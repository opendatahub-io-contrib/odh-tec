import axios from 'axios';
import config from '@app/config';

/**
 * Storage type discriminator
 */
export type StorageType = 's3' | 'local';

/**
 * Unified storage location interface
 */
export interface StorageLocation {
  id: string; // "local-0", "local-1", or S3 bucket name
  name: string; // Display name
  type: StorageType;
  available: boolean; // false if directory missing/inaccessible
  // S3-specific
  region?: string;
  // Local-specific
  path?: string;
}

/**
 * Unified file entry interface
 */
export interface FileEntry {
  name: string;
  path: string; // Relative to location root
  type: 'file' | 'directory' | 'symlink';
  size?: number;
  modified?: Date;
  target?: string; // Symlink target
}

/**
 * Transfer conflict information
 */
export interface TransferConflict {
  path: string;
  existingSize?: number;
  existingModified?: Date;
}

/**
 * Transfer request payload
 */
export interface TransferRequest {
  source: {
    type: StorageType;
    locationId: string;
    path: string;
  };
  destination: {
    type: StorageType;
    locationId: string;
    path: string;
  };
  files: string[];
  conflictResolution: 'overwrite' | 'skip' | 'rename';
}

/**
 * Transfer response with job tracking
 */
export interface TransferResponse {
  jobId: string;
  sseUrl: string;
}

/**
 * Unified Storage Service
 *
 * Provides a consistent API for both S3 and local storage operations,
 * abstracting the underlying differences between storage types.
 */
class StorageService {
  /**
   * Get all storage locations (S3 + local)
   */
  async getLocations(): Promise<StorageLocation[]> {
    try {
      const [s3Response, localResponse] = await Promise.all([
        axios.get(`${config.backend_api_url}/buckets`),
        axios.get(`${config.backend_api_url}/local/locations`),
      ]);

      // Normalize S3 buckets
      const s3Locations: StorageLocation[] = s3Response.data.buckets.map((bucket: any) => ({
        id: bucket.Name,
        name: bucket.Name,
        type: 's3' as const,
        available: true,
        region: bucket.Region,
      }));

      // Normalize local locations
      const localLocations: StorageLocation[] = localResponse.data.locations.map((loc: any) => ({
        id: loc.id,
        name: loc.name,
        type: 'local' as const,
        available: loc.available,
        path: loc.path,
      }));

      return [...s3Locations, ...localLocations];
    } catch (error) {
      console.error('Failed to fetch storage locations:', error);
      throw error;
    }
  }

  /**
   * List files at location
   */
  async listFiles(
    locationId: string,
    path: string = '',
    limit?: number,
    offset?: number,
  ): Promise<{ files: FileEntry[]; totalCount: number }> {
    const location = await this.getLocation(locationId);

    try {
      if (location.type === 's3') {
        const response = await axios.get(`${config.backend_api_url}/objects/${locationId}`, {
          params: { prefix: path, limit, offset },
        });

        return {
          files: response.data.objects.map(this.normalizeS3Object),
          totalCount: response.data.totalCount || response.data.objects.length,
        };
      } else {
        const response = await axios.get(
          `${config.backend_api_url}/local/files/${locationId}/${path}`,
          {
            params: { limit, offset },
          },
        );

        return {
          files: response.data.files.map(this.normalizeLocalFile),
          totalCount: response.data.totalCount || response.data.files.length,
        };
      }
    } catch (error) {
      console.error(`Failed to list files for location ${locationId}:`, error);
      throw error;
    }
  }

  /**
   * Upload file
   */
  async uploadFile(locationId: string, path: string, file: File): Promise<void> {
    const location = await this.getLocation(locationId);
    const formData = new FormData();
    formData.append('file', file);

    try {
      if (location.type === 's3') {
        await axios.post(`${config.backend_api_url}/objects/${locationId}/${path}`, formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });
      } else {
        await axios.post(`${config.backend_api_url}/local/files/${locationId}/${path}`, formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });
      }
    } catch (error) {
      console.error(`Failed to upload file to ${locationId}/${path}:`, error);
      throw error;
    }
  }

  /**
   * Download file
   */
  async downloadFile(locationId: string, path: string): Promise<void> {
    const location = await this.getLocation(locationId);

    const url =
      location.type === 's3'
        ? `${config.backend_api_url}/objects/${locationId}/${path}?download=true`
        : `${config.backend_api_url}/local/download/${locationId}/${path}`;

    // Trigger browser download
    window.location.href = url;
  }

  /**
   * Delete file or directory
   */
  async deleteFile(locationId: string, path: string): Promise<void> {
    const location = await this.getLocation(locationId);

    try {
      if (location.type === 's3') {
        await axios.delete(`${config.backend_api_url}/objects/${locationId}/${path}`);
      } else {
        await axios.delete(`${config.backend_api_url}/local/files/${locationId}/${path}`);
      }
    } catch (error) {
      console.error(`Failed to delete ${locationId}/${path}:`, error);
      throw error;
    }
  }

  /**
   * Create directory
   */
  async createDirectory(locationId: string, path: string): Promise<void> {
    const location = await this.getLocation(locationId);

    try {
      if (location.type === 's3') {
        // S3 doesn't need explicit directory creation
        // Create empty "directory marker" object
        await axios.post(`${config.backend_api_url}/objects/${locationId}/${path}/`);
      } else {
        await axios.post(`${config.backend_api_url}/local/directories/${locationId}/${path}`);
      }
    } catch (error) {
      console.error(`Failed to create directory ${locationId}/${path}:`, error);
      throw error;
    }
  }

  /**
   * Check for conflicting files before transfer
   */
  async checkConflicts(
    destination: { type: StorageType; locationId: string; path: string },
    files: string[],
  ): Promise<string[]> {
    try {
      const response = await axios.post(`${config.backend_api_url}/transfer/check-conflicts`, {
        destination,
        files,
      });

      return response.data.conflicts;
    } catch (error) {
      console.error('Failed to check conflicts:', error);
      throw error;
    }
  }

  /**
   * Initiate cross-storage transfer
   */
  async initiateTransfer(request: TransferRequest): Promise<TransferResponse> {
    try {
      const response = await axios.post(`${config.backend_api_url}/transfer`, request);
      return response.data;
    } catch (error) {
      console.error('Failed to initiate transfer:', error);
      throw error;
    }
  }

  /**
   * Cancel transfer
   */
  async cancelTransfer(jobId: string): Promise<void> {
    try {
      await axios.delete(`${config.backend_api_url}/transfer/${jobId}`);
    } catch (error) {
      console.error(`Failed to cancel transfer ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Helper: Get single location by ID
   */
  private async getLocation(locationId: string): Promise<StorageLocation> {
    const locations = await this.getLocations();
    const location = locations.find((loc) => loc.id === locationId);

    if (!location) {
      throw new Error(`Location not found: ${locationId}`);
    }

    return location;
  }

  /**
   * Helper: Normalize S3 object to FileEntry
   */
  private normalizeS3Object(obj: any): FileEntry {
    // For directories (ending with /), strip the trailing slash before extracting name
    const key = obj.Key.endsWith('/') ? obj.Key.slice(0, -1) : obj.Key;
    const name = key.split('/').pop() || key;

    return {
      name,
      path: obj.Key,
      type: obj.Key.endsWith('/') ? 'directory' : 'file',
      size: obj.Size,
      modified: obj.LastModified ? new Date(obj.LastModified) : undefined,
    };
  }

  /**
   * Helper: Normalize local file to FileEntry
   */
  private normalizeLocalFile(file: any): FileEntry {
    return {
      name: file.name,
      path: file.path,
      type: file.type,
      size: file.size,
      modified: file.modified ? new Date(file.modified) : undefined,
      target: file.target,
    };
  }
}

// Export singleton instance
export const storageService = new StorageService();
