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
   * Cache for storage locations
   * Indefinite cache since locations can't change without container restart
   */
  private locationsCache: StorageLocation[] | null = null;

  /**
   * Get all storage locations (S3 + local)
   * Uses indefinite cache - locations only fetched once until manual refresh
   * Gracefully handles failures - if one storage type fails, returns the other
   */
  async getLocations(): Promise<StorageLocation[]> {
    // Return cached locations if available
    if (this.locationsCache !== null) {
      return this.locationsCache;
    }

    // Fetch and cache locations
    // Use allSettled to handle failures independently
    const results = await Promise.allSettled([
      axios.get(`${config.backend_api_url}/buckets`),
      axios.get(`${config.backend_api_url}/local/locations`),
    ]);

    const [s3Result, localResult] = results;

    // Process S3 locations (gracefully handle failure)
    const s3Locations: StorageLocation[] =
      s3Result.status === 'fulfilled'
        ? s3Result.value.data.buckets.map((bucket: any) => ({
            id: bucket.Name,
            name: bucket.Name,
            type: 's3' as const,
            available: true,
            region: bucket.Region,
          }))
        : [];

    // Log S3 errors but don't fail
    if (s3Result.status === 'rejected') {
      console.warn('S3 storage unavailable:', s3Result.reason?.message || s3Result.reason);
    }

    // Process local locations (gracefully handle failure)
    const localLocations: StorageLocation[] =
      localResult.status === 'fulfilled'
        ? localResult.value.data.locations.map((loc: any) => ({
            id: loc.id,
            name: loc.name,
            type: 'local' as const,
            available: loc.available,
            path: loc.path,
          }))
        : [];

    // Log local storage errors but don't fail
    if (localResult.status === 'rejected') {
      const error = localResult.reason;
      console.warn('Local storage unavailable:', {
        message: error?.message || 'Unknown error',
        status: error?.response?.status,
        statusText: error?.response?.statusText,
        errorDetails: error?.response?.data,
        url: error?.config?.url,
      });

      // Provide specific guidance based on error type
      if (error?.response?.status === 404) {
        console.warn(
          'Local storage API endpoint not found. The backend may not have local storage enabled.',
        );
      } else if (error?.response?.status === 403 || error?.response?.status === 401) {
        console.warn(
          'Local storage API access denied. Check authentication/authorization configuration.',
        );
      } else if (error?.code === 'ERR_NETWORK' || error?.code === 'ECONNREFUSED') {
        console.warn('Cannot connect to backend server. Check if backend is running.');
      }
    }

    // If both failed, warn user
    if (s3Locations.length === 0 && localLocations.length === 0) {
      console.error('All storage sources failed to load');
      // Return empty array instead of throwing - components will handle empty state
    }

    // Cache the results before returning
    this.locationsCache = [...s3Locations, ...localLocations];
    return this.locationsCache;
  }

  /**
   * Force refresh storage locations
   * Clears cache and fetches fresh data from backend
   * Use this after bucket create/delete or when user manually refreshes
   */
  async refreshLocations(): Promise<StorageLocation[]> {
    this.locationsCache = null;
    return this.getLocations();
  }

  /**
   * List files at location with storage-specific pagination
   *
   * For S3: Uses continuationToken + maxKeys (AWS S3 standard pagination)
   * For local storage: Uses limit + offset (SQL-style pagination)
   *
   * @param locationId - Storage location ID
   * @param path - Path within the location
   * @param options - Pagination options (storage-type specific)
   *   - For S3: { continuationToken, maxKeys }
   *   - For local: { limit, offset }
   */
  async listFiles(
    locationId: string,
    path: string = '',
    options?: {
      // S3 pagination (AWS standard)
      continuationToken?: string;
      maxKeys?: number;
      // Local storage pagination (SQL-style)
      limit?: number;
      offset?: number;
      // Search parameters (both S3 and local)
      q?: string;
      mode?: 'startsWith' | 'contains';
    },
  ): Promise<{
    files: FileEntry[];
    totalCount?: number;
    // S3-specific pagination fields
    nextContinuationToken?: string | null;
    isTruncated?: boolean;
  }> {
    const location = await this.getLocation(locationId);

    try {
      if (location.type === 's3') {
        // S3 uses continuationToken + maxKeys pagination
        // Prefix must be base64-encoded and in URL path to match backend route
        const url = path
          ? `${config.backend_api_url}/objects/${locationId}/${btoa(path)}`
          : `${config.backend_api_url}/objects/${locationId}`;

        const response = await axios.get(url, {
          params: {
            continuationToken: options?.continuationToken,
            maxKeys: options?.maxKeys,
            q: options?.q,
            mode: options?.mode,
          },
        });

        // Normalize both objects (files) and prefixes (folders)
        const objectFiles = response.data.objects?.map(this.normalizeS3Object) || [];
        const prefixDirs = response.data.prefixes?.map(this.normalizeS3Prefix) || [];

        return {
          files: [...prefixDirs, ...objectFiles], // Folders first, then files
          totalCount: prefixDirs.length + objectFiles.length,
          nextContinuationToken: response.data.nextContinuationToken || null,
          isTruncated: response.data.isTruncated || false,
        };
      } else {
        // Local storage uses limit + offset pagination
        // Local storage requires base64-encoded paths
        const encodedPath = path ? btoa(path) : '';
        const response = await axios.get(
          `${config.backend_api_url}/local/files/${locationId}/${encodedPath}`,
          {
            params: {
              limit: options?.limit,
              offset: options?.offset,
              q: options?.q,
              mode: options?.mode,
            },
          },
        );

        return {
          files: response.data.files?.map(this.normalizeLocalFile) || [],
          totalCount: response.data.totalCount || response.data.files?.length || 0,
        };
      }
    } catch (error) {
      console.error(`Failed to list files for location ${locationId}:`, error);
      throw error;
    }
  }

  /**
   * Upload file with optional progress tracking
   */
  async uploadFile(
    locationId: string,
    path: string,
    file: File,
    options?: {
      onProgress?: (percentCompleted: number) => void;
    },
  ): Promise<void> {
    const location = await this.getLocation(locationId);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const axiosConfig: any = {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      };

      // Add progress tracking if callback provided
      if (options?.onProgress) {
        axiosConfig.onUploadProgress = (progressEvent: any) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / (progressEvent.total || progressEvent.loaded),
          );
          options.onProgress!(percentCompleted);
        };
      }

      if (location.type === 's3') {
        // S3 requires encoded path to match backend route: /objects/upload/:bucketName/:encodedKey
        const encodedPath = btoa(path);
        await axios.post(`${config.backend_api_url}/objects/upload/${locationId}/${encodedPath}`, formData, axiosConfig);
      } else {
        // Local storage requires base64-encoded paths
        const encodedPath = btoa(path);
        await axios.post(`${config.backend_api_url}/local/files/${locationId}/${encodedPath}`, formData, axiosConfig);
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
        ? `${config.backend_api_url}/objects/download/${locationId}/${btoa(path)}`
        : `${config.backend_api_url}/local/download/${locationId}/${btoa(path)}`;

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
        // S3 requires base64-encoded paths
        await axios.delete(`${config.backend_api_url}/objects/${locationId}/${btoa(path)}`);
      } else {
        // Local storage requires base64-encoded paths
        const encodedPath = btoa(path);
        await axios.delete(`${config.backend_api_url}/local/files/${locationId}/${encodedPath}`);
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
        // S3 folders are virtual - create a .s3keep marker file
        // This approach works reliably across all S3-compatible systems
        const formData = new FormData();
        const emptyFile = new File([''], '.s3keep');
        formData.append('file', emptyFile);
        const encodedKey = btoa(`${path}/.s3keep`);
        await axios.post(
          `${config.backend_api_url}/objects/upload/${locationId}/${encodedKey}`,
          formData,
          { headers: { 'Content-Type': 'multipart/form-data' } }
        );
      } else {
        // Local storage requires base64-encoded paths
        const encodedPath = btoa(path);
        await axios.post(`${config.backend_api_url}/local/directories/${locationId}/${encodedPath}`);
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
   * Helper: Normalize S3 prefix to FileEntry (for folders)
   */
  private normalizeS3Prefix(prefix: any): FileEntry {
    // CommonPrefixes from S3 look like: { Prefix: "folder/" }
    const path = prefix.Prefix;
    const key = path.endsWith('/') ? path.slice(0, -1) : path;
    const name = key.split('/').pop() || key;

    return {
      name,
      path: path, // Keep trailing slash to indicate directory
      type: 'directory',
      // S3 prefixes don't have size or modified date
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
