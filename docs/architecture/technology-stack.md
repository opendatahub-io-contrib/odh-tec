# Technology Stack

Complete inventory of technologies, frameworks, libraries, and tools used in ODH-TEC.

## Table of Contents

- [Overview](#overview)
- [Backend Stack](#backend-stack)
- [Frontend Stack](#frontend-stack)
- [Build and Development Tools](#build-and-development-tools)
- [Container and Deployment](#container-and-deployment)
- [Version Matrix](#version-matrix)

## Overview

ODH-TEC is built with modern, enterprise-grade technologies:

**Backend**: Node.js + TypeScript + Fastify
**Frontend**: React 18 + TypeScript + PatternFly 6
**Build**: Webpack + npm
**Container**: Red Hat UBI9 + Node.js 18
**Testing**: Jest + React Testing Library

## Backend Stack

### Core Framework

| Technology     | Version | Purpose              | License    |
| -------------- | ------- | -------------------- | ---------- |
| **Node.js**    | 18+     | JavaScript runtime   | MIT        |
| **TypeScript** | 5.3.3   | Type-safe JavaScript | Apache 2.0 |
| **Fastify**    | 4.28.1  | Web framework        | MIT        |
| **Pino**       | 8.11.0  | Logging              | MIT        |

### Fastify Plugins

| Plugin               | Version | Purpose                      |
| -------------------- | ------- | ---------------------------- |
| `@fastify/autoload`  | 5.7.1   | Auto-discover routes/plugins |
| `@fastify/static`    | 7.0.4   | Serve frontend static files  |
| `@fastify/multipart` | 7.7.3   | Handle file uploads          |
| `@fastify/cors`      | 9.0.1   | CORS configuration           |
| `@fastify/sensible`  | 5.6.0   | Common utilities             |
| `@fastify/websocket` | 8.3.1   | WebSocket support            |
| `@fastify/swagger`   | 8.14.0  | API documentation (future)   |
| `fastify-sse-v2`     | 4.2.1   | Server-Sent Events           |
| `fastify-plugin`     | 4.5.1   | Plugin helper                |

### AWS Integration

| Library                      | Version | Purpose                 |
| ---------------------------- | ------- | ----------------------- |
| `@aws-sdk/client-s3`         | 3.787.0 | S3 client (SDK v3)      |
| `@aws-sdk/lib-storage`       | 3.787.0 | Multipart uploads       |
| `@aws-sdk/node-http-handler` | 3.374.0 | HTTP handler with proxy |

**Why AWS SDK v3?**

- Modular (import only what you need)
- Smaller bundle size
- Better TypeScript support
- Improved performance

### HTTP Client

| Library | Version | Purpose                         |
| ------- | ------- | ------------------------------- |
| `axios` | 1.8.4   | HTTP client for HuggingFace API |

**Why Axios?**

- Promise-based
- Stream support
- Interceptors
- Proxy support

### Utilities

| Library             | Version | Purpose                      |
| ------------------- | ------- | ---------------------------- |
| `p-limit`           | 3.1.0   | Concurrency control          |
| `dotenv`            | 16.5.0  | Environment variable loading |
| `http-proxy-agent`  | 7.0.2   | HTTP proxy support           |
| `https-proxy-agent` | 7.0.6   | HTTPS proxy support          |
| `lodash`            | 4.17.21 | Utility functions            |
| `js-yaml`           | 4.0.0   | YAML parsing                 |
| `minipass`          | 7.1.2   | Stream utilities             |

### Kubernetes Integration

| Library                   | Version | Purpose                        |
| ------------------------- | ------- | ------------------------------ |
| `@kubernetes/client-node` | 0.12.2  | Kubernetes API client (future) |

### Development Dependencies

| Tool                               | Version | Purpose                   |
| ---------------------------------- | ------- | ------------------------- |
| `ts-node`                          | 10.9.2  | Run TypeScript directly   |
| `nodemon`                          | 3.0.2   | Hot reload in development |
| `prettier`                         | 2.2.1   | Code formatting           |
| `eslint`                           | 8.57.0  | Linting                   |
| `@typescript-eslint/parser`        | 7.1.1   | TypeScript ESLint parser  |
| `@typescript-eslint/eslint-plugin` | 7.1.1   | TypeScript ESLint rules   |
| `rimraf`                           | 5.0.7   | Cross-platform rm -rf     |

### Testing Dependencies

| Tool                  | Version | Purpose                     |
| --------------------- | ------- | --------------------------- |
| `jest`                | 29.6.1  | Test framework              |
| `ts-jest`             | 29.1.1  | TypeScript support for Jest |
| `@types/jest`         | 29.5.14 | TypeScript types for Jest   |
| `aws-sdk-client-mock` | 4.1.0   | Mock AWS SDK calls          |

## Frontend Stack

### Core Framework

| Technology       | Version | Purpose              | License    |
| ---------------- | ------- | -------------------- | ---------- |
| **React**        | 18.3.1  | UI framework         | MIT        |
| **React DOM**    | 18.3.1  | DOM rendering        | MIT        |
| **TypeScript**   | 5.8.2   | Type-safe JavaScript | Apache 2.0 |
| **React Router** | 7.1.5   | Client-side routing  | MIT        |

**Why React 18?**

- Concurrent features
- Automatic batching
- Suspense improvements
- Industry standard

### UI Library (PatternFly 6)

| Library                         | Version | Purpose               |
| ------------------------------- | ------- | --------------------- |
| `@patternfly/patternfly`        | 6.2.3   | CSS framework         |
| `@patternfly/react-core`        | 6.2.2   | Core components       |
| `@patternfly/react-table`       | 6.2.2   | Table components      |
| `@patternfly/react-icons`       | 6.2.2   | Icon library          |
| `@patternfly/react-styles`      | 6.2.2   | CSS utilities         |
| `@patternfly/react-code-editor` | 6.2.2   | Code editor component |

**Why PatternFly 6?**

- Red Hat ecosystem alignment
- Enterprise design system
- Accessibility (WCAG AA)
- Dark theme built-in
- Comprehensive components

### Data Fetching

| Library | Version | Purpose                   |
| ------- | ------- | ------------------------- |
| `axios` | 1.8.4   | HTTP client for API calls |

**No React Query** - Direct API calls with local state

### State Management

| Library         | Version | Purpose                    |
| --------------- | ------- | -------------------------- |
| `eventemitter3` | 5.0.1   | Event-driven communication |

**No Redux** - Context API + local state + EventEmitter

### Internationalization

| Library                | Version | Purpose                       |
| ---------------------- | ------- | ----------------------------- |
| `i18next`              | 24.2.3  | i18n framework                |
| `react-i18next`        | 14.1.1  | React bindings                |
| `i18next-http-backend` | 3.0.2   | HTTP backend for translations |

### Utilities

| Library                    | Version | Purpose                        |
| -------------------------- | ------- | ------------------------------ |
| `p-limit`                  | 6.2.0   | Concurrency control (frontend) |
| `react-markdown`           | 9.1.0   | Markdown rendering             |
| `remark-gfm`               | 4.0.1   | GitHub Flavored Markdown       |
| `rehype-raw`               | 7.0.0   | Render raw HTML in markdown    |
| `react-syntax-highlighter` | 15.6.1  | Code syntax highlighting       |

### Charting (VRAM Estimator)

| Library    | Version        | Purpose          |
| ---------- | -------------- | ---------------- |
| `recharts` | 2.13.0-alpha.1 | Charting library |

**Why Recharts?**

- React-native
- Simple API
- Responsive
- Good TypeScript support

## Build and Development Tools

### Build System

| Tool                 | Version | Purpose               |
| -------------------- | ------- | --------------------- |
| **Webpack**          | 5.98.0  | Module bundler        |
| `webpack-cli`        | 6.0.1   | Webpack CLI           |
| `webpack-dev-server` | 5.2.1   | Development server    |
| `webpack-merge`      | 6.0.1   | Merge webpack configs |

### Webpack Plugins

| Plugin                         | Version | Purpose                      |
| ------------------------------ | ------- | ---------------------------- |
| `html-webpack-plugin`          | 5.6.3   | Generate HTML                |
| `copy-webpack-plugin`          | 13.0.0  | Copy static files            |
| `mini-css-extract-plugin`      | 2.9.2   | Extract CSS                  |
| `css-minimizer-webpack-plugin` | 7.0.2   | Minify CSS                   |
| `terser-webpack-plugin`        | 5.3.14  | Minify JavaScript            |
| `webpack-bundle-analyzer`      | 4.10.2  | Analyze bundle size          |
| `dotenv-webpack`               | 8.1.0   | Inject environment variables |

### Webpack Loaders

| Loader           | Version | Purpose                |
| ---------------- | ------- | ---------------------- |
| `ts-loader`      | 9.5.2   | TypeScript compilation |
| `css-loader`     | 7.1.2   | CSS modules            |
| `style-loader`   | 4.0.0   | Inject CSS             |
| `file-loader`    | 6.2.0   | File assets            |
| `url-loader`     | 4.1.1   | Inline small files     |
| `svg-url-loader` | 8.0.0   | SVG handling           |
| `raw-loader`     | 4.0.2   | Raw file content       |

### Monorepo Orchestration

| Tool          | Version | Purpose                          |
| ------------- | ------- | -------------------------------- |
| `npm-run-all` | 4.1.5   | Run scripts in parallel/sequence |

**Why npm-run-all?**

- Simple syntax
- Cross-platform
- Parallel execution
- Labeled output

### Code Quality

| Tool                               | Version | Purpose                  |
| ---------------------------------- | ------- | ------------------------ |
| `eslint`                           | 8.9.0   | Linting                  |
| `prettier`                         | 3.5.3   | Code formatting          |
| `@typescript-eslint/parser`        | 8.29.0  | TypeScript ESLint parser |
| `@typescript-eslint/eslint-plugin` | 8.29.0  | TypeScript ESLint rules  |
| `eslint-plugin-react`              | 7.37.5  | React ESLint rules       |
| `eslint-plugin-react-hooks`        | 5.2.0   | React Hooks ESLint rules |

### Testing Tools

| Tool                          | Version | Purpose                     |
| ----------------------------- | ------- | --------------------------- |
| `jest`                        | 29.7.0  | Test framework              |
| `ts-jest`                     | 29.3.1  | TypeScript support          |
| `@testing-library/react`      | 16.3.0  | React component testing     |
| `@testing-library/jest-dom`   | 6.6.3   | Jest DOM matchers           |
| `@testing-library/user-event` | 14.6.1  | User interaction simulation |
| `jest-environment-jsdom`      | 29.7.0  | DOM environment for Jest    |

### TypeScript Support

| Package                         | Version                            | Purpose                    |
| ------------------------------- | ---------------------------------- | -------------------------- |
| `typescript`                    | 5.3.3 (backend) / 5.8.2 (frontend) | TypeScript compiler        |
| `tsconfig-paths-webpack-plugin` | 4.2.0                              | Path resolution            |
| `tslib`                         | 2.8.1                              | TypeScript runtime library |
| `@types/node`                   | 18.14.5                            | Node.js types              |
| `@types/react`                  | (from React package)               | React types                |
| `@types/react-dom`              | (from React DOM)                   | React DOM types            |
| `@types/lodash`                 | 4.14.182                           | Lodash types               |

## Container and Deployment

### Base Image

| Component        | Version | Purpose               |
| ---------------- | ------- | --------------------- |
| **Red Hat UBI9** | 9       | Base operating system |
| **Node.js**      | 18      | JavaScript runtime    |

**Why UBI9?**

- Enterprise support
- Security scanning
- Lightweight
- OpenShift compatible

### Container Tools

| Tool        | Purpose                             |
| ----------- | ----------------------------------- |
| **Podman**  | Container build and run (preferred) |
| **Docker**  | Alternative container runtime       |
| **Buildah** | Container image building            |

### Kubernetes/OpenShift

| Technology        | Purpose                        |
| ----------------- | ------------------------------ |
| **Kubernetes**    | Container orchestration        |
| **OpenShift**     | Enterprise Kubernetes platform |
| **Open Data Hub** | ML/AI platform on OpenShift    |
| **RHOAI**         | Red Hat OpenShift AI           |

## Version Matrix

### Node.js Versions

| Package  | Node.js Version Required |
| -------- | ------------------------ |
| Root     | >= 18.0.0                |
| Backend  | >= 18.0.0                |
| Frontend | (inherits from root)     |

### Package Versions

| Package  | Version | Notes                |
| -------- | ------- | -------------------- |
| Root     | 2.0.7   | Monorepo coordinator |
| Backend  | 2.0.7   | Fastify API          |
| Frontend | 2.0.7   | React SPA            |

**Version Sync**: All packages share the same version number.

### Major Dependencies

| Category           | Library            | Version       | Breaking Changes Since |
| ------------------ | ------------------ | ------------- | ---------------------- |
| Backend Framework  | Fastify            | 4.28.1        | v3 → v4                |
| Frontend Framework | React              | 18.3.1        | v17 → v18              |
| UI Library         | PatternFly         | 6.2.3         | v5 → v6 (major)        |
| Router             | React Router       | 7.1.5         | v6 → v7                |
| AWS SDK            | @aws-sdk/client-s3 | 3.787.0       | v2 → v3 (major)        |
| Build Tool         | Webpack            | 5.98.0        | v4 → v5                |
| TypeScript         | TypeScript         | 5.8.2 / 5.3.3 | v4 → v5                |

### PatternFly 6 Migration

**Critical**: PatternFly 6 has breaking changes from v4/v5

**Key Changes**:

- All CSS classes use `pf-v6-` prefix
- Component API changes
- Import paths unchanged
- Dark theme improvements
- Accessibility enhancements

**Migration Required**:

- Update all class names: `pf-u-*` → `pf-v6-u-*`
- Review component props
- Test all UI components

## Technology Decisions

### Why These Technologies?

#### Fastify over Express

**Pros**:

- 2-3x faster performance
- Built-in TypeScript support
- Plugin architecture
- Schema validation
- Modern async/await

**Cons**:

- Smaller ecosystem than Express
- Different middleware pattern

**Decision**: Performance and TypeScript support outweigh ecosystem size.

#### PatternFly over Material-UI

**Pros**:

- Red Hat ecosystem alignment
- Enterprise design system
- Better accessibility defaults
- Comprehensive component set
- Dark theme built-in

**Cons**:

- Less widespread adoption
- Steeper learning curve
- Breaking changes between versions

**Decision**: Alignment with Red Hat products and enterprise focus.

#### Webpack over Vite

**Pros** (Webpack):

- Mature ecosystem
- Better legacy browser support
- More plugin options
- Team familiarity

**Cons** (Webpack):

- Slower than Vite
- More complex configuration

**Decision**: Maturity and compatibility outweigh build speed.

#### Monorepo over Multi-Repo

**Pros**:

- Single version number
- Atomic cross-package changes
- Shared tooling
- Simpler dependency management

**Cons**:

- Larger repository
- More complex CI/CD
- Potential for tight coupling

**Decision**: Benefits for small team and tight integration.

## Dependency Management

### Update Strategy

**Backend**:

```bash
cd backend
npm outdated        # Check for updates
npm update          # Update within semver
npm audit fix       # Fix security issues
```

**Frontend**:

```bash
cd frontend
npm outdated
npm update
npm audit fix
```

### Security Scanning

**npm audit**:

```bash
npm audit           # Check for vulnerabilities
npm audit fix       # Auto-fix if possible
```

**Dependabot** (GitHub):

- Automated security updates
- Pull request creation
- Version bump suggestions

### Overrides

**Backend** (`backend/package.json`):

```json
{
  "overrides": {
    "tough-cookie": "^4.1.3",
    "ws": "^8.17.1",
    "@types/tar": "^6.1.13",
    "jsonpath-plus": "^10.3.0"
  }
}
```

**Purpose**: Force specific versions to fix security issues.

## License Compliance

### License Summary

| License    | Count | Examples                      |
| ---------- | ----- | ----------------------------- |
| MIT        | ~80%  | React, Fastify, Axios         |
| Apache 2.0 | ~15%  | TypeScript, Kubernetes client |
| BSD        | ~3%   | Some utilities                |
| ISC        | ~2%   | Some npm packages             |

**All Open Source** - No proprietary dependencies

### License Compatibility

- MIT + Apache 2.0: Compatible
- All licenses: OSI-approved
- No GPL dependencies (avoids copyleft)

### License Files

- Root: MIT
- Backend: Apache 2.0
- Frontend: Apache 2.0

---

**Next**:

- [Development Workflow](development-workflow.md) - Build and test processes
- [Backend Architecture](backend-architecture.md) - Backend implementation
- [Frontend Architecture](frontend-architecture.md) - Frontend implementation
