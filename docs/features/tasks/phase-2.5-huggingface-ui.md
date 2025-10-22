# Phase 2.5: HuggingFace UI Updates

> **Task ID**: phase-2.5
> **Estimated Effort**: 0.5-1 day
> **Dependencies**: Phase 1.6 (HuggingFace Backend), Phase 2.1 (Storage Service)

## Objective

Update HuggingFace import modal to support both S3 and local storage destinations with conditional form fields.

## Files to Modify

- `frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx` - HuggingFace modal section

## Implementation

```tsx
const [showHFModal, setShowHFModal] = useState(false);
const [modelId, setModelId] = useState('');
const [hfToken, setHfToken] = useState('');
const [destType, setDestType] = useState<'s3' | 'local'>('s3');

// S3 destination fields
const [bucketName, setBucketName] = useState('');
const [prefix, setPrefix] = useState('');

// Local destination fields
const [localLocationId, setLocalLocationId] = useState('');
const [localPath, setLocalPath] = useState('');

// Load locations for local destination
const [locations, setLocations] = useState<StorageLocation[]>([]);

useEffect(() => {
  if (showHFModal) {
    storageService.getLocations().then(setLocations);
  }
}, [showHFModal]);

const localLocations = locations.filter((loc) => loc.type === 'local' && loc.available);

const isFormValid = () => {
  if (!modelId) return false;
  if (destType === 's3') {
    return !!bucketName;
  } else {
    return !!localLocationId && !!localPath;
  }
};

const handleImport = async () => {
  try {
    const params: any = {
      modelId,
      hfToken: hfToken || undefined,
      destinationType: destType,
    };

    if (destType === 's3') {
      params.bucketName = bucketName;
      params.prefix = prefix;
    } else {
      params.localLocationId = localLocationId;
      params.localPath = localPath;
    }

    const response = await axios.post('/api/objects/huggingface-import', params);

    // Open TransferProgress drawer with SSE URL
    openTransferProgress(response.data.jobId, response.data.sseUrl);

    setShowHFModal(false);
  } catch (error) {
    console.error('HuggingFace import failed:', error);
    // Show error notification
  }
};

// Modal JSX
<Modal
  title="Import from HuggingFace"
  isOpen={showHFModal}
  onClose={() => setShowHFModal(false)}
  variant="medium"
>
  <Form>
    <FormGroup label="Model ID" isRequired>
      <TextInput
        value={modelId}
        onChange={(_e, val) => setModelId(val)}
        placeholder="e.g., meta-llama/Llama-2-7b-hf"
      />
      <FormHelperText>
        <HelperText>
          <HelperTextItem>Enter the HuggingFace model repository ID</HelperTextItem>
        </HelperText>
      </FormHelperText>
    </FormGroup>

    <FormGroup label="HuggingFace Token (optional)">
      <TextInput type="password" value={hfToken} onChange={(_e, val) => setHfToken(val)} />
      <FormHelperText>
        <HelperText>
          <HelperTextItem>Required for private or gated models</HelperTextItem>
        </HelperText>
      </FormHelperText>
    </FormGroup>

    <FormGroup label="Destination Type" isRequired>
      <Radio
        id="dest-s3"
        name="destType"
        label="S3 Bucket"
        isChecked={destType === 's3'}
        onChange={() => setDestType('s3')}
      />
      <Radio
        id="dest-local"
        name="destType"
        label="Local Storage (PVC)"
        isChecked={destType === 'local'}
        onChange={() => setDestType('local')}
      />
    </FormGroup>

    {destType === 's3' ? (
      <>
        <FormGroup label="Bucket" isRequired>
          <FormSelect value={bucketName} onChange={(_e, val) => setBucketName(val)}>
            <FormSelectOption value="" label="Select bucket..." isDisabled />
            {locations
              .filter((loc) => loc.type === 's3')
              .map((bucket) => (
                <FormSelectOption key={bucket.id} value={bucket.id} label={bucket.name} />
              ))}
          </FormSelect>
        </FormGroup>
        <FormGroup label="Prefix (optional)">
          <TextInput
            value={prefix}
            onChange={(_e, val) => setPrefix(val)}
            placeholder="e.g., models/"
          />
        </FormGroup>
      </>
    ) : (
      <>
        <FormGroup label="Storage Location" isRequired>
          <FormSelect value={localLocationId} onChange={(_e, val) => setLocalLocationId(val)}>
            <FormSelectOption value="" label="Select location..." isDisabled />
            {localLocations.map((loc) => (
              <FormSelectOption key={loc.id} value={loc.id} label={loc.name} />
            ))}
          </FormSelect>
        </FormGroup>
        <FormGroup label="Destination Path" isRequired>
          <TextInput
            value={localPath}
            onChange={(_e, val) => setLocalPath(val)}
            placeholder="e.g., models/llama-2-7b"
          />
          <FormHelperText>
            <HelperText>
              <HelperTextItem>
                Path within the storage location where model files will be saved
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>
      </>
    )}
  </Form>

  <ActionGroup>
    <Button variant="primary" onClick={handleImport} isDisabled={!isFormValid()}>
      Import Model
    </Button>
    <Button variant="link" onClick={() => setShowHFModal(false)}>
      Cancel
    </Button>
  </ActionGroup>
</Modal>;
```

## Acceptance Criteria

- [ ] Modal shows destination type selector (S3 / Local)
- [ ] S3 destination shows bucket and prefix fields
- [ ] Local destination shows location and path fields
- [ ] Form validation requires appropriate fields
- [ ] Import button disabled when form invalid
- [ ] API call includes correct parameters for destination type
- [ ] Progress drawer opens after initiating import
- [ ] SSE connection established for progress updates
- [ ] Error handling shows clear messages
- [ ] Helper text provides guidance

## References

- Feature spec: `docs/features/pvc-storage-support.md` (lines 893-1010)
