# CLAUDE.md - ODH-TEC Backend Context

> **Note for AI Assistants**: This is a backend-specific context file for the ODH-TEC Fastify application. For project overview, see root [CLAUDE.md](../CLAUDE.md). For frontend context, see [frontend/CLAUDE.md](../frontend/CLAUDE.md).

## Backend Overview

**odh-tec-backend** - Fastify-based API server with TypeScript, AWS S3 integration, and streaming file transfers.

**Technology Stack**: Fastify 4, Node.js 18+, AWS SDK v3, TypeScript
**Development**: Port 8888 with nodemon hot reload
**Production**: Serves both API endpoints and static frontend files on port 8888

**For detailed architecture**, see [Backend Architecture](../docs/architecture/backend-architecture.md).

## Critical Architecture Principles

### 1. Fastify Plugin Pattern

⚠️ **REQUIRED**: All routes and plugins MUST be Fastify plugins (async functions accepting FastifyInstance).

**Pattern**: Each route file exports an async function that registers routes:

```typescript
export default async (fastify: FastifyInstance): Promise<void> => {
  fastify.get('/endpoint', async (req, reply) => {
    /* handler */
  });
};
```

**Autoload**: Routes and plugins are automatically loaded from their respective directories (`src/routes/`, `src/plugins/`).

### 2. Streaming Architecture

⚠️ **CRITICAL**: All file operations MUST use streaming - no intermediate storage.

- Direct passthrough from source to destination
- Memory-efficient (~256MB max for 7B model imports)
- Concurrent transfer limits via `p-limit` (default: 2)
- Supports files larger than available RAM

### 3. Error Handling Pattern

⚠️ **REQUIRED**: Always handle `S3ServiceException` separately from generic errors.

- Check for `S3ServiceException` instance
- Extract HTTP status code from `error.$metadata?.httpStatusCode`
- Provide proper error messages in response

### 4. Configuration Management

- Runtime S3 configuration via `getS3Config()` and `updateS3Config()`
- Environment variables loaded from `.env` or ODH/RHOAI Data Connection
- Proxy support via HTTP_PROXY and HTTPS_PROXY
- Configuration updates require S3 client reinitialization

## Essential Development Commands

```bash
# Development server with hot reload
npm run start:dev

# Building
npm run build          # Clean + TypeScript production build

# Testing
npm test               # Lint + type-check + jest
npm run test:lint      # ESLint check
npm run test:jest      # Jest tests with coverage

# Code quality
npm run format         # Prettier format

# Production
npm start              # Run production build from dist/
```

**For complete workflow**, see [Development Workflow](../docs/development/development-workflow.md).

## Route Organization

API routes are organized under `/api/*` and auto-loaded from `src/routes/api/`:

- `/api/buckets` - S3 bucket operations
- `/api/objects` - S3 object operations (upload, download, list, delete)
- `/api/settings` - Configuration management (S3, HuggingFace, proxy)
- `/api/disclaimer` - Application metadata

Static files served from `frontend/dist/` via `@fastify/static` in production.

**For detailed route documentation**, see [Backend Architecture](../docs/architecture/backend-architecture.md).

## Key Implementation Guidelines

### For AI Assistants

**DO:**

- ✅ Use Fastify plugin pattern for all routes
- ✅ Use streaming for all file operations (Upload from `@aws-sdk/lib-storage`)
- ✅ Handle S3ServiceException with proper status codes
- ✅ Use `getS3Config()` to access current S3 client
- ✅ Add logging with `logAccess(req)` for all routes
- ✅ Control concurrency with `p-limit(getMaxConcurrentTransfers())`
- ✅ Support proxy configuration for enterprise environments
- ✅ Use TypeScript with proper types (FastifyRequest, FastifyReply, FastifyInstance)
- ✅ **Run `npm run format` after creating or modifying files** - Ensures consistent Prettier formatting across the codebase

**DON'T:**

- ❌ Load entire files into memory - always stream
- ❌ Skip error handling for S3 operations
- ❌ Ignore runtime configuration updates
- ❌ Create routes outside the plugin pattern
- ❌ Bypass autoload conventions

### Testing Requirements

- Use `aws-sdk-client-mock` for mocking S3 operations
- Use `fastify.inject()` for testing routes without starting server
- Mock configuration module with Jest
- Test both success and error cases (especially S3ServiceException)

**For testing patterns**, see [Backend Architecture - Testing](../docs/architecture/backend-architecture.md#testing).

## Project Structure

```
backend/
├── src/
│   ├── routes/api/       # Auto-loaded API routes
│   ├── plugins/          # Auto-loaded Fastify plugins
│   ├── utils/            # Config, logging, constants
│   ├── __tests__/        # Jest tests
│   ├── app.ts            # Fastify app initialization
│   └── server.ts         # Server entry point
├── dist/                 # Compiled JavaScript
├── tsconfig.json         # TypeScript config (dev + test)
└── tsconfig.prod.json    # Production config (excludes tests)
```

## Environment Variables

Key configuration from environment (see [.env.example](.env.example) or [Configuration](../docs/deployment/configuration.md)):

- **S3**: `AWS_S3_ENDPOINT`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION`, `AWS_S3_BUCKET`
- **HuggingFace**: `HF_TOKEN`
- **Performance**: `MAX_CONCURRENT_TRANSFERS` (default: 2)
- **Proxy**: `HTTP_PROXY`, `HTTPS_PROXY`

## Known Limitations

- No authentication or authorization
- No rate limiting
- Ephemeral configuration (runtime updates not persisted)
- No database (all state from S3/environment)
- Limited error recovery/retry logic

## Related Documentation

- [Backend Architecture](../docs/architecture/backend-architecture.md) - Complete implementation details, code patterns, and examples
- [Development Workflow](../docs/development/development-workflow.md) - Build process, testing, and development setup
- [Configuration](../docs/deployment/configuration.md) - Environment variables and runtime configuration
- [Data Flow](../docs/architecture/data-flow.md) - Streaming patterns and API communication
- Root [CLAUDE.md](../CLAUDE.md) - Project overview
- Frontend [CLAUDE.md](../frontend/CLAUDE.md) - Frontend React app context
