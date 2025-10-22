# Monorepo Structure

This document describes the repository organization of ODH-TEC as a monorepo, including package structure, build orchestration, and dependency management.

## Table of Contents

- [Overview](#overview)
- [Directory Structure](#directory-structure)
- [Package Organization](#package-organization)
- [Build Orchestration](#build-orchestration)
- [Dependency Management](#dependency-management)
- [Development Workflow](#development-workflow)
- [Advantages of Monorepo](#advantages-of-monorepo)

## Overview

ODH-TEC uses a **monorepo architecture** where both backend and frontend packages are maintained in a single repository. The root package coordinates builds, tests, and development tasks across all packages.

### Monorepo Goals

1. **Unified Tooling** - Shared development tools and configurations
2. **Coordinated Releases** - Single version number for frontend and backend
3. **Simplified Development** - Single repository clone for full-stack development
4. **Consistent Dependencies** - Shared dependencies managed at root level
5. **Atomic Changes** - Cross-package changes in single commit

## Directory Structure

### Complete Repository Layout

```
odh-tec/                           # Root package (monorepo coordinator)
├── backend/                       # Backend package (Fastify API)
│   ├── src/                       # TypeScript source code
│   │   ├── routes/               # API route handlers
│   │   │   ├── api/              # API endpoints
│   │   │   │   ├── buckets/      # Bucket management routes
│   │   │   │   ├── objects/      # Object operations routes
│   │   │   │   ├── settings/     # Settings routes
│   │   │   │   ├── disclaimer/   # Info routes
│   │   │   │   └── not-found.ts  # 404 handler
│   │   │   └── root.ts           # Root route
│   │   ├── plugins/              # Fastify plugins
│   │   │   └── keep.ts           # Placeholder
│   │   ├── utils/                # Utility functions
│   │   │   ├── config.ts         # S3 configuration
│   │   │   ├── constants.ts      # Constants
│   │   │   ├── dotenv.ts         # Env loader
│   │   │   └── logAccess.ts      # Logging utility
│   │   ├── __tests__/            # Test files
│   │   │   └── routes/           # Route tests
│   │   ├── __mocks__/            # Jest mocks
│   │   ├── app.ts                # Fastify app setup
│   │   ├── server.ts             # Server entry point
│   │   ├── types.ts              # Type definitions
│   │   └── typeHelpers.ts        # Type utilities
│   ├── dist/                     # Compiled JavaScript (generated)
│   ├── coverage/                 # Test coverage reports (generated)
│   ├── tsconfig.json             # TypeScript config (dev)
│   ├── tsconfig.prod.json        # TypeScript config (prod)
│   ├── jest.config.js            # Jest configuration
│   ├── .eslintrc                 # ESLint configuration
│   ├── .env.example              # Environment template
│   └── package.json              # Backend dependencies/scripts
│
├── frontend/                     # Frontend package (React app)
│   ├── src/                      # TypeScript/React source
│   │   ├── app/                  # Application code
│   │   │   ├── components/       # React components
│   │   │   │   ├── AppLayout/    # Main layout
│   │   │   │   ├── Buckets/      # Bucket management UI
│   │   │   │   ├── ObjectBrowser/ # Object browser UI
│   │   │   │   ├── VramEstimator/ # VRAM calculator
│   │   │   │   ├── Settings/     # Settings UI
│   │   │   │   ├── UserContext/  # Context provider
│   │   │   │   ├── DocumentRenderer/ # Markdown renderer
│   │   │   │   └── NotFound/     # 404 page
│   │   │   ├── assets/           # Static assets
│   │   │   │   ├── images/       # Images
│   │   │   │   └── bgimages/     # Background images
│   │   │   ├── utils/            # Utilities
│   │   │   ├── routes.tsx        # Route definitions
│   │   │   ├── index.tsx         # App component
│   │   │   ├── config.tsx        # App config
│   │   │   └── app.css           # Global styles
│   │   ├── i18n/                 # Internationalization
│   │   │   └── config.ts         # i18n configuration
│   │   ├── redux/                # Redux (legacy, not used)
│   │   ├── utilities/            # Shared utilities
│   │   ├── index.tsx             # Entry point
│   │   ├── index.html            # HTML template
│   │   └── typings.d.ts          # Type declarations
│   ├── dist/                     # Webpack build output (generated)
│   ├── webpack.common.js         # Webpack base config
│   ├── webpack.dev.js            # Webpack dev config
│   ├── webpack.prod.js           # Webpack prod config
│   ├── tsconfig.json             # TypeScript configuration
│   ├── jest.config.js            # Jest configuration
│   ├── .env.example              # Environment template
│   └── package.json              # Frontend dependencies/scripts
│
├── docs/                         # Documentation
│   ├── architecture/             # Architecture docs
│   ├── development/              # Development guides
│   ├── features/                 # Feature specs
│   └── api/                      # API docs (future)
│
├── scripts/                      # Build/utility scripts
├── logs/                         # Log files (generated)
├── img/                          # README screenshots
│
├── .claude/                      # Claude Code configuration
├── .vscode/                      # VS Code settings
├── .docs/                        # Additional docs
│
├── Containerfile                 # Multi-stage container build
├── .containerignore              # Container build exclusions
├── CLAUDE.md                     # Root AI context
├── README.md                     # Project README
├── LICENSE                       # License file
├── package.json                  # Root package (orchestrator)
├── package-lock.json             # Root lockfile
├── .gitignore                    # Git exclusions
├── .npmrc                        # npm configuration
└── .prettierrc                   # Prettier configuration
```

## Package Organization

### Root Package

**Purpose**: Build orchestration and shared tooling

**Location**: `/`

**Key Files**:

- `package.json` - Orchestration scripts and shared dependencies
- `.prettierrc` - Shared code formatting
- `.gitignore` - Shared ignore patterns
- `Containerfile` - Container build definition

**Dependencies**:

- `npm-run-all` - Parallel/sequential script execution
- `prettier` - Code formatting
- `dotenv` - Environment variable loading
- Proxy agents (shared with backend)

**Scripts** (from package.json):

```json
{
  "build": "run-p -l build:*", // Build backend + frontend in parallel
  "build:backend": "cd ./backend && npm run build",
  "build:frontend": "cd ./frontend && npm run build",

  "dev": "run-p -l dev:*", // Run both in dev mode (parallel)
  "dev:backend": "cd ./backend && npm run start:dev",
  "dev:frontend": "cd ./frontend && npm run start:dev",

  "test": "run-s test:backend test:frontend", // Test sequentially
  "test:backend": "cd ./backend && npm run test",
  "test:frontend": "cd ./frontend && npm run test",

  "format": "prettier --write \"backend/**/*.ts\" \"frontend/**/*.tsx\"",

  "postinstall": "run-p postinstall:*", // Install package deps
  "postinstall:backend": "cd ./backend && npm install",
  "postinstall:frontend": "cd ./frontend && npm install"
}
```

### Backend Package

**Purpose**: Fastify API server

**Location**: `/backend`

**Package Name**: `odh-tec-backend`

**Main File**: `src/server.ts`

**Scripts**:

```json
{
  "start": "node ./dist/server.js", // Production
  "start:dev": "nodemon src/server.ts", // Development with hot reload
  "build": "run-s build:clean tsc:prod", // Clean + compile
  "test": "run-s test:lint test:type-check test:jest",
  "test:lint": "eslint --max-warnings 0 --ext .json,.js,.ts src/plugins src/routes src/utils",
  "test:fix": "eslint --ext .json,.js,.ts src/plugins src/routes src/utils --fix",
  "test:type-check": "tsc --noEmit",
  "test:jest": "jest --coverage"
}
```

**Key Dependencies**:

- `fastify` - Web framework
- `@fastify/autoload` - Plugin/route autoloading
- `@fastify/static` - Static file serving
- `@fastify/multipart` - File upload handling
- `@aws-sdk/client-s3` - S3 client
- `@aws-sdk/lib-storage` - Multipart uploads
- `axios` - HTTP client (HuggingFace API)
- `p-limit` - Concurrency control

**Dev Dependencies**:

- `typescript` - TypeScript compiler
- `ts-node` - TypeScript execution
- `nodemon` - Hot reload
- `jest` - Testing framework
- `eslint` - Linting

### Frontend Package

**Purpose**: React web application

**Location**: `/frontend`

**Package Name**: `odh-tec-frontend`

**Main File**: `src/index.tsx`

**Scripts**:

```json
{
  "build": "webpack --config ./webpack.prod.js", // Production build
  "start:dev": "webpack serve --config ./webpack.dev.js", // Dev server
  "test": "jest", // Run tests
  "test:coverage": "jest --coverage",
  "lint": "eslint --ext .tsx,.js ./src/",
  "format": "prettier --check --write ./src/**/*.{tsx,ts}",
  "type-check": "tsc --noEmit",
  "ci-checks": "npm run type-check && npm run lint && npm run test:coverage"
}
```

**Key Dependencies**:

- `react` - UI framework
- `react-dom` - DOM rendering
- `react-router-dom` - Routing
- `@patternfly/react-core` - UI components
- `@patternfly/react-table` - Table components
- `@patternfly/react-icons` - Icons
- `axios` - API client
- `i18next` - Internationalization

**Dev Dependencies**:

- `webpack` - Bundler
- `webpack-dev-server` - Development server
- `typescript` - TypeScript compiler
- `ts-loader` - TypeScript webpack loader
- `jest` - Testing framework
- `@testing-library/react` - React testing utilities

## Build Orchestration

The monorepo uses `npm-run-all` to coordinate builds and tests:

- **Parallel execution** (`run-p`) - Build and dev commands run both packages concurrently
- **Sequential execution** (`run-s`) - Test commands run packages one at a time
- **Cascading install** - `npm install` from root triggers installation in all packages via postinstall hooks

> **For complete build commands and development workflow**, see [Development Workflow](../../development/development-workflow.md).

## Dependency Management

### Shared Dependencies

Some dependencies are shared at root level:

**Root package.json**:

```json
{
  "dependencies": {
    "dotenv": "^16.5.0", // Used by root scripts
    "npm-run-all": "^4.1.5", // Build orchestration
    "prettier": "^3.5.3", // Code formatting
    "http-proxy-agent": "^7.0.2", // Shared with backend
    "https-proxy-agent": "^7.0.6" // Shared with backend
  }
}
```

**Why shared**:

- Avoid version conflicts
- Reduce total dependency count
- Consistent formatting across packages

### Package-Specific Dependencies

Each package maintains its own dependencies:

**Backend** (backend/package.json):

- Fastify ecosystem
- AWS SDK
- Utility libraries

**Frontend** (frontend/package.json):

- React ecosystem
- PatternFly components
- Build tools (Webpack)

### Version Synchronization

All packages share the same version number:

```json
// Root, backend, and frontend package.json
{
  "version": "2.0.7"
}
```

**Why**:

- Single release version
- Simplified deployment
- Clear compatibility

### Lockfile Management

- **Root**: `package-lock.json` for root dependencies
- **Backend**: `backend/package-lock.json` for backend
- **Frontend**: `frontend/package-lock.json` for frontend

**Best Practice**:

- Commit all lockfiles
- Update lockfiles together
- Avoid lockfile conflicts

## Advantages of Monorepo

### For Development

1. **Single Clone** - Get entire codebase with one command
2. **Consistent Tooling** - Shared ESLint, Prettier, TypeScript configs
3. **Atomic Changes** - Change backend API and frontend consumer in one commit
4. **Simplified Setup** - Single `npm install` for everything
5. **Cross-Package Refactoring** - Safe renames across boundaries

### For Deployment

1. **Single Version** - One version number for entire application
2. **Single Build** - One container image with both packages
3. **Coordinated Releases** - No version mismatch between frontend/backend
4. **Simplified CI/CD** - One build pipeline

### For Maintenance

1. **Shared Dependencies** - Easier to update common dependencies
2. **Consistent Code Style** - Single Prettier/ESLint config
3. **Unified Documentation** - All docs in one place
4. **Single Issue Tracker** - One GitHub repository

## Trade-offs

### Advantages

✅ Easier cross-package changes
✅ Simplified dependency management
✅ Atomic commits across packages
✅ Single version number
✅ Consistent tooling

### Disadvantages

❌ Larger repository size
❌ All or nothing checkout
❌ Requires build orchestration tools
❌ Potential for tight coupling
❌ More complex CI/CD setup

### Why Monorepo for ODH-TEC?

**Decision Factors**:

1. **Tight Coupling** - Frontend and backend are tightly coupled (same release cycle)
2. **Small Team** - Easier coordination with monorepo
3. **Single Deployment** - Both packages deployed together
4. **Shared Tooling** - Benefits from consistent configuration
5. **Simplified Development** - Single repository clone for contributors

---

**Next**:

- [Backend Architecture](backend-architecture.md) - Fastify backend details
- [Frontend Architecture](frontend-architecture.md) - React frontend details
- [Development Workflow](../../development/development-workflow.md) - Build and test processes
- [Deployment](../../deployment/deployment.md) - Container build and deployment
