# Development Workflow

This document describes the development processes, build workflows, and testing strategies for ODH-TEC.

## Table of Contents

- [Overview](#overview)
- [Initial Setup](#initial-setup)
- [Development Mode](#development-mode)
- [Build Process](#build-process)
- [Testing Workflow](#testing-workflow)
- [Code Quality](#code-quality)
- [Git Workflow](#git-workflow)
- [Release Process](#release-process)

## Overview

ODH-TEC uses a **monorepo workflow** with coordinated builds and tests across backend and frontend packages.

**Key Principles**:

- TypeScript for type safety
- Hot reload for fast iteration
- Automated testing
- Code quality checks before commit
- Semantic versioning

## Initial Setup

### Prerequisites

**Required**:

- **Node.js**: 18+ (check with `node --version`)
- **npm**: 8+ (comes with Node.js)
- **Git**: Any recent version

**Optional**:

- **Podman** or **Docker**: For container builds
- **VS Code**: Recommended IDE

### Clone Repository

```bash
git clone https://github.com/opendatahub-io-contrib/odh-tec.git
cd odh-tec
```

### Install Dependencies

**One command installs everything**:

```bash
npm install
```

**What happens**:

1. Root dependencies installed
2. `postinstall` hook triggers
3. Backend dependencies installed (`cd backend && npm install`)
4. Frontend dependencies installed (`cd frontend && npm install`)

**Time**: ~2-5 minutes (first time)

### Verify Installation

```bash
# Check Node.js version
node --version  # Should be 18+

# Verify packages installed
ls node_modules
ls backend/node_modules
ls frontend/node_modules

# Check TypeScript compilers
npx tsc --version
```

### Create Environment Files

**Backend configuration**:

```bash
# Copy example
cp backend/.env.example backend/.env

# Edit with your credentials
vim backend/.env
```

**Minimum required** (for S3 features):

```bash
AWS_S3_ENDPOINT=https://s3.amazonaws.com
AWS_ACCESS_KEY_ID=YOUR_ACCESS_KEY
AWS_SECRET_ACCESS_KEY=YOUR_SECRET_KEY
AWS_DEFAULT_REGION=us-east-1
```

**Frontend configuration** (optional):

```bash
# Copy example if needed
cp frontend/.env.example frontend/.env
```

## Development Mode

### Start Everything

**One command starts both backend and frontend**:

```bash
npm run dev
```

**What happens**:

1. Backend starts with nodemon (port 8888)
2. Frontend starts with webpack-dev-server (port 9000)
3. Both run in parallel with hot reload
4. Logs from both appear in terminal

**Output**:

```
[backend ] Server listening on http://127.0.0.1:8888
[backend ] ✓ S3 configuration detected from environment
[frontend] webpack compiled successfully
[frontend] Available at http://localhost:9000
```

### Access Application

**Development URLs**:

- **Frontend**: http://localhost:9000 (with HMR)
- **Backend API**: http://localhost:8888/api/\*
- **Backend serves**: API only (frontend served by webpack-dev-server)

### Start Individual Packages

**Backend only**:

```bash
npm run dev:backend
# or
cd backend && npm run start:dev
```

**Frontend only**:

```bash
npm run dev:frontend
# or
cd frontend && npm run start:dev
```

### Hot Reload

**Backend** (nodemon):

- Watches `backend/src/**/*.ts`
- Restarts server on file changes
- Fast restart (~1-2 seconds)

**Frontend** (Webpack HMR):

- Watches `frontend/src/**/*`
- Hot replaces modules without full reload
- Instant updates (preserves state)

**Example workflow**:

1. Edit `backend/src/routes/api/buckets/index.ts`
2. Save file
3. Backend automatically restarts
4. Refresh browser to see changes

5. Edit `frontend/src/app/components/Buckets/Buckets.tsx`
6. Save file
7. Browser updates instantly (no manual refresh)

### Development Tools

**TypeScript Compilation** (watch mode):

```bash
# Backend
cd backend && npm run watch

# Compiles on file changes, no server restart
```

**Logging**:

```bash
# Verbose logging
LOG_LEVEL=debug npm run dev:backend

# Pretty logs (default in development)
# JSON logs (production)
```

## Build Process

### Build Everything

**Production build**:

```bash
npm run build
```

**What happens**:

1. Backend: TypeScript compilation to `backend/dist/`
2. Frontend: Webpack production build to `frontend/dist/`
3. Both run in parallel

**Output**:

```
backend/dist/
├── routes/
├── plugins/
├── utils/
├── app.js
└── server.js

frontend/dist/
├── index.html
├── main.[hash].js
├── main.[hash].css
└── assets/
```

**Time**: ~30-60 seconds

### Build Individual Packages

**Backend only**:

```bash
npm run build:backend
# or
cd backend && npm run build
```

**Steps**:

1. Clean `dist/` directory
2. Compile TypeScript with `tsconfig.prod.json`
3. Output to `backend/dist/`

**Frontend only**:

```bash
npm run build:frontend
# or
cd frontend && npm run build
```

**Steps**:

1. Type check with TypeScript
2. Clean `dist/` directory
3. Webpack production build
4. Minify JavaScript and CSS
5. Output to `frontend/dist/`

### Production vs Development Builds

| Aspect           | Development        | Production          |
| ---------------- | ------------------ | ------------------- |
| **Backend**      | ts-node (no build) | Compiled JavaScript |
| **Frontend**     | Webpack dev server | Static build        |
| **Source Maps**  | Yes                | No                  |
| **Minification** | No                 | Yes                 |
| **Hot Reload**   | Yes                | No                  |
| **Build Time**   | Instant            | ~30-60 seconds      |
| **Bundle Size**  | Large              | Optimized           |

### Build Artifacts

**Backend** (`backend/dist/`):

- Compiled JavaScript (ES2020)
- Source structure preserved
- No bundling (uses node_modules)
- Ready for `node dist/server.js`

**Frontend** (`frontend/dist/`):

- Bundled JavaScript (single/chunked)
- Minified CSS
- HTML with asset injection
- Optimized images/fonts
- Ready for static serving

## Testing Workflow

### Run All Tests

**Test everything**:

```bash
npm test
```

**What happens**:

1. Backend tests run (lint + type-check + jest)
2. Frontend tests run (jest)
3. Sequential execution
4. Stops on first failure

### Test Individual Packages

**Backend tests**:

```bash
npm run test:backend
# or
cd backend && npm test
```

**Includes**:

- ESLint (code quality)
- TypeScript type checking
- Jest unit tests with coverage

**Frontend tests**:

```bash
npm run test:frontend
# or
cd frontend && npm test
```

**Includes**:

- Jest unit tests
- React Testing Library
- Component tests

### Specific Test Commands

**Linting**:

```bash
# Backend
cd backend && npm run test:lint

# Frontend
cd frontend && npm run lint

# Auto-fix issues
cd backend && npm run test:fix
cd frontend && npm run lint -- --fix
```

**Type Checking**:

```bash
# Backend
cd backend && npm run test:type-check

# Frontend
cd frontend && npm run type-check
```

**Unit Tests**:

```bash
# Backend (with coverage)
cd backend && npm run test:jest

# Frontend (with coverage)
cd frontend && npm run test:coverage

# Watch mode
cd frontend && npm run test:watch
```

### Coverage Reports

**Backend coverage**:

```bash
cd backend && npm run test:jest

# Output in:
# backend/coverage/lcov-report/index.html
```

**Frontend coverage**:

```bash
cd frontend && npm run test:coverage

# Output in:
# frontend/coverage/lcov-report/index.html
```

**View in browser**:

```bash
open backend/coverage/lcov-report/index.html
open frontend/coverage/lcov-report/index.html
```

### Writing Tests

**Backend test pattern**:

```typescript
// backend/src/__tests__/routes/api/buckets/index.test.ts
import { FastifyInstance } from 'fastify';
import bucketsRoutes from '../../../../routes/api/buckets';

describe('Bucket Routes', () => {
  let fastify: FastifyInstance;

  beforeEach(() => {
    const Fastify = require('fastify');
    fastify = Fastify();
    fastify.register(bucketsRoutes);
  });

  it('should list buckets', async () => {
    const response = await fastify.inject({
      method: 'GET',
      url: '/',
    });

    expect(response.statusCode).toBe(200);
  });
});
```

**Frontend test pattern**:

```typescript
// frontend/src/app/components/Buckets/Buckets.test.tsx
import { render, screen } from '@testing-library/react';
import Buckets from './Buckets';

describe('Buckets Component', () => {
  it('renders bucket list', () => {
    render(<Buckets />);
    expect(screen.getByText('S3 Buckets')).toBeInTheDocument();
  });
});
```

## Code Quality

### Linting

**ESLint configuration**:

Backend (`.eslintrc`):

```json
{
  "parser": "@typescript-eslint/parser",
  "extends": ["eslint:recommended", "plugin:@typescript-eslint/recommended"]
}
```

**Run linting**:

```bash
# Backend
cd backend && npm run test:lint

# Frontend
cd frontend && npm run lint

# Auto-fix
cd backend && npm run test:fix
```

### Code Formatting

**Prettier configuration** (`.prettierrc`):

```json
{
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

**Format code**:

```bash
# Format all (root command)
npm run format

# Formats:
# - backend/**/*.ts
# - frontend/**/*.ts
# - frontend/**/*.tsx
```

### Type Checking

**TypeScript strict mode enabled**:

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true
  }
}
```

**Check types**:

```bash
# Backend
cd backend && npm run test:type-check

# Frontend
cd frontend && npm run type-check
```

### Pre-Commit Checks

**Recommended workflow** (manual):

```bash
# Before committing
npm test                # Run all tests
npm run format         # Format code
npm run build          # Verify builds
```

**Automated with Husky** (optional, not currently configured):

```json
{
  "husky": {
    "hooks": {
      "pre-commit": "npm test && npm run format"
    }
  }
}
```

## Git Workflow

### Branch Strategy

**Main Branches**:

- `main` - Production-ready code
- `dev` - Integration branch (if used)

**Feature Branches**:

- `feature/bucket-permissions`
- `fix/upload-progress-tracking`
- `docs/architecture-documentation`

### Commit Messages

**Format**: Conventional Commits

```
type(scope): subject

body (optional)

footer (optional)
```

**Types**:

- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation
- `style` - Code style (formatting, etc.)
- `refactor` - Code refactoring
- `test` - Adding tests
- `chore` - Maintenance tasks

**Examples**:

```bash
git commit -m "feat(backend): add support for S3 bucket tagging"
git commit -m "fix(frontend): resolve upload progress bar flickering"
git commit -m "docs(architecture): add data flow documentation"
```

### Pull Request Workflow

1. **Create Feature Branch**:

   ```bash
   git checkout -b feature/my-feature
   ```

2. **Make Changes**:

   ```bash
   # Edit files
   npm test              # Verify tests pass
   npm run format       # Format code
   ```

3. **Commit Changes**:

   ```bash
   git add .
   git commit -m "feat: add new feature"
   ```

4. **Push to Remote**:

   ```bash
   git push origin feature/my-feature
   ```

5. **Create Pull Request**:

   - Open PR on GitHub
   - Fill in description
   - Request review
   - Wait for CI checks

6. **Address Review Feedback**:

   ```bash
   # Make changes
   git add .
   git commit -m "fix: address review feedback"
   git push
   ```

7. **Merge**:
   - Squash and merge (recommended)
   - Delete branch after merge

## Release Process

### Version Bumping

**Update version** in all package.json files:

```bash
# Root
npm version patch  # 2.0.7 → 2.0.8
npm version minor  # 2.0.8 → 2.1.0
npm version major  # 2.1.0 → 3.0.0
```

**Also update**:

- `backend/package.json`
- `frontend/package.json`

**Keep versions in sync** across all packages.

### Building Container

**Build production container**:

```bash
podman build -t odh-tec:2.0.8 -f Containerfile .
```

**Tag for registry**:

```bash
podman tag odh-tec:2.0.8 quay.io/rh-aiservices-bu/odh-tec:2.0.8
podman tag odh-tec:2.0.8 quay.io/rh-aiservices-bu/odh-tec:latest
```

**Push to registry**:

```bash
podman login quay.io
podman push quay.io/rh-aiservices-bu/odh-tec:2.0.8
podman push quay.io/rh-aiservices-bu/odh-tec:latest
```

### Release Checklist

- [ ] All tests passing
- [ ] Code formatted
- [ ] Documentation updated
- [ ] Version bumped in all package.json
- [ ] CHANGELOG updated (if maintained)
- [ ] Git tag created
- [ ] Container built and tested
- [ ] Container pushed to registry
- [ ] GitHub release created
- [ ] Deployment tested in ODH/RHOAI

### Creating GitHub Release

```bash
# Create git tag
git tag -a v2.0.8 -m "Release v2.0.8"
git push origin v2.0.8

# Create GitHub release
# Via GitHub UI:
# - Go to Releases
# - Draft new release
# - Select tag v2.0.8
# - Add release notes
# - Publish release
```

## Common Development Tasks

### Add New Backend Route

1. Create route file:

   ```bash
   touch backend/src/routes/api/myroute/index.ts
   ```

2. Implement route:

   ```typescript
   export default async (fastify: FastifyInstance): Promise<void> => {
     fastify.get('/', async (req, reply) => {
       reply.send({ message: 'Hello' });
     });
   };
   ```

3. Route auto-registered at `/api/myroute`

4. Add tests:

   ```bash
   touch backend/src/__tests__/routes/api/myroute/index.test.ts
   ```

5. Run tests:
   ```bash
   cd backend && npm test
   ```

### Add New Frontend Component

1. Create component:

   ```bash
   mkdir frontend/src/app/components/MyComponent
   touch frontend/src/app/components/MyComponent/MyComponent.tsx
   ```

2. Implement component:

   ```typescript
   const MyComponent: React.FC = () => {
     return <div>My Component</div>;
   };
   export default MyComponent;
   ```

3. Add to routes:

   ```typescript
   // frontend/src/app/routes.tsx
   import MyComponent from './components/MyComponent/MyComponent';

   const routes = [{ path: '/my-component', component: MyComponent }];
   ```

4. Add tests:
   ```bash
   touch frontend/src/app/components/MyComponent/MyComponent.test.tsx
   ```

### Add New Dependency

**Backend**:

```bash
cd backend
npm install --save new-package
npm install --save-dev @types/new-package
```

**Frontend**:

```bash
cd frontend
npm install --save new-package
npm install --save-dev @types/new-package
```

**Update lockfiles**:

```bash
# Commit both package.json and package-lock.json
git add backend/package*.json frontend/package*.json
git commit -m "chore: add new-package dependency"
```

### Troubleshooting

**Port already in use**:

```bash
# Kill process on port 8888
lsof -ti:8888 | xargs kill -9

# Kill process on port 9000
lsof -ti:9000 | xargs kill -9
```

**Module not found**:

```bash
# Reinstall dependencies
rm -rf node_modules backend/node_modules frontend/node_modules
npm install
```

**TypeScript errors**:

```bash
# Clean and rebuild
cd backend && rm -rf dist && npm run build
cd frontend && rm -rf dist && npm run build
```

**Test failures**:

```bash
# Clear Jest cache
cd backend && npx jest --clearCache
cd frontend && npx jest --clearCache

# Run tests with verbose output
cd backend && npm test -- --verbose
```

---

**Next**:

- [Backend Architecture](backend-architecture.md) - Backend implementation details
- [Frontend Architecture](frontend-architecture.md) - Frontend implementation details
- [Deployment](deployment.md) - Container build and deployment
- [Configuration](configuration.md) - Environment variables and settings
