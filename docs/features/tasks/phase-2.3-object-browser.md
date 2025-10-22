# Phase 2.3: ObjectBrowser Multi-Select

> **Task ID**: phase-2.3
> **Estimated Effort**: 1.5 days
> **Dependencies**: Phase 2.1 (Storage Service), Phase 2.2 (Buckets Component)

## Objective

Add multi-select support to ObjectBrowser with keyboard shortcuts (Ctrl+A, Shift+Click) and bulk actions toolbar using PatternFly 6 Table selectable rows pattern.

## Files to Modify

- `frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx`

## Implementation Steps

### Step 1: Add Multi-Select State

```typescript
const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
const [lastSelected, setLastSelected] = useState<string | null>(null);

// Clear selection on navigation
useEffect(() => {
  setSelectedItems(new Set());
  setLastSelected(null);
}, [currentPath, locationId]);
```

### Step 2: Implement Selection Handlers

```typescript
// Select all visible items
const handleSelectAll = (isSelecting: boolean) => {
  if (isSelecting) {
    setSelectedItems(new Set(files.map((f) => f.path)));
  } else {
    setSelectedItems(new Set());
  }
};

// Single row selection
const handleSelectRow = (path: string, isSelected: boolean) => {
  const updated = new Set(selectedItems);
  if (isSelected) {
    updated.add(path);
  } else {
    updated.delete(path);
  }
  setSelectedItems(updated);
  setLastSelected(path);
};

// Shift+Click range selection
const handleShiftClick = (path: string) => {
  if (!lastSelected) {
    handleSelectRow(path, true);
    return;
  }

  const lastIndex = files.findIndex((f) => f.path === lastSelected);
  const currentIndex = files.findIndex((f) => f.path === path);

  if (lastIndex === -1 || currentIndex === -1) return;

  const start = Math.min(lastIndex, currentIndex);
  const end = Math.max(lastIndex, currentIndex);

  const updated = new Set(selectedItems);
  for (let i = start; i <= end; i++) {
    updated.add(files[i].path);
  }

  setSelectedItems(updated);
};
```

### Step 3: Add Keyboard Shortcuts

```typescript
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    // Ctrl+A: Select all
    if (e.ctrlKey && e.key === 'a') {
      e.preventDefault();
      handleSelectAll(true);
    }

    // Escape: Clear selection
    if (e.key === 'Escape') {
      setSelectedItems(new Set());
    }
  };

  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [files]);
```

### Step 4: Update Table with Selection

```tsx
import { Table, Thead, Tbody, Tr, Th, Td } from '@patternfly/react-table';

<Table variant="compact">
  <Thead>
    <Tr>
      <Th
        select={{
          onSelect: (_event, isSelecting) => handleSelectAll(isSelecting),
          isSelected: selectedItems.size === files.length && files.length > 0,
        }}
      />
      <Th>Name</Th>
      <Th>Size</Th>
      <Th>Modified</Th>
      <Th>Actions</Th>
    </Tr>
  </Thead>
  <Tbody>
    {files.map((file, index) => (
      <Tr
        key={file.path}
        isRowSelected={selectedItems.has(file.path)}
        onRowClick={(event) => {
          if (event.shiftKey) {
            handleShiftClick(file.path);
          }
        }}
      >
        <Td
          select={{
            rowIndex: index,
            onSelect: (_event, isSelecting) => handleSelectRow(file.path, isSelecting),
            isSelected: selectedItems.has(file.path),
          }}
        />
        <Td>{file.name}</Td>
        <Td>{formatSize(file.size)}</Td>
        <Td>{formatDate(file.modified)}</Td>
        <Td>{/* actions */}</Td>
      </Tr>
    ))}
  </Tbody>
</Table>;
```

### Step 5: Add Bulk Actions Toolbar

```tsx
import { Toolbar, ToolbarContent, ToolbarItem, Text } from '@patternfly/react-core';
import { CopyIcon, TrashIcon } from '@patternfly/react-icons';

{
  selectedItems.size > 0 && (
    <Toolbar>
      <ToolbarContent>
        <ToolbarItem>
          <Text>
            {selectedItems.size} item{selectedItems.size > 1 ? 's' : ''} selected
          </Text>
        </ToolbarItem>
        <ToolbarItem>
          <Button variant="primary" icon={<CopyIcon />} onClick={handleCopySelected}>
            Copy to...
          </Button>
        </ToolbarItem>
        <ToolbarItem>
          <Button variant="danger" icon={<TrashIcon />} onClick={handleDeleteSelected}>
            Delete
          </Button>
        </ToolbarItem>
        <ToolbarItem>
          <Button variant="link" onClick={() => setSelectedItems(new Set())}>
            Clear selection
          </Button>
        </ToolbarItem>
      </ToolbarContent>
    </Toolbar>
  );
}
```

### Step 6: Implement Bulk Actions

```typescript
const handleDeleteSelected = async () => {
  if (!confirm(`Delete ${selectedItems.size} items?`)) return;

  try {
    await Promise.all(
      Array.from(selectedItems).map((path) => storageService.deleteFile(locationId, path)),
    );

    // Refresh file list
    await refreshFiles();
    setSelectedItems(new Set());

    // Show success notification
  } catch (error) {
    // Show error notification
  }
};

const handleCopySelected = () => {
  // Open destination picker modal
  // Will be implemented in Phase 2.4
};
```

### Step 7: Update API Integration

```typescript
// Detect storage type from locationId
const getStorageType = (id: string): 'local' | 's3' => {
  return id.startsWith('local-') ? 'local' : 's3';
};

// Use storage service for all operations
const refreshFiles = async () => {
  try {
    const { files } = await storageService.listFiles(locationId, currentPath);
    setFiles(files);
  } catch (error) {
    console.error('Failed to load files:', error);
  }
};
```

## Acceptance Criteria

- [ ] Checkbox column appears in file table
- [ ] Individual row selection works
- [ ] Select all checkbox works
- [ ] Shift+Click range selection works
- [ ] Ctrl+A keyboard shortcut selects all
- [ ] Escape clears selection
- [ ] Bulk actions toolbar appears when items selected
- [ ] Selection count displays correctly
- [ ] Delete selected works
- [ ] Copy to... opens modal (Phase 2.4)
- [ ] Selection clears on navigation
- [ ] Storage service used for all API calls
- [ ] Works for both S3 and local storage

## References

- Feature spec: `docs/features/pvc-storage-support.md` (lines 486-570)
- PatternFly Table: https://www.patternfly.org/components/table
