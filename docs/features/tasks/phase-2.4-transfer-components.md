# Phase 2.4: Transfer UI Components

> **Task ID**: phase-2.4
> **Estimated Effort**: 2-2.5 days
> **Dependencies**: Phase 2.1 (Storage Service), Phase 2.3 (ObjectBrowser)

## Objective

Create transfer UI components: DestinationPicker modal, ConflictResolutionModal, TransferProgress drawer with SSE updates, and integrate into ObjectBrowser.

## Files to Create

- `frontend/src/app/components/Transfer/DestinationPicker.tsx`
- `frontend/src/app/components/Transfer/ConflictResolutionModal.tsx`
- `frontend/src/app/components/Transfer/TransferProgress.tsx`
- `frontend/src/app/components/Transfer/TransferAction.tsx` - Integration helper

## Component 1: DestinationPicker

```tsx
import {
  Modal,
  Form,
  FormGroup,
  FormSelect,
  FormSelectOption,
  Breadcrumb,
  BreadcrumbItem,
  DataList,
  DataListItem,
  DataListItemRow,
  DataListItemCells,
  DataListCell,
  Button,
  ActionGroup,
} from '@patternfly/react-core';
import { FolderIcon, PlusIcon } from '@patternfly/react-icons';

interface DestinationPickerProps {
  isOpen: boolean;
  onSelect: (locationId: string, path: string) => void;
  onCancel: () => void;
}

export const DestinationPicker: React.FC<DestinationPickerProps> = ({
  isOpen,
  onSelect,
  onCancel,
}) => {
  const [locations, setLocations] = useState<StorageLocation[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<string>('');
  const [currentPath, setCurrentPath] = useState<string>('');
  const [directories, setDirectories] = useState<FileEntry[]>([]);

  // Load locations on mount
  useEffect(() => {
    if (isOpen) {
      storageService.getLocations().then(setLocations);
    }
  }, [isOpen]);

  // Load directories when location or path changes
  useEffect(() => {
    if (selectedLocation) {
      storageService.listFiles(selectedLocation, currentPath).then(({ files }) => {
        setDirectories(files.filter((f) => f.type === 'directory'));
      });
    }
  }, [selectedLocation, currentPath]);

  const handleNavigateInto = (dir: FileEntry) => {
    setCurrentPath(dir.path);
  };

  const handleNavigateUp = () => {
    const parent = currentPath.split('/').slice(0, -1).join('/');
    setCurrentPath(parent);
  };

  const handleCreateFolder = async () => {
    const name = prompt('Folder name:');
    if (!name) return;

    const newPath = currentPath ? `${currentPath}/${name}` : name;
    await storageService.createDirectory(selectedLocation, newPath);

    // Refresh
    const { files } = await storageService.listFiles(selectedLocation, currentPath);
    setDirectories(files.filter((f) => f.type === 'directory'));
  };

  return (
    <Modal title="Select Destination" isOpen={isOpen} onClose={onCancel} variant="large">
      <Form>
        <FormGroup label="Storage Location" isRequired>
          <FormSelect
            value={selectedLocation}
            onChange={(_event, value) => {
              setSelectedLocation(value);
              setCurrentPath('');
            }}
          >
            <FormSelectOption value="" label="Select location..." isDisabled />
            {locations.map((loc) => (
              <FormSelectOption
                key={loc.id}
                value={loc.id}
                label={`${loc.name} (${loc.type.toUpperCase()}) ${!loc.available ? '(unavailable)' : ''}`}
                isDisabled={!loc.available}
              />
            ))}
          </FormSelect>
        </FormGroup>

        {selectedLocation && (
          <>
            <Breadcrumb>
              <BreadcrumbItem onClick={() => setCurrentPath('')}>Root</BreadcrumbItem>
              {currentPath
                .split('/')
                .filter(Boolean)
                .map((segment, i, arr) => (
                  <BreadcrumbItem
                    key={i}
                    onClick={() => setCurrentPath(arr.slice(0, i + 1).join('/'))}
                  >
                    {segment}
                  </BreadcrumbItem>
                ))}
            </Breadcrumb>

            <DataList aria-label="Directory list">
              {directories.map((dir) => (
                <DataListItem key={dir.path}>
                  <DataListItemRow onClick={() => handleNavigateInto(dir)}>
                    <DataListItemCells
                      dataListCells={[
                        <DataListCell key="name">
                          <FolderIcon /> {dir.name}
                        </DataListCell>,
                      ]}
                    />
                  </DataListItemRow>
                </DataListItem>
              ))}
            </DataList>

            <Button variant="secondary" onClick={handleCreateFolder} icon={<PlusIcon />}>
              Create Folder
            </Button>
          </>
        )}
      </Form>

      <ActionGroup>
        <Button
          variant="primary"
          onClick={() => onSelect(selectedLocation, currentPath)}
          isDisabled={!selectedLocation}
        >
          Select Destination
        </Button>
        <Button variant="link" onClick={onCancel}>
          Cancel
        </Button>
      </ActionGroup>
    </Modal>
  );
};
```

## Component 2: ConflictResolutionModal

```tsx
interface ConflictResolutionModalProps {
  isOpen: boolean;
  conflicts: TransferConflict[];
  onResolve: (resolutions: Record<string, 'overwrite' | 'skip' | 'rename'>) => void;
  onCancel: () => void;
}

export const ConflictResolutionModal: React.FC<ConflictResolutionModalProps> = ({
  isOpen,
  conflicts,
  onResolve,
  onCancel,
}) => {
  const [resolutions, setResolutions] = useState<Record<string, string>>({});
  const [applyToAll, setApplyToAll] = useState<string>('');

  const handleResolve = () => {
    const finalResolutions: Record<string, 'overwrite' | 'skip' | 'rename'> = {};

    conflicts.forEach((conflict) => {
      finalResolutions[conflict.path] = (resolutions[conflict.path] ||
        applyToAll ||
        'rename') as any;
    });

    onResolve(finalResolutions);
  };

  return (
    <Modal title="File Conflicts Detected" isOpen={isOpen} onClose={onCancel} variant="medium">
      <Alert variant="warning" title={`${conflicts.length} file(s) already exist`} />

      <DataList aria-label="Conflict list">
        {conflicts.map((conflict) => (
          <DataListItem key={conflict.path}>
            <DataListItemRow>
              <DataListItemCells
                dataListCells={[
                  <DataListCell key="info">
                    <strong>{conflict.path}</strong>
                    {conflict.existingSize && (
                      <Text component="small">
                        Existing: {formatSize(conflict.existingSize)}, modified{' '}
                        {formatDate(conflict.existingModified)}
                      </Text>
                    )}
                  </DataListCell>,
                  <DataListCell key="resolution">
                    <Radio
                      name={conflict.path}
                      value="overwrite"
                      label="Overwrite"
                      isChecked={resolutions[conflict.path] === 'overwrite'}
                      onChange={() =>
                        setResolutions({ ...resolutions, [conflict.path]: 'overwrite' })
                      }
                    />
                    <Radio
                      name={conflict.path}
                      value="skip"
                      label="Skip"
                      isChecked={resolutions[conflict.path] === 'skip'}
                      onChange={() => setResolutions({ ...resolutions, [conflict.path]: 'skip' })}
                    />
                    <Radio
                      name={conflict.path}
                      value="rename"
                      label="Keep both (rename)"
                      isChecked={resolutions[conflict.path] === 'rename'}
                      onChange={() => setResolutions({ ...resolutions, [conflict.path]: 'rename' })}
                    />
                  </DataListCell>,
                ]}
              />
            </DataListItemRow>
          </DataListItem>
        ))}
      </DataList>

      <FormGroup label="Apply to all">
        <FormSelect value={applyToAll} onChange={(_e, val) => setApplyToAll(val)}>
          <FormSelectOption value="" label="Choose individually" />
          <FormSelectOption value="overwrite" label="Overwrite all" />
          <FormSelectOption value="skip" label="Skip all" />
          <FormSelectOption value="rename" label="Rename all" />
        </FormSelect>
      </FormGroup>

      <ActionGroup>
        <Button variant="primary" onClick={handleResolve}>
          Proceed with Transfer
        </Button>
        <Button variant="link" onClick={onCancel}>
          Cancel
        </Button>
      </ActionGroup>
    </Modal>
  );
};
```

## Component 3: TransferProgress (SSE)

```tsx
interface TransferProgressProps {
  isOpen: boolean;
  jobId: string | null;
  sseUrl: string | null;
  onClose: () => void;
}

export const TransferProgress: React.FC<TransferProgressProps> = ({
  isOpen,
  jobId,
  sseUrl,
  onClose,
}) => {
  const [transfers, setTransfers] = useState<Map<string, any>>(new Map());

  useEffect(() => {
    if (!sseUrl || !jobId) return;

    const eventSource = new EventSource(sseUrl);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setTransfers((prev) => new Map(prev).set(data.file, data));
    };

    eventSource.onerror = () => {
      console.error('SSE connection error');
      eventSource.close();
    };

    return () => eventSource.close();
  }, [sseUrl, jobId]);

  const handleCancel = async () => {
    if (jobId) {
      await storageService.cancelTransfer(jobId);
    }
    onClose();
  };

  return (
    <Drawer isExpanded={isOpen}>
      <DrawerContent>
        <DrawerHead>
          <Title headingLevel="h2">File Transfers</Title>
          <DrawerCloseButton onClick={onClose} />
        </DrawerHead>
        <DrawerContentBody>
          {Array.from(transfers.values()).map((transfer) => (
            <Card key={transfer.file} isCompact>
              <CardTitle>
                <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }}>
                  <FlexItem>{transfer.file}</FlexItem>
                  <FlexItem>
                    {transfer.status === 'error' ? (
                      <Label color="red">Error</Label>
                    ) : transfer.status === 'completed' ? (
                      <Label color="green">Complete</Label>
                    ) : (
                      <Label color="blue">Transferring</Label>
                    )}
                  </FlexItem>
                </Flex>
              </CardTitle>
              <CardBody>
                {transfer.status === 'transferring' && (
                  <Progress
                    value={(transfer.loaded / transfer.total) * 100}
                    label={`${formatSize(transfer.loaded)} / ${formatSize(transfer.total)}`}
                  />
                )}
                {transfer.error && <Alert variant="danger">{transfer.error}</Alert>}
              </CardBody>
            </Card>
          ))}

          <Button variant="danger" onClick={handleCancel}>
            Cancel Transfer
          </Button>
        </DrawerContentBody>
      </DrawerContent>
    </Drawer>
  );
};
```

## Integration into ObjectBrowser

See feature spec lines 833-891 for complete transfer action integration.

## Acceptance Criteria

- [ ] DestinationPicker shows all available locations
- [ ] DestinationPicker supports folder navigation
- [ ] DestinationPicker allows folder creation
- [ ] ConflictResolutionModal shows all conflicts
- [ ] ConflictResolutionModal supports per-file resolution
- [ ] ConflictResolutionModal supports "apply to all"
- [ ] TransferProgress connects to SSE endpoint
- [ ] TransferProgress shows real-time updates
- [ ] TransferProgress shows completion status
- [ ] Transfer cancellation works
- [ ] Complete flow: select → check conflicts → resolve → transfer → progress

## References

- Feature spec: `docs/features/pvc-storage-support.md` (lines 572-891)
