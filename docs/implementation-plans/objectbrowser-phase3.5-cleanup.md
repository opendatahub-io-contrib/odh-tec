# Phase 3.5: Remove Compatibility Layers & Technical Debt

**Part of**: ObjectBrowser Unified Storage Integration
**Estimated Time**: 1.5 hours
**Difficulty**: Medium
**Dependencies**: Phase 3 (State Refactoring & Data Layer) must be complete

## Objective

Clean up all temporary compatibility layers and technical debt introduced during Phases 1-3:

1. Remove `bucketName = locationId` and `decodedPrefix = currentPath` compatibility variables
2. Replace all occurrences of `bucketName` with `locationId` throughout the component
3. Replace all occurrences of `decodedPrefix` with `currentPath` throughout the component
4. Inline file/folder operations to use `storageService` instead of old `objectBrowserFunctions`
5. Remove imports of deprecated functions

**Success Criteria**: Clean, storage-agnostic code with no S3-specific naming or compatibility layers. TypeScript compiles, builds succeed, all operations work.

## Prerequisites

- [ ] Phase 3 completed (State variables renamed, refreshFiles working)
- [ ] Understand that NO backward compatibility is needed (containerized, stateless deployment)
- [ ] Development server running for testing

## Files to Modify

### Primary Files

1. `frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx` - Remove all compatibility code

### Files to Reference (Do Not Modify)

- `frontend/src/app/services/storageService.ts` - For storageService methods
- `frontend/src/app/components/ObjectBrowser/objectBrowserFunctions.ts` - Old functions (keep file, just don't import)

## Detailed Tasks

### Task 3.5.1: Remove Compatibility Layer Variables (10 min)

**File**: `frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx`

**Current State** (lines 418, 420):

```typescript
const bucketName = locationId;
// ... other code ...
const decodedPrefix = currentPath;
```

**Changes Required**:

Delete both lines entirely:

```typescript
// DELETE THESE TWO LINES:
const bucketName = locationId;
const decodedPrefix = currentPath;
```

**Rationale**: These were temporary compatibility shims for incremental migration. Since there's no need for backward compatibility in a containerized deployment, remove them completely.

**Verification**:

- [ ] Lines 418 and 420 removed
- [ ] TypeScript shows errors where `bucketName` and `decodedPrefix` are used (expected - will fix in next tasks)

---

### Task 3.5.2: Replace All `bucketName` References (40 min)

**File**: `frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx`

**Total Occurrences**: 19 (after removing compatibility layer)

**Strategy**: Search for `\bbucketName\b` regex and replace each occurrence

#### 3.5.2.1: Simple Variable Replacements (15 min)

**Locations to Update**:

1. **Line ~463**: Guard condition in deep search

```typescript
// BEFORE
if (!bucketName) return;

// AFTER
if (!locationId) return;
```

2. **Line ~532**: Guard condition

```typescript
// BEFORE
if (!bucketName || deepSearchActive) return;

// AFTER
if (!locationId || deepSearchActive) return;
```

3. **Line ~567**: Deep search initiator parameter

```typescript
// BEFORE
bucketName,

// AFTER
locationId,
```

4. **Line ~604**: useEffect dependencies (also needs decodedPrefix → currentPath)

```typescript
// BEFORE
}, [decodedPrefix, bucketName]);

// AFTER
}, [currentPath, locationId]);
```

5. **Line ~674**: Bulk delete (storageService call)

```typescript
// BEFORE
storageService.deleteFile(bucketName!, path);

// AFTER
storageService.deleteFile(locationId!, path);
```

6. **Line ~770**: File viewer axios call

```typescript
// BEFORE
.get(`${config.backend_api_url}/objects/view/${bucketName}/${btoa(key)}`, { responseType: 'arraybuffer' })

// AFTER
.get(`${config.backend_api_url}/objects/view/${locationId}/${btoa(key)}`, { responseType: 'arraybuffer' })
```

7. **Line ~1407**: HuggingFace import params

```typescript
// BEFORE
params.bucketName = hfBucketName;

// AFTER
params.locationId = hfBucketName;
```

8. **Line ~1455**: HuggingFace success check

```typescript
// BEFORE
if (destType === 's3' && hfBucketName === bucketName)

// AFTER
if (destType === 's3' && hfBucketName === locationId)
```

9. **Line ~2334**: Transfer modal source location

```typescript
// BEFORE
sourceLocationId={bucketName!}

// AFTER
sourceLocationId={locationId!}
```

#### 3.5.2.2: Breadcrumb Updates (5 min)

10. **Line ~1629**: Breadcrumb root link

```typescript
// BEFORE
<BreadcrumbItem to={`/browse/${bucketName}`}>

// AFTER
<BreadcrumbItem to={`/browse/${locationId}`}>
```

11. **Line ~1636**: Breadcrumb root label - USE LOCATION NAME

```typescript
// BEFORE
{
  bucketName;
}

// AFTER
{
  selectedLocation?.name || locationId;
}
```

**Why**: Display friendly location name instead of ID (e.g., "My S3 Bucket" instead of "my-s3-bucket")

#### 3.5.2.3: URL Updates (5 min)

12. **Line ~898**: Upload progress EventSource (also needs decodedPrefix)

```typescript
// BEFORE
`${config.backend_api_url}/objects/upload-progress/${btoa(decodedPrefix + singleFilename)}` // AFTER
`${config.backend_api_url}/objects/upload-progress/${btoa(currentPath + singleFilename)}`;
```

13. **Line ~916**: Single file upload URL (also needs decodedPrefix)

```typescript
// BEFORE
`${config.backend_api_url}/objects/upload/${bucketName}/${btoa(decodedPrefix + singleFilename)}` // AFTER
`${config.backend_api_url}/objects/upload/${locationId}/${btoa(currentPath + singleFilename)}`;
```

14. **Line ~936**: Navigation after upload (both variables)

```typescript
// BEFORE
navigate(`/browse/${bucketName}/${btoa(decodedPrefix)}`);

// AFTER
navigate(`/browse/${locationId}/${btoa(currentPath)}`);
```

15. **Line ~1157**: Multi-file upload URL

```typescript
// BEFORE
.post(`${config.backend_api_url}/objects/upload/${bucketName}/${btoa(fullPath)}`, formData, {

// AFTER
.post(`${config.backend_api_url}/objects/upload/${locationId}/${btoa(fullPath)}`, formData, {
```

16. **Line ~1456**: HuggingFace navigation (both variables)

```typescript
// BEFORE
navigate(`/browse/${bucketName}/${btoa(decodedPrefix)}`);

// AFTER
navigate(`/browse/${locationId}/${btoa(currentPath)}`);
```

17. **Line ~1869**: File download link

```typescript
// BEFORE
href={`${config.backend_api_url}/objects/download/${bucketName}/${btoa(file.path)}`}

// AFTER
href={`${config.backend_api_url}/objects/download/${locationId}/${btoa(file.path)}`}
```

#### 3.5.2.4: Inline Old objectBrowserFunctions Calls (15 min)

**Important**: These three handlers currently call old functions from `objectBrowserFunctions.ts`. We need to inline them and use storageService.

18. **Line ~1230**: Delete file handler - INLINE IMPLEMENTATION

**BEFORE**:

```typescript
const handleDeleteFileConfirm = () => {
  if (!validateFileToDelete()) return;
  deleteFile(
    bucketName!,
    decodedPrefix,
    selectedFile,
    navigate,
    setFileToDelete,
    setIsDeleteFileModalOpen,
  );
};
```

**AFTER**:

```typescript
const handleDeleteFileConfirm = async () => {
  if (!validateFileToDelete()) return;

  try {
    await storageService.deleteFile(locationId!, selectedFile);

    Emitter.emit('notification', {
      variant: 'success',
      title: 'File deleted',
      description: `File "${selectedFile.split('/').pop()}" has been successfully deleted.`,
    });

    navigate(`/browse/${locationId}/${btoa(currentPath)}`);
    setFileToDelete('');
    setIsDeleteFileModalOpen(false);
  } catch (error: any) {
    console.error('Error deleting file', error);
    Emitter.emit('notification', {
      variant: 'warning',
      title: error.response?.data?.error || 'File Deletion Failed',
      description: error.response?.data?.message || String(error),
    });
  }
};
```

19. **Line ~1268**: Delete folder handler - INLINE IMPLEMENTATION

**BEFORE**:

```typescript
const handleDeleteFolderConfirm = () => {
  if (!validateFolderToDelete()) return;
  deleteFolder(
    bucketName!,
    decodedPrefix,
    selectedFolder,
    navigate,
    setFolderToDelete,
    setIsDeleteFolderModalOpen,
  );
};
```

**AFTER**:

```typescript
const handleDeleteFolderConfirm = async () => {
  if (!validateFolderToDelete()) return;

  try {
    await storageService.deleteFile(locationId!, selectedFolder);

    Emitter.emit('notification', {
      variant: 'success',
      title: 'Folder deleted',
      description: `Folder "${selectedFolder.slice(0, -1).split('/').pop()}" has been successfully deleted.`,
    });

    navigate(`/browse/${locationId}/${btoa(currentPath)}`);
    setFolderToDelete('');
    setIsDeleteFolderModalOpen(false);
  } catch (error: any) {
    console.error('Error deleting folder', error);
    Emitter.emit('notification', {
      variant: 'warning',
      title: error.response?.data?.error || 'Folder Deletion Failed',
      description: error.response?.data?.message || String(error),
    });
  }
};
```

**Note**: Both file and folder deletion use `storageService.deleteFile()` - the backend handles both.

20. **Line ~1312**: Create folder handler - INLINE WITH storageService.createDirectory

**BEFORE**:

```typescript
const handleNewFolderCreate = () => {
  if (!validateFolderName()) return;
  createFolder(
    bucketName!,
    decodedPrefix,
    newFolderName,
    navigate,
    setNewFolderName,
    setIsCreateFolderModalOpen,
  );
};
```

**AFTER**:

```typescript
const handleNewFolderCreate = async () => {
  if (!validateFolderName()) return;

  try {
    await storageService.createDirectory(locationId!, currentPath + newFolderName);

    Emitter.emit('notification', {
      variant: 'success',
      title: 'Folder created',
      description: `Folder "${newFolderName}" has been successfully created.`,
    });

    setNewFolderName('');
    setIsCreateFolderModalOpen(false);
    navigate(`/browse/${locationId}/${btoa(currentPath)}`);
  } catch (error: any) {
    console.error('Error creating folder', error);
    Emitter.emit('notification', {
      variant: 'warning',
      title: error.response?.data?.error || 'Folder Creation Failed',
      description: error.response?.data?.message || String(error),
    });
  }
};
```

**Verification After Task 3.5.2**:

```bash
# Should find 0 matches:
grep -n "\bbucketName\b" frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx
```

---

### Task 3.5.3: Replace All `decodedPrefix` References (30 min)

**File**: `frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx`

**Total Occurrences**: 17 (after removing compatibility layer)

**Strategy**: Search for `\bdecodedPrefix\b` regex and replace each occurrence

**Note**: Many of these were already covered in Task 3.5.2. This task handles the remaining ones.

#### 3.5.3.1: Simple Replacements (10 min)

1. **Line ~272**: Copy path to clipboard

```typescript
// BEFORE
navigator.clipboard.writeText('/' + decodedPrefix).then(

// AFTER
navigator.clipboard.writeText('/' + currentPath).then(
```

2. **Line ~604**: useEffect dependencies (already covered in 3.5.2.1 #4)

3-7. **Lines ~898, 916, 936, 1079, 1087, 1103**: Already covered in Task 3.5.2

8-10. **Lines ~1230, 1268, 1312**: Already covered in Task 3.5.2

11. **Line ~1456**: Already covered in Task 3.5.2

#### 3.5.3.2: Breadcrumb Path Rendering (10 min)

12. **Line ~1639**: Breadcrumb conditional render

```typescript
// BEFORE
{decodedPrefix
  ? decodedPrefix.slice(0, -1).split('/').map((part, index) => (
      // ... breadcrumb items
  ))
  : null}

// AFTER
{currentPath
  ? currentPath.slice(0, -1).split('/').map((part, index) => (
      // ... breadcrumb items
  ))
  : null}
```

13. **Line ~1648**: Breadcrumb path accumulation

```typescript
// BEFORE
decodedPrefix
  .slice(0, -1)
  .split('/')
  .slice(0, index + 1)
  .join('/') + '/';

// AFTER
currentPath
  .slice(0, -1)
  .split('/')
  .slice(0, index + 1)
  .join('/') + '/';
```

14. **Line ~1654**: Breadcrumb disable logic

```typescript
// BEFORE
isDisabled={index === decodedPrefix.slice(0, -1).split('/').length - 1}

// AFTER
isDisabled={index === currentPath.slice(0, -1).split('/').length - 1}
```

#### 3.5.3.3: Upload Progress Tracking (10 min)

15-17. **Lines ~2299, 2304, 2306**: Upload progress object keys

```typescript
// BEFORE (line ~2299)
(uploadToS3Percentages[decodedPrefix + file.path.replace(/^\//, '')]?.status ?? '')

// AFTER
(uploadToS3Percentages[currentPath + file.path.replace(/^\//, '')]?.status ?? '')

// BEFORE (line ~2304)
progressValue={uploadToS3Percentages[decodedPrefix + file.path.replace(/^\//, '')]?.loaded ?? 0}

// AFTER
progressValue={uploadToS3Percentages[currentPath + file.path.replace(/^\//, '')]?.loaded ?? 0}

// BEFORE (line ~2306)
uploadToS3Percentages[decodedPrefix + file.path.replace(/^\//, '')]?.status === 'completed'

// AFTER
uploadToS3Percentages[currentPath + file.path.replace(/^\//, '')]?.status === 'completed'
```

**Verification After Task 3.5.3**:

```bash
# Should find 0 matches:
grep -n "\bdecodedPrefix\b" frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx
```

---

### Task 3.5.4: Remove Old Function Imports (5 min)

**File**: `frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx`

**Current Import** (line 48):

```typescript
import { createFolder, deleteFolder, deleteFile } from './objectBrowserFunctions';
```

**Changes Required**:

Delete this import line entirely.

**Reasoning**:

- We inlined these functions in Task 3.5.2.4
- They now use `storageService` methods instead
- The old functions in `objectBrowserFunctions.ts` are deprecated

**Note**: Keep the file `objectBrowserFunctions.ts` itself for now. It may be used by other components or during migration. We can remove it in a future cleanup after verifying nothing else uses it.

**Verification**:

```bash
# Should find 0 matches:
grep -n "import.*objectBrowserFunctions" frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx
```

---

### Task 3.5.5: Final Code Quality Improvements (10 min)

#### 3.5.5.1: Add Proper TypeScript Types to Inlined Handlers

Ensure all three inlined handlers have proper error typing:

```typescript
const handleDeleteFileConfirm = async () => {
  // ... implementation with error: any in catch block
};

const handleDeleteFolderConfirm = async () => {
  // ... implementation with error: any in catch block
};

const handleNewFolderCreate = async () => {
  // ... implementation with error: any in catch block
};
```

#### 3.5.5.2: Verify All Navigate Calls Use Correct Pattern

All navigate calls should follow the pattern:

```typescript
navigate(`/browse/${locationId}/${btoa(currentPath)}`);
// OR
navigate(`/browse/${locationId}`); // for root
```

**Search for**: `navigate\(`
**Verify**: All use `locationId` not `bucketName`

---

## Verification Steps

### Automated Checks (10 min)

```bash
cd /home/gmoutier/Dev/repos/opendatahub-io-contrib/odh-tec

# 1. Type checking
npm run --prefix frontend type-check

# 2. Verify compatibility layers removed (should find 0 matches)
grep -n "const bucketName = locationId" frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx
grep -n "const decodedPrefix = currentPath" frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx

# 3. Verify old variable names removed (should find 0 matches)
grep -n "\bbucketName\b" frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx
grep -n "\bdecodedPrefix\b" frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx

# 4. Verify old imports removed (should find 0 matches)
grep -n "import.*deleteFile.*objectBrowserFunctions" frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx
grep -n "import.*deleteFolder.*objectBrowserFunctions" frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx
grep -n "import.*createFolder.*objectBrowserFunctions" frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx

# 5. Lint check
npm run --prefix frontend lint

# 6. Build
npm run --prefix frontend build
```

### Manual Testing Checklist (20 min)

**Start Development Server**:

```bash
npm run dev
```

**Test Suite**:

1. **Location Selection**:

   - [ ] Select S3 location from dropdown
   - [ ] Select local location from dropdown
   - [ ] Verify URL updates to `/browse/{locationId}`
   - [ ] Verify breadcrumb shows location name (not ID)

2. **Navigation**:

   - [ ] Navigate into directories
   - [ ] Navigate back via breadcrumbs
   - [ ] Verify URLs use `/browse/{locationId}/{base64path}`
   - [ ] Verify breadcrumbs show full path

3. **Create Folder**:

   - [ ] Open create folder modal
   - [ ] Enter folder name
   - [ ] Click create
   - [ ] Verify success notification
   - [ ] Verify folder appears in list
   - [ ] Verify navigation stays on current location

4. **Delete File**:

   - [ ] Click delete on a file
   - [ ] Confirm deletion
   - [ ] Verify success notification
   - [ ] Verify file removed from list
   - [ ] Verify navigation stays on current location

5. **Delete Folder**:

   - [ ] Click delete on a folder
   - [ ] Confirm deletion
   - [ ] Verify success notification
   - [ ] Verify folder removed from list
   - [ ] Verify navigation stays on current location

6. **Upload File**:

   - [ ] Upload single file
   - [ ] Verify progress tracking works
   - [ ] Verify success notification
   - [ ] Verify file appears in list

7. **Download File**:

   - [ ] Click download link
   - [ ] Verify file downloads correctly

8. **Copy Path**:

   - [ ] Click copy path button
   - [ ] Verify clipboard contains correct path

9. **Switch Locations**:

   - [ ] Browse in S3 location
   - [ ] Switch to local location
   - [ ] Verify state resets correctly
   - [ ] Switch back to S3
   - [ ] Verify works correctly

10. **HuggingFace Import** (if available):
    - [ ] Open HF import modal
    - [ ] Import a model
    - [ ] Verify navigation works after import

### Browser Console Verification

Check browser console for:

- [ ] No TypeScript errors
- [ ] No runtime errors
- [ ] No warnings about deprecated code
- [ ] Console logs show correct locationId and currentPath values

---

## Common Issues & Solutions

### Issue 1: TypeScript Error - Cannot find name 'bucketName'

**Cause**: Forgot to replace a `bucketName` reference
**Solution**: Search for `\bbucketName\b` and replace with `locationId`

### Issue 2: TypeScript Error - Cannot find name 'decodedPrefix'

**Cause**: Forgot to replace a `decodedPrefix` reference
**Solution**: Search for `\bdecodedPrefix\b` and replace with `currentPath`

### Issue 3: Runtime Error - storageService.createDirectory is not a function

**Cause**: Backend or storageService doesn't have createDirectory method
**Solution**:

1. Check `frontend/src/app/services/storageService.ts` for the method
2. If missing, use the S3 marker file approach temporarily:

```typescript
// Fallback implementation
const formData = new FormData();
const emptyFile = new File([''], '.s3keep');
formData.append('file', emptyFile);
const encodedKey = btoa(currentPath + newFolderName + '/.s3keep');
await axios.post(`${config.backend_api_url}/objects/upload/${locationId}/${encodedKey}`, formData, {
  headers: { 'Content-Type': 'multipart/form-data' },
});
```

### Issue 4: Breadcrumb shows locationId instead of friendly name

**Cause**: selectedLocation is null or doesn't have name property
**Solution**: Verify location loading logic from Phase 2 is working correctly

### Issue 5: Upload progress not working

**Cause**: Progress keys still using old variable names
**Solution**: Verify all upload progress object keys use `currentPath` instead of `decodedPrefix`

### Issue 6: Navigation broken after file operations

**Cause**: Navigate calls still using old variable names
**Solution**: Search for all `navigate(` calls and verify they use `locationId` and `currentPath`

---

## Rollback Instructions

If Phase 3.5 causes critical issues:

1. **Revert ObjectBrowser.tsx**:

```bash
git checkout HEAD -- frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx
```

2. **Rebuild**:

```bash
npm run --prefix frontend build
```

3. **Test**: Verify application works with Phase 3 code

**Note**: Phase 3.5 changes are straightforward renaming/inlining. Rollback should be clean.

---

## Dependencies for Next Phases

**Phase 4 depends on**:

- ✅ `locationId` used consistently (not `bucketName`)
- ✅ `currentPath` used consistently (not `decodedPrefix`)
- ✅ File operations use storageService methods
- ✅ No compatibility layers or old function imports

**What Phase 4 will do**:

- Migrate remaining file operations to storageService
- Add upload progress support to storageService
- Update download handling
- Complete HuggingFace import integration
- Update breadcrumbs and navigation

---

## Checklist Before Marking Complete

- [ ] Compatibility layer variables removed (lines 418, 420)
- [ ] All `bucketName` replaced with `locationId` (19 occurrences)
- [ ] All `decodedPrefix` replaced with `currentPath` (17 occurrences)
- [ ] Old objectBrowserFunctions import removed
- [ ] File delete inlined with storageService
- [ ] Folder delete inlined with storageService
- [ ] Folder create inlined with storageService
- [ ] All handlers properly async
- [ ] TypeScript compiles with no errors
- [ ] Linting passes
- [ ] Build succeeds
- [ ] Manual testing passes all checkpoints
- [ ] No console errors during normal operation
- [ ] Git changes reviewed and ready for commit

---

## Estimated Time Breakdown

- Task 3.5.1 (Remove compatibility): 10 min
- Task 3.5.2 (Replace bucketName): 40 min
- Task 3.5.3 (Replace decodedPrefix): 30 min
- Task 3.5.4 (Remove imports): 5 min
- Task 3.5.5 (Code quality): 10 min
- Verification (automated): 10 min
- Verification (manual): 20 min
- **Total**: ~2 hours (buffer included)

---

## Git Commit Message

After successful completion and testing:

```
refactor(objectbrowser): remove S3-specific compatibility layers (Phase 3.5)

- Remove bucketName/decodedPrefix compatibility variables
- Replace all bucketName references with locationId
- Replace all decodedPrefix references with currentPath
- Inline file/folder operations using storageService
- Remove deprecated objectBrowserFunctions imports
- Update breadcrumbs to show location names

This cleanup removes all technical debt from Phases 1-3 migration,
resulting in clean storage-agnostic code with no backward compatibility
shims needed for containerized deployment.

Part of objectbrowser unified storage integration.
```

---

## Next Phase

After completing Phase 3.5, proceed to:
**Phase 4: File Operations & Navigation** (`objectbrowser-phase4-operations.md`)
