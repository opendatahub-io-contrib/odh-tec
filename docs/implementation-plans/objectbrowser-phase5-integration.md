# Phase 5: Integration Points & Polish

**Part of**: ObjectBrowser Unified Storage Integration
**Estimated Time**: 1.5 hours
**Difficulty**: Medium
**Dependencies**: Phase 4 (File Operations & Navigation) must be complete

## Objective

Finalize integration with other features and polish UI:

1. Update UI labels and titles to be storage-agnostic
2. Update HuggingFace model import modal to use unified locations
3. Update transfer modal integration
4. Test and polish error handling for unavailable locations
5. Handle symlinks display (if backend supports)
6. Final verification and cleanup

**Success Criteria**: All features work seamlessly with unified storage, UI is polished, error handling is robust

## Prerequisites

- [ ] Phases 1-4 completed
- [ ] All file operations working
- [ ] Location loading and selection working
- [ ] File listing working for both storage types

## Files to Modify

1. `frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx` - UI labels, modals, integration
2. Verify other components that link to ObjectBrowser

## Detailed Tasks

### Task 5.1: Update UI Labels and Titles (15 min)

**File**: `frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx`

**Find and Replace** (use search in file):

1. **Page Title**:

```typescript
// FIND:
<Content component={ContentVariants.h1}>S3 Objects Browser</Content>

// REPLACE WITH:
<Content component={ContentVariants.h1}>
  {selectedLocation ? `${selectedLocation.name} Browser` : 'Storage Browser'}
</Content>
```

2. **Location Selector Label**:

```typescript
// Already done in Phase 2, but verify:
<Content component={ContentVariants.p}>Storage Location:</Content>
```

3. **Upload Button Labels**:

```typescript
// FIND: "Upload to S3"
// REPLACE: "Upload Files"

// FIND: "Upload to bucket"
// REPLACE: "Upload to location"
```

4. **Search Placeholder**:

```typescript
// FIND:
placeholder = 'Search S3 objects...';

// REPLACE:
placeholder = 'Search files...';
```

5. **Toolbar Labels**:

```typescript
// FIND: "S3 Object Actions"
// REPLACE: "File Actions"

// FIND: "Bucket tools"
// REPLACE: "Storage tools"
```

**Verification**:

- [ ] No references to "S3" in user-facing text
- [ ] Labels are storage-agnostic
- [ ] Page title shows location name

---

### Task 5.2: Update HuggingFace Model Import Modal (45 min)

**File**: `frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx`

**Find**: HuggingFace import modal (search for "huggingface" or "hf" or "import model")

**Verify Location Loading**:
The modal should already have access to `locations` state from Phase 2.

**Update Destination Selection UI**:

```typescript
// In the HuggingFace modal destination selector

// Group S3 locations
<FormGroup label="Destination" isRequired>
  <FormSelect
    value={destType === 's3' ? hfBucketName : localLocationId}
    onChange={handleDestinationChange}
    aria-label="Select destination location"
  >
    {/* S3 Buckets Group */}
    <FormSelectOption
      key="s3-header"
      value=""
      label="──── S3 Buckets ────"
      isDisabled
    />
    {locations
      .filter(loc => loc.type === 's3')
      .map(loc => (
        <FormSelectOption
          key={loc.id}
          value={loc.id}
          label={loc.name}
        />
      ))}

    {/* Local Storage Group */}
    {locations.filter(loc => loc.type === 'local' && loc.available).length > 0 && (
      <>
        <FormSelectOption
          key="local-header"
          value=""
          label="──── Local Storage ────"
          isDisabled
        />
        {locations
          .filter(loc => loc.type === 'local')
          .map(loc => (
            <FormSelectOption
              key={loc.id}
              value={loc.id}
              label={loc.name}
              isDisabled={!loc.available}
            />
          ))}
      </>
    )}
  </FormSelect>
</FormGroup>
```

**Update Destination Change Handler**:

```typescript
const handleDestinationChange = (_event: React.FormEvent<HTMLSelectElement>, value: string) => {
  const selectedLoc = locations.find((loc) => loc.id === value);

  if (!selectedLoc) return;

  if (selectedLoc.type === 's3') {
    setDestType('s3');
    setHfBucketName(value);
    setLocalLocationId('');
  } else {
    setDestType('local');
    setLocalLocationId(value);
    setHfBucketName('');
  }
};
```

**Verify Import Handler**:
The import should already work with both `destType` values ('s3' or 'local'). The backend handles the distinction based on the API endpoint called.

**Verification**:

- [ ] Modal shows both S3 and local storage options
- [ ] S3 and local sections are visually separated
- [ ] Unavailable locations are disabled
- [ ] Selecting location updates `destType` correctly
- [ ] Import works for both destination types

---

### Task 5.3: Update Transfer Modal Integration (15 min)

**File**: `frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx`

**Find**: TransferAction component usage (search for "TransferAction")

**Update Component Props**:

```typescript
// BEFORE
<TransferAction
  sourceLocationId={bucketName!}
  sourceType="s3"
  sourcePath={decodedPrefix}
  selectedFiles={Array.from(selectedItems)}
/>

// AFTER
<TransferAction
  sourceLocationId={locationId!}
  sourceType={selectedLocation?.type || 's3'}
  sourcePath={currentPath}
  selectedFiles={Array.from(selectedItems)}
/>
```

**Ensure Transfer Button Disabled When No Location**:

```typescript
<Button
  variant="primary"
  onClick={() => setIsTransferModalOpen(true)}
  isDisabled={!selectedLocation || !selectedLocation.available || selectedItems.size === 0}
>
  Transfer Selected
</Button>
```

**Verification**:

- [ ] Transfer button disabled when no location or location unavailable
- [ ] Transfer modal receives correct source type (s3 or local)
- [ ] Transfer can be initiated from both S3 and local storage
- [ ] Source path is correct

---

### Task 5.4: Polish Unavailable Location Handling (20 min)

**File**: `frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx`

**Add Visual Indicator for Unavailable Location**:

```typescript
// Add near top of component render, after location check
{selectedLocation && !selectedLocation.available && (
  <Alert
    variant="warning"
    title="Location Unavailable"
    isInline
    style={{ marginBottom: 'var(--pf-t--global--spacer--md)' }}
  >
    <p>
      The storage location "{selectedLocation.name}" is currently unavailable.
      {selectedLocation.type === 'local' && (
        <span> The directory may be inaccessible or the path may be incorrect.</span>
      )}
    </p>
    <p>File operations are disabled until the location becomes available.</p>
  </Alert>
)}
```

**Disable Actions When Location Unavailable**:

```typescript
// Upload button
<Button
  onClick={handleUploadModalToggle}
  isDisabled={!selectedLocation?.available}
>
  Upload Files
</Button>

// Create Directory button
<Button
  onClick={handleCreateFolderModalToggle}
  isDisabled={!selectedLocation?.available}
>
  Create Directory
</Button>

// Delete button
<Button
  onClick={handleDeleteSelected}
  isDisabled={!selectedLocation?.available || selectedItems.size === 0}
>
  Delete Selected
</Button>
```

**Add Tooltip Explanations**:

```typescript
import { Tooltip } from '@patternfly/react-core';

<Tooltip content="Location is unavailable">
  <Button
    onClick={handleUploadModalToggle}
    isDisabled={!selectedLocation?.available}
  >
    Upload Files
  </Button>
</Tooltip>
```

**Verification**:

- [ ] Alert shows when location is unavailable
- [ ] All action buttons are disabled
- [ ] Tooltips explain why actions are disabled
- [ ] File list shows empty (from Phase 2)
- [ ] Can still switch to different location

---

### Task 5.5: Handle Symlinks Display (15 min - Optional)

**File**: `frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx`

**Check if Backend Returns Symlinks**:

```typescript
// In refreshFiles success callback, add logging:
console.log('[refreshFiles] Sample file entry:', response.files[0]);
// Check if any file has type: 'symlink' and target field
```

**If Symlinks Are Supported**, add rendering:

```typescript
import { LinkIcon } from '@patternfly/react-icons';
import { Label, Tooltip } from '@patternfly/react-core';

// In file table rendering:
{files.map((file) => (
  <Tr key={file.path}>
    <Td dataLabel="Name">
      <Button variant="link" onClick={() => handleFileClick(file)}>
        {file.type === 'symlink' && (
          <LinkIcon style={{ marginRight: '0.5rem' }} />
        )}
        {file.name}
      </Button>
      {file.type === 'symlink' && file.target && (
        <Tooltip content={`Links to: ${file.target}`}>
          <Label color="blue" icon={<LinkIcon />} style={{ marginLeft: '0.5rem' }}>
            Symlink
          </Label>
        </Tooltip>
      )}
    </Td>
    {/* ... other columns ... */}
  </Tr>
))}
```

**Security Note**: Symlinks that point outside the storage location should be handled carefully. This is typically a backend concern, but the UI should not allow operations that could expose unauthorized files.

**Verification** (if applicable):

- [ ] Symlinks show link icon
- [ ] Symlink target shown in tooltip or label
- [ ] Clicking symlink navigates to target (if directory) or downloads (if file)

---

### Task 5.6: Final Verification and Cleanup (20 min)

**Code Cleanup**:

1. **Remove Unused Imports**:

```bash
# Check for unused imports
grep -n "import.*from.*objectBrowserFunctions" src/app/components/ObjectBrowser/ObjectBrowser.tsx
```

Remove any imports that are no longer used (like `loadBuckets`, `refreshObjects`)

2. **Remove Old State Variables**:
   Ensure completely removed:

- `bucketsList`, `setBucketsList`
- `formSelectBucket`, `setFormSelectBucket`
- Any other S3-specific state not yet removed

3. **Remove Console Logs** (optional):
   For production, remove excessive console.log statements or wrap in `if (process.env.NODE_ENV === 'development')`

**Final Testing Checklist**:

**S3 Storage**:

- [ ] Select S3 location from dropdown
- [ ] Browse directories
- [ ] Upload file (check progress)
- [ ] Download file
- [ ] Delete file
- [ ] Create directory
- [ ] Navigate with breadcrumbs
- [ ] Search/filter files
- [ ] Pagination "Load More"
- [ ] HuggingFace import to S3
- [ ] Transfer from S3 to local

**Local Storage**:

- [ ] Select local location from dropdown
- [ ] Browse directories
- [ ] Upload file (check progress)
- [ ] Download file
- [ ] Delete file
- [ ] Create directory
- [ ] Navigate with breadcrumbs
- [ ] Search/filter files
- [ ] Pagination "Load More"
- [ ] HuggingFace import to local
- [ ] Transfer from local to S3

**Error Handling**:

- [ ] Unavailable location shows warning
- [ ] Actions disabled for unavailable location
- [ ] Invalid location ID shows error and redirects
- [ ] Missing location in URL redirects to first available
- [ ] Network errors show appropriate notifications

**UI/UX**:

- [ ] Page title shows location name
- [ ] Location selector shows type indicator (S3/Local)
- [ ] Unavailable locations are greyed out
- [ ] Labels are storage-agnostic (no "S3" in text)
- [ ] Upload progress displays correctly
- [ ] Breadcrumbs show full path
- [ ] Loading states are clear

**TypeScript and Build**:

```bash
cd frontend
npm run type-check
npm run lint
npm run build
npm test
```

- [ ] No TypeScript errors
- [ ] No ESLint errors
- [ ] Build succeeds
- [ ] Tests pass (if any exist for ObjectBrowser)

---

## Final Code Search Verification

Run these searches to ensure complete migration:

```bash
cd frontend/src/app/components/ObjectBrowser

# Should find ZERO matches:
grep -r "s3Objects" .
grep -r "s3Prefixes" .
grep -r "bucketsList" .
grep -r "nextContinuationToken" .
grep -r "decodedPrefix" .
grep -r "refreshObjects" .
grep -r "loadBuckets" .
grep -r "/objects/\${" .

# Should find matches (new code):
grep -r "files" .
grep -r "directories" .
grep -r "locations" .
grep -r "paginationToken" .
grep -r "currentPath" .
grep -r "refreshFiles" .
grep -r "/browse/\${" .
```

---

## Rollback Instructions

If Phase 5 causes critical issues:

1. **UI Labels**: Easy to revert, low impact
2. **HF Modal**: Can temporarily disable feature
3. **Transfer Modal**: Can temporarily disable feature
4. **Unavailable Location Handling**: Can remove alert, keep functionality

Full rollback:

```bash
git checkout HEAD~1 -- frontend/src/app/components/ObjectBrowser/
```

---

## Success Criteria Checklist

### Functional Requirements

- [ ] User can select both S3 buckets and local PVC locations
- [ ] File listing works for both storage types
- [ ] All file operations work (upload, download, delete, create directory)
- [ ] Pagination works correctly for both types
- [ ] Navigation and breadcrumbs work correctly
- [ ] Search/filter works for both types
- [ ] HuggingFace import works to both destination types
- [ ] Transfer modal works from both source types

### Technical Requirements

- [ ] Uses `storageService` for all storage operations
- [ ] State uses storage-agnostic names
- [ ] Data uses FileEntry interface directly
- [ ] Proper pagination handling (S3: token, Local: offset)
- [ ] No hardcoded storage type assumptions
- [ ] Upload progress tracking works
- [ ] Download doesn't cause page navigation
- [ ] Error handling for unavailable/missing locations

### UI/UX Requirements

- [ ] Labels are storage-agnostic
- [ ] Page title shows location name
- [ ] Location selector indicates storage type
- [ ] Unavailable locations are disabled with feedback
- [ ] Breadcrumbs show location name and path
- [ ] Error messages are appropriate
- [ ] Loading states are clear
- [ ] All success criteria from v2 plan met

---

## Checklist Before Marking Complete

- [ ] All UI labels updated to storage-agnostic
- [ ] HuggingFace import modal works with unified locations
- [ ] Transfer modal integration works
- [ ] Unavailable location handling polished
- [ ] Symlinks handled (if applicable)
- [ ] All manual tests pass
- [ ] All code searches show migration complete
- [ ] TypeScript compiles with no errors
- [ ] Build succeeds
- [ ] No console errors during normal operation
- [ ] All phases (1-5) complete and verified
- [ ] Ready for code review and PR

---

## Estimated Time Breakdown

- Task 5.1 (UI labels): 15 min
- Task 5.2 (HF modal): 45 min
- Task 5.3 (Transfer modal): 15 min
- Task 5.4 (Unavailable location polish): 20 min
- Task 5.5 (Symlinks): 15 min
- Task 5.6 (Final verification): 20 min
- **Total**: ~1.5 hours

---

## Post-Completion Steps

After Phase 5 is complete:

1. **Create Git Commit**:

```bash
git add .
git commit -m "feat: Implement unified storage browsing for S3 and local PVC

- Refactor ObjectBrowser to support both S3 and local storage
- Use StorageLocation interface and storageService abstraction
- Update URL pattern to /browse/:locationId/:path
- Rename state variables to storage-agnostic names
- Implement FileEntry interface for file data
- Add proper pagination handling for both storage types
- Update all file operations (upload, download, delete, create directory)
- Polish UI with storage-agnostic labels
- Add error handling for unavailable locations

Closes #[issue-number]"
```

2. **Run Final Tests**:

```bash
npm run ci-checks
```

3. **Create Pull Request**:

- Reference implementation plan v2
- Include screenshots of both S3 and local storage browsing
- List all success criteria met
- Mention any known limitations or future work

4. **Update Documentation** (if needed):

- Update user guide with unified storage browsing
- Update screenshots showing both storage types
- Document any new configuration options

---

## Congratulations!

You've successfully completed the ObjectBrowser Unified Storage Integration!

The ObjectBrowser now provides a seamless experience for browsing both S3 buckets and local PVC storage through a unified interface, with proper abstraction, error handling, and storage-agnostic UI.
