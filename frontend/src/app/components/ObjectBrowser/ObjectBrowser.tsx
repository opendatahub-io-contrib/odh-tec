import config from '@app/config';
import { faDownload, faEye, faFile, faFolder, faTrash } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    Breadcrumb, BreadcrumbItem, Button, Card,
    DropEvent,
    FileUpload, Flex, FlexItem, Form, FormGroup, FormSelect, FormSelectOption,
    HelperText,
    HelperTextItem,
    Modal,
    MultipleFileUpload,
    MultipleFileUploadMain,
    MultipleFileUploadStatus,
    MultipleFileUploadStatusItem,
    Page, PageSection, Progress, ProgressSize, Text, TextContent, TextInput, TextVariants, ToolbarContent, ToolbarGroup, ToolbarItem, Tooltip
} from '@patternfly/react-core';
import { SearchIcon } from '@patternfly/react-icons';
import UploadIcon from '@patternfly/react-icons/dist/esm/icons/upload-icon';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import axios from 'axios';
import * as React from 'react';
import { useHistory, useLocation, useParams } from 'react-router-dom';
import Emitter from '../../utils/emitter';
import DocumentRenderer from '../DocumentRenderer/DocumentRenderer';
import { createFolder, deleteFile, loadBuckets, refreshObjects } from './objectBrowserFunctions';
import { BucketsList, ObjectRow, PrefixRow, UploadedFile, S3Objects, S3Prefixes, ExtendedFile } from './objectBrowserTypes';
import HfLogo from '@app/assets/bgimages/hf-logo.svg';
import pLimit from 'p-limit';

interface ObjectBrowserProps { }

const ObjectBrowser: React.FC<ObjectBrowserProps> = () => {

    /*
      Common variables
    */

    // React hooks
    const history = useHistory();
    const location = useLocation();
    const abortUploadController = React.useRef<AbortController | null>(null);

    // Limit the number of concurrent file uploads or transfers
    const [maxConcurrentTransfers, setMaxConcurrentTransfers] = React.useState(2);

    React.useEffect(() => {
        axios.get(`${config.backend_api_url}/settings/max-concurrent-transfers`)
            .then(response => {
                setMaxConcurrentTransfers(response.data.maxConcurrentTransfers);
            })
            .catch(error => {
                console.error('Error getting max concurrent transfers', error);
            });
    }, []);

    // URL parameters
    const { bucketName } = useParams<{ bucketName: string }>();
    const { prefix } = useParams<{ prefix: string }>();

    // Buckets handling
    const [bucketsList, setBucketsList] = React.useState<BucketsList | null>(null);
    const [formSelectBucket, setFormSelectBucket] = React.useState(bucketName);

    // Load buckets at startup and when location changes
    React.useEffect(() => {
        loadBuckets(bucketName, history, setBucketsList);
    }, [location]);

    // Refresh objects from the bucket when location changes
    React.useEffect(() => {
        refreshObjects(bucketName, prefix, setDecodedPrefix, setS3Objects, setS3Prefixes);
    }, [location, prefix]);

    // Handle bucket change in the dropdown
    const handleBucketChange = (_event: React.FormEvent<HTMLSelectElement>, value: string) => {
        setFormSelectBucket(value);
        history.push(`/objects/${value}`);
    }

    /*
      Utilities
    */
    // Copy the prefix (aka full "folder" path) to the clipboard
    const copyPrefixToClipboard = () => {
        navigator.clipboard.writeText('/' + decodedPrefix).then(
            () => {
                Emitter.emit('notification', { variant: 'success', title: 'Path copied', description: 'The path has been successfully copied to the clipboard.' });
            },
            (err) => {
                console.error('Failed to copy prefix to clipboard: ', err);
            }
        );
    };

    /*
      Objects display
    */
    const [searchObjectText, setSearchObjectText] = React.useState(''); // The text to search for in the objects names
    const [decodedPrefix, setDecodedPrefix] = React.useState(''); // The decoded prefix (aka full "folder" path)
    const [s3Objects, setS3Objects] = React.useState<S3Objects | null>(null); // The list of objects with the selected prefix ("folder")
    const [s3Prefixes, setS3Prefixes] = React.useState<S3Prefixes | null>(null); // The list of prefixes ("subfolders") in the current prefix

    const columnNames = {
        key: 'Key',
        lastModified: 'Last Modified',
        size: 'Size'
    };

    // Convert the S3 objects and prefixes to rows
    const prefixRows: PrefixRow[] = s3Prefixes ? s3Prefixes.s3Prefixes.map((s3Prefix) => ({
        prefix: s3Prefix.Prefix
    })) : [];

    const objectRows: ObjectRow[] = s3Objects ? s3Objects.s3Objects.map((s3Object) => ({
        key: s3Object.Key,
        lastModified: s3Object.LastModified,
        size: s3Object.Size,
        originalSize: s3Object.OriginalSize
    })) : [];

    // Filter the rows on all fields based on the search text
    const filteredRows = objectRows.filter(row =>
        Object.entries(row).some(([field, value]) => {
            if (field === 'key') {
                const lastSegment = value.split('/').pop();
                return lastSegment.toLowerCase().includes(searchObjectText.toLowerCase());
            } else {
                return value.toString().toLowerCase().includes(searchObjectText.toLowerCase());
            }
        })
    );

    const filteredPrefixRows = prefixRows.filter(row => {
        if (row.prefix) {
            const lastSegment = row.prefix.slice(0, -1).split('/').pop();
            return lastSegment && lastSegment.toLowerCase().includes(searchObjectText.toLowerCase());
        }
        return false;
    });

    // Helper to validate which files can be viewed
    const validateFileView = (filename: string, size: number) => {
        const allowedExtensions = ['txt', 'log', 'jpg', 'py', 'json', 'yaml', 'yml', 'md', 'html', 'css', 'js', 'ts', 'tsx', 'jsx', 'sh', 'bash', 'sql', 'csv', 'xml', 'png', 'gif', 'bmp', 'jpeg', 'svg', 'webp', 'ico'];
        if (size > 1024 * 1024) {
            return false;
        }
        if (!allowedExtensions.includes(filename.split('.').pop() || '')) {
            return false;
        }
        return true;
    }

    // Navigate when clicking on a prefix
    const handlePrefixClick = (plainTextPrefix: string) => (event: React.MouseEvent<HTMLButtonElement>) => {
        setS3Objects(null);
        setS3Prefixes(null);
        setDecodedPrefix(plainTextPrefix);
        history.push(plainTextPrefix !== '' ? `/objects/${bucketName}/${btoa(plainTextPrefix)}` : `/objects/${bucketName}`);
    }

    /*
      File viewing
    */
    const [fileData, setFileData] = React.useState('');
    const [fileName, setFileName] = React.useState('');

    const [isFileViewerOpen, setIsFileViewerOpen] = React.useState(false);
    const handleFileViewerToggle = (_event: KeyboardEvent | React.MouseEvent) => {
        setIsFileViewerOpen(!isFileViewerOpen);
    }

    const handleObjectViewClick = (key: string) => async (event: React.MouseEvent<HTMLButtonElement>) => {
        // Retrieve the object from the backend and open the File Viewer modal
        await axios.get(`${config.backend_api_url}/objects/view/${bucketName}/${btoa(key)}`, { responseType: 'arraybuffer' })
            .then((response) => {
                setFileName(key.split('/').pop() || '');
                const binary = new Uint8Array(response.data);
                const data = btoa(
                    binary.reduce((data, byte) => data + String.fromCharCode(byte), '')
                );
                setFileData(data);
                setIsFileViewerOpen(true);
            })
            .catch((error) => {
                console.error('Error viewing object', error);
            });
    }


    /*
      File(s) upload progress trackers
    */

    // We have 2 progress trackers: one for the upload to the backend and one for the upload to S3
    // They are stored in objects with the encoded key as key (yes, I know...) and the percentage as value
    interface UploadToS3Percentage {
        loaded: number;
        status?: string;
    }

    interface UploadToS3Percentages {
        [key: string]: UploadToS3Percentage;
    }

    interface UploadPercentage {
        loaded: number;
    }

    interface UploadPercentages {
        [key: string]: UploadPercentage;
    }

    const [uploadToS3Percentages, setUploadToS3Percentages] = React.useState<UploadToS3Percentages>({});
    const [uploadPercentages, setUploadPercentages] = React.useState<UploadPercentages>({});

    const updateS3Progress = (key: string, value: number, status: string = '') => {
        setUploadToS3Percentages(prevPercentages => ({
            ...prevPercentages,
            [key]: {
                ...prevPercentages[key],
                loaded: value,
                status: status,
            },
        }));
    }

    const updateProgress = (encodedKey: string, loaded: number) => {
        setUploadPercentages(prevPercentages => ({
            ...prevPercentages,
            [encodedKey]: {
                ...prevPercentages[encodedKey],
                loaded: loaded,
            },
        }));
    };

    /*
      Single file upload
    */

    const [singleFileUploadValue, setSingleFileUploadValue] = React.useState<File | undefined>(undefined); // File reference
    const [singleFilename, setSingleFilename] = React.useState(''); // Filename

    const [isUploadSingleFileModalOpen, setIsUploadSingleFileModalOpen] = React.useState(false);
    const handleUploadSingleFileModalToggle = (_event: KeyboardEvent | React.MouseEvent) => {
        setIsUploadSingleFileModalOpen(!isUploadSingleFileModalOpen);
    }

    const resetSingleFileUploadPanel = () => {
        setSingleFileUploadValue(undefined);
        setSingleFilename('');
        setUploadToS3Percentages({});
        setUploadPercentages({});
        setIsUploadSingleFileModalOpen(false);
        abortUploadController.current = null;
    }

    const handleFileInputChange = (_, file: File) => {
        setSingleFilename(file.name);
        setSingleFileUploadValue(file);
    };

    const handleUploadFileCancel = (_event: React.MouseEvent) => {
        if (abortUploadController.current) {
            abortUploadController.current.abort(); // Abort the current request if controller exists
        }
        axios.get(`${config.backend_api_url}/objects/abort-upload`, {})
            .then(response => {
                console.log('Upload aborted', response);
            })
            .catch(error => {
                console.error('Error aborting upload', error);
            });
        resetSingleFileUploadPanel();
    }

    const handleUploadFileConfirm = (_event: React.MouseEvent) => {
        if (!singleFileUploadValue) {
            return;
        }
        const fileSize = singleFileUploadValue.size;

        // Reset progress trackers
        setUploadPercentages(() => ({
            [singleFilename]: { loaded: 0 },
        }));
        setUploadToS3Percentages(() => ({
            [singleFilename]: { loaded: 0 },
        }));

        const formData = new FormData();
        formData.append('file', singleFileUploadValue);

        // Upload to S3 progress feedback
        const eventSource = new EventSource(`${config.backend_api_url}/objects/upload-progress/${btoa(decodedPrefix + singleFilename)}`);
        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.loaded !== 0 && data.status === 'uploading') {
                updateS3Progress(singleFilename, Math.round((data.loaded / fileSize) * 100));
            }
            if (data.status === 'completed') {
                console.log('Upload to S3 completed');
                eventSource.close();
                delete uploadToS3Percentages[singleFilename];
            }
        }

        // Upload
        abortUploadController.current = new AbortController();
        axios.post(`${config.backend_api_url}/objects/upload/${bucketName}/${btoa(decodedPrefix + singleFilename)}`, formData, {
            signal: abortUploadController.current.signal,
            headers: {
                'Content-Type': 'multipart/form-data'
            },
            onUploadProgress: (progressEvent) => {
                updateProgress(singleFilename, Math.round((progressEvent.loaded / fileSize) * 100));
            }
        })
            .then(response => {
                const oldFileName = singleFilename;
                Emitter.emit('notification', { variant: 'success', title: 'File uploaded', description: 'File "' + oldFileName + '" has been successfully uploaded.' });
                resetSingleFileUploadPanel();
                history.push(`/objects/${bucketName}/${btoa(decodedPrefix)}`);

            })
            .catch(error => {
                console.error('Error uploading file', error);
                Emitter.emit('notification', { variant: 'warning', title: 'File upload failed', description: String(error) });
                resetSingleFileUploadPanel();
            });
    }



    const handleClear = (_event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
        setSingleFilename('');
        setSingleFileUploadValue(undefined);
    };

    /*
      Multiple files upload
    */

    const [currentFiles, setCurrentFiles] = React.useState<ExtendedFile[]>([]);
    const [uploadedFiles, setUploadedFiles] = React.useState<UploadedFile[]>([]);
    const [showStatus, setShowStatus] = React.useState(false);
    const [statusIcon, setStatusIcon] = React.useState('inProgress');

    const [isUploadFilesModalOpen, setIsUploadFilesModalOpen] = React.useState(false);
    const handleUploadFilesModalToggle = (_event: KeyboardEvent | React.MouseEvent) => {
        setIsUploadFilesModalOpen(!isUploadFilesModalOpen);
    }

    const handleUploadFilesClose = (_event: React.MouseEvent) => {
        setIsUploadFilesModalOpen(false);
        setCurrentFiles([]);
        setUploadedFiles([]);
        setUploadToS3Percentages({});
        setUploadPercentages({});
        setShowStatus(false);
    }

    if (!showStatus && currentFiles.length > 0) {
        setShowStatus(true);
    }

    // determine the icon that should be shown for the overall status list
    React.useEffect(() => {
        if (uploadedFiles.length < currentFiles.length) {
            setStatusIcon('inProgress');
        } else if (uploadedFiles.every((file) => file.loadResult === 'success')) {
            setStatusIcon('success');
        } else {
            setStatusIcon('danger');
        }
    }, [uploadedFiles, currentFiles]);

    // remove files from both state arrays based on their paths
    const removeFiles = (pathsOfFilesToRemove: string[]) => {
        const newCurrentFiles = currentFiles.filter(
            (currentFile) => !pathsOfFilesToRemove.some((path) => path === currentFile.path)
        );

        setCurrentFiles(newCurrentFiles);

        const newUploadedFiles = uploadedFiles.filter(
            (uploadedFile) => !pathsOfFilesToRemove.some((path) => path === uploadedFile.path)
        );

        setUploadedFiles(newUploadedFiles);
    };

    const updateCurrentFiles = (files: ExtendedFile[]): void => {
        setCurrentFiles((prevFiles) => [...prevFiles, ...files]);
    };

    const handleFileDrop = async (_event: DropEvent, droppedFiles: File[]) => {
        console.log('Dropped files', droppedFiles);
        const fullDroppedFiles = droppedFiles as ExtendedFile[]; // cast to uploadedFile type to read "path" property
        // identify what, if any, files are re-uploads of already uploaded files
        // filtering on full path in case multiple folders gave the same file
        const currentFilePaths = currentFiles.map((file) => file.path);
        const reUploads = fullDroppedFiles.filter((fullDroppedFiles) => currentFilePaths.includes(fullDroppedFiles.path));

        /** this promise chain is needed because if the file removal is done at the same time as the file adding react
         * won't realize that the status items for the re-uploaded files needs to be re-rendered */
        Promise.resolve()
            .then(() => removeFiles(reUploads.map((file) => file.path)))
            .then(() => updateCurrentFiles(fullDroppedFiles));

        // Add the new files to the progress trackers
        setUploadPercentages((prevPercentages) => {
            const newPercentages = { ...prevPercentages };
            for (const file of fullDroppedFiles) {
                newPercentages[decodedPrefix + file.path.replace(/^\//, '')] = { loaded: 0 };
            }
            return newPercentages;
        });
        
        setUploadToS3Percentages((prevPercentages) => {
            const newPercentages = { ...prevPercentages };
            for (const file of fullDroppedFiles) {
                newPercentages[decodedPrefix + file.path.replace(/^\//, '')] = { loaded: 0, status: 'queued' };
            }
            return newPercentages;
        });

        // Start the upload process, using limit to control the number of concurrent uploads
        const limit = pLimit(maxConcurrentTransfers);

        const promises = fullDroppedFiles.map((file: ExtendedFile) => 
            limit(() => handleFileUpload(file)),
        );

        await Promise.all(promises);
    };

    // Processes a file upload
    const handleFileUpload = async (file: File): Promise<void> => {
        const fullFile = file as ExtendedFile;
        const fullPath = decodedPrefix + fullFile.path.replace(/^\//, ''); // remove leading slash in case of folder upload

        if (uploadPercentages[fullPath]) { // File already in upload progress, skipping
            return;
        }

        const fileSize = fullFile.size;

        const formData = new FormData();
        formData.append('file', file);

        // Upload to S3 progress feedback
        const eventSource = new EventSource(`${config.backend_api_url}/objects/upload-progress/${btoa(fullPath)}`);
        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.loaded !== 0 && data.status === 'uploading') {
                updateS3Progress(fullPath, Math.round((data.loaded / fileSize) * 100), data.status);
            }
            if (data.status === 'completed') {
                updateS3Progress(fullPath, 100, data.status);
                setUploadedFiles((prevUploadedFiles) => {
                    const fileExists = prevUploadedFiles.some(file =>
                        file.path === fullFile.path && file.loadResult === 'success'
                    );
                    if (!fileExists) {
                        return [
                            ...prevUploadedFiles,
                            { fileName: fullFile.name, loadResult: 'success', path: fullFile.path }
                        ];
                    }
                    return prevUploadedFiles;
                });
                refreshObjects(bucketName, prefix, setDecodedPrefix, setS3Objects, setS3Prefixes);
                eventSource.close();
            }
        }

        await axios.post(`${config.backend_api_url}/objects/upload/${bucketName}/${btoa(fullPath)}`, formData, {
            headers: {
                'Content-Type': 'multipart/form-data'
            },
            onUploadProgress: (progressEvent) => {
                updateProgress(fullPath, Math.round((progressEvent.loaded / fileSize) * 100));
            }
        })
            .catch(error => {
                console.error('Error uploading file', error);
                Emitter.emit('notification', { variant: 'warning', title: 'File upload failed', description: String(error) });
                setUploadedFiles((prevUploadedFiles) => [
                    ...prevUploadedFiles,
                    { loadError: error, fileName: fullFile.name, loadResult: 'danger', path: fullPath }
                ]);
            });
    };

    // add helper text to a status item showing any error encountered during the file reading process
    const createHelperText = (file: File) => {
        const fullFile = file as ExtendedFile;
        const fileResult = uploadedFiles.find((uploadedFile) => uploadedFile.path === fullFile.path);
        if (fileResult?.loadError) {
            return (
                <HelperText isLiveRegion>
                    <HelperTextItem variant={'error'}>{fileResult.loadError.toString()}</HelperTextItem>
                </HelperText>
            );
        }
        return null; // Explicitly return null when there's no error
    };

    const [successfullyUploadedFileCount, setSuccessfullyUploadedFileCount] = React.useState(0);

    React.useEffect(() => {
        const successCount = uploadedFiles.filter((uploadedFile) => uploadedFile.loadResult === 'success').length;
        setSuccessfullyUploadedFileCount(successCount);
    }, [uploadedFiles]);

    /*
      File deletion
    */
    const [isDeleteFileModalOpen, setIsDeleteFileModalOpen] = React.useState(false);
    const [selectedFile, setSelectedFile] = React.useState('');
    const [fileToDelete, setFileToDelete] = React.useState('');

    const handleDeleteFileModalToggle = (_event: KeyboardEvent | React.MouseEvent) => {
        setIsDeleteFileModalOpen(!isDeleteFileModalOpen);
    }

    const handleDeleteFileClick = (key: string) => (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
        setSelectedFile(key);
        handleDeleteFileModalToggle(event);
    }

    const validateFileToDelete = (): boolean => {
        if (fileToDelete !== selectedFile.split('/').pop()) {
            return false;
        } else {
            return true;
        }
    }

    const handleDeleteFileConfirm = () => {
        if (!validateFileToDelete()) {
            console.log('Invalid file to delete');
            return;
        } else {
            deleteFile(bucketName, decodedPrefix, selectedFile, history, setFileToDelete, setIsDeleteFileModalOpen);
        }
    }

    const handleDeleteFileCancel = () => {
        setFileToDelete('');
        setIsDeleteFileModalOpen(false);
    }

    /*
      Folder creation
    */
    const [newFolderName, setNewFolderName] = React.useState('');
    const [newFolderNameRulesVisibility, setNewFolderNameRulesVisibility] = React.useState(false);

    const [isCreateFolderModalOpen, setIsCreateFolderModalOpen] = React.useState(false);
    const handleCreateFolderModalToggle = (_event: KeyboardEvent | React.MouseEvent) => {
        setIsCreateFolderModalOpen(!isCreateFolderModalOpen);
    }

    const validateFolderName = (folderName: string): boolean => {
        if (folderName === '') {
            return false;
        }
        const validCharacters = /^[b-zA-Z0-9!.\-_*'()]+$/;
        if (!validCharacters.test(folderName)) {
            return false;
        }
        return true;
    }

    React.useEffect(() => {
        if (newFolderName.length > 0) {
            setNewFolderNameRulesVisibility(!validateFolderName(newFolderName));
        } else {
            setNewFolderNameRulesVisibility(false);
        }
    }, [newFolderName]);

    const handleNewFolderCreate = () => {
        if (!validateFolderName(newFolderName)) {
            alert('Invalid folder name');
            return;
        } else {
            createFolder(bucketName, decodedPrefix, newFolderName, history, setNewFolderName);
            setNewFolderName('');
            setIsCreateFolderModalOpen(false);
        }
    }

    const handleNewFolderCancel = () => {
        setNewFolderName('');
        setIsCreateFolderModalOpen(false);
    }

    // Import HF model handling
    const [modelName, setModelName] = React.useState('');
    const [isImportModelModalOpen, setIsImportModelModalOpen] = React.useState(false);
    const [modelFiles, setModelFiles] = React.useState<string[]>([]);
    const handleImportModelModalToggle = (_event: KeyboardEvent | React.MouseEvent) => {
        setIsImportModelModalOpen(!isImportModelModalOpen);
    }

    const handleImportModelCancel = (_event: React.MouseEvent) => {
        setIsImportModelModalOpen(false);
        setModelName('');
    }

    interface DataValue {
        loaded: number;
        status: string;
        total: number;
    }

    const handleImportModelConfirm = (_event: React.MouseEvent) => {
        const eventSource = new EventSource(`${config.backend_api_url}/objects/import-model-progress`);
        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (modelFiles.length === 0) {
                setModelFiles(Object.keys(data));
            }
            Object.entries(data).forEach(([name, value]) => {
                const { loaded, status, total } = value as DataValue;
                console.log(`Name: ${name}, Loaded: ${loaded}, Status: ${status}`);
                updateS3Progress(name, Math.round((loaded / total) * 100), status);
            });
            const allCompleted = Object.entries(data).every(([_, value]) => {
                const { status } = value as DataValue;
                return status === 'completed';
            });

            if (allCompleted) {
                eventSource.close();
            }
        }

        axios.get(`${config.backend_api_url}/objects/hf-import/${bucketName}/${btoa(decodedPrefix)}/${btoa(modelName)}`)
            .then(response => {
                Emitter.emit('notification', { variant: 'success', title: 'Model imported', description: 'Model "' + modelName + '" has been successfully imported.' });
                setModelName('');
                setModelFiles([]);
                setUploadToS3Percentages({});
                setIsImportModelModalOpen(false);
                history.push(`/objects/${bucketName}/${btoa(decodedPrefix)}`);
            })
            .catch(error => {
                console.error('Error cloning model', error);
                Emitter.emit('notification', { variant: 'warning', title: 'Model importing failed', description: String(error) });
                setModelName('');
                setIsImportModelModalOpen(false);
            });
    }
    return (
        <Page className='buckets-list'>
            <PageSection>
                <TextContent>
                    <Text component={TextVariants.h1}>Objects</Text>
                </TextContent>
            </PageSection>
            <PageSection>
                <Flex>
                    <FlexItem>
                        <Text component={TextVariants.h4}>
                            Browsing objects in bucket:
                        </Text>
                    </FlexItem>
                    <FlexItem>
                        <FormSelect className='bucket-select' value={formSelectBucket}
                            aria-label="FormSelect Input"
                            ouiaId="BasicFormSelect"
                            onChange={handleBucketChange}>
                            {bucketsList?.buckets.map(bucket => (
                                <FormSelectOption key={bucket.Name} value={bucket.Name} label={bucket.Name} />
                            ))}
                        </FormSelect>
                    </FlexItem>
                </Flex>
            </PageSection>
            <PageSection>
                <Flex direction={{ default: 'column' }}>
                    <FlexItem>
                        <Flex>
                            <FlexItem>
                                <Breadcrumb ouiaId="PrefixBreadcrumb">
                                    <BreadcrumbItem
                                        to={`/objects/${bucketName}`}>
                                        <Button variant="link"
                                            className='breadcrumb-button'
                                            onClick={handlePrefixClick('')}
                                        >
                                            {bucketName}
                                        </Button>
                                    </BreadcrumbItem>
                                    {decodedPrefix.slice(0, -1).split('/').map((part, index) => (
                                        <BreadcrumbItem
                                            key={index}
                                        >
                                            <Button variant="link"
                                                className='breadcrumb-button'
                                                onClick={handlePrefixClick(decodedPrefix.slice(0, -1).split('/').slice(0, index + 1).join('/') + '/')}
                                                isDisabled={index === decodedPrefix.slice(0, -1).split('/').length - 1}
                                            >
                                                {part}
                                            </Button>
                                        </BreadcrumbItem>
                                    ))
                                    }
                                </Breadcrumb>
                            </FlexItem>
                            <FlexItem>
                                <Button variant="secondary" onClick={copyPrefixToClipboard} className='copy-path-button' ouiaId="CopyPath">
                                    Copy Path
                                </Button>
                            </FlexItem>
                        </Flex>


                    </FlexItem>
                    <FlexItem>
                        <Flex>
                            <FlexItem>
                                <TextInput
                                    value={searchObjectText}
                                    type="search"
                                    onChange={(_event, searchText) => setSearchObjectText(searchText)}
                                    aria-label="search text input"
                                    placeholder="Filter objects..."
                                    customIcon={<SearchIcon />}
                                    className='buckets-list-filter-search'
                                />
                            </FlexItem>
                            <FlexItem align={{ default: 'alignRight' }}>
                                <Flex>
                                    <FlexItem className='file-folder-buttons'>
                                        <Button variant="primary" onClick={handleCreateFolderModalToggle} ouiaId="ShowCreateFolderModal">
                                            Create Folder</Button>
                                    </FlexItem>
                                    <FlexItem className='file-folder-buttons'>
                                        <Button variant="primary" onClick={handleUploadSingleFileModalToggle} ouiaId="ShowUploadSingleFileModal">
                                            Upload Single File</Button>
                                    </FlexItem>
                                    <FlexItem className='file-folder-buttons'>
                                        <Button variant="primary" onClick={handleUploadFilesModalToggle} ouiaId="ShowUploadMultipleFileModal">
                                            Upload Multiple Files</Button>
                                    </FlexItem>
                                    <FlexItem className='file-folder-buttons'>
                                        <Button variant="primary" onClick={handleImportModelModalToggle} icon={<img className='button-logo' src={HfLogo} alt="HuggingFace Logo" />} ouiaId="ShowImportHFModal">
                                            Import HF Model</Button>
                                    </FlexItem>
                                </Flex>
                            </FlexItem>
                        </Flex>
                    </FlexItem>
                    <FlexItem>
                        <Card component="div">
                            <Table aria-label="Buckets list" isStickyHeader>
                                <Thead>
                                    <Tr>
                                        <Th width={30}>{columnNames.key}</Th>
                                        <Th width={10}>{columnNames.lastModified}</Th>
                                        <Th width={10}>{columnNames.size}</Th>
                                        <Th width={10}>&nbsp;</Th>
                                    </Tr>
                                </Thead>
                                <Tbody>
                                    {filteredPrefixRows.map((row, rowIndex) => (
                                        <Tr key={rowIndex} className='bucket-row'>
                                            <Td className='bucket-column'>
                                                <Button variant="link" onClick={handlePrefixClick(row.prefix)} className='button-folder-link'>
                                                    <FontAwesomeIcon icon={faFolder} className='folder-icon' />
                                                    {row.prefix.slice(0, -1).split('/').pop()}
                                                </Button>
                                            </Td>
                                            <Td className='bucket-column'></Td>
                                            <Td className='bucket-column'></Td>
                                            <Td className='bucket-column align-right'></Td>
                                        </Tr>
                                    ))}
                                </Tbody>
                                <Tbody>
                                    {filteredRows.map((row, rowIndex) => (
                                        <Tr key={rowIndex} className='bucket-row'>
                                            <Td className='bucket-column'>
                                                <FontAwesomeIcon icon={faFile} className='file-icon' />
                                                {row.key.split('/').pop()}
                                            </Td>
                                            <Td className='bucket-column'>{row.lastModified}</Td>
                                            <Td className='bucket-column'>{row.size}</Td>
                                            <Td className='bucket-column align-right'>
                                                <ToolbarContent>
                                                    <ToolbarGroup
                                                        variant="icon-button-group"
                                                        align={{ default: 'alignRight' }}
                                                        spacer={{ default: 'spacerMd', md: 'spacerMd' }}
                                                    >
                                                        <ToolbarItem spacer={{ default: 'spacerLg' }}>
                                                            <Tooltip content={<div>View this file.</div>}>
                                                                <Button variant="primary" className='button-file-control'
                                                                    isDisabled={!validateFileView(row.key.split('/').pop() || '', row.originalSize)}
                                                                    onClick={handleObjectViewClick(row.key)}>
                                                                    <FontAwesomeIcon icon={faEye} />
                                                                </Button>
                                                            </Tooltip>
                                                        </ToolbarItem>
                                                        <ToolbarItem spacer={{ default: 'spacerLg' }}>
                                                            <Tooltip content={<div>Download this file.</div>}>
                                                                <Button component="a" variant="primary" className='button-file-control'
                                                                    download={row.key.split('/').pop()}
                                                                    href={`${config.backend_api_url}/objects/download/${bucketName}/${btoa(row.key)}`}>
                                                                    <FontAwesomeIcon icon={faDownload} />
                                                                </Button>
                                                            </Tooltip>
                                                        </ToolbarItem>
                                                        <ToolbarItem variant='separator' />
                                                        <ToolbarItem>
                                                            <Tooltip content={<div>Delete this file.</div>}>
                                                                <Button variant="danger" className='button-file-control'
                                                                    onClick={handleDeleteFileClick(row.key)}>
                                                                    <FontAwesomeIcon icon={faTrash} />
                                                                </Button>
                                                            </Tooltip>
                                                        </ToolbarItem>
                                                    </ToolbarGroup>
                                                </ToolbarContent>
                                            </Td>
                                        </Tr>
                                    ))}
                                </Tbody>
                            </Table>

                        </Card>
                        <Flex direction={{ default: 'column' }} >
                            <FlexItem className='file-list-notes' align={{ default: 'alignRight' }}>
                                <Text component={TextVariants.small}>
                                    File viewer is only enabled for files smaller than 1MB and supported types.
                                </Text>
                            </FlexItem>
                            <FlexItem className='file-list-notes' align={{ default: 'alignRight' }}>
                                <Text component={TextVariants.small}>
                                    Deleting the last item in a folder will delete the folder.
                                </Text>
                            </FlexItem>
                            <FlexItem className='file-list-notes' align={{ default: 'alignRight' }}>
                                <Text component={TextVariants.small}>
                                    Download of large files may fail.
                                </Text>
                            </FlexItem>
                        </Flex>
                    </FlexItem>
                </Flex>
            </PageSection>
            <Modal
                title="File Preview"
                isOpen={isFileViewerOpen}
                onClose={handleFileViewerToggle}
                actions={[
                    <Button key="close" variant="primary" onClick={handleFileViewerToggle}>
                        Close
                    </Button>
                ]}
                ouiaId='file-viewer-modal'
                className='file-viewer-modal'
            >
                <DocumentRenderer fileData={fileData} fileName={fileName} />
            </Modal>
            <Modal
                title={"Delete file?"}
                titleIconVariant="warning"
                className="bucket-modal"
                isOpen={isDeleteFileModalOpen}
                onClose={handleDeleteFileModalToggle}
                actions={[
                    <Button key="confirm" variant='danger' onClick={handleDeleteFileConfirm} isDisabled={!validateFileToDelete()}>
                        Delete file
                    </Button>,
                    <Button key="cancel" variant="secondary" onClick={handleDeleteFileCancel}>
                        Cancel
                    </Button>
                ]}
            >
                <TextContent>
                    <Text component={TextVariants.p}>
                        This action cannot be undone.
                    </Text>
                    <Text component={TextVariants.p}>
                        Type <strong>{selectedFile.split('/').pop()}</strong> to confirm deletion.
                    </Text>
                </TextContent>
                <TextInput
                    id="delete-modal-input"
                    aria-label="Delete modal input"
                    value={fileToDelete}
                    onChange={(_event, fileToDelete) => setFileToDelete(fileToDelete)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter' && validateFileToDelete()) {
                            handleDeleteFileConfirm();
                        }
                    }}
                />
            </Modal>
            <Modal
                title="Create a new folder"
                className="bucket-modal"
                isOpen={isCreateFolderModalOpen}
                onClose={handleCreateFolderModalToggle}
                actions={[
                    <Button key="create" variant="primary" onClick={handleNewFolderCreate} isDisabled={(newFolderName.length < 1) || newFolderNameRulesVisibility}>
                        Create
                    </Button>,
                    <Button key="cancel" variant="link" onClick={handleNewFolderCancel}>
                        Cancel
                    </Button>
                ]}
                ouiaId="CreateFolderModal"
            >
                <Form>
                    <FormGroup
                        label="Folder name"
                        isRequired
                        fieldId="folder-name"
                    >
                        <TextInput
                            isRequired
                            type="text"
                            id="folder-name"
                            name="folder-name"
                            aria-describedby="folder-name-helper"
                            placeholder='Enter at least 1 character'
                            value={newFolderName}
                            onChange={(_event, newFolderName) => setNewFolderName(newFolderName)}
                        />
                    </FormGroup>
                </Form>
                <TextContent hidden={!newFolderNameRulesVisibility}>
                    <Text component={TextVariants.small} className="bucket-name-rules">
                        Folder names must:
                        <ul>
                            <li>be unique,</li>
                            <li>only contain lowercase letters, numbers and hyphens,</li>
                        </ul>
                    </Text>
                </TextContent>
            </Modal>
            <Modal
                title="Import a model from Hugging Face"
                className="bucket-modal"
                isOpen={isImportModelModalOpen}
                onClose={handleImportModelModalToggle}
                actions={[
                    <Button key="import" variant="primary" onClick={handleImportModelConfirm} isDisabled={(modelName.length < 1)}>
                        Import
                    </Button>,
                    <Button key="cancel" variant="link" onClick={handleImportModelCancel}>
                        Cancel
                    </Button>
                ]}
                ouiaId="ImportModelModal"
            >
                <Form>
                    <FormGroup
                        label="Model name"
                        isRequired
                        fieldId="model-name"
                    >
                        <TextInput
                            isRequired
                            type="text"
                            id="model-name"
                            name="model-name"
                            aria-describedby="model-name-helper"
                            placeholder='ibm-granite/granite-3b-code-instruct'
                            value={modelName}
                            onChange={(_event, modelName) => setModelName(modelName)}
                        />
                    </FormGroup>
                </Form>
                <Flex direction={{ default: 'column' }} className='upload-bars'>
                    {modelFiles.map((file) => (
                        <FlexItem key={file}>
                            <Progress
                                value={uploadToS3Percentages[file]?.loaded ?? 0}
                                title={file + ' - ' + uploadToS3Percentages[file]?.status ?? ''}
                                measureLocation='outside'
                                variant={uploadToS3Percentages[file]?.status === 'completed' ? 'success' : undefined}
                                size={ProgressSize.sm} />
                        </FlexItem>
                    ))}
                </Flex>
            </Modal>
            <Modal
                title={"Upload file"}
                className="bucket-modal"
                isOpen={isUploadSingleFileModalOpen}
                onClose={handleUploadSingleFileModalToggle}
                actions={[
                    <Button key="confirm" variant="primary" onClick={handleUploadFileConfirm} isDisabled={singleFilename === ""}>
                        Upload
                    </Button>,
                    <Button key="cancel" variant="link" onClick={handleUploadFileCancel}>
                        Cancel
                    </Button>
                ]}
            >
                <FileUpload
                    id="simple-file"
                    value={singleFileUploadValue}
                    filename={singleFilename}
                    filenamePlaceholder="Drag and drop a file or upload one"
                    onFileInputChange={handleFileInputChange}
                    onClearClick={handleClear}
                    browseButtonText="Browse"
                />
                <Flex direction={{ default: 'column' }} className='upload-bars'>
                    <FlexItem hidden={!(uploadPercentages[singleFilename] && uploadPercentages[singleFilename].loaded !== 0)}>
                        <Progress value={uploadPercentages[singleFilename]?.loaded ?? 0} title="Upload to backend progress" size={ProgressSize.sm} />
                    </FlexItem>
                    <FlexItem hidden={!(uploadToS3Percentages[singleFilename] && uploadToS3Percentages[singleFilename].loaded !== 0)}>
                        <Progress value={uploadToS3Percentages[singleFilename]?.loaded ?? 0} title="Upload to S3 progress" size={ProgressSize.sm} />
                    </FlexItem>
                </Flex>
            </Modal>
            <Modal
                title="Upload multiple files"
                className="bucket-modal"
                isOpen={isUploadFilesModalOpen}
                actions={[
                    <Button key="close" variant="primary" onClick={handleUploadFilesClose}>
                        Close
                    </Button>
                ]}
            >
                <MultipleFileUpload
                    onFileDrop={handleFileDrop}
                    isHorizontal={false}
                >
                    <MultipleFileUploadMain
                        titleIcon={<UploadIcon />}
                        titleText="Drag and drop files here or click on the button to select files and folders."
                    />
                    {showStatus && (
                        <MultipleFileUploadStatus
                            statusToggleText={`${successfullyUploadedFileCount} of ${currentFiles.length} files uploaded`}
                            statusToggleIcon={statusIcon}
                            aria-label="Current uploads"
                        >
                            {currentFiles.map((file) => (
                                <MultipleFileUploadStatusItem
                                    file={file}
                                    key={file.path}
                                    fileName={file.path + ' - ' + uploadToS3Percentages[decodedPrefix + file.path.replace(/^\//, '')]?.status ?? ''}
                                    onClearClick={() => removeFiles([file.path])}
                                    progressHelperText={createHelperText(file)}
                                    customFileHandler={() => { ; }}
                                    progressValue={uploadToS3Percentages[decodedPrefix + file.path.replace(/^\//, '')]?.loaded ?? 0}
                                    progressVariant={uploadToS3Percentages[decodedPrefix + file.path.replace(/^\//, '')]?.status === 'completed' ? 'success' : undefined}
                                />
                            ))}
                        </MultipleFileUploadStatus>
                    )}
                </MultipleFileUpload>
            </Modal>
        </Page>
    );
};

export default ObjectBrowser;