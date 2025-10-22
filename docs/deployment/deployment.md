# Deployment Architecture

This document describes the container build process and deployment options for ODH-TEC across different platforms.

## Table of Contents

- [Overview](#overview)
- [Container Build Process](#container-build-process)
- [Deployment Scenarios](#deployment-scenarios)
- [Resource Requirements](#resource-requirements)
- [Network Configuration](#network-configuration)
- [Security Configuration](#security-configuration)
- [High Availability](#high-availability)
- [Monitoring and Logging](#monitoring-and-logging)

## Overview

ODH-TEC is deployed as a **single container** containing both the Fastify backend and React frontend. The container is built using a multi-stage Containerfile for optimal size and security.

**Key Characteristics**:

- Single container deployment
- Single port (8888) for all traffic
- Non-root user (UID 1001)
- Red Hat UBI9 Node.js 18 base image
- Multi-stage build for minimal final image

## Container Build Process

### Multi-Stage Build

**File**: `Containerfile` (root of repository)

#### Stage 1: Base

```dockerfile
FROM registry.access.redhat.com/ubi9/nodejs-18 as base

USER 0

RUN yum -y update --setopt=tsflags=nodocs && \
    yum clean all
```

**Purpose**: Common base image with system updates

#### Stage 2: Builder

```dockerfile
FROM base as builder

USER 0

COPY --chown=1001:0 . /tmp/src/

WORKDIR /tmp/src

RUN npm install && \
    npm run build
```

**Purpose**: Build both backend and frontend

**Actions**:

1. Copy entire repository
2. Install all dependencies (root + backend + frontend)
3. Build both packages:
   - Backend: TypeScript compilation to `backend/dist/`
   - Frontend: Webpack production build to `frontend/dist/`

**Build Artifacts**:

```
/tmp/src/backend/dist/    # Compiled backend JavaScript
/tmp/src/frontend/dist/   # Webpack bundled frontend
```

#### Stage 3: Final

```dockerfile
FROM base as final

USER 1001

RUN mkdir -p /opt/app-root/bin/odh-tec && \
    mkdir -p /opt/app-root/bin/odh-tec/backend && \
    mkdir -p /opt/app-root/bin/odh-tec/frontend && \
    chown -R 1001:0 /opt/app-root/bin/odh-tec && \
    chmod -R ug+rwx /opt/app-root/bin/odh-tec

# Copy package.json files
COPY --from=builder --chown=1001:0 /tmp/src/backend/package*.json \
     /opt/app-root/bin/odh-tec/backend/
COPY --from=builder --chown=1001:0 /tmp/src/frontend/package*.json \
     /opt/app-root/bin/odh-tec/frontend/

# Install production dependencies only
RUN npm install --production --prefix /opt/app-root/bin/odh-tec/backend/ && \
    npm install --production --prefix /opt/app-root/bin/odh-tec/frontend/

# Copy build artifacts
COPY --from=builder --chown=1001:0 /tmp/src/backend/dist \
     /opt/app-root/bin/odh-tec/backend/dist
COPY --from=builder --chown=1001:0 /tmp/src/frontend/dist \
     /opt/app-root/bin/odh-tec/frontend/dist

WORKDIR /opt/app-root/src

CMD ["npm", "run", "start", "--prefix", "/opt/app-root/bin/odh-tec/backend/"]
```

**Purpose**: Create minimal runtime image

**Actions**:

1. Create directory structure
2. Copy package.json files
3. Install production dependencies only (no devDependencies)
4. Copy build artifacts (compiled JS, bundled frontend)
5. Set non-root user (1001)
6. Configure startup command

**Final Image Structure**:

```
/opt/app-root/bin/odh-tec/
├── backend/
│   ├── dist/               # Compiled JavaScript
│   ├── node_modules/       # Production deps only
│   └── package.json
└── frontend/
    ├── dist/               # Webpack bundle
    ├── node_modules/       # Production deps only
    └── package.json
```

### Building the Container

**Using Podman**:

```bash
podman build -t odh-tec:latest -f Containerfile .
```

**Using Docker**:

```bash
docker build -t odh-tec:latest -f Containerfile .
```

**Build Time**: ~5-10 minutes (depending on network and CPU)

**Image Size**: ~700-800 MB (compressed)

### Container Registry

**Official Images**:

```
quay.io/rh-aiservices-bu/odh-tec:latest
quay.io/rh-aiservices-bu/odh-tec:2.0.7
```

**Pushing to Registry**:

```bash
podman tag odh-tec:latest quay.io/rh-aiservices-bu/odh-tec:2.0.7
podman push quay.io/rh-aiservices-bu/odh-tec:2.0.7
```

## Deployment Scenarios

### 1. ODH/RHOAI Workbench

**Use Case**: Personal development environment for data scientists

#### Prerequisites

- ODH or RHOAI platform
- Administrator access to import custom images
- Optional: Data Connection for S3 credentials

#### Deployment Steps

1. **Import Custom Image** (Admin):

   ```yaml
   apiVersion: v1
   kind: ImageStream
   metadata:
     name: odh-tec
     namespace: redhat-ods-applications
   spec:
     lookupPolicy:
       local: true
     tags:
       - name: latest
         from:
           kind: DockerImage
           name: quay.io/rh-aiservices-bu/odh-tec:latest
         importPolicy:
           scheduled: true
   ```

2. **Create Workbench** (User):

   - Select "odh-tec" image
   - Set resources: 1 CPU / 1 GB RAM (minimum)
   - Attach Data Connection (optional)
   - Add environment variables (optional):
     - `HF_TOKEN` - HuggingFace token
     - `MAX_CONCURRENT_TRANSFERS` - Concurrency limit

3. **Launch Workbench**:
   - Click "Start"
   - Wait for pod to be ready
   - Click "Open" to access UI

#### Auto-Configuration

When Data Connection is attached, these environment variables are automatically injected:

- `AWS_S3_ENDPOINT`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_DEFAULT_REGION`
- `AWS_S3_BUCKET`

**No configuration needed** - workbench starts with S3 access.

#### Resource Allocation

**Minimum**:

- CPU: 1 core
- Memory: 1 GB
- Storage: Not required (ephemeral)

**Recommended**:

- CPU: 2 cores (for smoother operation)
- Memory: 2 GB (for multiple concurrent uploads)

### 2. OpenShift Deployment

**Use Case**: Shared tool for entire team

#### Deployment Manifests

**Deployment**:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: odh-tec
  namespace: odh-tools
spec:
  replicas: 2
  selector:
    matchLabels:
      app: odh-tec
  template:
    metadata:
      labels:
        app: odh-tec
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 1001
      containers:
        - name: odh-tec
          image: quay.io/rh-aiservices-bu/odh-tec:latest
          ports:
            - containerPort: 8888
              protocol: TCP
          env:
            - name: AWS_S3_ENDPOINT
              valueFrom:
                secretKeyRef:
                  name: s3-credentials
                  key: endpoint
            - name: AWS_ACCESS_KEY_ID
              valueFrom:
                secretKeyRef:
                  name: s3-credentials
                  key: access-key-id
            - name: AWS_SECRET_ACCESS_KEY
              valueFrom:
                secretKeyRef:
                  name: s3-credentials
                  key: secret-access-key
            - name: AWS_DEFAULT_REGION
              value: 'us-east-1'
            - name: AWS_S3_BUCKET
              value: 'default-bucket'
            - name: MAX_CONCURRENT_TRANSFERS
              value: '4'
          resources:
            requests:
              cpu: 500m
              memory: 512Mi
            limits:
              cpu: 2
              memory: 2Gi
          livenessProbe:
            httpGet:
              path: /
              port: 8888
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /
              port: 8888
            initialDelaySeconds: 10
            periodSeconds: 5
```

**Service**:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: odh-tec
  namespace: odh-tools
spec:
  selector:
    app: odh-tec
  ports:
    - protocol: TCP
      port: 8888
      targetPort: 8888
  type: ClusterIP
```

**Route**:

```yaml
apiVersion: route.openshift.io/v1
kind: Route
metadata:
  name: odh-tec
  namespace: odh-tools
spec:
  to:
    kind: Service
    name: odh-tec
  port:
    targetPort: 8888
  tls:
    termination: edge
    insecureEdgeTerminationPolicy: Redirect
```

**Secret** (S3 Credentials):

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: s3-credentials
  namespace: odh-tools
type: Opaque
stringData:
  endpoint: 'https://s3.amazonaws.com'
  access-key-id: 'YOUR_ACCESS_KEY'
  secret-access-key: 'YOUR_SECRET_KEY'
```

#### Deployment Command

```bash
oc apply -f deployment.yaml
oc apply -f service.yaml
oc apply -f route.yaml
oc apply -f secret.yaml
```

#### Access

```bash
# Get route URL
oc get route odh-tec -n odh-tools

# Example output:
# https://odh-tec-odh-tools.apps.cluster.example.com
```

### 3. Local Podman Deployment

**Use Case**: Development, testing, or standalone usage

#### Create Environment File

**File**: `.env`

```bash
# S3 Configuration
AWS_S3_ENDPOINT=https://s3.amazonaws.com
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
AWS_DEFAULT_REGION=us-east-1
AWS_S3_BUCKET=my-bucket

# HuggingFace (optional)
HF_TOKEN=hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Performance Tuning (optional)
MAX_CONCURRENT_TRANSFERS=2

# Proxy (optional)
HTTP_PROXY=http://proxy.example.com:3128
HTTPS_PROXY=http://proxy.example.com:3128
```

#### Run Container

```bash
podman run --rm -it \
  -p 8888:8888 \
  --env-file=.env \
  quay.io/rh-aiservices-bu/odh-tec:latest
```

**Options**:

- `--rm` - Remove container when stopped
- `-it` - Interactive terminal
- `-p 8888:8888` - Port mapping
- `--env-file` - Load environment from file

#### Access

Open browser at: http://localhost:8888

#### Running in Background

```bash
podman run -d \
  --name odh-tec \
  -p 8888:8888 \
  --env-file=.env \
  --restart=unless-stopped \
  quay.io/rh-aiservices-bu/odh-tec:latest
```

**Manage Container**:

```bash
podman ps                # List running containers
podman logs odh-tec      # View logs
podman stop odh-tec      # Stop container
podman start odh-tec     # Start container
podman rm odh-tec        # Remove container
```

## Resource Requirements

### Minimum Requirements

| Resource | Value    | Notes                                 |
| -------- | -------- | ------------------------------------- |
| CPU      | 1 core   | Sufficient for 2 concurrent transfers |
| Memory   | 1 GB     | Base + 2 transfers                    |
| Storage  | None     | Ephemeral only                        |
| Network  | Standard | Depends on S3 endpoint bandwidth      |

### Recommended Requirements

| Resource | Value          | Notes                            |
| -------- | -------------- | -------------------------------- |
| CPU      | 2 cores        | Better performance               |
| Memory   | 2 GB           | Support 4-8 concurrent transfers |
| Storage  | None           | Still ephemeral                  |
| Network  | High bandwidth | Faster uploads/downloads         |

### Resource Scaling

**Memory scaling with concurrent transfers**:

| Concurrent Transfers | Memory Required | CPU Recommended |
| -------------------- | --------------- | --------------- |
| 2 (default)          | 1 GB            | 1 core          |
| 4                    | 2 GB            | 2 cores         |
| 8                    | 4 GB            | 4 cores         |
| 16                   | 8 GB            | 4 cores         |

**Formula**: `Memory (GB) ≈ 0.5 + (0.1 × concurrent_transfers)`

## Network Configuration

### Port Usage

**Single Port**: 8888

**Traffic Types**:

- HTTP API requests (`/api/*`)
- Static file serving (`/*`)
- Server-Sent Events (SSE) for progress
- WebSocket (if enabled)

### Firewall Rules

**Inbound**:

- Allow TCP 8888 from clients

**Outbound**:

- Allow HTTPS 443 to S3 endpoint
- Allow HTTPS 443 to huggingface.co
- Allow HTTP/HTTPS to proxy (if configured)

### Proxy Configuration

**Environment Variables**:

```bash
HTTP_PROXY=http://proxy.example.com:3128
HTTPS_PROXY=http://proxy.example.com:3128
NO_PROXY=localhost,127.0.0.1,.cluster.local
```

**Applied to**:

- S3 SDK client
- Axios (HuggingFace API)
- Node.js HTTPS agent

## Security Configuration

### Container Security

**Non-Root User**:

- Runs as UID 1001
- No privileged operations
- OpenShift-compatible

**Capabilities**:

- No special capabilities required
- No host access needed

**SELinux**:

- Compatible with enforcing mode
- No custom policy required

### Network Security

**TLS/SSL**:

- Backend supports HTTPS endpoints
- Automatic CA bundle loading
- Certificate validation enabled

**CA Bundle Paths** (auto-loaded):

```bash
/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem
/var/run/secrets/kubernetes.io/serviceaccount/ca.crt
/var/run/secrets/kubernetes.io/serviceaccount/service-ca.crt
/etc/pki/tls/certs/odh-ca-bundle.crt
/etc/pki/tls/certs/odh-trusted-ca-bundle.crt
```

### Secrets Management

**Best Practices**:

1. Use Kubernetes Secrets for credentials
2. Never commit credentials to Git
3. Use Data Connections in ODH/RHOAI
4. Rotate credentials regularly

**Secret Mounting** (OpenShift):

```yaml
volumeMounts:
  - name: s3-credentials
    mountPath: /etc/secrets
    readOnly: true
volumes:
  - name: s3-credentials
    secret:
      secretName: s3-credentials
```

## High Availability

### Horizontal Scaling

**Stateless Design** enables horizontal scaling:

```yaml
spec:
  replicas: 3 # Scale to 3 pods
```

**Load Balancing**:

- Service distributes traffic
- No session affinity required
- All pods can serve any request

**Limitations**:

- No shared state between pods
- SSE progress tracking is per-connection
- Upload progress lost if pod dies

### Health Checks

**Liveness Probe**:

```yaml
livenessProbe:
  httpGet:
    path: /
    port: 8888
  initialDelaySeconds: 30
  periodSeconds: 10
  failureThreshold: 3
```

**Readiness Probe**:

```yaml
readinessProbe:
  httpGet:
    path: /
    port: 8888
  initialDelaySeconds: 10
  periodSeconds: 5
  failureThreshold: 3
```

### Rolling Updates

**Deployment Strategy**:

```yaml
spec:
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
```

**Zero Downtime Updates**:

1. New pod starts
2. Readiness probe passes
3. Traffic shifts to new pod
4. Old pod terminates

## Monitoring and Logging

### Logging

**Log Output**: stdout/stderr (container standard)

**Log Levels**:

- `info` - Default (production)
- `debug` - Verbose (development)
- `warn` - Warnings only
- `error` - Errors only

**Configuration**:

```yaml
env:
  - name: LOG_LEVEL
    value: 'info'
```

**Access Logs**:

- Written to `logs/access.log` (inside container)
- Also output to stdout
- Format: `TIMESTAMP - METHOD URL`

### Viewing Logs

**Podman**:

```bash
podman logs odh-tec
podman logs -f odh-tec  # Follow
```

**OpenShift**:

```bash
oc logs deployment/odh-tec
oc logs -f deployment/odh-tec  # Follow
```

### Metrics

**No built-in metrics** (future enhancement)

**Potential metrics to add**:

- Request rate
- Response time
- Upload/download throughput
- Error rate
- Active transfers

**Prometheus Integration** (future):

- Add `prom-client` library
- Expose `/metrics` endpoint
- Create ServiceMonitor

---

**Next**:

- [Configuration](configuration.md) - Environment variables and settings
- [System Architecture](system-architecture.md) - Overall architecture
- [Backend Architecture](backend-architecture.md) - API implementation
