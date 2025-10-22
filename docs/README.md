# ODH-TEC Documentation

Documentation for the Open Data Hub Tools & Extensions Companion (ODH-TEC) project.

## Overview

ODH-TEC is a full-stack TypeScript application for managing S3 storage and GPU resources, designed to work as an ODH/RHOAI workbench or standalone deployment.

## Documentation Structure

### 📚 [Development](development/)

Development documentation for building and contributing to ODH-TEC.

- **[PatternFly 6 Guide](development/pf6-guide/README.md)** - Comprehensive guide for frontend development with PatternFly 6, including components, styling, testing patterns, and best practices

### 🚀 [Features](features/)

Feature specifications and implementation plans.

- **[PVC Storage Support](features/pvc-storage-support.md)** - Specification for local PVC-mounted directory support with unified S3/PVC interface

## Project Documentation

For general project information, see the root-level documentation:

- **[CLAUDE.md](../CLAUDE.md)** - Project architecture, development commands, and technical details
- **[README.md](../README.md)** - Project overview and getting started guide

## Quick Links

### Getting Started

- [Development Setup](development/pf6-guide/setup/README.md) - Frontend development prerequisites
- [Quick Start](development/pf6-guide/setup/quick-start.md) - Start developing with PatternFly 6

### Development Guidelines

- [PatternFly Guidelines](development/pf6-guide/guidelines/README.md) - Core frontend development principles
- [Component Architecture](development/pf6-guide/guidelines/component-architecture.md) - Component structure and patterns
- [Testing Patterns](development/pf6-guide/testing-patterns/README.md) - Testing guides for PatternFly 6 components

### Common Tasks

- [Component Reference](development/pf6-guide/components/README.md) - PatternFly 6 component usage
- [Troubleshooting](development/pf6-guide/troubleshooting/README.md) - Common issues and solutions

## Contributing

When adding new documentation:

1. Place development-related docs in [development/](development/)
2. Place feature specifications in [features/](features/)
3. Update this README to reference new content
4. Follow the existing documentation structure and style
