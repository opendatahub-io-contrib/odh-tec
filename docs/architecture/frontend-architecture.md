# Frontend Architecture

This document provides a comprehensive overview of the ODH-TEC frontend architecture, built with React 18 and PatternFly 6.

## Table of Contents

- [Overview](#overview)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Component Architecture](#component-architecture)
- [Routing](#routing)
- [State Management](#state-management)
- [API Integration](#api-integration)
- [PatternFly 6 Integration](#patternfly-6-integration)
- [Styling](#styling)
- [Testing](#testing)
- [Build System](#build-system)

## Overview

The frontend is a **React 18 single-page application (SPA)** that provides:

- S3 bucket and object management UI
- File upload/download with progress tracking
- HuggingFace model import interface
- GPU VRAM estimation calculator
- S3 connection settings management

**Key Characteristics**:

- TypeScript for type safety
- PatternFly 6 component library
- React Router v7 for navigation
- Axios for API communication
- Webpack-based build system
- Hot Module Replacement (HMR) in development

## Technology Stack

The frontend uses **React 18** with **PatternFly 6** for the UI. Key technologies include:

- **Core**: React 18.3.1, React Router 7.1.5, TypeScript 5.8.2
- **UI Library**: PatternFly 6.2.x (React components, tables, icons, dark theme)
- **State Management**: React Context API, EventEmitter3, local useState hooks
- **Data Fetching**: Axios 1.8.4 (direct API calls, no React Query)
- **Build**: Webpack 5.98.0 with Hot Module Replacement
- **Testing**: Jest, React Testing Library

> **For complete technology inventory**, see [Technology Stack](technology-stack.md).

## Project Structure

The frontend follows a component-based architecture organized by feature:

- **`src/app/components/`** - React components (AppLayout, ObjectBrowser, Buckets, VramEstimator, Settings)
- **`src/app/routes.tsx`** - Route definitions with React Router
- **`src/app/utils/`** - Utilities (EventEmitter, custom hooks)
- **`src/i18n/`** - Internationalization configuration
- **`dist/`** - Webpack build output

> **For complete repository structure and monorepo organization**, see [Monorepo Structure](monorepo-structure.md).

## Component Architecture

### Component Pattern

**Functional components with hooks**:

```typescript
import React, { useState, useEffect } from 'react';
import { PageSection } from '@patternfly/react-core';
import axios from 'axios';

const MyComponent: React.FC = () => {
  // State management
  const [data, setData] = useState<DataType[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data fetching
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get('/api/endpoint');
      setData(response.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Render
  return (
    <PageSection>
      {loading && <Spinner />}
      {error && <Alert variant="danger">{error}</Alert>}
      {/* Component content */}
    </PageSection>
  );
};

export default MyComponent;
```

### Key Components

#### AppLayout

**Purpose**: Main application shell with navigation

**Features**:

- PatternFly Page component
- Sidebar navigation
- Route groups (S3 Tools, GPU Tools, Settings)
- Responsive layout
- Dark theme support

**Structure**:

```typescript
<Page
  header={<Masthead />}
  sidebar={<PageSidebar nav={<Navigation />} />}
>
  <PageSection>
    {children}
  </PageSection>
</Page>
```

#### ObjectBrowser

**Purpose**: S3 object management interface

**Features**:

- Folder/file navigation with breadcrumbs
- File list with PatternFly Table
- Upload modal (single/multiple files)
- Download files
- Delete files/folders
- Create new folders
- HuggingFace model import
- Progress tracking with EventEmitter

**Key State**:

```typescript
const [objects, setObjects] = useState<S3Object[]>([]);
const [currentPrefix, setCurrentPrefix] = useState('');
const [uploadProgress, setUploadProgress] = useState<number>(0);
const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
const [isImportHFModalOpen, setIsImportHFModalOpen] = useState(false);
```

#### Buckets

**Purpose**: S3 bucket management

**Features**:

- List all buckets
- Create new buckets
- Delete buckets
- Navigate to bucket contents

**API Calls**:

```typescript
// List buckets
const response = await axios.get('/api/buckets');

// Create bucket
await axios.post('/api/buckets', { bucketName });

// Delete bucket
await axios.delete(`/api/buckets/${bucketName}`);
```

#### VramEstimator

**Purpose**: GPU VRAM requirement calculator

**Features**:

- Model configuration inputs (parameters, layers, etc.)
- Precision settings (FP32, FP16, INT8, etc.)
- Batch size and sequence length
- Real-time VRAM calculation
- Stacked bar chart visualization
- Helpful tips and documentation

**Calculation Logic**:

```typescript
const calculateVRAM = (
  modelSize: number,
  precision: number,
  batchSize: number,
  seqLength: number,
): number => {
  // VRAM calculation logic
  return modelSize * precision * batchSize * seqLength;
};
```

#### Settings

**Purpose**: S3 connection configuration

**Features**:

- S3 endpoint configuration
- Credentials management (access key, secret key)
- Region and bucket selection
- HuggingFace token input
- Connection testing
- Proxy configuration
- Max concurrent transfers

**State Management**:

```typescript
const [s3Config, setS3Config] = useState({
  endpoint: '',
  accessKeyId: '',
  secretAccessKey: '',
  region: '',
  bucket: '',
});
```

#### UserContext

**Purpose**: Global user state management

**Implementation**:

```typescript
// Context creation
const UserContext = React.createContext<UserContextType | undefined>(undefined);

// Provider component
export const UserProvider: React.FC = ({ children }) => {
  const [userName, setUserName] = useState<string>('User');

  return (
    <UserContext.Provider value={{ userName, setUserName }}>
      {children}
    </UserContext.Provider>
  );
};

// Custom hook
export const useUser = () => {
  const context = React.useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within UserProvider');
  }
  return context;
};
```

**Usage**:

```typescript
const { userName, setUserName } = useUser();
```

## Routing

### Route Configuration

**File**: `src/app/routes.tsx`

```typescript
export interface IAppRoute {
  label?: string;
  path: string;
  exact?: boolean;
  component: React.ComponentType;
  isAsync?: boolean;
  icon?: React.ComponentType;
}

export interface IAppRouteGroup {
  label: string;
  routes: IAppRoute[];
}

const routes: IAppRouteGroup[] = [
  {
    label: 'S3 Tools',
    routes: [
      {
        label: 'Object Browser',
        path: '/objects/:bucketName/:prefix?',
        component: ObjectBrowser,
        icon: FolderIcon,
      },
      {
        label: 'Buckets',
        path: '/buckets',
        component: Buckets,
        icon: DatabaseIcon,
      },
    ],
  },
  {
    label: 'GPU Tools',
    routes: [
      {
        label: 'VRAM Estimator',
        path: '/gpu/vram-estimator',
        component: VramEstimator,
        icon: ServerIcon,
      },
    ],
  },
  {
    label: 'Settings',
    routes: [
      {
        label: 'Settings',
        path: '/settings',
        component: Settings,
        icon: CogIcon,
      },
    ],
  },
];
```

### Route Rendering

**React Router v7 usage**:

```typescript
import { BrowserRouter, Routes, Route } from 'react-router-dom';

const AppRoutes: React.FC = () => (
  <BrowserRouter>
    <Routes>
      {flattenedRoutes.map(route => (
        <Route
          key={route.path}
          path={route.path}
          element={<route.component />}
        />
      ))}
      <Route path="*" element={<Navigate to="/objects" />} />
    </Routes>
  </BrowserRouter>
);
```

### Navigation

**URL-based navigation**:

```typescript
import { useNavigate } from 'react-router-dom';

const navigate = useNavigate();

// Navigate to bucket
navigate(`/objects/${bucketName}`);

// Navigate with encoded prefix
const encodedPrefix = btoa(prefix);
navigate(`/objects/${bucketName}/${encodedPrefix}`);
```

## State Management

### Local State (useState)

**Component-specific state**:

```typescript
const [buckets, setBuckets] = useState<Bucket[]>([]);
const [loading, setLoading] = useState(false);
const [error, setError] = useState<string | null>(null);
```

### Global State (Context API)

**UserContext for shared state**:

```typescript
// In App component
<UserProvider>
  <AppLayout>
    <AppRoutes />
  </AppLayout>
</UserProvider>

// In any component
const { userName, setUserName } = useUser();
```

### Event-Based Communication (EventEmitter)

**File**: `src/app/utils/emitter.ts`

```typescript
import EventEmitter from 'eventemitter3';

const emitter = new EventEmitter();
export default emitter;
```

**Usage**:

```typescript
// Emit event
emitter.emit('upload-progress', { filename, progress: 50 });

// Listen to event
useEffect(() => {
  const handler = (data) => {
    console.log('Progress:', data.progress);
  };

  emitter.on('upload-progress', handler);

  return () => {
    emitter.off('upload-progress', handler);
  };
}, []);
```

**Common Events**:

- `upload-progress` - File upload progress
- `import-progress` - HuggingFace import progress
- `transfer-complete` - Transfer completion
- `error` - Error notifications

## API Integration

### Axios Configuration

**Direct usage** (no centralized service layer):

```typescript
import axios from 'axios';

// GET request
const response = await axios.get('/api/buckets');
const buckets = response.data.buckets;

// POST request
await axios.post('/api/buckets', { bucketName: 'my-bucket' });

// DELETE request
await axios.delete(`/api/buckets/${bucketName}`);

// PUT request
await axios.put('/api/settings/s3', {
  accessKeyId,
  secretAccessKey,
  region,
  endpoint,
  bucket,
});
```

### Error Handling

**Standard pattern**:

```typescript
try {
  const response = await axios.get('/api/endpoint');
  setData(response.data);
} catch (error) {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message || error.message;
    setError(message);
  } else {
    setError('An unexpected error occurred');
  }
}
```

### File Upload

**Multipart form data**:

```typescript
const formData = new FormData();
files.forEach((file) => {
  formData.append('files', file);
});

await axios.post(`/api/objects/upload/${bucketName}`, formData, {
  headers: { 'Content-Type': 'multipart/form-data' },
});
```

## PatternFly 6 Integration

### Component Imports

**Always use v6 packages**:

```typescript
import {
  Page,
  PageSection,
  PageSidebar,
  Button,
  Card,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
  Modal,
  Alert,
  Spinner,
} from '@patternfly/react-core';

import { Table, Thead, Tbody, Tr, Th, Td } from '@patternfly/react-table';

import { TrashIcon, UploadIcon, DownloadIcon, FolderIcon } from '@patternfly/react-icons';
```

### CSS Class Prefix

**CRITICAL**: All PatternFly 6 classes use `pf-v6-` prefix:

```typescript
// Correct (PatternFly 6)
className = 'pf-v6-u-mt-md';

// Incorrect (PatternFly 4/5)
className = 'pf-u-mt-md'; // ❌ Missing version prefix
```

### Common Components

**Button**:

```typescript
<Button variant="primary" onClick={handleClick}>
  Primary Action
</Button>
```

**Modal**:

```typescript
<Modal
  title="Confirm Action"
  isOpen={isModalOpen}
  onClose={() => setIsModalOpen(false)}
  actions={[
    <Button key="confirm" variant="primary" onClick={handleConfirm}>
      Confirm
    </Button>,
    <Button key="cancel" variant="link" onClick={() => setIsModalOpen(false)}>
      Cancel
    </Button>
  ]}
>
  Modal content here
</Modal>
```

**Table**:

```typescript
<Table aria-label="Data table">
  <Thead>
    <Tr>
      <Th>Column 1</Th>
      <Th>Column 2</Th>
    </Tr>
  </Thead>
  <Tbody>
    {data.map(item => (
      <Tr key={item.id}>
        <Td>{item.col1}</Td>
        <Td>{item.col2}</Td>
      </Tr>
    ))}
  </Tbody>
</Table>
```

### Dark Theme Support

**Automatic** - PatternFly handles theme switching based on system preferences or user selection.

## Styling

### Global Styles

**File**: `src/app/app.css`

Minimal custom CSS - mostly PatternFly components and utilities.

### Component Styles

**Inline styles** (avoid when possible):

```typescript
<div style={{ marginTop: '20px' }}>
```

**PatternFly utilities** (preferred):

```typescript
<div className="pf-v6-u-mt-md">
```

### Theme Support

PatternFly provides automatic dark/light theme support. Custom styles should use CSS variables:

```css
.custom-element {
  color: var(--pf-v6-global--Color--100);
  background-color: var(--pf-v6-global--BackgroundColor--100);
}
```

## Testing

### Testing Stack

- **Jest** - Test framework
- **React Testing Library** - React component testing
- **@testing-library/user-event** - User interaction simulation

### Test Pattern

```typescript
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MyComponent from './MyComponent';

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('Expected Text')).toBeInTheDocument();
  });

  it('handles user interaction', async () => {
    const user = userEvent.setup();
    render(<MyComponent />);

    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => {
      expect(screen.getByText('Success')).toBeInTheDocument();
    });
  });
});
```

### Running Tests

```bash
npm test                # Run all tests
npm run test:watch     # Watch mode
npm run test:coverage  # With coverage report
```

## Build System

The frontend uses **Webpack 5** with separate configurations for development and production:

- **Development** - Webpack dev server on port 9000 with HMR and proxy to backend
- **Production** - Optimized build with minification, code splitting, and asset optimization
- **Output** - Static files in `dist/` directory served by backend in production

> **For complete build configuration and development workflow**, see [Development Workflow](../../development/development-workflow.md).

---

**Next**:

- [Data Flow](data-flow.md) - Request/response patterns
- [Backend Architecture](backend-architecture.md) - API server details
- [Deployment](../../deployment/deployment.md) - Build and deployment process
- [Development Workflow](../../development/development-workflow.md) - Build and testing processes
