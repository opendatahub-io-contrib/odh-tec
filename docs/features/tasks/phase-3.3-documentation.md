# Phase 3.3: Documentation Updates

> **Task ID**: phase-3.3
> **Estimated Effort**: 1.5-2 days
> **Dependencies**: All Phase 1 and Phase 2 tasks completed

## Objective

Update existing documentation and create new user guides for PVC storage support. Ensure configuration, deployment, and usage are well-documented.

## Documentation Updates Required

### 1. Environment Variables

**File**: `backend/.env.example`

Add new configuration variables:

```bash
# ===================================
# Local Storage Configuration
# ===================================

# Comma-separated list of allowed local storage paths
# These paths must exist and be accessible to the application
# Default: /opt/app-root/src/data
LOCAL_STORAGE_PATHS=/opt/app-root/src/data,/opt/app-root/src/models

# Maximum file size for uploads and transfers (in GB)
# Files larger than this limit will be rejected
# Default: 20
MAX_FILE_SIZE_GB=20

# ===================================
# Transfer Configuration
# ===================================

# Maximum number of concurrent file transfers
# Higher values increase throughput but use more memory
# Default: 2
MAX_CONCURRENT_TRANSFERS=2
```

### 2. Root CLAUDE.md

**File**: `CLAUDE.md`

Update project overview section:

```markdown
## Key Features

- **Unified Storage Browser**: Browse both S3 buckets and local PVC-mounted directories
- **Cross-Storage Transfers**: Copy files between S3 and local storage with real-time progress
- **HuggingFace Model Import**: Download models to S3 or local PVC storage
- **Multi-Select Operations**: Batch operations on files and folders
- **Real-time Progress**: Server-Sent Events (SSE) for transfer progress updates
- **Security-Hardened**: Path validation prevents directory traversal attacks
```

Add to architecture overview:

```markdown
## Storage Layer

- **S3 Support**: AWS S3 and S3-compatible object storage
- **Local Storage**: PVC-mounted directories with path validation
- **Unified API**: Storage service abstracts S3 and local operations
- **Transfer Queue**: Shared concurrency limits for all transfer types
```

### 3. Backend Architecture Documentation

**File**: `docs/architecture/backend-architecture.md`

Add new sections:

```markdown
## Transfer Queue Module

**Location**: `backend/src/utils/transferQueue.ts`

Centralized transfer coordination using `p-limit` for concurrency control.

**Key Features**:

- Shared concurrency limits across all transfer types
- Progress tracking with EventEmitter pattern
- Job cancellation support
- Automatic cleanup of completed jobs

## Local Storage Utilities

**Location**: `backend/src/utils/localStorage.ts`

Security-hardened filesystem operations with strict path validation.

**Key Features**:

- Path traversal attack prevention
- Symlink resolution with boundary validation
- Custom error types (SecurityError, PermissionError, StorageError)
- File size validation
- Streaming support

## API Routes

### Local Storage Routes

- `GET /api/local/locations` - List configured storage locations
- `GET /api/local/files/:locationId/:path*` - List files with pagination
- `POST /api/local/files/:locationId/:path*` - Upload file
- `GET /api/local/download/:locationId/:path*` - Download file
- `DELETE /api/local/files/:locationId/:path*` - Delete file/directory
- `POST /api/local/directories/:locationId/:path*` - Create directory

### Transfer Routes

- `POST /api/transfer` - Initiate cross-storage transfer
- `GET /api/transfer/progress/:jobId` - SSE progress stream
- `DELETE /api/transfer/:jobId` - Cancel transfer
- `POST /api/transfer/check-conflicts` - Pre-flight conflict check
```

### 4. Frontend Architecture Documentation

**File**: `docs/architecture/frontend-architecture.md`

Add new sections:

```markdown
## Storage Service

**Location**: `frontend/src/app/services/storageService.ts`

Unified API client for S3 and local storage operations.

**Responsibilities**:

- Fetch and normalize storage locations
- Abstract S3 vs local differences
- Handle file operations (list, upload, download, delete)
- Manage transfer operations
- Normalize API responses

## Transfer Components

**Location**: `frontend/src/app/components/Transfer/`

**DestinationPicker**: Modal for selecting transfer destination with folder navigation

**ConflictResolutionModal**: Handle file conflicts before transfer (overwrite/skip/rename)

**TransferProgress**: Drawer showing real-time transfer progress via SSE
```

### 5. Deployment Configuration

**File**: `docs/deployment/configuration.md`

Add PVC storage configuration section:

````markdown
## Local Storage Configuration

### Environment Variables

**LOCAL_STORAGE_PATHS**

- **Type**: Comma-separated string
- **Default**: `/opt/app-root/src/data`
- **Example**: `/mnt/data,/mnt/models,/opt/app-root/src/data`
- **Description**: Filesystem paths accessible for local storage operations

**MAX_FILE_SIZE_GB**

- **Type**: Integer
- **Default**: `20`
- **Range**: 1-1000
- **Description**: Maximum file size in gigabytes for uploads and transfers

### PVC Mounting

For Kubernetes deployments, mount PVCs to paths listed in `LOCAL_STORAGE_PATHS`:

```yaml
volumeMounts:
  - name: data-pvc
    mountPath: /mnt/data
  - name: models-pvc
    mountPath: /mnt/models
```
````

### Security Considerations

- All paths undergo strict validation to prevent directory traversal
- Symlinks are resolved and validated to stay within allowed directories
- Only directories listed in `LOCAL_STORAGE_PATHS` are accessible
- Missing directories are logged but don't fail startup

````

### 6. Create PVC Storage User Guide

**File**: `docs/features/pvc-storage-guide.md`

Create comprehensive user guide:

```markdown
# PVC Storage Support - User Guide

## Overview

ODH-TEC supports browsing and transferring files in PVC-mounted directories alongside S3 buckets.

## Configuration

### Kubernetes Setup

**StatefulSet Example**:
```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: odh-tec
spec:
  serviceName: odh-tec
  volumeClaimTemplates:
    - metadata:
        name: data-storage
      spec:
        accessModes: [ "ReadWriteOnce" ]
        resources:
          requests:
            storage: 100Gi
  template:
    spec:
      containers:
        - name: odh-tec
          env:
            - name: LOCAL_STORAGE_PATHS
              value: '/mnt/data'
          volumeMounts:
            - name: data-storage
              mountPath: /mnt/data
````

**ODH/RHOAI Notebook Example**:

```yaml
apiVersion: kubeflow.org/v1
kind: Notebook
metadata:
  name: odh-tec-workbench
spec:
  template:
    spec:
      containers:
        - name: odh-tec
          env:
            - name: LOCAL_STORAGE_PATHS
              value: '/opt/app-root/src/data,/opt/app-root/src/models'
          volumeMounts:
            - name: data-pvc
              mountPath: /opt/app-root/src/data
      volumes:
        - name: data-pvc
          persistentVolumeClaim:
            claimName: workbench-data
```

## Features

### Unified Storage Browser

- View S3 buckets and local PVC directories in one interface
- Visual badges distinguish storage types (S3 vs PVC)
- Unavailable directories shown with clear indicators

### Cross-Storage Transfers

Transfer files between any combination:

- S3 → Local PVC
- Local PVC → S3
- Local PVC → Local PVC
- S3 → S3

### HuggingFace Model Import

Download HuggingFace models directly to:

- S3 buckets
- Local PVC storage

### Multi-Select Operations

- Select multiple files/folders
- Keyboard shortcuts (Ctrl+A, Shift+Click)
- Bulk delete and transfer operations

### Real-Time Progress

- Live progress updates via Server-Sent Events
- File-by-file status tracking
- Transfer cancellation support

## Security

### Path Validation

All filesystem operations validate paths to prevent directory traversal attacks:

- Relative paths only (no absolute paths)
- Symlinks resolved and validated
- Paths must stay within configured directories

### File Size Limits

Configure maximum file size (default 20GB):

```bash
MAX_FILE_SIZE_GB=50
```

## Performance Tuning

### Concurrency Control

Adjust concurrent transfer limit:

```bash
MAX_CONCURRENT_TRANSFERS=4
```

Higher values = more throughput but more memory usage

### Memory Considerations

- Streaming-first design minimizes memory usage
- ~256MB RAM for transferring 7GB model
- Recommend 512MB-1GB container memory limit

## Troubleshooting

### "Storage location unavailable"

**Cause**: Directory in LOCAL_STORAGE_PATHS doesn't exist or isn't accessible

**Solution**:

1. Verify PVC is mounted: `kubectl describe pod <pod-name>`
2. Check directory exists: `kubectl exec <pod-name> -- ls -la /mnt/data`
3. Check permissions: Directory must be readable/writable

### "Permission denied"

**Cause**: Container user lacks permissions on mounted PVC

**Solution**:

```yaml
securityContext:
  fsGroup: 1000 # Match PVC ownership
  runAsUser: 1000
```

### "Disk full" errors

**Cause**: PVC storage exhausted

**Solution**:

- Check PVC usage: `kubectl exec <pod-name> -- df -h /mnt/data`
- Expand PVC if storage class supports it
- Clean up unused files

### "File too large"

**Cause**: File exceeds MAX_FILE_SIZE_GB limit

**Solution**:

- Increase limit via environment variable
- Split large files if possible

## Best Practices

1. **Use StatefulSets or Notebooks** - Not bare Pods (PVC lifecycle)
2. **Set fsGroup** - Ensure correct PVC permissions
3. **Monitor disk usage** - Set up alerts for PVC capacity
4. **Use ReadWriteOnce** - Sufficient for single-pod workbenches
5. **Configure file size limits** - Prevent memory exhaustion

## References

- [Deployment Guide](../deployment/deployment.md)
- [Configuration Guide](../deployment/configuration.md)
- [Architecture Overview](../architecture/README.md)

````

### 7. Update Data Flow Documentation

**File**: `docs/architecture/data-flow.md`

Add transfer flow diagrams:

```markdown
## Cross-Storage Transfer Flow

1. User selects files and clicks "Copy to..."
2. Frontend opens DestinationPicker modal
3. User navigates to destination location
4. Frontend calls `/api/transfer/check-conflicts`
5. If conflicts exist, show ConflictResolutionModal
6. User resolves conflicts (overwrite/skip/rename)
7. Frontend calls `POST /api/transfer` with:
   - Source (type, locationId, path)
   - Destination (type, locationId, path)
   - Files to transfer
   - Conflict resolution strategy
8. Backend validates paths and creates TransferJob
9. Backend queues job with TransferQueue (concurrency limit)
10. Backend returns jobId and SSE URL
11. Frontend opens TransferProgress drawer
12. Frontend connects to SSE endpoint
13. Backend streams progress events as files transfer
14. Frontend updates progress UI in real-time
15. SSE connection closes when complete/failed
````

## Acceptance Criteria

- [ ] `.env.example` updated with all new variables
- [ ] Root `CLAUDE.md` updated with feature list
- [ ] Backend architecture documentation updated
- [ ] Frontend architecture documentation updated
- [ ] Deployment configuration documented
- [ ] PVC storage user guide created
- [ ] Data flow diagrams updated
- [ ] All code examples tested and verified
- [ ] Kubernetes manifests validated
- [ ] Security considerations documented
- [ ] Troubleshooting guide complete
- [ ] Best practices section complete

## References

- Feature spec: `docs/features/pvc-storage-support.md` (lines 1085-1294)
