# Phase 2: Location Loading & Selection

**Part of**: ObjectBrowser Unified Storage Integration
**Estimated Time**: 1.5 hours
**Difficulty**: Medium
**Dependencies**: Phase 1 (Foundation & URL Refactoring) must be complete

## Objective

Replace S3-specific bucket loading with unified storage location loading that supports both S3 buckets and local PVC storage:

1. Replace `bucketsList` state with `locations` state using StorageLocation interface
2. Load all storage locations (S3 + local) via storageService
3. Implement location selection with error handling for unavailable locations
4. Update location selector dropdown to show both storage types

**Success Criteria**: Dropdown shows both S3 and local storage locations, unavailable locations are disabled, error handling works for missing/unavailable locations

## Prerequisites

- [ ] Phase 1 completed (URL pattern is `/browse/:locationId/:path?`)
- [ ] Read `frontend/src/app/services/storageService.ts` to understand:
  - `StorageLocation` interface
  - `getLocations()` method
- [ ] Development server running

## Files to Modify

### Primary Files

1. `frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx` - Main component
2. `frontend/src/app/components/ObjectBrowser/objectBrowserTypes.ts` - Type definitions (import StorageLocation)

### Files to Reference (Do Not Modify)

- `frontend/src/app/services/storageService.ts` - StorageLocation interface and getLocations()
- `frontend/src/app/components/ObjectBrowser/objectBrowserFunctions.ts` - Current loadBuckets() function

## Detailed Tasks

### Task 2.1: Import StorageLocation Types (10 min)

**File**: `frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx`

**Current Imports** (top of file):

```typescript
import * as React from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
// ... other imports
```

**Add Import**:

```typescript
import { storageService, StorageLocation } from '@app/services/storageService';
```

**Verification**:

- [ ] TypeScript compiles
- [ ] No import errors in IDE

---

### Task 2.2: Add Location State Variables (15 min)

**File**: `frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx`

**Current State** (around line 130-140):

```typescript
const [bucketsList, setBucketsList] = React.useState<BucketsList | null>(null);
const [formSelectBucket, setFormSelectBucket] = React.useState(bucketName);
```

**Add New State** (add after existing state declarations):

```typescript
// Unified storage locations (S3 + local)
const [locations, setLocations] = React.useState<StorageLocation[]>([]);
const [selectedLocation, setSelectedLocation] = React.useState<StorageLocation | null>(null);
const [formSelectLocation, setFormSelectLocation] = React.useState(locationId || '');
```

**Important Notes**:

- Keep existing `bucketsList` and `formSelectBucket` state for now (Phase 3 will remove them)
- This allows incremental migration
- New state works alongside old state temporarily

**Verification**:

- [ ] TypeScript compiles
- [ ] No state-related errors

---

### Task 2.3: Load All Storage Locations on Mount (20 min)

**File**: `frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx`

**Add New useEffect** (add after existing useEffect hooks):

```typescript
// Load all storage locations (S3 + local) on mount
React.useEffect(() => {
  storageService
    .getLocations()
    .then((allLocations) => {
      console.log('[ObjectBrowser] Loaded locations:', allLocations);
      setLocations(allLocations);
    })
    .catch((error) => {
      console.error('[ObjectBrowser] Failed to load storage locations:', error);
      Emitter.emit('notification', {
        variant: 'warning',
        title: 'Error Loading Locations',
        description: 'Failed to load storage locations. Please check your connection settings.',
      });
    });
}, []); // Empty dependency array - run only on mount
```

**Why This Works**:

- Loads both S3 buckets AND local storage locations in one call
- storageService.getLocations() returns unified StorageLocation[] array
- Runs once when component mounts
- Provides error feedback to user via notification

**Verification**:

- [ ] Console shows "Loaded locations:" message with array
- [ ] Array contains both S3 and local storage locations
- [ ] If backend is not running, notification appears

---

### Task 2.4: Set Selected Location from URL (25 min)

**File**: `frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx`

**Add New useEffect** (add after location loading effect):

```typescript
// Set selected location based on URL parameter
React.useEffect(() => {
  if (!locationId) {
    // No location selected - redirect to first available
    if (locations.length > 0) {
      const firstAvailable = locations.find((loc) => loc.available) || locations[0];
      console.log('[ObjectBrowser] No location in URL, redirecting to:', firstAvailable.id);
      navigate(`/browse/${firstAvailable.id}`);
    }
    return;
  }

  if (locations.length === 0) {
    // Locations not loaded yet
    return;
  }

  // Find location by ID
  const location = locations.find((loc) => loc.id === locationId);

  if (!location) {
    // Location not found
    console.error('[ObjectBrowser] Location not found:', locationId);
    Emitter.emit('notification', {
      variant: 'warning',
      title: 'Location Not Found',
      description: `Storage location "${locationId}" does not exist.`,
    });
    // Redirect to first available location
    const firstAvailable = locations.find((loc) => loc.available) || locations[0];
    if (firstAvailable) {
      navigate(`/browse/${firstAvailable.id}`);
    } else {
      navigate('/browse');
    }
    return;
  }

  if (!location.available) {
    // Location exists but is unavailable
    console.warn('[ObjectBrowser] Location unavailable:', locationId);
    Emitter.emit('notification', {
      variant: 'warning',
      title: 'Location Unavailable',
      description: `Storage location "${location.name}" is currently unavailable. It may be disconnected or inaccessible.`,
    });
  }

  // Set selected location
  console.log('[ObjectBrowser] Selected location:', location);
  setSelectedLocation(location);
  setFormSelectLocation(locationId);
}, [locationId, locations, navigate]);
```

**Key Features**:

1. Handles missing locationId (no location in URL)
2. Handles location not found (invalid locationId)
3. Handles unavailable location (exists but not accessible)
4. Provides user feedback via notifications
5. Auto-redirects to valid location when needed

**Verification**:

- [ ] Navigate to `/browse` → Auto-redirects to first location
- [ ] Navigate to `/browse/invalid-id` → Shows error, redirects
- [ ] Navigate to `/browse/valid-id` → Sets selectedLocation
- [ ] Console logs show location selection flow

---

### Task 2.5: Update Location Selector Dropdown (30 min)

**File**: `frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx`

**Find Current Location Selector** (search for "FormSelect"):

```typescript
// Current bucket selector (around line 1200-1220)
<FormSelect
  value={formSelectBucket}
  onChange={handleBucketSelectorChange}
  aria-label="Select bucket"
>
  {bucketsList?.buckets.map((bucket) => (
    <FormSelectOption
      key={bucket.Name}
      value={bucket.Name}
      label={bucket.Name}
    />
  ))}
</FormSelect>
```

**Replace With**:

```typescript
<FormSelect
  value={formSelectLocation}
  onChange={handleLocationSelectorChange}
  aria-label="Select storage location"
>
  {locations.length === 0 && (
    <FormSelectOption
      key="loading"
      value=""
      label="Loading locations..."
      isDisabled
    />
  )}

  {locations.map((loc) => {
    const label = loc.type === 's3'
      ? `${loc.name} (S3)`
      : `${loc.name} (Local${!loc.available ? ' - Unavailable' : ''})`;

    return (
      <FormSelectOption
        key={loc.id}
        value={loc.id}
        label={label}
        isDisabled={!loc.available}
      />
    );
  })}
</FormSelect>
```

**Features**:

- Shows loading state when locations not yet loaded
- Displays storage type (S3/Local) in label
- Shows "Unavailable" for inaccessible local locations
- Disables unavailable locations (can't select them)
- Clear visual distinction between S3 and local storage

---

### Task 2.6: Update Location Selector Change Handler (15 min)

**File**: `frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx`

**Find Current Handler** (search for "handleBucketSelectorChange"):

```typescript
const handleBucketSelectorChange = (_event: React.FormEvent<HTMLSelectElement>, value: string) => {
  setFormSelectBucket(value);
  navigate(`/objects/${value}`); // OLD URL pattern
};
```

**Add New Handler** (add near existing handler):

```typescript
const handleLocationSelectorChange = (
  _event: React.FormEvent<HTMLSelectElement>,
  value: string,
) => {
  console.log('[ObjectBrowser] Location selector changed to:', value);

  // Find the selected location
  const newLocation = locations.find((loc) => loc.id === value);

  if (!newLocation) {
    console.error('[ObjectBrowser] Selected location not found:', value);
    return;
  }

  if (!newLocation.available) {
    console.warn('[ObjectBrowser] Attempted to select unavailable location:', value);
    Emitter.emit('notification', {
      variant: 'warning',
      title: 'Location Unavailable',
      description: `Cannot select "${newLocation.name}" as it is currently unavailable.`,
    });
    return;
  }

  // Navigate to the new location (root path)
  setFormSelectLocation(value);
  navigate(`/browse/${value}`);
};
```

**Important Notes**:

- Validates location exists before navigating
- Prevents selecting unavailable locations (double-check, UI should prevent this)
- Provides user feedback
- Navigates to root of selected location

**Verification**:

- [ ] Selecting different location updates URL
- [ ] Selecting unavailable location shows error (if UI allows)
- [ ] Page reloads with new location

---

### Task 2.7: Update Location Selector Label (10 min)

**File**: `frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx`

**Find Label Text** (search for "Bucket Selection" or "Bucket override"):

```typescript
<Content component={ContentVariants.p}>Bucket Selection:</Content>
```

**Replace With**:

```typescript
<Content component={ContentVariants.p}>Storage Location:</Content>
```

**Also Find and Update**:

```typescript
// Old
<Content component={ContentVariants.p}>Bucket override:</Content>

// New
<Content component={ContentVariants.p}>Location override:</Content>
```

**Verification**:

- [ ] UI shows "Storage Location:" label
- [ ] UI shows "Location override:" label (if manual input exists)

---

### Task 2.8: Update Location Text Input Handler (if exists) (10 min)

**File**: `frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx`

**Find Handler** (search for "handleBucketTextInputSend"):

```typescript
const handleBucketTextInputSend = () => {
  navigate(`/objects/${formSelectBucket}`);
};
```

**Replace With**:

```typescript
const handleLocationTextInputSend = () => {
  // Validate location exists
  const location = locations.find((loc) => loc.id === formSelectLocation);

  if (!location) {
    Emitter.emit('notification', {
      variant: 'warning',
      title: 'Invalid Location',
      description: `Location "${formSelectLocation}" does not exist.`,
    });
    return;
  }

  navigate(`/browse/${formSelectLocation}`);
};
```

**Update Text Input Component** (if exists):

```typescript
// Update onChange handler
onChange={(_event, value) => setFormSelectLocation(value)}

// Update button onClick
onClick={handleLocationTextInputSend}
```

**Verification**:

- [ ] Manual location input validates before navigating
- [ ] Invalid location shows error message

---

## Verification Steps

### Automated Checks

```bash
# From frontend directory:

# 1. Type checking
npm run type-check

# 2. Build (ensure no errors)
npm run build
```

### Manual Testing Checklist

1. **Location Loading**:

```bash
# Open browser console
# Navigate to http://localhost:9000/browse
# Check console for: "[ObjectBrowser] Loaded locations: [...array...]"
```

- [ ] Console shows locations loaded
- [ ] Array contains both S3 and local storage locations
- [ ] No errors in console

2. **Location Dropdown**:

- [ ] Dropdown shows all locations
- [ ] S3 locations show "(S3)" label
- [ ] Local locations show "(Local)" label
- [ ] Unavailable locations show "(Local - Unavailable)"
- [ ] Unavailable locations are greyed out/disabled

3. **Location Selection**:

- [ ] Selecting S3 location updates URL to `/browse/{s3-bucket-name}`
- [ ] Selecting local location updates URL to `/browse/{local-id}`
- [ ] Console logs show selection flow
- [ ] Page reloads with new location

4. **Error Handling**:

```bash
# Test invalid location
# Navigate to: http://localhost:9000/browse/invalid-location-id
```

- [ ] Shows "Location Not Found" notification
- [ ] Redirects to valid location
- [ ] Console logs error

5. **No Location in URL**:

```bash
# Navigate to: http://localhost:9000/browse
```

- [ ] Auto-redirects to first available location
- [ ] Console logs show redirect decision

6. **Unavailable Location** (if you have one):

```bash
# Create unavailable location by misconfiguring backend
# Or manually test with mock data
```

- [ ] Shows "Location Unavailable" warning
- [ ] Location is disabled in dropdown
- [ ] Can view location name but can't browse files

### Console Verification

Expected console output when navigating to `/browse`:

```
[ObjectBrowser] Loaded locations: Array(3) [
  {id: "my-s3-bucket", name: "my-s3-bucket", type: "s3", available: true, ...},
  {id: "local-0", name: "PVC Storage", type: "local", available: true, ...},
  {id: "local-1", name: "Temp Storage", type: "local", available: false, ...}
]
[ObjectBrowser] No location in URL, redirecting to: my-s3-bucket
[ObjectBrowser] Selected location: {id: "my-s3-bucket", ...}
```

---

## Common Issues & Solutions

### Issue 1: Dropdown shows "Loading locations..." forever

**Cause**: getLocations() call failing
**Debug**:

```bash
# Check browser console for error
# Check backend is running: curl http://localhost:8888/api/buckets
# Check backend logs
```

**Solution**: Verify backend is running and accessible

### Issue 2: Only S3 locations showing, no local storage

**Cause**: Backend not configured for local storage OR backend error
**Debug**:

```bash
# Check backend endpoint:
curl http://localhost:8888/api/local/locations

# Should return:
# {"locations": [{...}, {...}]}
```

**Solution**: Verify backend local storage configuration

### Issue 3: TypeScript error - Cannot find name 'Emitter'

**Cause**: Missing import
**Solution**:

```typescript
import Emitter from '@app/utils/emitter';
```

### Issue 4: Infinite redirect loop

**Cause**: Navigation triggers in wrong effect dependencies
**Solution**: Check useEffect dependency array, ensure `navigate` is in deps

### Issue 5: Location selector doesn't update when URL changes

**Cause**: Missing `locationId` in dependency array
**Solution**: Verify useEffect has `[locationId, locations, navigate]` deps

---

## Rollback Instructions

If Phase 2 causes critical issues:

1. **Keep Phase 1 changes** (URL pattern is good)
2. **Comment out new location loading code**:

```typescript
// Temporarily disable new location loading
// React.useEffect(() => {
//   storageService.getLocations()...
// }, []);
```

3. **Keep old bucket loading** (don't delete it yet)

4. **Rebuild and test**

---

## Dependencies for Next Phases

**Phase 3 depends on**:

- ✅ `locations` state populated with StorageLocation[]
- ✅ `selectedLocation` state contains current location
- ✅ Location dropdown working
- ✅ Location selection triggers URL change

**What Phase 3 will do**:

- Rename all state variables (s3Objects → files, etc.)
- Remove `bucketsList` state (replaced by `locations`)
- Remove old bucket loading code
- Create unified refreshFiles() function
- Refactor table to use FileEntry interface

---

## Checklist Before Marking Complete

- [ ] StorageLocation imported correctly
- [ ] Location state variables added
- [ ] getLocations() called on mount
- [ ] Location selection from URL works
- [ ] Location dropdown shows both S3 and local locations
- [ ] Unavailable locations are disabled
- [ ] Error handling works for missing/unavailable locations
- [ ] TypeScript compiles with no errors
- [ ] Manual testing passes all checks
- [ ] Console logs show correct flow
- [ ] Git changes reviewed and ready for commit

---

## Estimated Time Breakdown

- Task 2.1 (Import types): 10 min
- Task 2.2 (Add state): 15 min
- Task 2.3 (Load locations): 20 min
- Task 2.4 (Set selected location): 25 min
- Task 2.5 (Update dropdown): 30 min
- Task 2.6 (Change handler): 15 min
- Task 2.7 (Update labels): 10 min
- Task 2.8 (Text input): 10 min
- **Total**: ~1.5 hours

---

## Next Phase

After completing Phase 2, proceed to:
**Phase 3: State Refactoring & Data Layer** (`objectbrowser-phase3-state-refactor.md`)
