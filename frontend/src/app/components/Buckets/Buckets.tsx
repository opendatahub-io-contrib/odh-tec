import config from '@app/config';
import * as React from 'react';
import axios from 'axios';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBucket, faTrash, faFolder } from '@fortawesome/free-solid-svg-icons';
import {
  Button,
  Card,
  Flex,
  FlexItem,
  Form,
  FormGroup,
  Page,
  PageSection,
  Content,
  TextInput,
  ContentVariants,
  Label,
  Tooltip,
} from '@patternfly/react-core';
import { Modal } from '@patternfly/react-core/deprecated';
import { Table, Thead, Tr, Th, Tbody, Td, ThProps } from '@patternfly/react-table';
import { SearchIcon, CloudIcon, FolderIcon, SyncIcon } from '@patternfly/react-icons';
import Emitter from '../../utils/emitter';
import { useNavigate } from 'react-router-dom';
import { storageService, StorageLocation } from '../../services/storageService';

class Bucket {
  Name: string;
  CreationDate: string;

  constructor(name: string, creationDate: string) {
    this.Name = name;
    this.CreationDate = creationDate;
  }
}

class Owner {
  DisplayName: string;
  ID: string;

  constructor(displayName: string, id: string) {
    this.DisplayName = displayName;
    this.ID = id;
  }
}

class BucketsList {
  buckets: Bucket[];
  owner: Owner;

  constructor(buckets: Bucket[], owner: Owner) {
    this.buckets = buckets;
    this.owner = owner;
  }
}

interface BucketRow {
  name: string;
  creation_date: string;
  owner: string;
}

const Buckets: React.FunctionComponent = () => {
  const navigate = useNavigate();

  // New bucket handling
  const [newBucketName, setNewBucketName] = React.useState('');
  const [newBucketNameRulesVisibility, setNewBucketNameRulesVisibility] = React.useState(false);

  // Validate bucket name
  function validateBucketName(name: string): boolean {
    // Check length
    if (name.length > 63) {
      return false;
    }

    // Check if name starts with a lowercase letter or number
    if (!/^[a-z0-9]/.test(name)) {
      return false;
    }

    // Check if name contains only allowed characters
    if (!/^[a-z0-9.-]+$/.test(name)) {
      return false;
    }

    // Check if name ends with a hyphen
    if (/-$/.test(name)) {
      return false;
    }

    // Check if name has consecutive periods or dashes adjacent to periods
    if (/\.\.|-\.|\.-/.test(name)) {
      return false;
    }

    // Check if name is formatted as an IP address
    if (/^(\d+\.){3}\d+$/.test(name)) {
      return false;
    }

    // Check if name is unique
    if (bucketsList) {
      return !bucketsList.buckets.some((bucket) => bucket.Name === name);
    }

    return true;
  }

  React.useEffect(() => {
    if (newBucketName.length > 2) {
      setNewBucketNameRulesVisibility(!validateBucketName(newBucketName));
    } else {
      setNewBucketNameRulesVisibility(false);
    }
  }, [newBucketName]);

  // Create bucket modal handling
  const [isCreateBucketModalOpen, setIsCreateBucketModalOpen] = React.useState(false);
  const handleCreateBucketModalToggle = (_event: KeyboardEvent | React.MouseEvent) => {
    setIsCreateBucketModalOpen(!isCreateBucketModalOpen);
  };

  const handleNewBucketCreate = () => {
    if (!validateBucketName(newBucketName)) {
      Emitter.emit('notification', {
        variant: 'warning',
        title: 'Invalid bucket name',
        description: 'Bucket name ' + newBucketName + ' is invalid. Please check the rules and try again.',
      });
      return;
    } else {
      axios
        .post(`${config.backend_api_url}/buckets`, {
          bucketName: newBucketName,
        })
        .then((response) => {
          Emitter.emit('notification', {
            variant: 'success',
            title: 'Bucket created',
            description: 'Bucket ' + newBucketName + ' has been created successfully',
          });
          // Refresh both locations and bucket details (force refresh to update cache)
          Promise.all([storageService.refreshLocations(), axios.get(`${config.backend_api_url}/buckets`)])
            .then(([newLocations, bucketsResponse]) => {
              setLocations(newLocations);
              const { owner, buckets } = bucketsResponse.data;
              const newBucketsState = new BucketsList(
                buckets.map((bucket: any) => new Bucket(bucket.Name, bucket.CreationDate)),
                new Owner(owner.DisplayName, owner.ID),
              );
              setBucketsList(newBucketsState);
              setNewBucketName('');
              setIsCreateBucketModalOpen(false);
            })
            .catch((error) => {
              console.error(error);
              Emitter.emit('notification', {
                variant: 'warning',
                title: error.response?.data?.error || 'Error Fetching Storage',
                description: error.response?.data?.message || 'Failed to refresh storage locations.',
              });
            });
        })
        .catch((error) => {
          Emitter.emit('notification', {
            variant: 'warning',
            title: error.response?.data?.error || 'Bucket Creation Failed',
            description: error.response?.data?.message || 'Bucket could not be created.',
          });
          setIsCreateBucketModalOpen(false);
          console.log(error.response?.data?.message || error.message);
        });
    }
  };

  const handleNewBucketCancel = () => {
    setNewBucketName('');
    setIsCreateBucketModalOpen(false);
  };

  // Delete bucket handling
  const [isDeleteBucketModalOpen, setIsDeleteBucketModalOpen] = React.useState(false);
  const [selectedBucket, setSelectedBucket] = React.useState('');
  const [bucketToDelete, setBucketToDelete] = React.useState('');

  const handleDeleteBucketModalToggle = (_event: KeyboardEvent | React.MouseEvent) => {
    setIsDeleteBucketModalOpen(!isDeleteBucketModalOpen);
  };

  const handleDeleteBucketClick = (name: string) => (event: React.MouseEvent<HTMLButtonElement>) => {
    setSelectedBucket(name);
    handleDeleteBucketModalToggle(event);
  };

  const validateBucketToDelete = (): boolean => {
    if (bucketToDelete !== selectedBucket) {
      return false;
    } else {
      return true;
    }
  };

  const handleDeleteBucketConfirm = () => {
    if (!validateBucketToDelete()) {
      console.log('Invalid bucket to delete');
      return;
    } else {
      axios
        .delete(`${config.backend_api_url}/buckets/${selectedBucket}`)
        .then((response) => {
          Emitter.emit('notification', {
            variant: 'success',
            title: 'Bucket deleted',
            description: 'Bucket ' + selectedBucket + ' has been deleted successfully',
          });
          // Refresh both locations and bucket details (force refresh to update cache)
          Promise.all([storageService.refreshLocations(), axios.get(`${config.backend_api_url}/buckets`)])
            .then(([newLocations, bucketsResponse]) => {
              setLocations(newLocations);
              const { owner, buckets } = bucketsResponse.data;
              const newBucketsState = new BucketsList(
                buckets.map((bucket: any) => new Bucket(bucket.Name, bucket.CreationDate)),
                new Owner(owner.DisplayName, owner.ID),
              );
              setBucketsList(newBucketsState);
              setBucketToDelete('');
              setIsDeleteBucketModalOpen(false);
            })
            .catch((error) => {
              console.error(error);
              Emitter.emit('notification', {
                variant: 'warning',
                title: error.response?.data?.error || 'Error Fetching Storage',
                description: error.response?.data?.message || 'Failed to refresh storage locations.',
              });
            });
        })
        .catch((error) => {
          console.error(error);
          Emitter.emit('notification', {
            variant: 'warning',
            title: error.response?.data?.error || 'Bucket Deletion Failed',
            description: error.response?.data?.message || 'Bucket could not be deleted.',
          });
        });
    }
  };

  const handleDeleteBucketCancel = () => {
    setBucketToDelete('');
    setIsDeleteBucketModalOpen(false);
  };

  // Storage locations handling (S3 + PVC)
  const [searchBucketText, setSearchBucketText] = React.useState('');
  const [locations, setLocations] = React.useState<StorageLocation[]>([]);
  const [bucketsList, setBucketsList] = React.useState<BucketsList | null>(null);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  // Manual refresh handler
  const handleRefreshLocations = async () => {
    setIsRefreshing(true);
    try {
      // Force refresh storage locations from backend
      const [newLocations, bucketsResponse] = await Promise.all([
        storageService.refreshLocations(),
        axios.get(`${config.backend_api_url}/buckets`),
      ]);

      setLocations(newLocations);

      // Update S3 bucket details
      const { owner, buckets } = bucketsResponse.data;
      const newBucketsState = new BucketsList(
        buckets.map((bucket: any) => new Bucket(bucket.Name, bucket.CreationDate)),
        new Owner(owner.DisplayName, owner.ID),
      );
      setBucketsList(newBucketsState);

      Emitter.emit('notification', {
        variant: 'success',
        title: 'Storage refreshed',
        description: 'Storage locations have been updated successfully.',
      });
    } catch (error: any) {
      console.error('Failed to refresh storage locations:', error);
      Emitter.emit('notification', {
        variant: 'warning',
        title: error.response?.data?.error || 'Refresh Failed',
        description: error.response?.data?.message || 'Failed to refresh storage locations.',
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const columnNames = {
    name: 'Name',
    type: 'Type',
    status: 'Status',
    creation_date: 'Creation Date',
    owner: 'Owner',
  };

  // Map locations to rows for display
  interface LocationRow {
    id: string;
    name: string;
    type: 's3' | 'local';
    available: boolean;
    creation_date?: string;
    owner?: string;
  }

  const rows: LocationRow[] = locations.map((location) => ({
    id: location.id,
    name: location.name,
    type: location.type,
    available: location.available,
    creation_date:
      location.type === 's3' ? bucketsList?.buckets.find((b) => b.Name === location.id)?.CreationDate : undefined,
    owner: location.type === 's3' ? bucketsList?.owner.DisplayName : undefined,
  }));

  const filteredRows = rows.filter((row) =>
    Object.entries(row)
      .map(([_, value]) => value)
      .some((val) => val.toString().toLowerCase().includes(searchBucketText.toLowerCase())), // Search all fields with the search text
  );

  // Index of the currently sorted column
  const [activeSortIndex, setActiveSortIndex] = React.useState<number | null>(null);

  // Sort direction of the currently sorted column
  const [activeSortDirection, setActiveSortDirection] = React.useState<'asc' | 'desc' | null>(null);

  // Since OnSort specifies sorted columns by index, we need sortable values for our object by column index.
  const getSortableRowValues = (row: LocationRow): (string | number | boolean)[] => {
    const { name, type, available, creation_date, owner } = row;
    return [name, type, available ? 1 : 0, creation_date || '', owner || ''];
  };

  let sortedRows = filteredRows;
  if (activeSortIndex !== null) {
    sortedRows = rows.sort((a, b) => {
      const aValue = getSortableRowValues(a)[activeSortIndex as number];
      const bValue = getSortableRowValues(b)[activeSortIndex as number];
      if (typeof aValue === 'number') {
        // Numeric sort
        if (activeSortDirection === 'asc') {
          return (aValue as number) - (bValue as number);
        }
        return (bValue as number) - (aValue as number);
      } else {
        // String sort
        if (activeSortDirection === 'asc') {
          return (aValue as string).localeCompare(bValue as string);
        }
        return (bValue as string).localeCompare(aValue as string);
      }
    });
  }

  const getSortParams = (columnIndex: number): ThProps['sort'] => ({
    sortBy: {
      // @ts-ignore
      index: activeSortIndex,
      // @ts-ignore
      direction: activeSortDirection,
      defaultDirection: 'asc', // starting sort direction when first sorting a column. Defaults to 'asc'
    },
    onSort: (_event, index, direction) => {
      setActiveSortIndex(index);
      setActiveSortDirection(direction);
    },
    columnIndex,
  });

  // Load storage locations (S3 + PVC) at startup
  React.useEffect(() => {
    // Load unified storage locations
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
            variant: 'info',
            title: 'Storage locations unavailable',
            description: 'Storage locations exist but are not currently accessible.',
          });
        }
      })
      .catch((error) => {
        // This should not happen with allSettled, but keep as safety net
        console.error('Failed to load storage locations:', error);
        Emitter.emit('notification', {
          variant: 'warning',
          title: 'Error Loading Storage',
          description: error.response?.data?.message || 'Failed to fetch storage locations from the backend.',
        });
      });

    // Also load S3 bucket details for creation date and owner
    axios
      .get(`${config.backend_api_url}/buckets`)
      .then((response) => {
        const { owner, buckets } = response.data;
        const newBucketsState = new BucketsList(
          buckets.map((bucket: any) => new Bucket(bucket.Name, bucket.CreationDate)),
          new Owner(owner.DisplayName, owner.ID),
        );
        setBucketsList(newBucketsState);
      })
      .catch((error) => {
        console.error(error);
        // Don't show notification here as storageService already handles it
      });
  }, []);

  return (
    <div className="buckets-list">
      <PageSection hasBodyWrapper={false}>
        <Content>
          <Content component={ContentVariants.h1}>Storage Management</Content>
        </Content>
      </PageSection>
      <PageSection hasBodyWrapper={false}>
        <Flex>
          <FlexItem>
            <TextInput
              value={searchBucketText}
              type="search"
              onChange={(_event, searchText) => setSearchBucketText(searchText)}
              aria-label="search text input"
              placeholder="Search storage locations"
              customIcon={<SearchIcon />}
              className="buckets-list-filter-search"
            />
          </FlexItem>
          <FlexItem align={{ default: 'alignRight' }}>
            <Button
              variant="secondary"
              onClick={handleRefreshLocations}
              isLoading={isRefreshing}
              isDisabled={isRefreshing}
              icon={<SyncIcon />}
              aria-label="Refresh storage locations"
            >
              Refresh
            </Button>
          </FlexItem>
          <FlexItem>
            <Button variant="primary" onClick={handleCreateBucketModalToggle} ouiaId="ShowCreateProjectModal">
              Create S3 Bucket
            </Button>
          </FlexItem>
        </Flex>
      </PageSection>
      <PageSection hasBodyWrapper={false}>
        <Card component="div">
          <Table aria-label="Storage locations list" isStickyHeader>
            <Thead>
              <Tr>
                <Th sort={getSortParams(0)} width={15}>
                  {columnNames.name}
                </Th>
                <Th width={10}>{columnNames.type}</Th>
                <Th width={10}>{columnNames.status}</Th>
                <Th width={10}>{columnNames.creation_date}</Th>
                <Th width={10}>{columnNames.owner}</Th>
                <Th width={10} screenReaderText="Actions" />
              </Tr>
            </Thead>
            <Tbody>
              {sortedRows.map((row, rowIndex) => (
                <Tr key={rowIndex} className="bucket-row">
                  <Td className="bucket-column">
                    <Button
                      variant="link"
                      onClick={() => {
                        navigate(`/storage/${row.id}`);
                      }}
                      isDisabled={!row.available}
                    >
                      <FontAwesomeIcon icon={row.type === 's3' ? faBucket : faFolder} />
                      &nbsp;{row.name}
                    </Button>
                  </Td>
                  <Td className="bucket-column">
                    {row.type === 's3' ? (
                      <Label color="blue" icon={<CloudIcon />}>
                        S3
                      </Label>
                    ) : (
                      <Label color="green" icon={<FolderIcon />}>
                        PVC
                      </Label>
                    )}
                  </Td>
                  <Td className="bucket-column">
                    {!row.available && (
                      <Tooltip content="Storage location is not accessible">
                        <Label color="red">Unavailable</Label>
                      </Tooltip>
                    )}
                  </Td>
                  <Td className="bucket-column">{row.creation_date || '-'}</Td>
                  <Td className="bucket-column">{row.owner || '-'}</Td>
                  <Td className="bucket-column align-right">
                    {row.type === 's3' && (
                      <Button variant="danger" onClick={handleDeleteBucketClick(row.name)} isDisabled={!row.available}>
                        <FontAwesomeIcon icon={faTrash} />
                      </Button>
                    )}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Card>
      </PageSection>
      <Modal
        title="Create a new bucket"
        className="bucket-modal"
        isOpen={isCreateBucketModalOpen}
        onClose={handleCreateBucketModalToggle}
        actions={[
          <Button
            key="create"
            variant="primary"
            onClick={handleNewBucketCreate}
            isDisabled={newBucketName.length < 3 || newBucketNameRulesVisibility}
          >
            Create
          </Button>,
          <Button key="cancel" variant="link" onClick={handleNewBucketCancel}>
            Cancel
          </Button>,
        ]}
        ouiaId="CreateBucketModal"
      >
        <Form
          onSubmit={(event) => {
            event.preventDefault();
            if (newBucketName.length > 2 && validateBucketName(newBucketName)) {
              handleNewBucketCreate();
            }
          }}
        >
          <FormGroup label="Bucket name" isRequired fieldId="bucket-name">
            <TextInput
              isRequired
              type="text"
              id="bucket-name"
              name="bucket-name"
              aria-describedby="bucket-name-helper"
              placeholder="Enter at least 3 characters"
              value={newBucketName}
              onChange={(_event, newBucketName) => setNewBucketName(newBucketName)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  if (newBucketName.length > 2 && validateBucketName(newBucketName)) {
                    handleNewBucketCreate();
                  }
                }
              }}
            />
          </FormGroup>
        </Form>
        <Content hidden={!newBucketNameRulesVisibility}>
          <Content component={ContentVariants.small} className="bucket-name-rules">
            Bucket names must:
            <ul>
              <li>be unique,</li>
              <li>be between 3 and 63 characters,</li>
              <li>start with a lowercase letter or number,</li>
              <li>only contain lowercase letters, numbers and hyphens,</li>
              <li>not end with an hyphen,</li>
              <li>not contain consecutive periods or dashes adjacent to periods,</li>
              <li>not be formatted as an IP address.</li>
            </ul>
          </Content>
        </Content>
      </Modal>
      <Modal
        title={'Delete bucket?'}
        titleIconVariant="warning"
        className="bucket-modal"
        isOpen={isDeleteBucketModalOpen}
        onClose={handleDeleteBucketModalToggle}
        actions={[
          <Button
            key="confirm"
            variant="danger"
            onClick={handleDeleteBucketConfirm}
            isDisabled={!validateBucketToDelete()}
          >
            Delete bucket
          </Button>,
          <Button key="cancel" variant="secondary" onClick={handleDeleteBucketCancel}>
            Cancel
          </Button>,
        ]}
      >
        <Content>
          <Content component={ContentVariants.p}>This action cannot be undone.</Content>
          <Content component={ContentVariants.p}>
            Type <strong>{selectedBucket}</strong> to confirm deletion.
          </Content>
        </Content>
        <TextInput
          id="delete-modal-input"
          aria-label="Delete modal input"
          value={bucketToDelete}
          onChange={(_event, bucketToDelete) => setBucketToDelete(bucketToDelete)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              if (validateBucketToDelete()) {
                handleDeleteBucketConfirm();
              }
            }
          }}
        />
      </Modal>
    </div>
  );
};

export default Buckets;
