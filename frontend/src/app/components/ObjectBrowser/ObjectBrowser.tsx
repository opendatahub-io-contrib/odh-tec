import config from '@app/config';
import { faDownload, faEye, faFile, faFolder, faTrash } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    Breadcrumb,
    BreadcrumbItem,
    Button,
    Card,
    DropEvent,
    FileUpload,
    Flex,
    FlexItem,
    Form,
    FormGroup,
    FormSelect,
    FormSelectOption,
    HelperText,
    HelperTextItem,
    MultipleFileUpload,
    MultipleFileUploadMain,
    MultipleFileUploadStatus,
    MultipleFileUploadStatusItem,
    Page,
    PageSection,
    Progress,
    ProgressSize,
    Content,
    TextInput,
    ContentVariants,
    ToolbarContent,
    ToolbarGroup,
    ToolbarItem,
    Tooltip
} from '@patternfly/react-core';
import {
    Modal
} from '@patternfly/react-core/deprecated';
import { SearchIcon } from '@patternfly/react-icons';
import UploadIcon from '@patternfly/react-icons/dist/esm/icons/upload-icon';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import axios from 'axios';
import * as React from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import Emitter from '../../utils/emitter';
import DocumentRenderer from '../DocumentRenderer/DocumentRenderer';
import { createFolder, deleteFolder, deleteFile, loadBuckets, refreshObjects } from './objectBrowserFunctions';
import { BucketsList, ObjectRow, PrefixRow, UploadedFile, S3Objects, S3Prefixes, ExtendedFile } from './objectBrowserTypes';
import HfLogo from '@app/assets/bgimages/hf-logo.svg';
import pLimit from 'p-limit';

interface ObjectBrowserProps { }

const ObjectBrowser: React.FC<ObjectBrowserProps> = () => {

    /*
      Common variables
    */

    // React hooks
    const navigate = useNavigate();
    const location = useLocation();
    const abortUploadController = React.useRef<AbortController | null>(null);

    // EventSource refs for proper cleanup
    const singleFileEventSource = React.useRef<EventSource | null>(null);
    const modelImportEventSource = React.useRef<EventSource | null>(null);
    const multiFileEventSources = React.useRef<Map<string, EventSource>>(new Map());

    // Cleanup EventSources on component unmount
    React.useEffect(() => {
        return () => {
            // Close single file upload EventSource if open
            if (singleFileEventSource.current) {
                singleFileEventSource.current.close();
                singleFileEventSource.current = null;
            }
            // Close model import EventSource if open
            if (modelImportEventSource.current) {
                modelImportEventSource.current.close();
                modelImportEventSource.current = null;
            }
            // Close all multi-file EventSources
            multiFileEventSources.current.forEach((eventSource) => {
                eventSource.close();
            });
            multiFileEventSources.current.clear();
        };
    }, []);

    // Limit the number of concurrent file uploads or transfers
    const [maxConcurrentTransfers, setMaxConcurrentTransfers] = React.useState(2);

    React.useEffect(() => {
        axios.get(`${config.backend_api_url}/settings/max-concurrent-transfers`)
            .then(response => {
                const { maxConcurrentTransfers } = response.data;
                if (maxConcurrentTransfers !== undefined) {
                    setMaxConcurrentTransfers(maxConcurrentTransfers);
                }
            })
            .catch(error => {
                console.error(error);
                Emitter.emit('notification', { variant: 'warning', title: error.response?.data?.error || 'Error Fetching Settings', description: error.response?.data?.message || 'Failed to fetch max concurrent transfers setting.' });
            });
    }, []);

    // URL parameters
    const { bucketName } = useParams<{ bucketName: string }>();
    const { prefix } = useParams<{ prefix: string }>();

    // Buckets handling
    const [bucketsList, setBucketsList] = React.useState<BucketsList | null>(null);
    const [formSelectBucket, setFormSelectBucket] = React.useState(bucketName);
    const [textInputBucket, setTextInputBucket] = React.useState(bucketName === ":bucketName" ? "" : bucketName);

    // Insert server search states early to avoid use-before-declaration
    const [searchObjectText, setSearchObjectText] = React.useState('');
    const [searchMode, setSearchMode] = React.useState<'startsWith' | 'contains'>('contains');
    const [filterMeta, setFilterMeta] = React.useState<any | null>(null);
    const serverSearchActive = searchObjectText.length >= 3;

    // Component-specific abort controller
    const abortControllerRef = React.useRef<AbortController | null>(null);

    React.useEffect(() => {
        return () => {
            // Cleanup: abort any pending requests
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, []);

    // Load buckets at startup and when location changes
    React.useEffect(() => {
        if (bucketName) {
            loadBuckets(bucketName, navigate, (updatedBucketsList) => {
                setBucketsList(updatedBucketsList);
                if (bucketName === ':bucketName') {
                    setFormSelectBucket(updatedBucketsList?.buckets[0]?.Name || '');
                    setTextInputBucket(updatedBucketsList?.buckets[0]?.Name || '');
                } else {
                    setFormSelectBucket(bucketName);
                    setTextInputBucket(bucketName);
                }
            });
        }
    }, [location]);

    // Refresh objects from the bucket when location changes
    React.useEffect(() => {
        if (bucketName) {
            // Abort previous request
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
            abortControllerRef.current = new AbortController();

            setNextContinuationToken(null);
            setIsTruncated(false);
            setFilterMeta(null);
            setS3Objects(null);
            setS3Prefixes(null);            if (serverSearchActive) {
                refreshObjects(bucketName, prefix || '', setDecodedPrefix, setS3Objects, setS3Prefixes, setNextContinuationToken, setIsTruncated, undefined, false, { q: searchObjectText, mode: searchMode }, setFilterMeta, abortControllerRef.current || undefined);
            } else {
                refreshObjects(bucketName, prefix || '', setDecodedPrefix, setS3Objects, setS3Prefixes, setNextContinuationToken, setIsTruncated, undefined, false, undefined, undefined, abortControllerRef.current || undefined);
            }
            setFormSelectBucket(bucketName);
            if (bucketName === ':bucketName') { setTextInputBucket(''); } else { setTextInputBucket(bucketName); }
        }
    }, [location, prefix, searchObjectText, searchMode]);    // Handle bucket change in the dropdown
    const handleBucketSelectorChange = (_event: React.FormEvent<HTMLSelectElement>, value: string) => {
        setFormSelectBucket(value);
        setTextInputBucket(value);
        setSearchObjectText(''); // Clear search field when switching buckets
        navigate(`/objects/${value}`);
    }

    const handleBucketTextInputSend = (_event: React.MouseEvent<HTMLButtonElement>) => {
        setSearchObjectText(''); // Clear search field when navigating to different bucket
        navigate(`/objects/${textInputBucket}`);
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
    // Pagination state
    const [decodedPrefix, setDecodedPrefix] = React.useState(''); // The decoded prefix (aka full "folder" path)
    const [s3Objects, setS3Objects] = React.useState<S3Objects | null>(null); // The list of objects with the selected prefix ("folder")
    const [s3Prefixes, setS3Prefixes] = React.useState<S3Prefixes | null>(null); // The list of prefixes ("subfolders") in the current prefix
    const [nextContinuationToken, setNextContinuationToken] = React.useState<string | null>(null);
    const [isTruncated, setIsTruncated] = React.useState<boolean>(false);
    const [isLoadingMore, setIsLoadingMore] = React.useState<boolean>(false);
    // Deep search (auto-pagination) state (disabled when serverSearchActive)
    const [deepSearchActive, setDeepSearchActive] = React.useState<boolean>(false);
    const [deepSearchPagesScanned, setDeepSearchPagesScanned] = React.useState<number>(0);
    const [deepSearchCancelled, setDeepSearchCancelled] = React.useState<boolean>(false);

    React.useEffect(() => {
        // On short searches (<3) just local filter; if we were previously server searching, reload unfiltered list.
        if (!bucketName) return;
        let cancelled = false;
        if (!serverSearchActive) {
            if (filterMeta) {
                // We were in server mode, need to reset to baseline listing
                setFilterMeta(null);
                setNextContinuationToken(null);
                setIsTruncated(false);                refreshObjects(
                    bucketName,
                    prefix || '',
                    setDecodedPrefix,
                    setS3Objects,
                    setS3Prefixes,
                    setNextContinuationToken,
                    setIsTruncated,                    undefined,
                    false,
                    undefined,
                    undefined,
                    abortControllerRef.current || undefined
                );
            }
            return;
        }
        // For server searches: debounce input
        const handle = setTimeout(() => {
            if (cancelled) return;
            // Reset pagination & existing results, then fetch filtered first page
            setNextContinuationToken(null);
            setIsTruncated(false);
            setS3Objects(null);
            setS3Prefixes(null);
            setFilterMeta(null);            refreshObjects(
                bucketName,
                prefix || '',
                setDecodedPrefix,
                setS3Objects,
                setS3Prefixes,
                setNextContinuationToken,
                setIsTruncated,
                undefined,                false,
                { q: searchObjectText, mode: searchMode },
                setFilterMeta,
                abortControllerRef.current || undefined
            );
        }, 400);        return () => { cancelled = true; clearTimeout(handle); };    }, [searchObjectText, searchMode]);

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
        return false;    });    // Auto-trigger deep search for client-side searches when no matches found
    React.useEffect(() => {
        if (!bucketName || deepSearchActive) return;
        if (searchObjectText.length === 0) return; // No search active
        if (!isTruncated || !nextContinuationToken) return; // No more pages

        // Check if we have any matches in current data
        const hasMatches = (filteredRows.length + filteredPrefixRows.length) > 0;
        if (hasMatches) return; // Already have matches

        // For server search, check if we need to auto-load more pages
        // This handles cases where server search returns empty first page but might have results later
        if (serverSearchActive) {
            // For server search with no results, auto-trigger loading more pages after a delay
            const timer = setTimeout(() => {
                if (isTruncated && nextContinuationToken && !isLoadingMore) {
                    handleLoadMore();
                }
            }, 1500); // Slightly longer delay for server search

            return () => clearTimeout(timer);
        } else {
            // For client-side search, trigger deep search as before
            const timer = setTimeout(() => {
                initiateDeepSearch();
            }, 1000);

            return () => clearTimeout(timer);
        }
    }, [searchObjectText, filteredRows.length, filteredPrefixRows.length, isTruncated, nextContinuationToken, serverSearchActive, deepSearchActive, bucketName, isLoadingMore]);

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
    }    // Navigate when clicking on a prefix
    const handlePrefixClick = (plainTextPrefix: string) => (event: React.MouseEvent<HTMLButtonElement>) => {
        setS3Objects(null);
        setS3Prefixes(null);
        setDecodedPrefix(plainTextPrefix);
        setNextContinuationToken(null);
        setIsTruncated(false);
        setSearchObjectText(''); // Clear search field when navigating to folder
        navigate(plainTextPrefix !== '' ? `/objects/${bucketName}/${btoa(plainTextPrefix)}` : `/objects/${bucketName}`);
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
                Emitter.emit('notification', { variant: 'warning', title: error.response?.data?.error || 'Error Viewing File', description: error.response?.data?.message || 'Failed to retrieve the object content.' });
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

    // Utility function for consistent progress key generation
    const generateProgressKey = (prefix: string, filename: string): string => {
        const cleanPrefix = prefix.endsWith('/') ? prefix : (prefix ? prefix + '/' : '');
        const cleanFilename = filename.replace(/^[\/\\]+/, ''); // Remove leading slashes
        return cleanPrefix + cleanFilename;
    };

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
                Emitter.emit('notification', { variant: 'warning', title: error.response?.data?.error || 'Error Aborting Upload', description: error.response?.data?.message || 'Failed to abort the upload process.' });
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
        formData.append('file', singleFileUploadValue);        // Close previous EventSource if exists
        if (singleFileEventSource.current) {
            singleFileEventSource.current.close();
        }

        // Upload to S3 progress feedback
        singleFileEventSource.current = new EventSource(`${config.backend_api_url}/objects/upload-progress/${btoa(decodedPrefix + singleFilename)}`);
        singleFileEventSource.current.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.loaded !== 0 && data.status === 'uploading') {
                updateS3Progress(singleFilename, Math.round((data.loaded / fileSize) * 100));
            }
            if (data.status === 'completed') {
                console.log('Upload to S3 completed');
                if (singleFileEventSource.current) {
                    singleFileEventSource.current.close();
                    singleFileEventSource.current = null;
                }
                delete uploadToS3Percentages[singleFilename];
            }
        };

        singleFileEventSource.current.onerror = () => {
            if (singleFileEventSource.current) {
                singleFileEventSource.current.close();
                singleFileEventSource.current = null;
            }
        };

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
                refreshObjects(bucketName!, prefix!, setDecodedPrefix, setS3Objects, setS3Prefixes, setNextContinuationToken, setIsTruncated, undefined, false, undefined, undefined, abortControllerRef.current || undefined);

            })
            .catch(error => {
                console.error('Error uploading file', error);
                Emitter.emit('notification', { variant: 'warning', title: error.response?.data?.error || 'File Upload Failed', description: error.response?.data?.message || String(error) });
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
        // Cast to ExtendedFile type and process paths to remove eventual leading "./"
        const fullDroppedFiles: ExtendedFile[] = droppedFiles.map(originalFile => {
            // 1. Determine the path for the file.
            // Prefer webkitRelativePath for dropped folders, then an existing .path, fallback to file.name.
            let pathValue: string;
            const webkitPath = (originalFile as any).webkitRelativePath;
            const directPath = (originalFile as any).path;

            if (typeof webkitPath === 'string' && webkitPath.trim() !== '') {
                pathValue = webkitPath;
            } else if (typeof directPath === 'string' && directPath.trim() !== '') {
                pathValue = directPath;
            } else {
                pathValue = originalFile.name;
            }

            // Process the path remove leading "./"
            let processedPath = pathValue.startsWith('./') ? pathValue.substring(2) : pathValue;
            if (!processedPath && originalFile.name) { // Ensure path is not empty
                processedPath = originalFile.name;
            }


            // 2. Create a new File object from the original file's content and metadata.
            // This ensures it's a proper File instance that FormData can handle.
            const newFileInstance = new File(
                [originalFile], // The content of the new file is the original file itself
                originalFile.name, // Use the original file's name for the File object's name property
                {
                    type: originalFile.type,
                    lastModified: originalFile.lastModified,
                }
            );

            // 3. Cast the new File instance to ExtendedFile and add custom properties.
            const extendedFile = newFileInstance as ExtendedFile;

            // Define 'path' as an own, writable property on the new File instance.
            Object.defineProperty(extendedFile, 'path', {
                value: processedPath, // Store the processed path here
                writable: true,
                enumerable: true,
                configurable: true
            });

            // Add other custom properties
            extendedFile.uploadProgress = 0;
            extendedFile.uploadS3Progress = 0;

            return extendedFile;
        });
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
        const fullPath = decodedPrefix + fullFile.path.replace(/^\//, '').replace(/^\.\//, ''); // remove leading slash in case of folder upload or ./ in case of files

        if (uploadPercentages[fullPath]) { // File already in upload progress, skipping
            return;
        }

        const fileSize = fullFile.size;

        const formData = new FormData();
        formData.append('file', file);        // Upload to S3 progress feedback
        const eventSource = new EventSource(`${config.backend_api_url}/objects/upload-progress/${btoa(fullPath)}`);
        multiFileEventSources.current.set(fullPath, eventSource);
        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.loaded !== 0 && data.status === 'uploading') {
                updateS3Progress(fullPath, Math.round((data.loaded / fileSize) * 100), data.status);
            }
            if (data.status === 'completed') {
                updateS3Progress(fullPath, 100, data.status);
                // Close and remove this specific EventSource
                eventSource.close();                multiFileEventSources.current.delete(fullPath);
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
                    return prevUploadedFiles;                });
                refreshObjects(bucketName!, prefix!, setDecodedPrefix, setS3Objects, setS3Prefixes, setNextContinuationToken, setIsTruncated, nextContinuationToken, true, undefined, undefined, abortControllerRef.current || undefined);
            }
        };

        eventSource.onerror = () => {
            eventSource.close();
            multiFileEventSources.current.delete(fullPath);
        };

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
                Emitter.emit('notification', { variant: 'warning', title: error.response?.data?.error || 'File Upload Failed', description: error.response?.data?.message || String(error) });
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
        }
        if (selectedFile) {
            deleteFile(bucketName!, decodedPrefix, selectedFile, navigate, setFileToDelete, setIsDeleteFileModalOpen);
        }
    }

    const handleDeleteFileCancel = () => {
        setFileToDelete('');
        setIsDeleteFileModalOpen(false);
    }

    /*
      Folder deletion
    */
    const [isDeleteFolderModalOpen, setIsDeleteFolderModalOpen] = React.useState(false);
    const [selectedFolder, setSelectedFolder] = React.useState('');
    const [folderToDelete, setFolderToDelete] = React.useState('');

    const handleDeleteFolderModalToggle = (_event: KeyboardEvent | React.MouseEvent) => {
        setIsDeleteFolderModalOpen(!isDeleteFolderModalOpen);
    }

    const handleDeleteFolderClick = (prefix: string) => (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
        setSelectedFolder(prefix);
        handleDeleteFolderModalToggle(event);
    }

    const validateFolderToDelete = (): boolean => {
        if (folderToDelete !== selectedFolder.slice(0, -1).split('/').pop()) {
            return false;
        } else {
            return true;
        }
    }

    const handleDeleteFolderConfirm = () => {
        if (!validateFolderToDelete()) {
            console.log('Invalid folder to delete');
            return;
        } else {
            deleteFolder(bucketName!, decodedPrefix, selectedFolder, navigate, setFolderToDelete, setIsDeleteFolderModalOpen);
        }
    }

    const handleDeleteFolderCancel = () => {
        setFolderToDelete('');
        setIsDeleteFolderModalOpen(false);
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
        const validCharacters = /^[a-zA-Z0-9!.\-_*'()]+$/;
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
            createFolder(bucketName!, decodedPrefix, newFolderName, navigate, setNewFolderName, setIsCreateFolderModalOpen);
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

    const handleImportModelClose = (_event: React.MouseEvent) => {
        setIsImportModelModalOpen(false);
        setModelName('');
    }

    interface DataValue {
        loaded?: number;
        status?: string;
        total?: number;
        error?: string;
        message?: string;
    }    const handleImportModelConfirm = (_event: React.MouseEvent) => {
        // Close previous EventSource if exists
        if (modelImportEventSource.current) {
            modelImportEventSource.current.close();
        }

        modelImportEventSource.current = new EventSource(`${config.backend_api_url}/objects/import-model-progress`);
        modelImportEventSource.current.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (modelFiles.length === 0) {
                setModelFiles(Object.keys(data));
            }
            Object.entries(data).forEach(([name, value]) => {
                const { loaded, status, total, error, message } = value as DataValue;
                if (error) {
                    Emitter.emit('notification', { variant: 'warning', title: 'Model file import error', description: `Error importing model file "${name}": ${error} - ${message}` });
                    return;
                } else {
                    console.log(`Name: ${name}, Loaded: ${loaded}, Status: ${status}`);
                    if (loaded !== undefined && total !== undefined) {
                        updateS3Progress(name, Math.round((loaded / total) * 100), status);
                    }
                }
            });
            const allCompleted = Object.entries(data).every(([_, value]) => {
                const { status } = value as DataValue;
                return status === 'completed';
            });

            if (allCompleted) {
                if (modelImportEventSource.current) {
                    modelImportEventSource.current.close();
                    modelImportEventSource.current = null;
                }
                Emitter.emit('notification', { variant: 'success', title: 'Model imported', description: 'Model "' + modelName + '" has been successfully imported.' });
                setModelName('');
                setModelFiles([]);
                setUploadToS3Percentages({});
                setIsImportModelModalOpen(false);
                navigate(`/objects/${bucketName}/${btoa(decodedPrefix)}`);
            }
        };

        modelImportEventSource.current.onerror = () => {
            if (modelImportEventSource.current) {
                modelImportEventSource.current.close();
                modelImportEventSource.current = null;
            }
        };

        const prefixToSend = btoa(decodedPrefix === '' ? 'there_is_no_prefix' : decodedPrefix); // We need to send something to respect the URL format
        axios.get(`${config.backend_api_url}/objects/hf-import/${bucketName}/${prefixToSend}/${btoa(modelName)}`)
            .then(response => {
                Emitter.emit('notification', { variant: 'success', title: 'Model import', description: 'Model "' + modelName + '" import has successfully started.' });
            })            .catch(error => {
                Emitter.emit('notification', { variant: 'warning', title: 'Model import failed', description: error.response.data.message });
                if (modelImportEventSource.current) {
                    modelImportEventSource.current.close();
                    modelImportEventSource.current = null;
                }
                setModelName('');
                setModelFiles([]);
                setUploadToS3Percentages({});
                setIsImportModelModalOpen(false);
            });
    }

    const handleLoadMore = () => {
        if (!isTruncated || !nextContinuationToken || isLoadingMore || deepSearchActive) return;
        setIsLoadingMore(true);        refreshObjects(
            bucketName!,
            prefix || '',
            setDecodedPrefix,
            setS3Objects,
            setS3Prefixes,
            setNextContinuationToken,
            setIsTruncated,
            nextContinuationToken,
            true,            serverSearchActive ? { q: searchObjectText, mode: searchMode } : undefined,
            serverSearchActive ? setFilterMeta : undefined,
            abortControllerRef.current || undefined
        )
            .then(() => { setIsLoadingMore(false); })
            .catch(() => { setIsLoadingMore(false); });
    };

    // Deep search: auto paginate until we find matches for current searchObjectText (or exhaust pages)
    const initiateDeepSearch = async () => {
        if (serverSearchActive) return; // server handled; disable client deep search
        if (deepSearchActive || !isTruncated || !nextContinuationToken) return;
        setDeepSearchActive(true);
        setDeepSearchPagesScanned(0);
        setDeepSearchCancelled(false);
        try {
            let pages = 0;
            // Loop while more pages and still no matches and not cancelled
            // Recompute filtered arrays after each append; rely on derived variables after state settles
            while (!deepSearchCancelled) {
                // Re-evaluate current matches
                const haveMatches = (filteredRows.length + filteredPrefixRows.length) > 0;
                if (haveMatches) break;                if (!isTruncated || !nextContinuationToken) break;
                await refreshObjects(bucketName!, prefix || '', setDecodedPrefix, setS3Objects, setS3Prefixes, setNextContinuationToken, setIsTruncated, nextContinuationToken, true, undefined, undefined, abortControllerRef.current || undefined);
                pages += 1;
                setDeepSearchPagesScanned(pages);
                // Yield to allow state/filteredRows to update
                await new Promise(r => setTimeout(r, 10));
            }
        } finally {
            setDeepSearchActive(false);
        }
    };

    const cancelDeepSearch = () => {
        setDeepSearchCancelled(true);
        setDeepSearchActive(false);
    };

    return (
        <div>
            <PageSection hasBodyWrapper={false}>
                <Content component={ContentVariants.h1}>S3 Objects Browser</Content>
            </PageSection>
            <PageSection hasBodyWrapper={false} isFilled={true} className='object-browser-page-section'>
                <Flex direction={{ default: 'row' }}>
                    <FlexItem>
                        <Flex>
                            <FlexItem>
                                <Content component={ContentVariants.p}>
                                    Bucket Selection:
                                </Content>
                            </FlexItem>
                            <FlexItem>
                                <FormSelect className='bucket-select' value={formSelectBucket}
                                    aria-label="FormSelect Input"
                                    ouiaId="BasicFormSelect"
                                    onChange={handleBucketSelectorChange}>
                                    {bucketsList?.buckets.map(bucket => (
                                        <FormSelectOption key={bucket.Name} value={bucket.Name} label={bucket.Name} />
                                    ))}
                                </FormSelect>
                            </FlexItem>
                        </Flex>
                    </FlexItem>
                    <FlexItem>
                        <Flex>
                            <FlexItem>
                                <Content component={ContentVariants.p}>
                                    Bucket override:
                                </Content>
                            </FlexItem>
                            <FlexItem>
                                <TextInput
                                    value={textInputBucket}
                                    onChange={(_event, textInputBucket) => setTextInputBucket(textInputBucket)}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter') {
                                            handleBucketTextInputSend(event as unknown as React.MouseEvent<HTMLButtonElement>);
                                        }
                                    }}
                                    type="search"
                                    aria-label="search text input"
                                    placeholder="Filter objects..."
                                    className='buckets-list-filter-search'
                                />
                            </FlexItem>
                            <FlexItem>
                                <Button variant="secondary" onClick={handleBucketTextInputSend} ouiaId="RefreshBucket">
                                    Set bucket
                                </Button>
                            </FlexItem>
                        </Flex>
                    </FlexItem>
                </Flex>
            </PageSection>
            <PageSection hasBodyWrapper={false} isFilled={true}>
                <Flex>
                    <FlexItem>
                        <Breadcrumb ouiaId="PrefixBreadcrumb">
                            <BreadcrumbItem
                                to={`/objects/${bucketName}`}>
                                <Button variant="link"
                                    className='breadcrumb-button'
                                    onClick={handlePrefixClick('')}
                                    aria-label='bucket-name'
                                >
                                    {bucketName === ':bucketName' ? bucketsList?.buckets?.[0]?.Name : bucketName}
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
                                        aria-label='folder-name'
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
            </PageSection>
            <PageSection hasBodyWrapper={false} isFilled={true}>
                <Flex direction={{ default: 'column' }}>
                    <FlexItem>
                        <Flex>
                            <FlexItem>
                                <TextInput
                                    value={searchObjectText}
                                    type="search"
                                    onChange={(_event, searchText) => setSearchObjectText(searchText)}
                                    aria-label="search text input"
                                    placeholder="Filter objects (min 3 chars to server search)…"
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
                                    <FlexItem className='file-folder-buttons'>
                                        <FormSelect
                                            value={searchMode}
                                            aria-label='Search mode'
                                            onChange={(_e, v) => setSearchMode(v as any)}
                                            isDisabled={!serverSearchActive}
                                            ouiaId='SearchModeSelect'
                                        >
                                            <FormSelectOption value='contains' label='Contains'/>
                                            <FormSelectOption value='startsWith' label='Starts with'/>
                                        </FormSelect>
                                    </FlexItem>
                                    {serverSearchActive && (
                                        <FlexItem className='file-folder-buttons'>
                                            <Button variant='secondary' onClick={() => { setSearchObjectText(''); }} ouiaId='ClearSearch'>Clear Search</Button>
                                        </FlexItem>
                                    )}
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
                                            <Td className='bucket-column align-right'>
                                                <ToolbarContent>
                                                    <ToolbarGroup
                                                        variant="action-group-plain"
                                                        align={{ default: "alignEnd" }}
                                                        gap={{ default: "gapMd", md: "gapMd" }}
                                                    >
                                                        <ToolbarItem>
                                                            <Tooltip content={<div>Delete this folder.</div>}>
                                                                <Button variant="danger" className='button-file-control'
                                                                    onClick={handleDeleteFolderClick(row.prefix)}>
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
                                                        variant="action-group-plain"
                                                        align={{ default: "alignEnd" }}
                                                        gap={{ default: "gapMd", md: "gapMd" }}
                                                    >
                                                        <ToolbarItem gap={{ default: "gapLg" }}>
                                                            <Tooltip content={<div>View this file.</div>}>
                                                                <Button variant="primary" className='button-file-control'
                                                                    isDisabled={!validateFileView(row.key.split('/').pop() || '', row.originalSize)}
                                                                    onClick={handleObjectViewClick(row.key)}>
                                                                    <FontAwesomeIcon icon={faEye} />
                                                                </Button>
                                                            </Tooltip>
                                                        </ToolbarItem>
                                                        <ToolbarItem gap={{ default: "gapLg" }}>
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
                            {isTruncated && nextContinuationToken && (
                                <Flex className='load-more-container' justifyContent={{ default: 'justifyContentCenter' }} style={{ marginTop: '8px', marginBottom: '8px' }}>
                                    <Button variant="secondary" onClick={handleLoadMore} isDisabled={isLoadingMore || deepSearchActive} ouiaId='LoadMoreObjects'>
                                        {isLoadingMore ? 'Loading…' : 'Load more'}
                                    </Button>
                                </Flex>
                            )}                            {/* Deep search helper UI disabled when server search active */}
                            { !serverSearchActive && !deepSearchActive && !isLoadingMore && isTruncated && nextContinuationToken && searchObjectText.length >= 1 && (filteredRows.length + filteredPrefixRows.length === 0) && (
                                <Flex justifyContent={{ default: 'justifyContentCenter' }} style={{ marginTop: '4px' }}>
                                    <Button variant="link" onClick={initiateDeepSearch} ouiaId='DeepSearchTrigger'>
                                        Search all remaining pages for "{searchObjectText}" (auto-load)
                                    </Button>
                                </Flex>
                            )}
                            { deepSearchActive && !serverSearchActive && (
                                <Flex justifyContent={{ default: 'justifyContentCenter' }} style={{ marginTop: '4px' }}>
                                    <Content component={ContentVariants.small}>
                                        Auto searching… scanned {deepSearchPagesScanned} additional page{deepSearchPagesScanned === 1 ? '' : 's'}.
                                    </Content>
                                    <Button variant='link' onClick={cancelDeepSearch} ouiaId='DeepSearchCancel'>Cancel</Button>
                                </Flex>
                            )}                            { serverSearchActive && filterMeta && filterMeta.partialResult && (
                                <Flex justifyContent={{ default: 'justifyContentCenter' }} style={{ marginTop: '4px' }}>
                                    <Content component={ContentVariants.small} aria-live='polite'>
                                        Showing first batch of matches for "{filterMeta.q}". Refine your search to narrow results.
                                    </Content>
                                </Flex>
                            )}
                            { serverSearchActive && isLoadingMore && isTruncated && nextContinuationToken && (filteredRows.length + filteredPrefixRows.length === 0) && (
                                <Flex justifyContent={{ default: 'justifyContentCenter' }} style={{ marginTop: '4px' }}>
                                    <Content component={ContentVariants.small} aria-live='polite'>
                                        Auto-loading more pages to find matches for "{searchObjectText}"...
                                    </Content>
                                </Flex>
                            )}
                        </Card>
                        <Flex direction={{ default: 'column' }} >
                            <FlexItem className='file-list-notes' align={{ default: 'alignRight' }}>
                                <Content component={ContentVariants.small}>
                                    File viewer is only enabled for files smaller than 1MB and supported types.
                                </Content>
                            </FlexItem>
                            <FlexItem className='file-list-notes' align={{ default: 'alignRight' }}>
                                <Content component={ContentVariants.small}>
                                    Deleting the last item in a folder will delete the folder.
                                </Content>
                            </FlexItem>
                            <FlexItem className='file-list-notes' align={{ default: 'alignRight' }}>
                                <Content component={ContentVariants.small}>
                                    Download of large files may fail.
                                </Content>
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
                <Content>
                    <Content component={ContentVariants.p}>
                        This action cannot be undone.
                    </Content>
                    <Content component={ContentVariants.p}>
                        Type <strong>{selectedFile.split('/').pop()}</strong> to confirm deletion.
                    </Content>
                </Content>
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
                title="Delete folder and all its content?"
                titleIconVariant="warning"
                className="bucket-modal"
                isOpen={isDeleteFolderModalOpen}
                onClose={handleDeleteFolderModalToggle}
                actions={[
                    <Button key="confirm" variant='danger' onClick={handleDeleteFolderConfirm}>
                        Delete folder
                    </Button>,
                    <Button key="cancel" variant="secondary" onClick={handleDeleteFolderCancel}>
                        Cancel
                    </Button>
                ]}
            >
                <Content>
                    <Content component={ContentVariants.p}>
                        This action cannot be undone.
                    </Content>
                    <Content component={ContentVariants.p}>
                        Type <strong>{selectedFolder.slice(0, -1).split('/').pop()}</strong> to confirm deletion.
                    </Content>
                </Content>
                <TextInput
                    id="delete-folder-modal-input"
                    aria-label="Delete folder modal input"
                    value={folderToDelete}
                    onChange={(_event, folderToDelete) => setFolderToDelete(folderToDelete)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter' && validateFolderToDelete()) {
                            handleDeleteFolderConfirm();
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
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' && newFolderName.length > 0 && !newFolderNameRulesVisibility) {
                                    handleNewFolderCreate();
                                }
                            }}
                        />
                    </FormGroup>
                </Form>
                <Content hidden={!newFolderNameRulesVisibility}>
                    <Content component={ContentVariants.small} className="bucket-name-rules">
                        Folder names must:
                        <ul>
                            <li>be unique,</li>
                            <li>only contain lowercase letters, numbers and hyphens,</li>
                        </ul>
                    </Content>
                </Content>
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
                    <Button key="cancel" variant="link" onClick={handleImportModelClose}>
                        Close
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
                                title={`${file} - ${uploadToS3Percentages[file]?.status ?? ''}`}
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
                                    fileName={file.path + ' - ' + (uploadToS3Percentages[decodedPrefix + file.path.replace(/^\//, '')]?.status ?? '')}
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
        </div>
    );
};

export default ObjectBrowser;
