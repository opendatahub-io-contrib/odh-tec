# Phase 2.2: Update Buckets Component

> **Task ID**: phase-2.2
> **Estimated Effort**: 0.5 days
> **Dependencies**: Phase 2.1 (Storage Service)

## Objective

Modify the Buckets component to display unified storage list (S3 + local) with visual type indicators using PatternFly 6 Label badges.

## Files to Modify

- `frontend/src/app/components/Buckets/Buckets.tsx`

## Implementation Steps

### Step 1: Replace API Call

```typescript
// Before (S3 only):
const [buckets, setBuckets] = useState<any[]>([]);

useEffect(() => {
  fetch('/api/buckets')
    .then((res) => res.json())
    .then((data) => setBuckets(data.buckets));
}, []);

// After (Unified storage):
import { storageService, StorageLocation } from '../../services/storageService';

const [locations, setLocations] = useState<StorageLocation[]>([]);

useEffect(() => {
  storageService
    .getLocations()
    .then(setLocations)
    .catch((error) => {
      console.error('Failed to load storage locations:', error);
      // Show error notification
    });
}, []);
```

### Step 2: Add Type Indicators

```tsx
import { Label } from '@patternfly/react-core';
import { CloudIcon, FolderIcon } from '@patternfly/react-icons';

{
  locations.map((location) => (
    <DataListItem key={location.id}>
      <DataListItemRow>
        <DataListItemCells
          dataListCells={[
            <DataListCell key="name">
              <Flex
                spaceItems={{ default: 'spaceItemsSm' }}
                alignItems={{ default: 'alignItemsCenter' }}
              >
                <FlexItem>{location.name}</FlexItem>
                <FlexItem>
                  {location.type === 's3' ? (
                    <Label color="blue" icon={<CloudIcon />}>
                      S3
                    </Label>
                  ) : (
                    <Label color="green" icon={<FolderIcon />}>
                      PVC
                    </Label>
                  )}
                </FlexItem>
              </Flex>
            </DataListCell>,
            <DataListCell key="status">
              {!location.available && (
                <Tooltip content="Storage location is not accessible">
                  <Label color="red">Unavailable</Label>
                </Tooltip>
              )}
            </DataListCell>,
          ]}
        />
        <DataListAction>
          <Button
            variant="primary"
            onClick={() => navigate(`/storage/${location.id}`)}
            isDisabled={!location.available}
          >
            Browse
          </Button>
        </DataListAction>
      </DataListItemRow>
    </DataListItem>
  ));
}
```

### Step 3: Update Navigation

```typescript
// Update navigation to handle both types
const navigate = useNavigate();

const handleBrowse = (location: StorageLocation) => {
  if (!location.available) {
    // Show warning notification
    return;
  }

  navigate(`/storage/${location.id}`);
};
```

### Step 4: Update Creation/Deletion

```typescript
// For S3 buckets (if creation is supported):
const handleCreateS3Bucket = async (name: string) => {
  await fetch('/api/buckets', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  // Refresh locations
  const updated = await storageService.getLocations();
  setLocations(updated);
};

// Local storage locations are managed via environment variables,
// so creation UI is not applicable
```

## Acceptance Criteria

- [ ] Component displays both S3 and local storage locations
- [ ] S3 locations show blue "S3" label
- [ ] Local locations show green "PVC" label
- [ ] Unavailable locations show red "Unavailable" label
- [ ] Unavailable locations have disabled browse button
- [ ] Tooltip explains unavailability
- [ ] Navigation works for both storage types
- [ ] Component updates when locations change
- [ ] Error handling shows notifications
- [ ] No regression in S3 functionality

## References

- Feature spec: `docs/features/pvc-storage-support.md` (lines 465-484)
- PatternFly Label: https://www.patternfly.org/components/label
