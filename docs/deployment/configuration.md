# Configuration Management

This document describes how ODH-TEC handles configuration, including environment variables, runtime settings, and auto-detection mechanisms.

## Table of Contents

- [Overview](#overview)
- [Configuration Layers](#configuration-layers)
- [Environment Variables](#environment-variables)
- [Runtime Configuration](#runtime-configuration)
- [Auto-Detection](#auto-detection)
- [Configuration Files](#configuration-files)
- [Proxy Configuration](#proxy-configuration)
- [Security Considerations](#security-considerations)

## Overview

ODH-TEC uses a **multi-layer configuration system**:

1. **Default Values** - Hardcoded fallbacks in code
2. **Environment Variables** - Startup configuration
3. **Auto-Detection** - Platform-specific discovery
4. **Runtime Updates** - User-configured via Settings UI

**Configuration Flow**:

```
Default Values
    ↓
Environment Variables (override defaults)
    ↓
Auto-Detection (detect platform config)
    ↓
Runtime Updates (ephemeral, lost on restart)
```

## Configuration Layers

### Layer 1: Default Values

**Hardcoded in source code**:

```typescript
// backend/src/utils/config.ts
const DEFAULT_REGION = 'us-east-1';
const DEFAULT_MAX_CONCURRENT_TRANSFERS = 2;
const DEFAULT_LOG_LEVEL = 'info';
```

**Purpose**:

- Fallback when no configuration provided
- Safe defaults for development
- Ensure application can start

### Layer 2: Environment Variables

**Loaded at startup**:

```typescript
// backend/src/utils/dotenv.ts
import dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';

const myEnv = dotenv.config();
dotenvExpand.expand(myEnv);
```

**Source**:

- `.env` file (development)
- System environment (production)
- Kubernetes ConfigMap/Secret (OpenShift)
- Data Connection (ODH/RHOAI)

### Layer 3: Auto-Detection

**Platform-specific discovery**:

```typescript
// Auto-detect Data Connection environment variables
if (process.env.AWS_S3_ENDPOINT) {
  endpoint = process.env.AWS_S3_ENDPOINT;
}

// Auto-load CA bundles
const caPaths = [
  '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt',
  '/etc/pki/tls/certs/odh-ca-bundle.crt',
  // ... more paths
];
```

**Purpose**:

- Seamless integration with ODH/RHOAI
- Support enterprise environments
- Reduce manual configuration

### Layer 4: Runtime Updates

**User-configured via Settings UI**:

```typescript
// backend/src/utils/config.ts
export const updateS3Config = (
  newAccessKeyId: string,
  newSecretAccessKey: string,
  newRegion: string,
  newEndpoint: string,
  newDefaultBucket: string,
): void => {
  accessKeyId = newAccessKeyId;
  secretAccessKey = newSecretAccessKey;
  region = newRegion;
  endpoint = newEndpoint;
  defaultBucket = newDefaultBucket;

  s3Client = initializeS3Client();
};
```

**Characteristics**:

- Ephemeral (lost on pod restart)
- Overrides all other layers
- Useful for testing different configurations

## Environment Variables

### Complete Variable Reference

#### S3 Configuration

| Variable                | Required | Default     | Description     | Example                    |
| ----------------------- | -------- | ----------- | --------------- | -------------------------- |
| `AWS_S3_ENDPOINT`       | Yes\*    | -           | S3 endpoint URL | `https://s3.amazonaws.com` |
| `AWS_ACCESS_KEY_ID`     | Yes\*    | -           | S3 access key   | `AKIAIOSFODNN7EXAMPLE`     |
| `AWS_SECRET_ACCESS_KEY` | Yes\*    | -           | S3 secret key   | `wJalrXUtnFEMI/K7MDENG...` |
| `AWS_DEFAULT_REGION`    | No       | `us-east-1` | AWS region      | `us-east-1`, `eu-west-1`   |
| `AWS_S3_BUCKET`         | No       | -           | Default bucket  | `my-bucket`                |

\*Required unless configured via Settings UI

#### HuggingFace Configuration

| Variable   | Required | Default | Description           | Example        |
| ---------- | -------- | ------- | --------------------- | -------------- |
| `HF_TOKEN` | No       | -       | HuggingFace API token | `hf_xxxxxxxxx` |

**Note**: Only required for private model imports

#### Performance Tuning

| Variable                   | Required | Default | Description                    | Example       |
| -------------------------- | -------- | ------- | ------------------------------ | ------------- |
| `MAX_CONCURRENT_TRANSFERS` | No       | `2`     | Max parallel uploads/downloads | `2`, `4`, `8` |

**Memory Impact**:

- 2 transfers: ~1 GB RAM
- 4 transfers: ~2 GB RAM
- 8 transfers: ~4 GB RAM

#### Proxy Configuration

| Variable      | Required | Default | Description       | Example                    |
| ------------- | -------- | ------- | ----------------- | -------------------------- |
| `HTTP_PROXY`  | No       | -       | HTTP proxy URL    | `http://proxy:3128`        |
| `HTTPS_PROXY` | No       | -       | HTTPS proxy URL   | `http://proxy:3128`        |
| `NO_PROXY`    | No       | -       | Proxy bypass list | `localhost,.cluster.local` |

#### Application Configuration

| Variable    | Required | Default       | Description      | Example                          |
| ----------- | -------- | ------------- | ---------------- | -------------------------------- |
| `NODE_ENV`  | No       | `development` | Environment mode | `development`, `production`      |
| `PORT`      | No       | `8888`        | Server port      | `8888`, `3000`                   |
| `LOG_LEVEL` | No       | `info`        | Logging level    | `debug`, `info`, `warn`, `error` |

### Environment File Example

**File**: `backend/.env.example`

```bash
# ===========================================
# S3 Configuration (Required)
# ===========================================

# S3 endpoint URL (required)
# Examples:
#   - AWS S3: https://s3.amazonaws.com
#   - Minio: http://minio.example.com:9000
#   - OpenShift Data Foundation: https://s3.openshift-storage.svc
AWS_S3_ENDPOINT=https://s3.amazonaws.com

# S3 access credentials (required)
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY

# AWS region (optional, default: us-east-1)
AWS_DEFAULT_REGION=us-east-1

# Default S3 bucket (optional)
AWS_S3_BUCKET=my-bucket

# ===========================================
# HuggingFace Configuration (Optional)
# ===========================================

# HuggingFace API token (optional)
# Required only for private model imports
# Get your token at: https://huggingface.co/settings/tokens
HF_TOKEN=hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ===========================================
# Performance Tuning (Optional)
# ===========================================

# Maximum concurrent file transfers (default: 2)
# Higher values increase memory usage:
#   2 transfers: ~1 GB RAM
#   4 transfers: ~2 GB RAM
#   8 transfers: ~4 GB RAM
MAX_CONCURRENT_TRANSFERS=2

# ===========================================
# Proxy Configuration (Optional)
# ===========================================

# HTTP/HTTPS proxy for outbound connections
# Required in corporate/enterprise environments
HTTP_PROXY=http://proxy.example.com:3128
HTTPS_PROXY=http://proxy.example.com:3128

# Proxy bypass list (comma-separated)
NO_PROXY=localhost,127.0.0.1,.cluster.local

# ===========================================
# Application Configuration (Optional)
# ===========================================

# Node.js environment (development | production)
NODE_ENV=development

# Server port (default: 8888)
PORT=8888

# Logging level (debug | info | warn | error)
LOG_LEVEL=info
```

### Using Environment Files

**Development**:

```bash
# Copy example to .env
cp backend/.env.example backend/.env

# Edit .env with your values
vim backend/.env

# Start application
npm run dev
```

**Podman/Docker**:

```bash
# Run with env file
podman run --env-file=backend/.env -p 8888:8888 odh-tec:latest
```

**Kubernetes**:

```yaml
# ConfigMap
apiVersion: v1
kind: ConfigMap
metadata:
  name: odh-tec-config
data:
  AWS_DEFAULT_REGION: 'us-east-1'
  AWS_S3_BUCKET: 'my-bucket'
  MAX_CONCURRENT_TRANSFERS: '4'
  LOG_LEVEL: 'info'

---
# Secret
apiVersion: v1
kind: Secret
metadata:
  name: odh-tec-secrets
type: Opaque
stringData:
  AWS_S3_ENDPOINT: 'https://s3.amazonaws.com'
  AWS_ACCESS_KEY_ID: 'AKIAIOSFODNN7EXAMPLE'
  AWS_SECRET_ACCESS_KEY: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'

---
# Deployment using ConfigMap + Secret
spec:
  containers:
    - name: odh-tec
      envFrom:
        - configMapRef:
            name: odh-tec-config
        - secretRef:
            name: odh-tec-secrets
```

## Runtime Configuration

### Settings UI

**Location**: `/settings` route in application

**Configurable Settings**:

1. **S3 Connection**

   - Endpoint URL
   - Access Key ID
   - Secret Access Key
   - Region
   - Default Bucket

2. **HuggingFace**

   - API Token

3. **Proxy**

   - HTTP Proxy
   - HTTPS Proxy

4. **Performance**
   - Max Concurrent Transfers

### API Endpoints

**Get S3 Settings**:

```bash
GET /api/settings/s3
```

**Update S3 Settings**:

```bash
PUT /api/settings/s3
Content-Type: application/json

{
  "endpoint": "https://s3.amazonaws.com",
  "accessKeyId": "AKIAIOSFODNN7EXAMPLE",
  "secretAccessKey": "wJalrXUtnFEMI/K7MDENG...",
  "region": "us-east-1",
  "bucket": "my-bucket"
}
```

**Test S3 Connection**:

```bash
POST /api/settings/test-s3
```

### Persistence

**Important**: Runtime configuration is **ephemeral**.

**Not Persisted**:

- Settings UI changes
- Runtime API updates

**Lost On**:

- Pod restart
- Container restart
- Application crash

**To Persist**:

- Use environment variables
- Use Kubernetes ConfigMap/Secret
- Use Data Connection (ODH/RHOAI)

### Configuration Priority

When multiple sources provide configuration:

```
Runtime Updates (highest priority)
    ↓
Environment Variables
    ↓
Default Values (lowest priority)
```

**Example**:

```
Default:      region = 'us-east-1'
Env Var:      AWS_DEFAULT_REGION = 'eu-west-1'
Runtime:      updateS3Config(..., 'ap-south-1', ...)

Result:       region = 'ap-south-1'
```

## Auto-Detection

### Data Connection (ODH/RHOAI)

**Automatic Detection**:

When workbench has attached Data Connection, these environment variables are auto-injected:

```bash
AWS_S3_ENDPOINT=https://s3.openshift-storage.svc
AWS_ACCESS_KEY_ID=xxxxxxxxxxxx
AWS_SECRET_ACCESS_KEY=xxxxxxxxxxxx
AWS_DEFAULT_REGION=us-east-1
AWS_S3_BUCKET=my-bucket
```

**Backend Auto-Detection**:

```typescript
// backend/src/utils/config.ts
const endpoint = process.env.AWS_S3_ENDPOINT || '';
const accessKeyId = process.env.AWS_ACCESS_KEY_ID || '';
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || '';

if (endpoint && accessKeyId && secretAccessKey) {
  console.log('✓ S3 configuration detected from environment');
  s3Client = initializeS3Client();
} else {
  console.log('⚠ No S3 configuration found. Please configure via Settings.');
}
```

**User Experience**:

1. Create workbench with Data Connection
2. Launch workbench
3. **No configuration needed** - automatically connected to S3

### CA Bundle Loading

**Auto-detect platform CA certificates**:

```typescript
const caPaths = [
  '/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem', // RHEL/CentOS
  '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt', // Kubernetes
  '/var/run/secrets/kubernetes.io/serviceaccount/service-ca.crt',
  '/etc/pki/tls/certs/odh-ca-bundle.crt', // ODH
  '/etc/pki/tls/certs/odh-trusted-ca-bundle.crt', // RHOAI
];

const loadedBundles = caPaths.map(getCABundle).filter((ca) => ca !== undefined);

if (loadedBundles.length > 0) {
  https.globalAgent.options.ca = loadedBundles;
  console.log(`✓ Loaded ${loadedBundles.length} CA bundles`);
}
```

**Purpose**:

- Trust platform/cluster certificates
- Enable HTTPS to internal services
- Support enterprise CA requirements

## Configuration Files

### TypeScript Configs

**Backend** (`backend/tsconfig.json`):

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Frontend** (`frontend/tsconfig.json`):

```json
{
  "compilerOptions": {
    "target": "ES6",
    "lib": ["DOM", "ES2015"],
    "jsx": "react",
    "module": "ESNext",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

### Webpack Configs

**Common** (`frontend/webpack.common.js`):

- Shared configuration
- Loaders (ts-loader, css-loader, etc.)
- Plugins (HtmlWebpackPlugin, etc.)

**Development** (`frontend/webpack.dev.js`):

- Source maps
- Dev server on port 9000
- HMR enabled
- Proxy to backend

**Production** (`frontend/webpack.prod.js`):

- Minification
- Code splitting
- Optimization

### ESLint Config

**Backend** (`backend/.eslintrc`):

```json
{
  "parser": "@typescript-eslint/parser",
  "extends": ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  "rules": {
    "no-console": "off",
    "@typescript-eslint/no-explicit-any": "warn"
  }
}
```

## Proxy Configuration

### Use Cases

**Enterprise Environments**:

- Corporate proxy required for internet access
- Firewall rules restrict direct connections
- Security policy requires proxy

**Example Network**:

```
ODH-TEC Container
    │
    │ HTTP_PROXY / HTTPS_PROXY
    ▼
Corporate Proxy (proxy.corp.com:3128)
    │
    ├─────────────┬─────────────┐
    │             │             │
    ▼             ▼             ▼
S3 Storage   HuggingFace   Internet
```

### Configuration

**Environment Variables**:

```bash
HTTP_PROXY=http://proxy.corp.com:3128
HTTPS_PROXY=http://proxy.corp.com:3128
NO_PROXY=localhost,127.0.0.1,.cluster.local
```

**Backend Implementation**:

```typescript
// S3 Client with proxy
const httpProxy = process.env.HTTP_PROXY;
const httpsProxy = process.env.HTTPS_PROXY;

if (httpProxy || httpsProxy) {
  s3ClientOptions.requestHandler = new NodeHttpHandler({
    httpAgent: new HttpProxyAgent(httpProxy),
    httpsAgent: new HttpsProxyAgent(httpsProxy),
  });
}

// Axios with proxy
const config: AxiosRequestConfig = {
  httpAgent: httpProxy ? new HttpProxyAgent(httpProxy) : undefined,
  httpsAgent: httpsProxy ? new HttpsProxyAgent(httpsProxy) : undefined,
};
```

### Testing Proxy

**Verify proxy is used**:

```bash
# Check environment
echo $HTTP_PROXY
echo $HTTPS_PROXY

# Check logs for proxy usage
oc logs deployment/odh-tec | grep -i proxy

# Test S3 connection via Settings UI
# Should succeed if proxy configuration is correct
```

## Security Considerations

### Credential Storage

**Best Practices**:

1. **Never commit credentials to Git**

   - Add `.env` to `.gitignore`
   - Use `.env.example` template only

2. **Use Kubernetes Secrets**

   - Store credentials in Secrets
   - Mount as environment variables
   - Never use ConfigMaps for secrets

3. **Rotate credentials regularly**

   - Update S3 access keys
   - Update HuggingFace tokens
   - Test after rotation

4. **Use Data Connections**
   - Leverage platform-managed secrets
   - Benefit from platform security

### Credential Handling

**Never logged**:

```typescript
// Redacted from logs
logger: pino({
  redact: [
    'headers.Authorization',
    'request.headers.Authorization',
    'AWS_SECRET_ACCESS_KEY',
    'HF_TOKEN',
  ],
});
```

**Never exposed to frontend**:

- Credentials only in backend
- Frontend never receives credentials
- Settings UI returns masked values

**Example (masked response)**:

```json
{
  "endpoint": "https://s3.amazonaws.com",
  "accessKeyId": "AKIA************",
  "secretAccessKey": "****************************",
  "region": "us-east-1"
}
```

### Environment Isolation

**Development vs Production**:

```bash
# Development (.env file)
NODE_ENV=development
LOG_LEVEL=debug

# Production (Kubernetes Secret)
NODE_ENV=production
LOG_LEVEL=info
```

**Separation**:

- Development: Local `.env` file
- Production: Kubernetes Secrets
- Never share environments

---

**Next**:

- [Deployment](deployment.md) - Container build and deployment
- [Backend Architecture](backend-architecture.md) - Configuration implementation
- [Technology Stack](technology-stack.md) - All technologies used
