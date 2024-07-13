import config from '@app/config';
import * as React from 'react';
import axios from 'axios';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBucket, faTrash } from '@fortawesome/free-solid-svg-icons';
import {
    Button,
    Card,
    Flex,
    FlexItem,
    Form,
    FormGroup,
    Modal,
    Page,
    PageSection,
    Text,
    TextContent,
    TextInput,
    TextVariants,
} from '@patternfly/react-core';
import { Table, Caption, Thead, Tr, Th, Tbody, Td, ThProps } from '@patternfly/react-table';
import { AlignRightIcon, SearchIcon } from '@patternfly/react-icons';
import Emitter from '../../utils/emitter';
import { useHistory } from 'react-router-dom';


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
    const history = useHistory();

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
            return !bucketsList.buckets.some(bucket => bucket.Name === name);
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
            Emitter.emit('notification', { variant: 'warning', title: 'Invalid bucket name', description: 'Bucket name ' + newBucketName + ' is invalid. Please check the rules and try again.' });
            return;
        } else {
            axios.post(`${config.backend_api_url}/buckets`, {
                bucketName: newBucketName
            })
                .then(response => {
                    Emitter.emit('notification', { variant: 'success', title: 'Bucket created', description: 'Bucket ' + newBucketName + ' has been created successfully' });
                    axios.get(`${config.backend_api_url}/buckets`)
                        .then(response => {
                            const { owner, buckets } = response.data;
                            const newBucketsState = new BucketsList(
                                buckets.map((bucket: any) => new Bucket(bucket.Name, bucket.CreationDate)),
                                new Owner(owner.DisplayName, owner.ID)
                            );
                            setBucketsList(newBucketsState);
                            setNewBucketName('');
                            setIsCreateBucketModalOpen(false);
                        })
                        .catch(error => {
                            console.error(error);
                        });
                })
                .catch(error => {
                    Emitter.emit('notification', { variant: 'warning', title: 'Bucket creation failed', description: 'Bucket ' + newBucketName + ' could not be created. Reason: ' + error.response.data.message.Code });
                    setIsCreateBucketModalOpen(false);
                    console.log(error.response.data.message.Code);
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
    }

    const handleDeleteBucketConfirm = () => {
        if (!validateBucketToDelete()) {
            console.log('Invalid bucket to delete');
            return;
        } else {
            axios.delete(`${config.backend_api_url}/buckets/${selectedBucket}`)
                .then(response => {
                    Emitter.emit('notification', { variant: 'success', title: 'Bucket deleted', description: 'Bucket ' + selectedBucket + ' has been deleted successfully' });
                    axios.get(`${config.backend_api_url}/buckets`)
                        .then(response => {
                            const { owner, buckets } = response.data;
                            const newBucketsState = new BucketsList(
                                buckets.map((bucket: any) => new Bucket(bucket.Name, bucket.CreationDate)),
                                new Owner(owner.DisplayName, owner.ID)
                            );
                            setBucketsList(newBucketsState);
                            setBucketToDelete('');
                            setIsDeleteBucketModalOpen(false);
                        })
                        .catch(error => {
                            console.error(error);
                        });
                })
                .catch(error => {
                    console.error(error);
                    Emitter.emit('notification', { variant: 'warning', title: 'Bucket deletion failed', description: 'Bucket ' + selectedBucket + ' could not be deleted. Reason: ' + error.response.data.error });
                });
        }
    }

    const handleDeleteBucketCancel = () => {
        setBucketToDelete('');
        setIsDeleteBucketModalOpen(false);
    }


    // Buckets and owner handling
    const [searchBucketText, setSearchBucketText] = React.useState('');
    const [bucketsList, setBucketsList] = React.useState<BucketsList | null>(null);

    const columnNames = {
        name: 'Name',
        creation_date: 'Creation Date',
        owner: 'Owner',
    }

    const rows: BucketRow[] = bucketsList ? bucketsList.buckets.map(bucket => ({
        name: bucket.Name,
        creation_date: bucket.CreationDate,
        owner: bucketsList.owner.DisplayName,
    })) : [];

    const filteredRows = rows.filter(row => (
        Object.entries(row)
            .map(([_, value]) => value)
            .some(val => val.toString().toLowerCase().includes(searchBucketText.toLowerCase())) // Search all fields with the search text
    ));


    // Index of the currently sorted column
    const [activeSortIndex, setActiveSortIndex] = React.useState<number | null>(null);

    // Sort direction of the currently sorted column
    const [activeSortDirection, setActiveSortDirection] = React.useState<'asc' | 'desc' | null>(null);

    // Since OnSort specifies sorted columns by index, we need sortable values for our object by column index.
    const getSortableRowValues = (row: BucketRow): (string | number)[] => {
        const { name, creation_date, owner } = row;
        return [name, creation_date, owner];
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
            defaultDirection: 'asc' // starting sort direction when first sorting a column. Defaults to 'asc'
        },
        onSort: (_event, index, direction) => {
            setActiveSortIndex(index);
            setActiveSortDirection(direction);
        },
        columnIndex
    });

    // Load buckets at startup
    React.useEffect(() => {
        axios.get(`${config.backend_api_url}/buckets`)
            .then(response => {
                const { owner, buckets } = response.data;
                const newBucketsState = new BucketsList(
                    buckets.map((bucket: any) => new Bucket(bucket.Name, bucket.CreationDate)),
                    new Owner(owner.DisplayName, owner.ID)
                );
                setBucketsList(newBucketsState);
            })
            .catch(error => {
                console.error(error);
            });
    }, []);



    return (
        <Page className='buckets-list'>
            <PageSection>
                <TextContent>
                    <Text component={TextVariants.h1}>Buckets</Text>
                </TextContent>
            </PageSection>
            <PageSection>
                <Flex>
                    <FlexItem>
                        <TextInput
                            value={searchBucketText}
                            type="search"
                            onChange={(_event, searchText) => setSearchBucketText(searchText)}
                            aria-label="search text input"
                            placeholder="Search buckets"
                            customIcon={<SearchIcon />}
                            className='buckets-list-filter-search'
                        />
                    </FlexItem>
                    <FlexItem align={{ default: 'alignRight' }}>
                        <Button variant="primary" onClick={handleCreateBucketModalToggle} ouiaId="ShowCreateProjectModal">
                            Create Bucket</Button>
                    </FlexItem>
                </Flex>
            </PageSection>
            <PageSection >
                <Card component="div">
                    <Table aria-label="Buckets list" isStickyHeader>
                        <Thead>
                            <Tr>
                                <Th sort={getSortParams(1)} width={10}>{columnNames.name}</Th>
                                <Th width={10}>{columnNames.creation_date}</Th>
                                <Th width={10}>{columnNames.owner}</Th>
                                <Th width={10}>&nbsp;</Th>
                            </Tr>
                        </Thead>
                        <Tbody>
                            {sortedRows.map((row, rowIndex) => (
                                <Tr key={rowIndex}
                                    className='bucket-row'>
                                    <Td className='bucket-column'>
                                        <Button variant="link" onClick={() => { history.push(`/objects/${row.name}`); }}><FontAwesomeIcon icon={faBucket} />&nbsp;{row.name}</Button>
                                    </Td>
                                    <Td className='bucket-column'>{row.creation_date}</Td>
                                    <Td className='bucket-column'>{row.owner}</Td>
                                    <Td className='bucket-column align-right'>
                                        <Button variant="danger" onClick={handleDeleteBucketClick(row.name)}>
                                            <FontAwesomeIcon icon={faTrash} />
                                        </Button>
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
                    <Button key="create" variant="primary" onClick={handleNewBucketCreate} isDisabled={(newBucketName.length < 3) || newBucketNameRulesVisibility}>
                        Create
                    </Button>,
                    <Button key="cancel" variant="link" onClick={handleNewBucketCancel}>
                        Cancel
                    </Button>
                ]}
                ouiaId="CreateBucketModal"
            >
                <Form>
                    <FormGroup
                        label="Bucket name"
                        isRequired
                        fieldId="bucket-name"
                    >
                        <TextInput
                            isRequired
                            type="text"
                            id="bucket-name"
                            name="bucket-name"
                            aria-describedby="bucket-name-helper"
                            placeholder='Enter at least 3 characters'
                            value={newBucketName}
                            onChange={(_event, newBucketName) => setNewBucketName(newBucketName)}
                            onKeyDown={(event) => {              
                                if (event.key === 'Enter' && newBucketName.length > 2 && validateBucketName(newBucketName)) {
                                    handleNewBucketCreate();
                                }
                            }}
                        />
                    </FormGroup>
                </Form>
                <TextContent hidden={!newBucketNameRulesVisibility}>
                    <Text component={TextVariants.small} className="bucket-name-rules">
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
                    </Text>
                </TextContent>
            </Modal>
            <Modal
                title={"Delete bucket?"}
                titleIconVariant="warning"
                className="bucket-modal"
                isOpen={isDeleteBucketModalOpen}
                onClose={handleDeleteBucketModalToggle}
                actions={[
                    <Button key="confirm" variant="danger" onClick={handleDeleteBucketConfirm} isDisabled={!validateBucketToDelete()}>
                        Delete bucket
                    </Button>,
                    <Button key="cancel" variant="secondary" onClick={handleDeleteBucketCancel}>
                        Cancel
                    </Button>
                ]}
            >
                <TextContent>
                    <Text component={TextVariants.p}>
                        This action cannot be undone.
                    </Text>
                    <Text component={TextVariants.p}>
                        Type <strong>{selectedBucket}</strong> to confirm deletion.
                    </Text>
                </TextContent>
                <TextInput
                    id="delete-modal-input"
                    aria-label="Delete modal input"
                    value={bucketToDelete}
                    onChange={(_event, bucketToDelete) => setBucketToDelete(bucketToDelete)}
                    onKeyDown={(event) => {              
                        if (event.key === 'Enter' && validateBucketToDelete()) {
                            handleDeleteBucketConfirm();
                        }
                    }}
                />
            </Modal>
        </Page>

    )
};

export default Buckets;