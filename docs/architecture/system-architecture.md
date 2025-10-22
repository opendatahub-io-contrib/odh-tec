# System Architecture

This document describes the high-level architecture of ODH-TEC, including component relationships, deployment models, and integration points.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Component Architecture](#component-architecture)
- [Deployment Models](#deployment-models)
- [Request Flow](#request-flow)
- [Integration Points](#integration-points)
- [Network Architecture](#network-architecture)
- [Security Architecture](#security-architecture)
- [Scalability Considerations](#scalability-considerations)

## Architecture Overview

ODH-TEC follows a **single-container, full-stack architecture** where both frontend and backend are packaged and deployed together.

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     ODH-TEC Container                       │
│                      (Port 8888)                            │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Fastify Server (Backend)                │  │
│  │                                                      │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌────────────┐ │  │
│  │  │   Routes    │  │   Plugins    │  │   Utils    │ │  │
│  │  │  (API)      │  │  (Autoload)  │  │  (Config)  │ │  │
│  │  └─────────────┘  └──────────────┘  └────────────┘ │  │
│  │                                                      │  │
│  │  ┌──────────────────────────────────────────────┐  │  │
│  │  │     Static File Server (@fastify/static)     │  │  │
│  │  │         Serves Frontend from /dist           │  │  │
│  │  └──────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           React Frontend (Static Build)              │  │
│  │                                                      │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌────────────┐ │  │
│  │  │ Components  │  │   Routing    │  │   Utils    │ │  │
│  │  │(PatternFly) │  │ (React Router)│  │ (Axios)   │ │  │
│  │  └─────────────┘  └──────────────┘  └────────────┘ │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ HTTP/HTTPS
                           │
          ┌────────────────┼────────────────┐
          │                │                │
          ▼                ▼                ▼
    ┌──────────┐    ┌──────────┐    ┌──────────┐
    │    S3    │    │Hugging   │    │   User   │
    │ Storage  │    │  Face    │    │ Browser  │
    └──────────┘    └──────────┘    └──────────┘
```

### Design Principles

1. **Single Responsibility** - Backend handles API and file serving, frontend handles UI
2. **Streaming First** - All file operations use streaming for memory efficiency
3. **Stateless** - No persistent state in application (S3 is source of truth)
4. **Configuration via Environment** - Twelve-factor app principles
5. **Platform Agnostic** - Works in ODH, RHOAI, OpenShift, and Podman

## Component Architecture

### Backend Components

```
backend/
├── Server (Fastify)
│   ├── Plugin System
│   │   └── Autoload (routes, plugins)
│   ├── Route Handlers
│   │   ├── /api/buckets
│   │   ├── /api/objects
│   │   ├── /api/settings
│   │   └── /api/disclaimer
│   ├── Static File Server
│   │   └── Serves frontend/dist
│   └── Core Services
│       ├── S3 Client (AWS SDK v3)
│       ├── Configuration Manager
│       ├── Streaming Engine
│       └── Logger (Pino)
└── Infrastructure
    ├── HTTP/HTTPS Proxy Support
    ├── CA Bundle Loader
    └── Environment Config
```

### Frontend Components

```
frontend/
├── Application Shell
│   ├── AppLayout (PatternFly Page)
│   ├── Navigation (Sidebar)
│   └── Routing (React Router)
├── Feature Components
│   ├── ObjectBrowser
│   │   ├── File List
│   │   ├── Upload Modal
│   │   └── HF Import Modal
│   ├── Buckets
│   │   └── Bucket Management
│   ├── VramEstimator
│   │   └── GPU Calculator
│   └── Settings
│       └── Connection Config
├── State Management
│   ├── UserContext (React Context)
│   └── EventEmitter (Cross-component)
└── Services
    └── Axios (API Client)
```

## Deployment Models

ODH-TEC supports three primary deployment models:

1. **ODH/RHOAI Workbench** - Personal development environment for data scientists
2. **OpenShift Deployment** - Shared tool for entire team with HA support
3. **Local Podman** - Development and testing on local machines

Each model leverages the single-container architecture running on port 8888. Configuration is provided via environment variables, with auto-detection support for ODH/RHOAI Data Connections.

> **For detailed deployment instructions and manifests**, see [Deployment Architecture](../../deployment/deployment.md).

## Request Flow

### Static Asset Request (Production)

```
User Browser
    │
    │ GET /
    ▼
Fastify Server
    │
    │ @fastify/static
    ▼
Serve index.html from frontend/dist
    │
    │ HTML + JS bundles
    ▼
User Browser renders React app
```

### API Request (All Modes)

```
React Frontend
    │
    │ axios.get('/api/buckets')
    ▼
Fastify Server
    │
    │ Route Handler: /api/buckets
    ▼
S3 Client (AWS SDK)
    │
    │ ListBucketsCommand
    ▼
S3 Storage
    │
    │ Bucket list response
    ▼
Fastify Server
    │
    │ JSON response
    ▼
React Frontend
    │
    │ Update UI state
    ▼
User sees bucket list
```

### File Upload Flow

```
User Browser
    │
    │ File selection + Upload
    ▼
React Component
    │
    │ FormData with file
    │ POST /api/objects/upload/:bucketName
    ▼
Fastify Server
    │
    │ @fastify/multipart
    │ Stream file
    ▼
AWS SDK Upload
    │
    │ @aws-sdk/lib-storage
    │ Multipart upload
    ▼
S3 Storage
    │
    │ File stored
    ▼
Progress Events (SSE)
    │
    │ Upload progress %
    ▼
React Component
    │
    │ Update progress bar
    ▼
User sees progress
```

### HuggingFace Import Flow

```
User Browser
    │
    │ Model repo ID
    │ POST /api/objects/import-hf
    ▼
Fastify Server
    │
    │ Fetch model metadata
    ▼
HuggingFace API
    │
    │ List of files
    ▼
Fastify Server
    │
    │ For each file:
    │   Stream from HF
    │   Upload to S3
    │   Emit progress
    ▼
S3 Storage + Progress Events
    │
    │ Model files + Progress
    ▼
User sees import progress
```

## Integration Points

### S3 Storage

**Protocol**: HTTPS (AWS SDK v3)
**Authentication**: Access Key + Secret Key
**Operations**:

- Bucket: List, Create, Delete
- Object: List, Get, Put, Delete
- Streaming: Upload, Download

**Configuration**:

- Endpoint URL
- Region
- Credentials
- Force path style (for S3-compatible storage)

### HuggingFace API

**Protocol**: HTTPS (Axios)
**Authentication**: Bearer token (HF_TOKEN)
**Operations**:

- Model metadata retrieval
- File listing
- File download (streaming)

**Configuration**:

- Token (optional, for private models)

### Kubernetes/OpenShift

**Integration**:

- Environment variables from Data Connections
- CA bundle from mounted secrets
- Service account tokens
- ConfigMaps for configuration

**Auto-Detection**:

- Data Connection environment variables
- Platform CA certificates
- Proxy configuration

## Network Architecture

### Port Usage

- **8888**: Single port for all traffic
  - HTTP API endpoints (`/api/*`)
  - Static frontend files (`/*`)
  - WebSocket connections (future)
  - SSE streams (progress events)

### Network Flow

```
Internet/Cluster Network
        │
        │ HTTPS (via Route/Ingress)
        ▼
┌─────────────────────┐
│   ODH-TEC Service   │
│   (ClusterIP 8888)  │
└─────────────────────┘
        │
        │ HTTP (within cluster)
        ▼
┌─────────────────────┐
│   ODH-TEC Pod       │
│   (Port 8888)       │
└─────────────────────┘
        │
        ├───────────────┐
        │               │
        ▼               ▼
┌─────────────┐  ┌─────────────┐
│ S3 Endpoint │  │ HF API      │
│ (HTTPS)     │  │ (HTTPS)     │
└─────────────┘  └─────────────┘
```

### Proxy Support

When deployed in enterprise environments with proxy:

```
ODH-TEC Container
    │
    │ Via HTTP_PROXY / HTTPS_PROXY
    ▼
Corporate Proxy
    │
    ├─────────────┬─────────────┐
    │             │             │
    ▼             ▼             ▼
S3 Storage   HuggingFace   Public Internet
```

**Supported**:

- HTTP_PROXY environment variable
- HTTPS_PROXY environment variable
- Automatic proxy agent configuration

## Security Architecture

### Authentication Model

**Current**: No application-level authentication

**Rationale**:

- Workbench provides pod-level isolation
- S3 credentials control storage access
- Designed for single-user/single-team usage

**Access Control**:

```
Platform Level:
  - Workbench access (ODH/RHOAI)
  - Route/Ingress access control
  - Network policies

Storage Level:
  - S3 credentials required
  - Bucket policies
  - IAM roles
```

### Credential Management

**S3 Credentials**:

- Stored as environment variables
- Optionally from Data Connection (K8s Secret)
- Never logged or exposed to frontend

**HuggingFace Token**:

- Optional (public models work without)
- Stored as environment variable
- Used for private model access

### Network Security

**TLS/SSL**:

- Backend supports HTTPS endpoints
- Automatic CA bundle loading
- Certificate validation

**Isolation**:

- Runs as non-root user (UID 1001)
- No privileged operations required
- Minimal attack surface

## Scalability Considerations

### Horizontal Scaling

**Stateless Design**:

- No server-side sessions
- No in-memory caching
- Configuration from environment only

**Scaling Pattern**:

```
Load Balancer
    │
    ├─────────┬─────────┬─────────┐
    ▼         ▼         ▼         ▼
  Pod 1    Pod 2    Pod 3    Pod N
```

**Considerations**:

- All pods can serve any request
- Upload progress tracking per-request (SSE)
- No sticky sessions required

### Vertical Scaling

**Resource Requirements**:

Minimum (Workbench):

- CPU: 1 core
- Memory: 1 GB
- Handles: 2 concurrent transfers

Recommended (Shared Deployment):

- CPU: 2 cores
- Memory: 2 GB
- Handles: 4-8 concurrent transfers

High Load:

- CPU: 4 cores
- Memory: 4 GB
- Handles: 10+ concurrent transfers

**Memory Scaling**:

- Base: ~100-200 MB
- Per transfer: ~50-100 MB (buffering)
- Configurable via MAX_CONCURRENT_TRANSFERS

### Performance Optimization

**Streaming**:

- No file size limits (memory independent)
- Direct passthrough (no disk I/O)
- Parallel uploads with p-limit

**Caching**:

- Frontend static assets (browser cache)
- No backend caching (S3 is source of truth)

## Development vs Production Architecture

### Development Mode

```
┌─────────────────┐         ┌─────────────────┐
│  Webpack Dev    │         │  Backend        │
│  Server         │         │  (nodemon)      │
│  (Port 9000)    │         │  (Port 8888)    │
│                 │         │                 │
│  - Hot Reload   │         │  - Hot Reload   │
│  - Source Maps  │◀────────│  - Proxy API    │
│  - Fast Build   │  Proxy  │  - Full Logs    │
└─────────────────┘         └─────────────────┘
```

**Characteristics**:

- Separate processes for frontend and backend
- Fast iteration with HMR
- Detailed logging
- Source maps for debugging

### Production Mode

```
┌────────────────────────────────────┐
│   Single Fastify Process           │
│   (Port 8888)                      │
│                                    │
│  ┌──────────────────────────────┐ │
│  │   API Routes                 │ │
│  │   /api/*                     │ │
│  └──────────────────────────────┘ │
│                                    │
│  ┌──────────────────────────────┐ │
│  │   Static File Server         │ │
│  │   /* → frontend/dist         │ │
│  └──────────────────────────────┘ │
└────────────────────────────────────┘
```

**Characteristics**:

- Single process, single port
- Optimized builds (minified, compressed)
- Production logging
- Minimal resource usage

## Architectural Decisions

### Why Fastify?

**Pros**:

- High performance
- Plugin architecture
- Built-in TypeScript support
- Extensive ecosystem

**Alternatives Considered**:

- Express: Less performant, older patterns
- NestJS: Too heavyweight for simple API

### Why PatternFly?

**Pros**:

- Red Hat ecosystem alignment
- Comprehensive components
- Accessibility built-in
- Dark theme support

**Alternatives Considered**:

- Material-UI: Different design language
- Bootstrap: Less comprehensive
- Custom: Too much development effort

### Why Single Container?

**Pros**:

- Simpler deployment
- Lower resource usage
- Easier configuration
- Better for workbench use case

**Cons**:

- Cannot scale frontend/backend independently
- Updates require full rebuild

**Decision**: Pros outweigh cons for target use case (workbench/small deployments)

## Future Architecture Considerations

### Potential Enhancements

1. **Authentication Layer**

   - OAuth/OIDC integration
   - Role-based access control
   - Audit logging

2. **Caching Layer**

   - Redis for session storage
   - File metadata caching
   - API response caching

3. **Message Queue**

   - Async job processing
   - Background imports
   - Progress tracking

4. **Metrics & Monitoring**

   - Prometheus metrics
   - Health checks
   - Performance monitoring

5. **Multi-Tenancy**
   - Separate storage per user/team
   - Quota management
   - Usage tracking

---

**Next**:

- [Monorepo Structure](monorepo-structure.md) - Repository organization
- [Backend Architecture](backend-architecture.md) - Backend deep dive
- [Frontend Architecture](frontend-architecture.md) - Frontend deep dive
- [Deployment](../../deployment/deployment.md) - Container build and deployment scenarios
- [Configuration](../../deployment/configuration.md) - Environment variables and runtime settings
