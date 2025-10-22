# ODH-TEC Architecture Documentation

Welcome to the ODH-TEC (Open Data Hub Tools & Extensions Companion) architecture documentation. This directory contains comprehensive technical documentation about the system design, implementation, and deployment of ODH-TEC.

## Table of Contents

### Getting Started

- **[Overview](overview.md)** - Start here! Project purpose, capabilities, and design philosophy
- **[Technology Stack](technology-stack.md)** - Complete inventory of technologies, frameworks, and libraries

### Architecture

- **[System Architecture](system-architecture.md)** - High-level system design, components, and integration points
- **[Monorepo Structure](monorepo-structure.md)** - Repository organization and build orchestration
- **[Data Flow](data-flow.md)** - How data flows through the system (API, streaming, events)

### Component Deep Dives

- **[Backend Architecture](backend-architecture.md)** - Fastify server, plugin system, routes, and streaming
- **[Frontend Architecture](frontend-architecture.md)** - React application, PatternFly 6, components, and routing

## Quick Reference

### What is ODH-TEC?

ODH-TEC is a full-stack TypeScript application that provides S3 storage management and GPU resource calculation tools. It's designed to run as:

- An ODH/RHOAI workbench
- A standalone OpenShift deployment
- A local Podman container

### Key Technologies

- **Backend**: Fastify (Node.js), TypeScript, AWS SDK v3
- **Frontend**: React 18, PatternFly 6, Webpack
- **Deployment**: Red Hat UBI9 Node.js container, runs on port 8888

### Architecture Highlights

- **Monorepo**: Single repository with backend and frontend packages
- **Streaming**: Memory-efficient file transfers (no intermediate storage)
- **Single Container**: Backend serves both API and frontend in production
- **Concurrent Transfers**: Configurable limits to control memory usage

## Documentation Map

```
docs/
├── architecture/                 # Architecture documentation (this folder)
│   ├── README.md                 # This file - navigation and quick reference
│   ├── overview.md               # Project overview and capabilities
│   ├── system-architecture.md    # High-level system design
│   ├── monorepo-structure.md     # Repository organization
│   ├── backend-architecture.md   # Backend implementation details
│   ├── frontend-architecture.md  # Frontend implementation details
│   ├── data-flow.md              # Data flow and communication patterns
│   └── technology-stack.md       # Technology inventory
│
├── deployment/                   # Deployment documentation
│   ├── deployment.md             # Container build and deployment scenarios
│   └── configuration.md          # Environment variables and runtime config
│
└── development/                  # Development documentation
    ├── README.md                 # Development guide
    ├── development-workflow.md   # Build process, testing, and dev setup
    └── pf6-guide/                # PatternFly 6 guide
```

## Related Documentation

### Project Documentation

- **[Root README](../../README.md)** - Getting started, deployment, and usage
- **[CLAUDE.md](../../CLAUDE.md)** - AI assistant context and development guide

### Development Documentation

- **[Development Guide](../development/README.md)** - Development setup and practices
- **[Development Workflow](../development/development-workflow.md)** - Build process, testing, and dev setup
- **[PatternFly 6 Guide](../development/pf6-guide/README.md)** - Frontend development with PatternFly 6

### Deployment Documentation

- **[Deployment](../deployment/deployment.md)** - Container build process and deployment scenarios
- **[Configuration](../deployment/configuration.md)** - Environment variables and runtime configuration

### Feature Documentation

- **[Features](../features/README.md)** - Feature specifications and implementation plans

### API Documentation

> **Note**: API documentation will be added in `/docs/api/` in the future.

## How to Use This Documentation

### For New Developers

1. Start with **[Overview](overview.md)** to understand the project
2. Read **[System Architecture](system-architecture.md)** for the big picture
3. Dive into **[Backend](backend-architecture.md)** or **[Frontend](frontend-architecture.md)** based on your focus
4. Check **[Development Workflow](../development/development-workflow.md)** to start coding

### For DevOps Engineers

1. Review **[System Architecture](system-architecture.md)** for deployment topology
2. Study **[Deployment](../deployment/deployment.md)** for container and platform details
3. Reference **[Configuration](../deployment/configuration.md)** for environment setup

### For Technical Decision Makers

1. Read **[Overview](overview.md)** for project capabilities
2. Review **[Technology Stack](technology-stack.md)** for technology choices
3. Study **[System Architecture](system-architecture.md)** for design decisions

### For Contributors

1. Familiarize yourself with **[Monorepo Structure](monorepo-structure.md)**
2. Review component-specific architecture docs
3. Follow **[Development Workflow](../development/development-workflow.md)**
4. Refer to **[PatternFly 6 Guide](../development/pf6-guide/)** for frontend patterns

## Document Conventions

### Code Examples

Code blocks include language hints for syntax highlighting:

```typescript
// TypeScript example
const example: string = 'value';
```

```bash
# Shell commands
npm run dev
```

### Architecture Diagrams

ASCII diagrams illustrate system components and data flow:

```
┌─────────┐     ┌─────────┐     ┌─────────┐
│ Browser │────▶│ Backend │────▶│   S3    │
└─────────┘     └─────────┘     └─────────┘
```

### Cross-References

Links to related documents use relative paths:

- `[Backend Architecture](backend-architecture.md)` - Same directory
- `[Root README](../../README.md)` - Parent directories

### Status Indicators

Some documents may include status indicators:

- ✅ **Complete** - Fully documented
- 🚧 **In Progress** - Partial documentation
- 📝 **Planned** - Not yet documented

## Contributing to Documentation

When adding or updating architecture documentation:

1. **Maintain Structure** - Follow the existing organization and formatting
2. **Use Markdown** - Standard GitHub-flavored markdown
3. **Add Cross-References** - Link related documents
4. **Update TOC** - Keep table of contents current
5. **Include Examples** - Add code snippets where helpful
6. **ASCII Diagrams** - Use text diagrams for architecture visualization
7. **Update This README** - Add new documents to the navigation

## Version Information

This documentation corresponds to:

- **ODH-TEC Version**: 2.0.7
- **Node.js Version**: 18+
- **PatternFly Version**: 6.2.x
- **React Version**: 18.3.x

## Feedback and Questions

For questions or suggestions about this documentation:

- Open an issue on [GitHub](https://github.com/opendatahub-io-contrib/odh-tec/issues)
- Contribute improvements via pull requests

---

**Last Updated**: 2025-10-22
