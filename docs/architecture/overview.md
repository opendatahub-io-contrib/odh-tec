# ODH-TEC Overview

## What is ODH-TEC?

**ODH-TEC (Open Data Hub Tools & Extensions Companion)** is a full-stack TypeScript application that provides essential tools for working with S3 storage and GPU resources in AI/ML environments.

It is specifically designed to integrate seamlessly with:

- **Open Data Hub (ODH)** - Open source AI/ML platform
- **Red Hat OpenShift AI (RHOAI)** - Enterprise AI/ML platform
- **Standalone environments** - Local development with Podman or standard OpenShift deployments

## Purpose and Target Users

### Purpose

ODH-TEC simplifies common tasks in AI/ML workflows:

1. **S3 Storage Management** - Browse, upload, download, and manage S3 buckets and objects
2. **Model Import** - Import models from HuggingFace directly to S3 storage
3. **GPU Planning** - Calculate VRAM requirements for LLM inference and training

### Target Users

- **Data Scientists** - Manage datasets and models in S3, import HuggingFace models
- **ML Engineers** - Plan GPU resource requirements, transfer models to storage
- **Platform Engineers** - Deploy and configure storage tools for AI/ML teams
- **Developers** - Access S3 storage from development workbenches

## Key Capabilities

### S3 Storage Tools

#### Bucket Management

- **List Buckets** - View all accessible S3 buckets
- **Create Buckets** - Provision new storage buckets
- **Delete Buckets** - Remove empty buckets
- **Navigate** - Browse bucket contents with folder navigation

#### Object Browser

- **File Upload** - Single or multiple file uploads with progress tracking
- **File Download** - Streaming downloads of any size
- **File Preview** - View text and image files directly in browser
- **Folder Management** - Create folders, navigate nested structures
- **Batch Operations** - Delete multiple files at once
- **HuggingFace Import** - Import entire models from HuggingFace to S3

#### Performance Features

- **Streaming Transfers** - Memory-efficient file handling (no intermediate storage)
- **Concurrent Limits** - Configurable parallel transfer limits (default: 2)
- **Progress Tracking** - Real-time upload/download progress
- **Large File Support** - Handle files larger than available RAM (256MB for 7B model import)

### GPU Tools

#### VRAM Estimator

- **Model Configuration** - Input model parameters (size, layers, etc.)
- **Precision Settings** - Calculate for FP32, FP16, INT8, and other quantizations
- **Batch Size Planning** - Factor in batch size and sequence length
- **GPU Recommendations** - Determine number of GPUs needed
- **Training vs Inference** - Separate calculations for different workloads

### Settings and Configuration

#### Connection Testing

- **S3 Validation** - Test S3 endpoint connectivity and credentials
- **HuggingFace Auth** - Verify HuggingFace token validity

#### Runtime Configuration

- **S3 Credentials** - Update access keys and endpoint at runtime
- **HuggingFace Token** - Set token for model imports
- **Proxy Support** - Configure HTTP/HTTPS proxies for enterprise environments
- **Transfer Limits** - Adjust concurrent transfer limits

> **Note**: Runtime configuration is ephemeral and lost on pod restart. For persistent config, use environment variables.

## Design Philosophy

### Simplicity First

- **Single Container** - One container runs both frontend and backend
- **Single Port** - Everything accessible on port 8888
- **No Database** - Stateless design, all data in S3 or environment
- **No Authentication** - Relies on platform authentication (workbench isolation)

### Memory Efficiency

- **Streaming Architecture** - Direct passthrough from source to destination
- **No Intermediate Storage** - Files never fully loaded into memory
- **Configurable Concurrency** - Control memory usage via transfer limits
- **Small Footprint** - Runs comfortably with 1 CPU / 1GB RAM

### Platform Integration

- **Auto-Detection** - Automatically picks up ODH/RHOAI Data Connection env vars
- **Environment Variables** - Standard configuration via env vars
- **Non-Root User** - Runs as user 1001 for OpenShift compatibility
- **CA Bundle Support** - Loads platform CA certificates automatically

### Developer Experience

- **TypeScript** - Type-safe development for both frontend and backend
- **Hot Reload** - Fast development with nodemon and webpack HMR
- **Monorepo** - Single repository with shared tooling
- **PatternFly UI** - Consistent, accessible UI components

## Architecture Highlights

### Technology Stack

- **Backend**: Fastify (Node.js), TypeScript, AWS SDK v3
- **Frontend**: React 18, PatternFly 6, React Router v7
- **Build**: Webpack, npm-run-all
- **Container**: Red Hat UBI9 Node.js 18

### Deployment Models

#### ODH/RHOAI Workbench

- Import as custom workbench image
- Attach Data Connection for automatic S3 config
- Optionally add HF_TOKEN environment variable
- Launch with minimal resources (1 CPU / 1GB RAM)

#### OpenShift Deployment

- Standard Deployment with Service and Route
- Configure via environment variables
- No special permissions required

#### Local Podman

- Run with `--env-file` for configuration
- Access at http://127.0.0.1:8888
- Ideal for development and testing

### Data Flow

```
┌──────────────┐
│   Browser    │
│  (Frontend)  │
└──────┬───────┘
       │ HTTP/WebSocket
       ▼
┌──────────────┐
│   Fastify    │
│  (Backend)   │
└──┬───────┬───┘
   │       │
   │       └─────────────┐
   │                     │
   ▼                     ▼
┌──────────────┐   ┌──────────────┐
│   S3 Storage │   │ HuggingFace  │
│  (AWS SDK)   │   │     API      │
└──────────────┘   └──────────────┘
```

### Key Design Decisions

#### Why Single Container?

**Pros**:

- Simpler deployment (one container, one port)
- Lower resource usage
- Easier configuration management
- Better for workbench use case

**Trade-offs**:

- Frontend and backend scale together
- Cannot independently update frontend/backend in production

#### Why Streaming?

**Benefits**:

- Minimal memory footprint (256MB for 7B model import)
- Support for files larger than available RAM
- Direct passthrough without intermediate storage
- Faster transfers (no disk I/O overhead)

**Implementation**:

- Computer → Backend → S3 (upload)
- S3 → Backend → Browser (download)
- HuggingFace → Backend → S3 (import)

#### Why No Authentication?

**Rationale**:

- Workbench provides pod-level isolation
- S3 credentials control storage access
- Simpler deployment and configuration
- Focus on functionality over access control

**Security**:

- S3 credentials required for storage access
- HuggingFace token for private model imports
- Pod network isolation in ODH/RHOAI
- Can be extended with OAuth/OIDC if needed

#### Why PatternFly 6?

**Advantages**:

- Consistent with Red Hat product design
- Accessible by default (WCAG compliant)
- Comprehensive component library
- Dark theme support out of the box
- Active Red Hat support

## Use Cases

### Data Scientist Workflow

1. **Launch Workbench** - Start ODH-TEC workbench with Data Connection attached
2. **Import Model** - Use HuggingFace import to pull model to S3
3. **Verify Upload** - Browse S3 to confirm model files are present
4. **Plan GPUs** - Use VRAM estimator to determine GPU requirements
5. **Train Model** - Launch training job with correct GPU allocation

### ML Engineer Workflow

1. **Upload Datasets** - Batch upload training data to S3
2. **Organize Files** - Create folders and structure data
3. **Test Downloads** - Verify data accessibility from training pods
4. **Monitor Storage** - Check bucket sizes and object counts

### Platform Engineer Workflow

1. **Deploy Workbench** - Import ODH-TEC as custom workbench image
2. **Create Data Connection** - Set up S3 credentials
3. **Configure Proxy** - Set HTTP_PROXY env vars for enterprise
4. **Test Connection** - Verify S3 access via settings page
5. **Share with Team** - Provide workbench access to data science team

## Screenshots

The application provides an intuitive web interface for all operations. See the [root README](../../README.md#screenshots) for screenshots of:

- Bucket Management
- Single File Upload
- Multiple File Uploads
- HuggingFace Model Import
- VRAM Estimator

## What's Next?

To learn more about the architecture:

- **[System Architecture](system-architecture.md)** - High-level design and components
- **[Backend Architecture](backend-architecture.md)** - Fastify server implementation
- **[Frontend Architecture](frontend-architecture.md)** - React application structure
- **[Deployment](deployment.md)** - Container build and deployment options
- **[Configuration](configuration.md)** - Environment variables and settings

## Current Limitations

### Known Constraints

1. **No Authentication** - Relies on platform-level access control
2. **Ephemeral Configuration** - Runtime settings not persisted
3. **No Database** - All state is in S3 or environment variables
4. **No Rate Limiting** - No request throttling or DDoS protection
5. **Single Region** - S3 client configured for one region at a time

### Future Enhancements

Potential improvements for consideration:

1. **Persistent Settings** - Store user preferences in ConfigMap or database
2. **Multi-Region** - Support multiple S3 regions/endpoints
3. **Authentication** - Optional OAuth/OIDC integration
4. **Rate Limiting** - Protect against abuse
5. **Audit Logging** - Track operations for compliance
6. **Metrics** - Prometheus metrics for monitoring
7. **Multi-Language** - i18n support for additional languages

## Version Information

- **Current Version**: 2.0.7
- **Node.js Required**: 18+
- **Container Base**: Red Hat UBI9 Node.js 18
- **License**: Apache 2.0 (backend/frontend), MIT (root)

## Contributing

ODH-TEC is an open-source project. Contributions are welcome!

- **Repository**: [opendatahub-io-contrib/odh-tec](https://github.com/opendatahub-io-contrib/odh-tec)
- **Issues**: [GitHub Issues](https://github.com/opendatahub-io-contrib/odh-tec/issues)
- **Development Guide**: See [development documentation](../development/README.md)

---

**Next**:

- [System Architecture](system-architecture.md) - High-level system design
- [Backend Architecture](backend-architecture.md) - Fastify API implementation
- [Frontend Architecture](frontend-architecture.md) - React UI implementation
- [Development Workflow](../../development/development-workflow.md) - Setup and build processes
- [Deployment](../../deployment/deployment.md) - Container and deployment options
