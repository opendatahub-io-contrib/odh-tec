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
} from '@patternfly/react-core';
import { FolderIcon, PlusIcon } from '@patternfly/react-icons';
import * as React from 'react';
import { storageService, StorageLocation, FileEntry } from '@app/services/storageService';
import Emitter from '@app/utils/emitter';

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
  const [locations, setLocations] = React.useState<StorageLocation[]>([]);
  const [selectedLocation, setSelectedLocation] = React.useState<string>('');
  const [currentPath, setCurrentPath] = React.useState<string>('');
  const [directories, setDirectories] = React.useState<FileEntry[]>([]);

  // Load locations on mount
  React.useEffect(() => {
    if (isOpen) {
      storageService
        .getLocations()
        .then((locations) => {
          setLocations(locations);

          // Check if we got any available locations
          const availableLocations = locations.filter((loc) => loc.available);
          if (locations.length === 0) {
            Emitter.emit('notification', {
              variant: 'warning',
              title: 'No storage locations available',
              description:
                'All storage sources failed to load. Check S3 and local storage configuration. See browser console for details.',
            });
          } else if (availableLocations.length === 0) {
            Emitter.emit('notification', {
              variant: 'warning',
              title: 'All storage locations unavailable',
              description: 'Storage locations exist but are not accessible. Check configuration.',
            });
          }
        })
        .catch((error: any) => {
          // This should not happen with allSettled, but keep as safety net
          console.error('Failed to fetch locations:', error);
          Emitter.emit('notification', {
            variant: 'danger',
            title: 'Failed to load storage locations',
            description: error.message || 'Unknown error',
          });
        });
    }
  }, [isOpen]);

  // Load directories when location or path changes
  React.useEffect(() => {
    if (selectedLocation) {
      storageService
        .listFiles(selectedLocation, currentPath)
        .then(({ files }) => {
          setDirectories(files.filter((f) => f.type === 'directory'));
        })
        .catch((error: any) => {
          console.error('Failed to list directories:', error);
          Emitter.emit('notification', {
            variant: 'danger',
            title: 'Failed to load directories',
            description: error.message || 'Unknown error',
          });
        });
    }
  }, [selectedLocation, currentPath]);

  const handleNavigateInto = (dir: FileEntry) => {
    setCurrentPath(dir.path);
  };

  const handleBreadcrumbClick = (index: number) => {
    if (index === -1) {
      // Root clicked
      setCurrentPath('');
    } else {
      const segments = currentPath.split('/').filter(Boolean);
      setCurrentPath(segments.slice(0, index + 1).join('/'));
    }
  };

  const handleCreateFolder = async () => {
    const name = prompt('Folder name:');
    if (!name) return;

    const newPath = currentPath ? `${currentPath}/${name}` : name;

    try {
      await storageService.createDirectory(selectedLocation, newPath);

      // Refresh directory list
      const { files } = await storageService.listFiles(selectedLocation, currentPath);
      setDirectories(files.filter((f) => f.type === 'directory'));

      Emitter.emit('notification', {
        variant: 'success',
        title: 'Folder created',
        description: `Folder "${name}" created successfully`,
      });
    } catch (error: any) {
      console.error('Failed to create folder:', error);
      Emitter.emit('notification', {
        variant: 'danger',
        title: 'Failed to create folder',
        description: error.message || 'Unknown error',
      });
    }
  };

  return (
    <Modal
      title="Select Destination"
      isOpen={isOpen}
      onClose={onCancel}
      variant="large"
      actions={[
        <Button
          key="select"
          variant="primary"
          onClick={() => onSelect(selectedLocation, currentPath)}
          isDisabled={!selectedLocation}
        >
          Select Destination
        </Button>,
        <Button key="cancel" variant="link" onClick={onCancel}>
          Cancel
        </Button>,
      ]}
    >
      <Form>
        <FormGroup label="Storage Location" isRequired>
          <FormSelect
            id="destination-location-select"
            aria-label="Select storage location"
            value={selectedLocation}
            onChange={(_event, value) => {
              setSelectedLocation(value as string);
              setCurrentPath('');
            }}
          >
            <FormSelectOption value="" label="Select location..." isDisabled />
            {locations.map((loc) => (
              <FormSelectOption
                key={loc.id}
                value={loc.id}
                label={`${loc.name} (${loc.type.toUpperCase()})${!loc.available ? ' (unavailable)' : ''}`}
                isDisabled={!loc.available}
              />
            ))}
          </FormSelect>
        </FormGroup>

        {selectedLocation && (
          <>
            <Breadcrumb>
              <BreadcrumbItem onClick={() => handleBreadcrumbClick(-1)}>Root</BreadcrumbItem>
              {currentPath
                .split('/')
                .filter(Boolean)
                .map((segment, i) => (
                  <BreadcrumbItem key={i} onClick={() => handleBreadcrumbClick(i)}>
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
    </Modal>
  );
};
