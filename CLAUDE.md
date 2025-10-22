# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ODH-TEC (Open Data Hub Tools & Extensions Companion) is a full-stack TypeScript application for managing S3 storage and GPU resources. The application runs as a single container with both frontend and backend, designed to work as an ODH/RHOAI workbench or standalone deployment.

**For detailed project information**, see:

- [Architecture Documentation](docs/architecture/README.md) - System design, components, and technical details
- [Development Documentation](docs/development/README.md) - Build process, testing, and development workflow
- [Deployment Documentation](docs/deployment/README.md) - Container build and deployment scenarios
- [Project Structure](docs/architecture/monorepo-structure.md) - Full project tree

## Quick Architecture Reference

**Monorepo Structure**:

- **Root**: Monorepo scripts using `npm-run-all` to orchestrate both packages
- **Backend** (`backend/`): Fastify-based API server (TypeScript, port 8888)
- **Frontend** (`frontend/`): React + PatternFly 6 UI (TypeScript, Webpack)
- **Deployment**: Multi-stage Containerfile, production build serves static frontend from backend

**Technology Stack**:

- Backend: Fastify 4, Node.js 18+, AWS SDK v3, TypeScript
- Frontend: React 18, PatternFly 6, React Router v7, Webpack
- Container: UBI9 Node.js 18, runs on port 8888

**For complete technical details**, see [Technology Stack](docs/architecture/technology-stack.md).

## Essential Development Commands

```bash
# Initial setup
npm install                  # Installs all dependencies (root + backend + frontend)

# Development (runs both backend and frontend)
npm run dev                  # Starts both in dev mode with hot reload

# Building
npm run build                # Builds both backend and frontend

# Testing
npm test                     # Runs all tests (backend + frontend)

# Container operations
podman build -t odh-tec -f Containerfile .
podman run --rm -it -p 8888:8888 --env-file=.env odh-tec:latest
```

**For complete development workflow**, see [Development Workflow](docs/development/development-workflow.md).

## Key Architectural Principles

1. **Streaming-First**: All file transfers use streaming to minimize memory usage (~256MB for 7B model imports)
2. **Plugin-Based**: Backend uses Fastify's autoload pattern for routes and plugins
3. **Stateless**: Backend is stateless - configuration from environment only
4. **Single Container**: Production deployment serves both API and frontend on port 8888
5. **Memory-Efficient**: Concurrent transfer limits via `p-limit` to prevent memory spikes

**For detailed architecture**, see:

- [System Architecture](docs/architecture/system-architecture.md)
- [Backend Architecture](docs/architecture/backend-architecture.md)
- [Frontend Architecture](docs/architecture/frontend-architecture.md)
- [Data Flow](docs/architecture/data-flow.md)

## Important Notes for AI Assistants

- **No Authentication**: Currently no user auth, OAuth, or role-based access control
- **Node.js 18+ Required**: Specified in engines
- **Single Process in Production**: Backend serves both API and frontend static files
- **Dev vs Production**: Development runs separate processes, production is single container
- **S3 Compatibility**: Supports both AWS S3 and S3-compatible endpoints
- **Runtime Configuration**: Settings UI allows ephemeral overrides (not persisted)
- **Environment Auto-Detection**: Automatically picks up ODH/RHOAI Data Connection environment variables

## Documentation Map

```
docs/
├── architecture/          # System design and component architecture
│   ├── overview.md       # Project overview and capabilities
│   ├── system-architecture.md
│   ├── backend-architecture.md
│   ├── frontend-architecture.md
│   ├── monorepo-structure.md
│   ├── data-flow.md
│   └── technology-stack.md
│
├── development/          # Development practices and workflows
│   ├── development-workflow.md
│   └── pf6-guide/       # PatternFly 6 comprehensive guide
│
├── deployment/          # Deployment and configuration
│   ├── deployment.md
│   └── configuration.md
│
└── features/            # Feature specifications
    └── pvc-storage-support.md
```

## Component-Specific Context

For detailed context specific to backend or frontend development:

- **Backend**: See [backend/CLAUDE.md](backend/CLAUDE.md)
- **Frontend**: See [frontend/CLAUDE.md](frontend/CLAUDE.md)

### Context7 Usage Guidelines

⚠️ **Important for AI tools using Context7**:

- ✅ **Use Context7 for**: Backend libraries, non-UI frontend libraries (React, Axios,...)
- ❌ **Don't use Context7 for**: PatternFly 6 components. use `docs/development/pf6-guide/` + PatternFly.org instead)
- ✅ **Use `docs/development/pf6-guide/` + PatternFly.org** for Patternfly 6 components

Context7 may contain outdated PatternFly versions. For all PatternFly 6 UI development, refer to the local PF6 guide and official PatternFly.org documentation.
