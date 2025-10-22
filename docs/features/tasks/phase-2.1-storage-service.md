# Phase 2.1: Storage Service & Types

> **Task ID**: phase-2.1
> **Estimated Effort**: 1 day
> **Dependencies**: Phase 1.4 (Local Storage Routes), Phase 1.5 (Transfer Routes)

## Objective

Create unified storage service that abstracts S3 and local storage operations with a consistent API. This service will be used by all frontend components.

## Files to Create

- `frontend/src/app/services/storageService.ts` - Main service
- `frontend/src/__tests__/services/storageService.test.ts` - Service tests

## Implementation

### Type Definitions

```typescript
export type StorageType = 's3' | 'local';

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

export interface FileEntry {
  name: string;
  path: string; // Relative to location root
  type: 'file' | 'directory' | 'symlink';
  size?: number;
  modified?: Date;
  target?: string; // Symlink target
}

export interface TransferConflict {
  path: string;
  existingSize?: number;
  existingModified?: Date;
}

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

export interface TransferResponse {
  jobId: string;
  sseUrl: string;
}
```

### Service Implementation

```typescript
import axios from 'axios';

class StorageService {
  /**
   * Get all storage locations (S3 + local)
   */
  async getLocations(): Promise<StorageLocation[]> {
    const [s3Response, localResponse] = await Promise.all([
      axios.get('/api/buckets'),
      axios.get('/api/local/locations'),
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

    if (location.type === 's3') {
      const response = await axios.get(`/api/objects/${locationId}`, {
        params: { prefix: path, limit, offset },
      });

      return {
        files: response.data.objects.map(this.normalizeS3Object),
        totalCount: response.data.totalCount || response.data.objects.length,
      };
    } else {
      const response = await axios.get(`/api/local/files/${locationId}/${path}`, {
        params: { limit, offset },
      });

      return {
        files: response.data.files.map(this.normalizeLocalFile),
        totalCount: response.data.totalCount,
      };
    }
  }

  /**
   * Upload file
   */
  async uploadFile(locationId: string, path: string, file: File): Promise<void> {
    const location = await this.getLocation(locationId);
    const formData = new FormData();
    formData.append('file', file);

    if (location.type === 's3') {
      await axios.post(`/api/objects/${locationId}/${path}`, formData);
    } else {
      await axios.post(`/api/local/files/${locationId}/${path}`, formData);
    }
  }

  /**
   * Download file
   */
  async downloadFile(locationId: string, path: string): Promise<void> {
    const location = await this.getLocation(locationId);

    const url =
      location.type === 's3'
        ? `/api/objects/${locationId}/${path}?download=true`
        : `/api/local/download/${locationId}/${path}`;

    // Trigger browser download
    window.location.href = url;
  }

  /**
   * Delete file or directory
   */
  async deleteFile(locationId: string, path: string): Promise<void> {
    const location = await this.getLocation(locationId);

    if (location.type === 's3') {
      await axios.delete(`/api/objects/${locationId}/${path}`);
    } else {
      await axios.delete(`/api/local/files/${locationId}/${path}`);
    }
  }

  /**
   * Create directory
   */
  async createDirectory(locationId: string, path: string): Promise<void> {
    const location = await this.getLocation(locationId);

    if (location.type === 's3') {
      // S3 doesn't need explicit directory creation
      // Create empty "directory marker" object
      await axios.post(`/api/objects/${locationId}/${path}/`);
    } else {
      await axios.post(`/api/local/directories/${locationId}/${path}`);
    }
  }

  /**
   * Check for conflicting files before transfer
   */
  async checkConflicts(
    destination: { type: StorageType; locationId: string; path: string },
    files: string[],
  ): Promise<string[]> {
    const response = await axios.post('/api/transfer/check-conflicts', {
      destination,
      files,
    });

    return response.data.conflicts;
  }

  /**
   * Initiate cross-storage transfer
   */
  async initiateTransfer(request: TransferRequest): Promise<TransferResponse> {
    const response = await axios.post('/api/transfer', request);
    return response.data;
  }

  /**
   * Cancel transfer
   */
  async cancelTransfer(jobId: string): Promise<void> {
    await axios.delete(`/api/transfer/${jobId}`);
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
    return {
      name: obj.Key.split('/').pop() || obj.Key,
      path: obj.Key,
      type: obj.Key.endsWith('/') ? 'directory' : 'file',
      size: obj.Size,
      modified: new Date(obj.LastModified),
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

export const storageService = new StorageService();
```

## Acceptance Criteria

- [ ] Service fetches and normalizes both S3 and local locations
- [ ] File operations work for both storage types
- [ ] API calls use correct endpoints based on storage type
- [ ] Transfer operations properly route through transfer API
- [ ] Error handling provides clear messages
- [ ] Type definitions match backend contracts
- [ ] Service is singleton (exported instance)
- [ ] Unit tests mock axios and cover all methods
- [ ] TypeScript types are fully defined

## References

- Feature spec: `docs/features/pvc-storage-support.md` (lines 401-463)
