# Phase 1: Foundation & URL Refactoring

**Part of**: ObjectBrowser Unified Storage Integration
**Estimated Time**: 1.5 hours
**Difficulty**: Medium
**Dependencies**: None (can start immediately)

## Objective

Establish the foundation for unified storage browsing by:

1. Updating the routing pattern from S3-specific to storage-agnostic
2. Changing URL parameters from `bucketName/prefix` to `locationId/path`
3. Ensuring TypeScript compilation succeeds with new URL structure

**Success Criteria**: Application compiles, URLs use new pattern, navigation still works (even if features are incomplete)

## Prerequisites

- [ ] Read `docs/implementation-plans/objectbrowser-unified-storage-integration-v2.md`
- [ ] Understand StorageLocation interface in `frontend/src/app/services/storageService.ts`
- [ ] Have development environment running (`npm run start:dev`)

## Files to Modify

### Primary Files

1. `frontend/src/app/routes.tsx` - Route definitions
2. `frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx` - URL parameter extraction and navigation

### Files to Reference (Do Not Modify Yet)

- `frontend/src/app/services/storageService.ts` - StorageLocation interface
- `frontend/src/app/components/ObjectBrowser/objectBrowserFunctions.ts` - Current navigation logic

## Detailed Tasks

### Task 1.1: Update Route Definitions (15 min)

**File**: `frontend/src/app/routes.tsx`

**Current State** (lines 29-76):

```typescript
const routes: AppRouteConfig[] = [
  {
    label: 'S3 Tools',
    // ...
    routes: [
      {
        element: <ObjectBrowser />,
        label: 'Object Browser',
        path: '/objects/:bucketName/:prefix?',
        title: 'Object Browser',
      },
      // ...
    ],
  },
  // ...
  {
    element: <Navigate to="/objects/:bucketName/:prefix?" />,
    path: '/',
    title: 'Redirect',
  },
  // ...
  {
    element: <Navigate to="/objects/:bucketName/:prefix?" />,
    path: '*',
    title: 'Redirect',
  },
];
```

**Changes Required**:

1. Update ObjectBrowser route:

```typescript
{
  element: <ObjectBrowser />,
  label: 'Storage Browser', // Changed from 'Object Browser'
  path: '/browse/:locationId?/:path?', // Changed from '/objects/:bucketName/:prefix?'
  title: 'Storage Browser', // Changed from 'Object Browser'
}
```

2. Update default redirect (line 61-64):

```typescript
{
  element: <Navigate to="/browse" />, // Changed from '/objects/:bucketName/:prefix?'
  path: '/',
  title: 'Redirect',
}
```

3. Update catch-all redirect (line 72-75):

```typescript
{
  element: <Navigate to="/browse" />, // Changed from '/objects/:bucketName/:prefix?'
  path: '*',
  title: 'Redirect',
}
```

4. Update group label (line 31):

```typescript
label: 'Storage Tools', // Changed from 'S3 Tools'
```

**Verification**:

- [ ] TypeScript compiles without errors
- [ ] Browser dev server reloads without errors
- [ ] Navigating to `/` redirects to `/browse`
- [ ] Navigating to `/unknown-route` redirects to `/browse`

---

### Task 1.2: Update URL Parameter Extraction (20 min)

**File**: `frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx`

**Current State** (around line 124):

```typescript
const { bucketName } = useParams<{ bucketName: string }>();
const { prefix } = useParams<{ prefix: string }>();
```

**Changes Required**:

1. Replace URL parameter extraction:

```typescript
// REPLACE THIS:
const { bucketName } = useParams<{ bucketName: string }>();
const { prefix } = useParams<{ prefix: string }>();

// WITH THIS:
const { locationId, path } = useParams<{
  locationId?: string;
  path?: string;
}>();
```

2. Add temporary compatibility layer (will be removed in Phase 3):

```typescript
// TEMPORARY: Keep bucketName and prefix variables for compatibility
// These will be removed in Phase 3 when we refactor state
const bucketName = locationId;
const prefix = path;
```

**Why this approach**: This allows Phase 1 to compile while maintaining compatibility with existing code. Phase 3 will remove these compatibility variables when refactoring state.

**Verification**:

- [ ] TypeScript compiles without errors
- [ ] Component renders without runtime errors
- [ ] Console shows extracted `locationId` and `path` parameters when URL changes

---

### Task 1.3: Update Navigation Calls (45 min)

**File**: `frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx`

**Search Strategy**: Use grep to find all `navigate(` calls:

```bash
grep -n "navigate(" frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx
```

**Expected Locations** (approximate line numbers may vary):

- Line ~160: Bucket selector change
- Line ~180: Bucket text input
- Line ~220: Error handling redirects
- Line ~370: Prefix/path click handlers
- Line ~450: Folder navigation
- Multiple locations in event handlers

**Pattern to Find**:

```typescript
navigate(`/objects/${bucketName}/${...}`)
navigate(`/objects/${bucketName}`)
navigate('/objects/:bucketName')
```

**Pattern to Replace With**:

```typescript
navigate(`/browse/${locationId}/${...}`)
navigate(`/browse/${locationId}`)
navigate('/browse')
```

**Specific Examples**:

1. **Bucket selector change** (~line 160):

```typescript
// BEFORE
const handleBucketSelectorChange = (_event: React.FormEvent<HTMLSelectElement>, value: string) => {
  setFormSelectBucket(value);
  navigate(`/objects/${value}`);
};

// AFTER
const handleBucketSelectorChange = (_event: React.FormEvent<HTMLSelectElement>, value: string) => {
  setFormSelectBucket(value);
  navigate(`/browse/${value}`);
};
```

2. **Prefix click handlers** (~line 370):

```typescript
// BEFORE
const handlePrefixClick = (plainTextPrefix: string) => {
  // ...
  navigate(
    plainTextPrefix !== ''
      ? `/objects/${bucketName}/${btoa(plainTextPrefix)}`
      : `/objects/${bucketName}`,
  );
};

// AFTER
const handlePrefixClick = (plainTextPrefix: string) => {
  // ...
  navigate(
    plainTextPrefix !== ''
      ? `/browse/${locationId}/${btoa(plainTextPrefix)}`
      : `/browse/${locationId}`,
  );
};
```

3. **Error handling** (~line 220):

```typescript
// BEFORE
navigate(`/objects/${buckets[0].Name}`);

// AFTER
navigate(`/browse/${buckets[0].Name}`);
```

4. **Breadcrumb navigation**:

```typescript
// BEFORE
<BreadcrumbItem to={`/objects/${bucketName}`}>
  // ...
</BreadcrumbItem>

// AFTER
<BreadcrumbItem to={`/browse/${locationId}`}>
  // ...
</BreadcrumbItem>
```

**Important Notes**:

- Keep `bucketName` variable name for now (compatibility layer)
- Keep `prefix` variable name for now (compatibility layer)
- Just change the URL pattern from `/objects/` to `/browse/`
- All the state variable renaming happens in Phase 3

**Systematic Approach**:

1. Search for all occurrences of `navigate\(`
2. For each occurrence, check if it contains `/objects/`
3. Replace `/objects/` with `/browse/`
4. Ensure parameter order is correct: `locationId` first, then `path`
5. Verify TypeScript still compiles after each change

**Verification After Each Change**:

- [ ] TypeScript compiles
- [ ] No new ESLint errors
- [ ] Run `npm run type-check` in frontend directory

---

### Task 1.4: Update objectBrowserFunctions.ts Navigation (15 min)

**File**: `frontend/src/app/components/ObjectBrowser/objectBrowserFunctions.ts`

**Search for**: `navigate(` calls in this file

**Expected Location** (around lines 32-37):

```typescript
if (bucketName === ':bucketName') {
  if (defaultBucket !== '') navigate(`/objects/${defaultBucket}`);
  else {
    navigate(`/objects/${buckets[0].Name}`);
  }
}
```

**Changes Required**:

```typescript
// AFTER
if (bucketName === ':bucketName') {
  if (defaultBucket !== '') navigate(`/browse/${defaultBucket}`);
  else {
    navigate(`/browse/${buckets[0].Name}`);
  }
}
```

**Verification**:

- [ ] TypeScript compiles
- [ ] No new errors in browser console

---

### Task 1.5: Verify Application Still Works (15 min)

**Manual Testing Checklist**:

1. **Start Development Server**:

```bash
cd frontend
npm run start:dev
```

2. **Test URL Navigation**:

- [ ] Navigate to `http://localhost:9000/` → Should redirect to `/browse`
- [ ] Navigate to `http://localhost:9000/browse` → Should load ObjectBrowser
- [ ] Navigate to `http://localhost:9000/browse/test-bucket` → Should attempt to load bucket
- [ ] Browser console shows no runtime errors

3. **Test TypeScript Compilation**:

```bash
cd frontend
npm run type-check
```

- [ ] No TypeScript errors

4. **Test Build**:

```bash
cd frontend
npm run build
```

- [ ] Build succeeds

**Expected State After Phase 1**:

- ✅ Application compiles and runs
- ✅ URLs use `/browse/:locationId/:path?` pattern
- ✅ Navigation calls updated to new pattern
- ⚠️ Features may not work completely (expected - will be fixed in later phases)
- ⚠️ Still uses S3-specific state variables (expected - will be renamed in Phase 3)

---

## Verification Steps

### Automated Checks

```bash
# From frontend directory:

# 1. Type checking
npm run type-check

# 2. Linting
npm run lint

# 3. Build
npm run build
```

### Manual Checks

1. **URL Pattern Verification**:

   - Open browser to `http://localhost:9000/`
   - Verify redirect to `/browse`
   - Check browser console for errors

2. **Code Search Verification**:

```bash
# Should find NO matches (all should be updated):
grep -r "/objects/\${" frontend/src/app/components/ObjectBrowser/

# Should find matches (new pattern):
grep -r "/browse/\${" frontend/src/app/components/ObjectBrowser/
```

3. **Route Configuration**:
   - Verify `routes.tsx` has `/browse/:locationId?/:path?` pattern
   - Verify default redirects point to `/browse`

## Common Issues & Solutions

### Issue 1: TypeScript Error - Property 'bucketName' does not exist

**Cause**: Removed `bucketName` from useParams but code still references it
**Solution**: Add compatibility layer:

```typescript
const { locationId, path } = useParams<{...}>();
const bucketName = locationId; // Temporary compatibility
const prefix = path; // Temporary compatibility
```

### Issue 2: Browser shows blank page

**Cause**: Webpack compilation error or runtime error
**Solution**:

1. Check terminal for Webpack errors
2. Check browser console for runtime errors
3. Verify all imports are correct

### Issue 3: Routes not matching

**Cause**: Route order or pattern syntax
**Solution**:

1. Verify route pattern syntax: `/browse/:locationId?/:path?`
2. Check React Router v7 documentation for syntax
3. Ensure routes are ordered correctly (specific before general)

## Rollback Instructions

If this phase causes critical issues:

1. **Revert routes.tsx**:

```bash
git checkout -- frontend/src/app/routes.tsx
```

2. **Revert ObjectBrowser.tsx**:

```bash
git checkout -- frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx
```

3. **Revert objectBrowserFunctions.ts**:

```bash
git checkout -- frontend/src/app/components/ObjectBrowser/objectBrowserFunctions.ts
```

4. **Rebuild**:

```bash
cd frontend && npm run build
```

## Dependencies for Next Phases

**Phase 2 depends on**:

- ✅ `locationId` parameter available in ObjectBrowser
- ✅ Navigation using `/browse/:locationId` pattern
- ✅ TypeScript compilation succeeds

**What Phase 2 will do**:

- Replace bucket loading with location loading
- Add StorageLocation state
- Implement location selector

## Checklist Before Marking Complete

- [ ] All navigation calls updated to `/browse/` pattern
- [ ] URL parameter extraction uses `locationId` and `path`
- [ ] routes.tsx updated with new patterns
- [ ] TypeScript compiles with no errors
- [ ] Application runs in development mode
- [ ] Production build succeeds
- [ ] No console errors when loading `/browse`
- [ ] Git changes reviewed and ready for commit

## Estimated Time Breakdown

- Task 1.1 (Route definitions): 15 min
- Task 1.2 (URL parameters): 20 min
- Task 1.3 (Navigation calls): 45 min
- Task 1.4 (objectBrowserFunctions): 15 min
- Task 1.5 (Verification): 15 min
- **Total**: ~1.5 hours

## Next Phase

After completing Phase 1, proceed to:
**Phase 2: Location Loading & Selection** (`objectbrowser-phase2-locations.md`)
