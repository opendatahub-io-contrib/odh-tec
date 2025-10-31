import config from '@app/config';
import { faDownload, faEye, faFile, faFolder, faTrash } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  Alert,
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
  FormHelperText,
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
  Radio,
  TextInput,
  ContentVariants,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
  Tooltip,
} from '@patternfly/react-core';
import { Modal } from '@patternfly/react-core/deprecated';
import { SearchIcon, CopyIcon } from '@patternfly/react-icons';
import UploadIcon from '@patternfly/react-icons/dist/esm/icons/upload-icon';
import TrashIcon from '@patternfly/react-icons/dist/esm/icons/trash-icon';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import axios from 'axios';
import * as React from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import Emitter from '../../utils/emitter';
import DocumentRenderer from '../DocumentRenderer/DocumentRenderer';
import { ObjectRow, PrefixRow, UploadedFile, ExtendedFile } from './storageBrowserTypes';
import HfLogo from '@app/assets/bgimages/hf-logo.svg';
import pLimit from 'p-limit';
import { storageService, StorageLocation, FileEntry } from '@app/services/storageService';
import { TransferAction } from '@app/components/Transfer';

interface StorageBrowserProps {}

const StorageBrowser: React.FC<StorageBrowserProps> = () => {
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
  const [maxFilesPerPage, setMaxFilesPerPage] = React.useState(100);

  React.useEffect(() => {
    axios
      .get(`${config.backend_api_url}/settings/max-concurrent-transfers`)
      .then((response) => {
        const { maxConcurrentTransfers } = response.data;
        if (maxConcurrentTransfers !== undefined) {
          setMaxConcurrentTransfers(maxConcurrentTransfers);
        }
      })
      .catch((error) => {
        console.error(error);
        // Fall back to default value
        setMaxConcurrentTransfers(2);
        Emitter.emit('notification', {
          variant: 'warning',
          title: 'Using Default Settings',
          description: 'Failed to fetch max concurrent transfers setting. Using default value (2).',
        });
      });
  }, []);

  React.useEffect(() => {
    axios
      .get(`${config.backend_api_url}/settings/max-files-per-page`)
      .then((response) => {
        const { maxFilesPerPage } = response.data;
        if (maxFilesPerPage !== undefined) {
          setMaxFilesPerPage(maxFilesPerPage);
        }
      })
      .catch((error) => {
        console.error(error);
        // Fall back to default value
        setMaxFilesPerPage(100);
        Emitter.emit('notification', {
          variant: 'warning',
          title: 'Using Default Settings',
          description: 'Failed to fetch max files per page setting. Using default value (100).',
        });
      });
  }, []);

  // URL parameters from /browse/:locationId/:path?
  //
  // ENCODING STRATEGY (see docs/architecture/frontend-architecture.md):
  // - locationId: NOT encoded (validated to URL-safe [a-z0-9-] on backend)
  // - path: Base64-encoded (can contain slashes, spaces, special chars)
  const { locationId, path: encodedPath } = useParams<{
    locationId?: string;
    path?: string;
  }>();

  // Decode base64-encoded path from URL
  // Path is base64-encoded in URL to handle slashes and special characters safely
  // Note: locationId is NOT decoded - it's already URL-safe by validation
  // storageService will re-encode paths for local storage API calls
  const path = React.useMemo(() => {
    if (!encodedPath) return '';
    try {
      return atob(encodedPath);
    } catch (error) {
      console.error('[StorageBrowser] Failed to decode path from URL:', encodedPath, error);
      return '';
    }
  }, [encodedPath]);

  // Unified storage locations (S3 + local)
  const [locations, setLocations] = React.useState<StorageLocation[]>([]);
  const [locationsLoading, setLocationsLoading] = React.useState<boolean>(true);
  const [selectedLocation, setSelectedLocation] = React.useState<StorageLocation | null>(null);
  const [formSelectLocation, setFormSelectLocation] = React.useState(locationId || '');

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

  // Load all storage locations (S3 + local) on mount
  React.useEffect(() => {
    setLocationsLoading(true);
    storageService
      .getLocations()
      .then((allLocations) => {
        console.log('[StorageBrowser] Loaded locations:', allLocations);
        setLocations(allLocations);
        setLocationsLoading(false);

        // Notify if no locations available
        if (allLocations.length === 0) {
          Emitter.emit('notification', {
            variant: 'warning',
            title: 'No storage locations available',
            description:
              'All storage sources failed to load. Check S3 and local storage configuration. See browser console for details.',
          });
        }
      })
      .catch((error) => {
        // This should not happen with allSettled, but keep as safety net
        console.error('[StorageBrowser] Failed to load storage locations:', error);
        setLocationsLoading(false);
        Emitter.emit('notification', {
          variant: 'warning',
          title: 'Error Loading Locations',
          description: 'Failed to load storage locations. Please check your connection settings.',
        });
      });
  }, []); // Empty dependency array - run only on mount

  // Set selected location based on URL parameter
  React.useEffect(() => {
    if (!locationId) {
      // No location selected - redirect to first available
      if (locations.length > 0) {
        const firstAvailable = locations.find((loc) => loc.available) || locations[0];
        console.log('[StorageBrowser] No location in URL, redirecting to:', firstAvailable.id);
        navigate(`/browse/${firstAvailable.id}`);
      }
      return;
    }

    if (locations.length === 0) {
      // Locations not loaded yet
      return;
    }

    // Find location by ID
    const location = locations.find((loc) => loc.id === locationId);

    if (!location) {
      // Location not found
      console.error('[StorageBrowser] Location not found:', locationId);
      Emitter.emit('notification', {
        variant: 'warning',
        title: 'Location Not Found',
        description: `Storage location "${locationId}" does not exist.`,
      });
      // Redirect to first available location
      const firstAvailable = locations.find((loc) => loc.available) || locations[0];
      if (firstAvailable) {
        navigate(`/browse/${firstAvailable.id}`);
      } else {
        navigate('/browse');
      }
      return;
    }

    if (!location.available) {
      // Location exists but is unavailable
      console.warn('[StorageBrowser] Location unavailable:', locationId);
      Emitter.emit('notification', {
        variant: 'warning',
        title: 'Location Unavailable',
        description: `Storage location "${location.name}" is currently unavailable. It may be disconnected or inaccessible.`,
      });
    }

    // Set selected location
    console.log('[StorageBrowser] Selected location:', location);
    setSelectedLocation(location);
    setFormSelectLocation(locationId);
  }, [locationId, locations, navigate]);

  // Handle location change in the dropdown
  const handleLocationSelectorChange = (_event: React.FormEvent<HTMLSelectElement>, value: string) => {
    console.log('[StorageBrowser] Location selector changed to:', value);

    // Find the selected location
    const newLocation = locations.find((loc) => loc.id === value);

    if (!newLocation) {
      console.error('[StorageBrowser] Selected location not found:', value);
      return;
    }

    if (!newLocation.available) {
      console.warn('[StorageBrowser] Attempted to select unavailable location:', value);
      Emitter.emit('notification', {
        variant: 'warning',
        title: 'Location Unavailable',
        description: `Cannot select "${newLocation.name}" as it is currently unavailable.`,
      });
      return;
    }

    // Navigate to the new location (root path)
    setFormSelectLocation(value);
    setSearchObjectText(''); // Clear search field when switching locations
    navigate(`/browse/${value}`);
  };

  const handleLocationTextInputSend = (_event: React.MouseEvent<HTMLButtonElement>) => {
    // Validate location exists
    const location = locations.find((loc) => loc.id === formSelectLocation);

    if (!location) {
      Emitter.emit('notification', {
        variant: 'warning',
        title: 'Invalid Location',
        description: `Location "${formSelectLocation}" does not exist.`,
      });
      return;
    }

    setSearchObjectText(''); // Clear search field when navigating to different location
    navigate(`/browse/${formSelectLocation}`);
  };

  /*
      Utilities
    */
  // Copy the prefix (aka full "folder" path) to the clipboard
  const copyPrefixToClipboard = () => {
    navigator.clipboard.writeText('/' + currentPath).then(
      () => {
        Emitter.emit('notification', {
          variant: 'success',
          title: 'Path copied',
          description: 'The path has been successfully copied to the clipboard.',
        });
      },
      (err) => {
        console.error('Failed to copy prefix to clipboard: ', err);
      },
    );
  };

  /*
      Objects display
    */
  // Pagination state
  const [currentPath, setCurrentPath] = React.useState('');
  const [files, setFiles] = React.useState<FileEntry[]>([]);
  const [directories, setDirectories] = React.useState<FileEntry[]>([]);
  const [paginationToken, setPaginationToken] = React.useState<string | null>(null);
  const [paginationOffset, setPaginationOffset] = React.useState(0);
  const [isTruncated, setIsTruncated] = React.useState<boolean>(false);
  const [isLoadingMore, setIsLoadingMore] = React.useState<boolean>(false);
  // Deep search (auto-pagination) state (disabled when serverSearchActive)
  const [deepSearchActive, setDeepSearchActive] = React.useState<boolean>(false);
  const [deepSearchPagesScanned, setDeepSearchPagesScanned] = React.useState<number>(0);
  const [deepSearchCancelled, setDeepSearchCancelled] = React.useState<boolean>(false);

  // Helper function to format bytes to human-readable size
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  // Unified file refresh function - replaces refreshObjects
  const refreshFiles = React.useCallback(
    async (
      location: StorageLocation,
      path: string,
      continuationToken?: string | null,
      appendResults: boolean = false,
      searchParams?: { q: string; mode: 'startsWith' | 'contains' },
      abortController?: AbortController,
    ): Promise<void> => {
      if (!location) {
        console.warn('[refreshFiles] No location provided');
        return;
      }

      try {
        console.log('[refreshFiles] Loading files:', {
          location: location.id,
          path,
          type: location.type,
          append: appendResults,
        });

        let response;

        if (location.type === 's3') {
          // S3: Use continuation token pagination
          response = await storageService.listFiles(location.id, path, {
            continuationToken: continuationToken || undefined,
            maxKeys: searchParams ? undefined : maxFilesPerPage,
            q: searchParams?.q,
            mode: searchParams?.mode,
          });

          // Update S3 pagination state
          setPaginationToken(response.nextContinuationToken || null);
          setIsTruncated(response.isTruncated || false);
        } else {
          // Local storage: Use offset pagination
          const offset = appendResults ? paginationOffset : 0;

          response = await storageService.listFiles(location.id, path, {
            limit: maxFilesPerPage,
            offset,
            q: searchParams?.q,
            mode: searchParams?.mode,
          });

          // Update local pagination state
          const hasMore = response.totalCount! > offset + response.files.length;
          setIsTruncated(hasMore);

          // Update offset for next page
          if (appendResults) {
            setPaginationOffset(offset + response.files.length);
          } else {
            setPaginationOffset(response.files.length);
          }
        }

        // Separate files and directories from FileEntry array
        const dirEntries = response.files.filter((f) => f.type === 'directory');
        const fileEntries = response.files.filter((f) => f.type === 'file');

        console.log('[refreshFiles] Results:', {
          files: fileEntries.length,
          directories: dirEntries.length,
          hasMore: response.isTruncated || response.totalCount! > paginationOffset + response.files.length,
        });

        if (appendResults) {
          // Append to existing results (pagination)
          setDirectories((prev) => [...prev, ...dirEntries]);
          setFiles((prev) => [...prev, ...fileEntries]);
        } else {
          // Replace results (new path or refresh)
          setDirectories(dirEntries);
          setFiles(fileEntries);
        }

        setCurrentPath(path);
      } catch (error: any) {
        if (error.name === 'AbortError' || error.name === 'CanceledError') {
          console.log('[refreshFiles] Request aborted');
          return;
        }

        console.error('[refreshFiles] Failed:', error);
        Emitter.emit('notification', {
          variant: 'warning',
          title: 'Error Loading Files',
          description: error.response?.data?.message || 'Failed to load files from storage.',
        });

        // Clear results on error
        setDirectories([]);
        setFiles([]);
      }
    },
    [paginationOffset],
  ); // Dependencies: only paginationOffset (others are setters)

  // Load files when location or path changes
  React.useEffect(() => {
    if (!selectedLocation) {
      console.log('[StorageBrowser] No location selected, skipping file load');
      return;
    }

    if (!selectedLocation.available) {
      console.warn('[StorageBrowser] Location unavailable, showing empty view');
      setDirectories([]);
      setFiles([]);
      return;
    }

    console.log('[StorageBrowser] Loading files for location:', selectedLocation.id);

    // Abort previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    // Reset pagination
    setPaginationToken(null);
    setPaginationOffset(0);
    setIsTruncated(false);

    // Load files
    refreshFiles(
      selectedLocation,
      path || '',
      null,
      false,
      serverSearchActive ? { q: searchObjectText, mode: searchMode } : undefined,
      abortControllerRef.current || undefined,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLocation, path]);

  React.useEffect(() => {
    // On short searches (<3) just local filter; if we were previously server searching, reload unfiltered list.
    if (!locationId) return;
    let cancelled = false;
    if (!serverSearchActive) {
      if (filterMeta) {
        // We were in server mode, need to reset to baseline listing
        setFilterMeta(null);
        setPaginationToken(null);
        setIsTruncated(false);
        if (selectedLocation && selectedLocation.available) {
          refreshFiles(selectedLocation, path || '', null, false, undefined, abortControllerRef.current || undefined);
        }
      }
      return;
    }
    // For server searches: debounce input
    const handle = setTimeout(() => {
      if (cancelled) return;
      // Reset pagination & existing results, then fetch filtered first page
      setPaginationToken(null);
      setIsTruncated(false);
      setFiles([]);
      setDirectories([]);
      setFilterMeta(null);
      if (selectedLocation && selectedLocation.available) {
        refreshFiles(
          selectedLocation,
          path || '',
          null,
          false,
          { q: searchObjectText, mode: searchMode },
          abortControllerRef.current || undefined,
        );
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [searchObjectText, searchMode, selectedLocation, path, refreshFiles]);

  const columnNames = {
    key: 'Key',
    lastModified: 'Last Modified',
    size: 'Size',
  };

  // Filter files by name and path
  const filteredFiles = files.filter(
    (file) =>
      file.name.toLowerCase().includes(searchObjectText.toLowerCase()) ||
      file.path.toLowerCase().includes(searchObjectText.toLowerCase()),
  );

  // Filter directories by name and path
  const filteredDirectories = directories.filter(
    (dir) =>
      dir.name.toLowerCase().includes(searchObjectText.toLowerCase()) ||
      dir.path.toLowerCase().includes(searchObjectText.toLowerCase()),
  );

  // Auto-trigger deep search for client-side searches when no matches found
  React.useEffect(() => {
    if (!locationId || deepSearchActive) return;
    if (searchObjectText.length === 0) return; // No search active
    if (!isTruncated || !paginationToken) return; // No more pages

    // Check if we have any matches in current data
    const hasMatches = filteredFiles.length + filteredDirectories.length > 0;
    if (hasMatches) return; // Already have matches

    // For server search, check if we need to auto-load more pages
    // This handles cases where server search returns empty first page but might have results later
    if (serverSearchActive) {
      // For server search with no results, auto-trigger loading more pages after a delay
      const timer = setTimeout(() => {
        if (isTruncated && paginationToken && !isLoadingMore) {
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
  }, [
    searchObjectText,
    filteredFiles.length,
    filteredDirectories.length,
    isTruncated,
    paginationToken,
    serverSearchActive,
    deepSearchActive,
    locationId,
    isLoadingMore,
  ]);

  // Navigate when clicking on a path (directory)
  const handlePathClick = (newPath: string) => (event?: React.MouseEvent<HTMLButtonElement>) => {
    if (event) event.preventDefault();

    console.log('[handlePathClick] Navigating to path:', newPath);

    // Don't navigate if already at this path
    if (currentPath === newPath) {
      console.log('[handlePathClick] Already at this path, skipping navigation');
      return;
    }

    // Clear current results
    setFiles([]);
    setDirectories([]);
    setCurrentPath(newPath);

    // Reset pagination
    setPaginationToken(null);
    setPaginationOffset(0);
    setIsTruncated(false);

    // Clear search
    setSearchObjectText('');

    // Navigate
    navigate(newPath !== '' ? `/browse/${locationId}/${btoa(newPath)}` : `/browse/${locationId}`);
  };

  /*
      Multi-select state and handlers
    */
  const [selectedItems, setSelectedItems] = React.useState<Set<string>>(new Set());
  const [lastSelected, setLastSelected] = React.useState<string | null>(null);

  // Clear selection on navigation
  React.useEffect(() => {
    setSelectedItems(new Set());
    setLastSelected(null);
  }, [currentPath, locationId]);

  // Select all visible items
  const handleSelectAll = (isSelecting: boolean) => {
    if (isSelecting) {
      setSelectedItems(new Set(filteredFiles.map((f) => f.path)));
    } else {
      setSelectedItems(new Set());
    }
  };

  // Single row selection
  const handleSelectRow = (path: string, isSelected: boolean) => {
    const updated = new Set(selectedItems);
    if (isSelected) {
      updated.add(path);
    } else {
      updated.delete(path);
    }
    setSelectedItems(updated);
    setLastSelected(path);
  };

  // Shift+Click range selection
  const handleShiftClick = (path: string) => {
    if (!lastSelected) {
      handleSelectRow(path, true);
      return;
    }

    const lastIndex = filteredFiles.findIndex((f) => f.path === lastSelected);
    const currentIndex = filteredFiles.findIndex((f) => f.path === path);

    if (lastIndex === -1 || currentIndex === -1) return;

    const start = Math.min(lastIndex, currentIndex);
    const end = Math.max(lastIndex, currentIndex);

    const updated = new Set(selectedItems);
    for (let i = start; i <= end; i++) {
      updated.add(filteredFiles[i].path);
    }

    setSelectedItems(updated);
  };

  // Keyboard shortcuts
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+A: Select all
      if (e.ctrlKey && e.key === 'a') {
        e.preventDefault();
        handleSelectAll(true);
      }

      // Escape: Clear selection
      if (e.key === 'Escape') {
        setSelectedItems(new Set());
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredFiles]);

  // Bulk delete selected items
  const handleDeleteSelected = async () => {
    if (!confirm(`Delete ${selectedItems.size} items?`)) return;

    try {
      await Promise.all(Array.from(selectedItems).map((path) => storageService.deleteFile(locationId!, path)));

      // Refresh file list
      if (selectedLocation && selectedLocation.available) {
        await refreshFiles(
          selectedLocation,
          path || '',
          null,
          false,
          undefined,
          abortControllerRef.current || undefined,
        );
      }
      setSelectedItems(new Set());

      Emitter.emit('notification', {
        variant: 'success',
        title: 'Files deleted',
        description: `Successfully deleted ${selectedItems.size} items.`,
      });
    } catch (error) {
      console.error('Failed to delete selected items:', error);
      Emitter.emit('notification', {
        variant: 'warning',
        title: 'Delete Failed',
        description: 'Failed to delete some items. Please try again.',
      });
    }
  };

  // Open transfer modal for selected items
  const handleCopySelected = () => {
    if (selectedItems.size === 0) {
      Emitter.emit('notification', {
        variant: 'warning',
        title: 'No items selected',
        description: 'Please select items to copy.',
      });
      return;
    }
    setIsTransferModalOpen(true);
  };

  // Helper to validate which files can be viewed
  const validateFileView = (filename: string, size: number) => {
    const allowedExtensions = [
      'txt',
      'log',
      'jpg',
      'py',
      'json',
      'yaml',
      'yml',
      'md',
      'html',
      'css',
      'js',
      'ts',
      'tsx',
      'jsx',
      'sh',
      'bash',
      'sql',
      'csv',
      'xml',
      'png',
      'gif',
      'bmp',
      'jpeg',
      'svg',
      'webp',
      'ico',
    ];
    if (size > 1024 * 1024) {
      return false;
    }
    if (!allowedExtensions.includes(filename.split('.').pop() || '')) {
      return false;
    }
    return true;
  };

  /*
      File viewing
    */
  const [fileData, setFileData] = React.useState('');
  const [fileName, setFileName] = React.useState('');

  const [isFileViewerOpen, setIsFileViewerOpen] = React.useState(false);
  const handleFileViewerToggle = (_event: KeyboardEvent | React.MouseEvent) => {
    setIsFileViewerOpen(!isFileViewerOpen);
  };

  const handleObjectViewClick = (key: string) => async (event: React.MouseEvent<HTMLButtonElement>) => {
    // Retrieve the object from the backend and open the File Viewer modal
    await axios
      .get(`${config.backend_api_url}/objects/view/${locationId}/${btoa(key)}`, { responseType: 'arraybuffer' })
      .then((response) => {
        setFileName(key.split('/').pop() || '');
        const binary = new Uint8Array(response.data);
        const data = btoa(binary.reduce((data, byte) => data + String.fromCharCode(byte), ''));
        setFileData(data);
        setIsFileViewerOpen(true);
      })
      .catch((error) => {
        console.error('Error viewing object', error);
        Emitter.emit('notification', {
          variant: 'warning',
          title: error.response?.data?.error || 'Error Viewing File',
          description: error.response?.data?.message || 'Failed to retrieve the object content.',
        });
      });
  };

  const handleLocalFileViewClick = (filePath: string) => async (event: React.MouseEvent<HTMLButtonElement>) => {
    // Retrieve the local file from the backend and open the File Viewer modal
    await axios
      .get(`${config.backend_api_url}/local/view/${locationId}/${btoa(filePath)}`, { responseType: 'arraybuffer' })
      .then((response) => {
        setFileName(filePath.split('/').pop() || '');
        const binary = new Uint8Array(response.data);
        const data = btoa(binary.reduce((data, byte) => data + String.fromCharCode(byte), ''));
        setFileData(data);
        setIsFileViewerOpen(true);
      })
      .catch((error) => {
        console.error('Error viewing local file', error);
        Emitter.emit('notification', {
          variant: 'warning',
          title: error.response?.data?.error || 'Error Viewing File',
          description: error.response?.data?.message || 'Failed to retrieve the file content.',
        });
      });
  };

  // Download file handler - avoids page navigation issues
  const handleFileDownload = (file: FileEntry) => {
    if (!selectedLocation || !locationId) {
      console.error('[Download] No location selected');
      return;
    }

    console.log('[Download] Starting:', file.path);

    // Build download URL based on storage type
    const downloadUrl =
      selectedLocation.type === 's3'
        ? `${config.backend_api_url}/objects/download/${locationId}/${btoa(file.path)}`
        : `${config.backend_api_url}/local/download/${locationId}/${btoa(file.path)}`;

    // Use hidden link to trigger download without page navigation
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = file.name;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    console.log('[Download] Triggered for:', file.name);
  };

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
    setUploadToS3Percentages((prevPercentages) => ({
      ...prevPercentages,
      [key]: {
        ...prevPercentages[key],
        loaded: value,
        status: status,
      },
    }));
  };

  const updateProgress = (encodedKey: string, loaded: number) => {
    setUploadPercentages((prevPercentages) => ({
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
  };

  const resetSingleFileUploadPanel = () => {
    setSingleFileUploadValue(undefined);
    setSingleFilename('');
    setUploadToS3Percentages({});
    setUploadPercentages({});
    setIsUploadSingleFileModalOpen(false);
    abortUploadController.current = null;
  };

  const handleFileInputChange = (_, file: File) => {
    setSingleFilename(file.name);
    setSingleFileUploadValue(file);
  };

  const handleUploadFileCancel = (_event: React.MouseEvent) => {
    if (abortUploadController.current) {
      abortUploadController.current.abort(); // Abort the current request if controller exists
    }
    axios
      .get(`${config.backend_api_url}/objects/abort-upload`, {})
      .then((response) => {
        console.log('Upload aborted', response);
      })
      .catch((error) => {
        console.error('Error aborting upload', error);
        Emitter.emit('notification', {
          variant: 'warning',
          title: error.response?.data?.error || 'Error Aborting Upload',
          description: error.response?.data?.message || 'Failed to abort the upload process.',
        });
      });
    resetSingleFileUploadPanel();
  };

  const handleUploadFileConfirm = (_event: React.MouseEvent) => {
    if (!singleFileUploadValue || !selectedLocation || !locationId) {
      return;
    }
    const fileSize = singleFileUploadValue.size;
    // Ensure proper path joining with separator
    const fullPath = currentPath
      ? currentPath.endsWith('/')
        ? currentPath + singleFilename
        : currentPath + '/' + singleFilename
      : singleFilename;

    // Reset progress trackers
    setUploadPercentages(() => ({
      [singleFilename]: { loaded: 0 },
    }));
    setUploadToS3Percentages(() => ({
      [singleFilename]: { loaded: 0 },
    }));

    // Upload to storage progress feedback (backend-side progress)
    const eventSource = new EventSource(`${config.backend_api_url}/objects/upload-progress/${btoa(fullPath)}`);
    singleFileEventSource.current = eventSource;

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.loaded !== 0 && data.status === 'uploading') {
        updateS3Progress(singleFilename, Math.round((data.loaded / fileSize) * 100));
      }
      if (data.status === 'completed') {
        console.log('Upload to storage completed');
        eventSource.close();
        singleFileEventSource.current = null;
        delete uploadToS3Percentages[singleFilename];
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      singleFileEventSource.current = null;
    };

    // Upload using storageService with progress callback
    // Note: storageService handles base64 encoding internally for local storage
    storageService
      .uploadFile(locationId, fullPath, singleFileUploadValue, {
        onProgress: (percentCompleted) => {
          updateProgress(singleFilename, percentCompleted);
        },
      })
      .then(() => {
        const oldFileName = singleFilename;
        Emitter.emit('notification', {
          variant: 'success',
          title: 'File uploaded',
          description: 'File "' + oldFileName + '" has been successfully uploaded.',
        });
        resetSingleFileUploadPanel();
        if (selectedLocation && selectedLocation.available) {
          refreshFiles(
            selectedLocation,
            currentPath,
            paginationToken,
            false,
            undefined,
            abortControllerRef.current || undefined,
          );
        }
      })
      .catch((error) => {
        console.error('Error uploading file', error);
        Emitter.emit('notification', {
          variant: 'warning',
          title: error.response?.data?.error || 'File Upload Failed',
          description: error.response?.data?.message || String(error),
        });
        resetSingleFileUploadPanel();
      });
  };

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
  };

  const handleUploadFilesClose = (_event: React.MouseEvent) => {
    setIsUploadFilesModalOpen(false);
    setCurrentFiles([]);
    setUploadedFiles([]);
    setUploadToS3Percentages({});
    setUploadPercentages({});
    setShowStatus(false);

    // Refresh file browser to show newly uploaded files
    if (selectedLocation && selectedLocation.available) {
      refreshFiles(
        selectedLocation,
        currentPath,
        paginationToken,
        false,
        undefined,
        abortControllerRef.current || undefined,
      );
    }
  };

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

  // Show notification when all uploads are complete
  React.useEffect(() => {
    if (currentFiles.length === 0 || !isUploadFilesModalOpen) return;

    const allCompleted = uploadedFiles.length === currentFiles.length;
    if (!allCompleted) return;

    const allSuccessful = uploadedFiles.every((file) => file.loadResult === 'success');
    const successCount = uploadedFiles.filter((file) => file.loadResult === 'success').length;
    const failureCount = uploadedFiles.length - successCount;

    if (allSuccessful) {
      Emitter.emit('notification', {
        variant: 'success',
        title: 'Upload Complete',
        description: `Successfully uploaded ${successCount} file(s).`,
      });
    } else if (failureCount > 0) {
      Emitter.emit('notification', {
        variant: 'warning',
        title: 'Upload Completed with Errors',
        description: `${successCount} file(s) uploaded successfully, ${failureCount} failed.`,
      });
    }
  }, [uploadedFiles, currentFiles, isUploadFilesModalOpen]);

  // remove files from both state arrays based on their paths
  const removeFiles = (pathsOfFilesToRemove: string[]) => {
    const newCurrentFiles = currentFiles.filter(
      (currentFile) => !pathsOfFilesToRemove.some((path) => path === currentFile.path),
    );

    setCurrentFiles(newCurrentFiles);

    const newUploadedFiles = uploadedFiles.filter(
      (uploadedFile) => !pathsOfFilesToRemove.some((path) => path === uploadedFile.path),
    );

    setUploadedFiles(newUploadedFiles);
  };

  const updateCurrentFiles = (files: ExtendedFile[]): void => {
    setCurrentFiles((prevFiles) => [...prevFiles, ...files]);
  };

  const handleFileDrop = async (_event: DropEvent, droppedFiles: File[]) => {
    console.log('Dropped files', droppedFiles);
    // Cast to ExtendedFile type and process paths to remove eventual leading "./"
    const fullDroppedFiles: ExtendedFile[] = droppedFiles.map((originalFile) => {
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
      if (!processedPath && originalFile.name) {
        // Ensure path is not empty
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
        },
      );

      // 3. Cast the new File instance to ExtendedFile and add custom properties.
      const extendedFile = newFileInstance as ExtendedFile;

      // Define 'path' as an own, writable property on the new File instance.
      Object.defineProperty(extendedFile, 'path', {
        value: processedPath, // Store the processed path here
        writable: true,
        enumerable: true,
        configurable: true,
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
        const filePath = file.path.replace(/^\//, '');
        const fullPath = currentPath
          ? currentPath.endsWith('/')
            ? currentPath + filePath
            : currentPath + '/' + filePath
          : filePath;
        newPercentages[fullPath] = { loaded: 0 };
      }
      return newPercentages;
    });

    setUploadToS3Percentages((prevPercentages) => {
      const newPercentages = { ...prevPercentages };
      for (const file of fullDroppedFiles) {
        const filePath = file.path.replace(/^\//, '');
        const fullPath = currentPath
          ? currentPath.endsWith('/')
            ? currentPath + filePath
            : currentPath + '/' + filePath
          : filePath;
        newPercentages[fullPath] = { loaded: 0, status: 'queued' };
      }
      return newPercentages;
    });

    // Start the upload process, using limit to control the number of concurrent uploads
    const limit = pLimit(maxConcurrentTransfers);

    const promises = fullDroppedFiles.map((file: ExtendedFile) => limit(() => handleFileUpload(file)));

    await Promise.all(promises);
  };

  // Processes a file upload
  const handleFileUpload = async (file: File): Promise<void> => {
    if (!locationId || !selectedLocation) {
      console.error('[Upload] No location selected');
      return;
    }

    const fullFile = file as ExtendedFile;
    const filePath = fullFile.path.replace(/^\//, '').replace(/^\.\//, ''); // remove leading slash in case of folder upload or ./ in case of files
    // Ensure proper path joining with separator
    const fullPath = currentPath
      ? currentPath.endsWith('/')
        ? currentPath + filePath
        : currentPath + '/' + filePath
      : filePath;

    if (uploadPercentages[fullPath]) {
      // File already in upload progress, skipping
      return;
    }

    const fileSize = fullFile.size;

    // Upload to storage progress feedback (backend-side progress)
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
        eventSource.close();
        multiFileEventSources.current.delete(fullPath);
        setUploadedFiles((prevUploadedFiles) => {
          const fileExists = prevUploadedFiles.some(
            (file) => file.path === fullFile.path && file.loadResult === 'success',
          );
          if (!fileExists) {
            return [...prevUploadedFiles, { fileName: fullFile.name, loadResult: 'success', path: fullFile.path }];
          }
          return prevUploadedFiles;
        });
        // Optimistic UI update: Add uploaded file to the file list immediately
        if (selectedLocation && selectedLocation.available) {
          const newFileEntry: FileEntry = {
            name: fullFile.name,
            path: fullPath,
            type: 'file',
            size: fullFile.size,
            modified: new Date(),
          };

          setFiles((prevFiles) => {
            // Check if file already exists in the list
            const fileExists = prevFiles.some((f) => f.path === fullPath);
            if (!fileExists) {
              return [...prevFiles, newFileEntry];
            }
            return prevFiles;
          });
        }
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      multiFileEventSources.current.delete(fullPath);
    };

    // Upload using storageService with progress callback
    // Note: storageService handles base64 encoding internally for local storage
    await storageService
      .uploadFile(locationId, fullPath, file, {
        onProgress: (percentCompleted) => {
          updateProgress(fullPath, percentCompleted);
        },
      })
      .then(() => {
        // Track success for local/PVC uploads (EventSource doesn't fire completion for local storage)
        if (selectedLocation?.type === 'local') {
          setUploadedFiles((prevUploadedFiles) => {
            const fileExists = prevUploadedFiles.some((f) => f.path === fullFile.path && f.loadResult === 'success');
            if (!fileExists) {
              return [...prevUploadedFiles, { fileName: fullFile.name, loadResult: 'success', path: fullFile.path }];
            }
            return prevUploadedFiles;
          });

          // Optimistic UI update: Add uploaded file to the file list immediately
          const newFileEntry: FileEntry = {
            name: fullFile.name,
            path: fullPath,
            type: 'file',
            size: fullFile.size,
            modified: new Date(),
          };

          setFiles((prevFiles) => {
            // Check if file already exists in the list
            const fileExists = prevFiles.some((f) => f.path === fullPath);
            if (!fileExists) {
              return [...prevFiles, newFileEntry];
            }
            return prevFiles;
          });
        }
      })
      .catch((error) => {
        console.error('Error uploading file', error);
        Emitter.emit('notification', {
          variant: 'warning',
          title: error.response?.data?.error || 'File Upload Failed',
          description: error.response?.data?.message || String(error),
        });
        setUploadedFiles((prevUploadedFiles) => [
          ...prevUploadedFiles,
          { loadError: error, fileName: fullFile.name, loadResult: 'danger', path: fullPath },
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
  const [isDeletingFile, setIsDeletingFile] = React.useState(false);

  const handleDeleteFileModalToggle = (_event: KeyboardEvent | React.MouseEvent) => {
    setIsDeleteFileModalOpen(!isDeleteFileModalOpen);
  };

  const handleDeleteFileClick = (key: string) => (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    setSelectedFile(key);
    handleDeleteFileModalToggle(event);
  };

  const validateFileToDelete = (): boolean => {
    if (fileToDelete !== selectedFile.split('/').pop()) {
      return false;
    } else {
      return true;
    }
  };

  const handleDeleteFileConfirm = async () => {
    if (!validateFileToDelete()) {
      console.log('Invalid file to delete');
      return;
    }
    if (!selectedFile) return;

    setIsDeletingFile(true);
    try {
      await storageService.deleteFile(locationId!, selectedFile);

      Emitter.emit('notification', {
        variant: 'success',
        title: 'File deleted',
        description: `File "${selectedFile.split('/').pop()}" has been successfully deleted.`,
      });

      setFileToDelete('');
      setIsDeleteFileModalOpen(false);
      if (selectedLocation && selectedLocation.available) {
        refreshFiles(
          selectedLocation,
          currentPath,
          paginationToken,
          false,
          undefined,
          abortControllerRef.current || undefined,
        );
      }
    } catch (error: any) {
      console.error('Error deleting file', error);
      Emitter.emit('notification', {
        variant: 'warning',
        title: error.response?.data?.error || 'File Deletion Failed',
        description: error.response?.data?.message || String(error),
      });
    } finally {
      setIsDeletingFile(false);
    }
  };

  const handleDeleteFileCancel = () => {
    setFileToDelete('');
    setIsDeleteFileModalOpen(false);
    setIsDeletingFile(false);
  };

  /*
      Folder deletion
    */
  const [isDeleteFolderModalOpen, setIsDeleteFolderModalOpen] = React.useState(false);
  const [selectedFolder, setSelectedFolder] = React.useState('');
  const [folderToDelete, setFolderToDelete] = React.useState('');
  const [isDeletingFolder, setIsDeletingFolder] = React.useState(false);

  const handleDeleteFolderModalToggle = (_event: KeyboardEvent | React.MouseEvent) => {
    setIsDeleteFolderModalOpen(!isDeleteFolderModalOpen);
  };

  const handleDeleteFolderClick = (prefix: string) => (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    setSelectedFolder(prefix);
    handleDeleteFolderModalToggle(event);
  };

  const validateFolderToDelete = (): boolean => {
    if (folderToDelete !== selectedFolder.replace(/\/$/, '').split('/').pop()) {
      return false;
    } else {
      return true;
    }
  };

  const handleDeleteFolderConfirm = async () => {
    if (!validateFolderToDelete()) {
      console.log('Invalid folder to delete');
      return;
    }

    setIsDeletingFolder(true);
    try {
      await storageService.deleteFile(locationId!, selectedFolder);

      Emitter.emit('notification', {
        variant: 'success',
        title: 'Folder deleted',
        description: `Folder "${selectedFolder.replace(/\/$/, '').split('/').pop()}" has been successfully deleted.`,
      });

      setFolderToDelete('');
      setIsDeleteFolderModalOpen(false);
      if (selectedLocation && selectedLocation.available) {
        refreshFiles(
          selectedLocation,
          currentPath,
          paginationToken,
          false,
          undefined,
          abortControllerRef.current || undefined,
        );
      }
    } catch (error: any) {
      console.error('Error deleting folder', error);
      Emitter.emit('notification', {
        variant: 'warning',
        title: error.response?.data?.error || 'Folder Deletion Failed',
        description: error.response?.data?.message || String(error),
      });
    } finally {
      setIsDeletingFolder(false);
    }
  };

  const handleDeleteFolderCancel = () => {
    setFolderToDelete('');
    setIsDeleteFolderModalOpen(false);
    setIsDeletingFolder(false);
  };

  /*
      Folder creation
    */
  const [newFolderName, setNewFolderName] = React.useState('');
  const [newFolderNameRulesVisibility, setNewFolderNameRulesVisibility] = React.useState(false);

  const [isCreateFolderModalOpen, setIsCreateFolderModalOpen] = React.useState(false);
  const handleCreateFolderModalToggle = (_event: KeyboardEvent | React.MouseEvent) => {
    setIsCreateFolderModalOpen(!isCreateFolderModalOpen);
  };

  const validateFolderName = (folderName: string): boolean => {
    if (folderName === '') {
      return false;
    }
    const validCharacters = /^[a-zA-Z0-9!.\-_*'()]+$/;
    if (!validCharacters.test(folderName)) {
      return false;
    }
    return true;
  };

  React.useEffect(() => {
    if (newFolderName.length > 0) {
      setNewFolderNameRulesVisibility(!validateFolderName(newFolderName));
    } else {
      setNewFolderNameRulesVisibility(false);
    }
  }, [newFolderName]);

  const handleNewFolderCreate = async () => {
    if (!validateFolderName(newFolderName)) {
      alert('Invalid folder name');
      return;
    }

    try {
      // Properly join path with separator to avoid concatenating folder names
      const newPath = currentPath
        ? currentPath.endsWith('/')
          ? currentPath + newFolderName
          : currentPath + '/' + newFolderName
        : newFolderName;
      await storageService.createDirectory(locationId!, newPath);

      Emitter.emit('notification', {
        variant: 'success',
        title: 'Folder created',
        description: `Folder "${newFolderName}" has been successfully created.`,
      });

      setNewFolderName('');
      setIsCreateFolderModalOpen(false);
      if (selectedLocation && selectedLocation.available) {
        refreshFiles(
          selectedLocation,
          currentPath,
          paginationToken,
          false,
          undefined,
          abortControllerRef.current || undefined,
        );
      }
    } catch (error: any) {
      console.error('Error creating folder', error);
      Emitter.emit('notification', {
        variant: 'warning',
        title: error.response?.data?.error || 'Folder Creation Failed',
        description: error.response?.data?.message || String(error),
      });
    }
  };

  const handleNewFolderCancel = () => {
    setNewFolderName('');
    setIsCreateFolderModalOpen(false);
  };

  // Import HF model handling
  const [modelName, setModelName] = React.useState('');
  const [isImportModelModalOpen, setIsImportModelModalOpen] = React.useState(false);
  const [modelFiles, setModelFiles] = React.useState<string[]>([]);
  const [currentImportJobId, setCurrentImportJobId] = React.useState<string | null>(null);
  const [showCleanupDialog, setShowCleanupDialog] = React.useState(false);
  const [cancelledJobInfo, setCancelledJobInfo] = React.useState<any>(null);
  const [isDeletingFiles, setIsDeletingFiles] = React.useState(false);

  const handleImportModelModalToggle = (_event: KeyboardEvent | React.MouseEvent) => {
    setIsImportModelModalOpen(!isImportModelModalOpen);
  };

  const handleImportModelClose = (_event: React.MouseEvent) => {
    setIsImportModelModalOpen(false);
    setModelName('');
    setModelFiles([]);
    setUploadToS3Percentages({});
  };

  // Load locations when modal opens
  React.useEffect(() => {
    if (isImportModelModalOpen) {
      storageService
        .getLocations()
        .then((allLocations) => {
          setLocations(allLocations);

          // Notify if no locations available
          if (allLocations.length === 0) {
            Emitter.emit('notification', {
              variant: 'warning',
              title: 'No storage locations available',
              description: 'Cannot import model - no storage destinations available.',
            });
          }
        })
        .catch((error) => {
          console.error('Failed to load storage locations:', error);
          Emitter.emit('notification', {
            variant: 'warning',
            title: 'Error Loading Locations',
            description: 'Failed to load storage locations. Please try again.',
          });
        });
    }
  }, [isImportModelModalOpen]);

  interface DataValue {
    loaded?: number;
    status?: string;
    total?: number;
    error?: string;
    message?: string;
  }

  // Form validation for HF import
  const isHfFormValid = () => {
    return modelName.trim() !== '';
  };

  // Transfer modal state
  const [isTransferModalOpen, setIsTransferModalOpen] = React.useState(false);

  const handleImportModelConfirm = async (_event: React.MouseEvent) => {
    try {
      // Use current path as-is; backend will append the full modelId
      const destinationPath = currentPath || '';

      const params: any = {
        modelId: modelName,
        destinationType: selectedLocation?.type || 's3',
      };

      if (selectedLocation?.type === 's3') {
        params.bucketName = locationId;
        params.prefix = destinationPath;
      } else {
        params.localLocationId = locationId;
        params.localPath = destinationPath;
      }

      const response = await axios.post(`${config.backend_api_url}/objects/huggingface-import`, params);
      const sseUrl = `${config.backend_api_url}${response.data.sseUrl}`;
      const jobId = response.data.jobId;

      console.log('[HF Import] Job started, jobId:', jobId);

      // Store job ID for cancellation
      setCurrentImportJobId(jobId);
      console.log('[HF Import] Set currentImportJobId to:', jobId);

      let reconnectAttempts = 0;
      const maxReconnectAttempts = 5;

      const connectToProgressStream = () => {
        // Close existing EventSource if any
        if (modelImportEventSource.current) {
          modelImportEventSource.current.close();
        }

        // Set up SSE for progress tracking with new transfer queue format
        const eventSource = new EventSource(sseUrl);
        modelImportEventSource.current = eventSource;

        eventSource.onmessage = (event) => {
          const data = JSON.parse(event.data);

          // Handle error in job data
          if (data.error) {
            console.error('Job error:', data.error);
            Emitter.emit('notification', {
              variant: 'warning',
              title: 'Model import error',
              description: data.error,
            });
            eventSource.close();
            modelImportEventSource.current = null;
            return;
          }

          // New format: { jobId, status, progress, files: [{file, loaded, total, status, error}] }
          const { status: jobStatus, files } = data;

          // Initialize modelFiles array with file names if empty
          if (files && modelFiles.length === 0) {
            // Extract just the filename from destination path for display
            setModelFiles(files.map((f: any) => {
              const destPath = f.file;
              // destPath format: "s3:bucket/path/filename" or "local:loc/path/filename"
              return destPath.split('/').pop() || destPath;
            }));
          }

          // Update progress for each file
          if (files) {
            files.forEach((fileData: any) => {
              const { file: destPath, loaded, total, status: fileStatus, error } = fileData;

              // Extract filename from destination path for progress key
              const fileName = destPath.split('/').pop() || destPath;

              if (error) {
                // Don't show notifications for user-initiated cancellations
                if (error !== 'Cancelled by user') {
                  Emitter.emit('notification', {
                    variant: 'warning',
                    title: 'Model file import error',
                    description: `Error importing "${fileName}": ${error}`,
                  });
                }
                return;
              }

              if (loaded !== undefined && total !== undefined && total > 0) {
                const percentage = Math.round((loaded / total) * 100);
                updateS3Progress(fileName, percentage, fileStatus || 'downloading');
              }
            });
          }

          // Check if job completed
          if (jobStatus === 'completed' || jobStatus === 'failed' || jobStatus === 'cancelled') {
            eventSource.close();
            modelImportEventSource.current = null;

            if (jobStatus === 'completed') {
              // Clear job ID
              setCurrentImportJobId(null);

              Emitter.emit('notification', {
                variant: 'success',
                title: 'Model imported',
                description: `Model "${modelName}" has been successfully imported.`,
              });
              handleImportModelClose(_event);
              // Refresh file browser to show imported model
              if (selectedLocation && selectedLocation.available) {
                refreshFiles(
                  selectedLocation,
                  currentPath,
                  null,
                  false,
                  undefined,
                  abortControllerRef.current || undefined,
                );
              }
            } else if (jobStatus === 'failed') {
              // Clear job ID
              setCurrentImportJobId(null);

              Emitter.emit('notification', {
                variant: 'warning',
                title: 'Model import failed',
                description: `Import of model "${modelName}" failed.`,
              });
            } else if (jobStatus === 'cancelled') {
              // Job was cancelled - don't clear jobId yet as we might need it for cleanup
              // It will be cleared after user makes cleanup decision
              Emitter.emit('notification', {
                variant: 'info',
                title: 'Model import cancelled',
                description: `Import of model "${modelName}" was cancelled.`,
              });
            }
          }
        };

        eventSource.onerror = () => {
          eventSource.close();
          modelImportEventSource.current = null;

          // Check if all files completed successfully before attempting reconnection
          const allCompleted =
            modelFiles.length > 0 &&
            modelFiles.every((file) => {
              return uploadToS3Percentages[file]?.status === 'completed';
            });

          if (allCompleted) {
            // All files completed, no need to show error or reconnect
            console.log('All files completed successfully before connection lost');
            return;
          }

          // Attempt to reconnect with exponential backoff
          if (reconnectAttempts < maxReconnectAttempts) {
            const backoffDelay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
            reconnectAttempts++;

            console.log(`Reconnecting to progress stream (attempt ${reconnectAttempts}/${maxReconnectAttempts}) in ${backoffDelay}ms`);

            setTimeout(() => {
              connectToProgressStream();
            }, backoffDelay);
          } else {
            // Max reconnection attempts reached
            Emitter.emit('notification', {
              variant: 'warning',
              title: 'Connection error',
              description: 'Lost connection to import progress stream. Please check the transfer queue for status.',
            });
          }
        };
      };

      // Start the initial connection
      connectToProgressStream();

      Emitter.emit('notification', {
        variant: 'success',
        title: 'Model import started',
        description: `Model "${modelName}" import has successfully started.`,
      });
    } catch (error: any) {
      console.error('HuggingFace import failed:', error);
      Emitter.emit('notification', {
        variant: 'warning',
        title: 'Model import failed',
        description: error.response?.data?.message || 'Failed to start model import.',
      });
    }
  };

  const handleCancelImport = async () => {
    if (!currentImportJobId) {
      console.warn('No active import job to cancel');
      return;
    }

    try {
      // Cancel the job via API
      await axios.delete(`${config.backend_api_url}/transfer/${currentImportJobId}`);

      // Close EventSource
      if (modelImportEventSource.current) {
        modelImportEventSource.current.close();
        modelImportEventSource.current = null;
      }

      // Fetch job details to show user what was downloaded
      const jobInfoResponse = await axios.get(`${config.backend_api_url}/transfer/${currentImportJobId}`);
      setCancelledJobInfo(jobInfoResponse.data);
      setShowCleanupDialog(true);
    } catch (error: any) {
      console.error('Failed to cancel import:', error);
      Emitter.emit('notification', {
        variant: 'warning',
        title: 'Cancel failed',
        description: error.response?.data?.message || 'Failed to cancel import.',
      });
    }
  };

  const handleCleanupDecision = async (shouldDelete: boolean) => {
    if (!shouldDelete || !cancelledJobInfo) {
      // User chose to keep files - refresh to show them
      if (selectedLocation && selectedLocation.available) {
        refreshFiles(
          selectedLocation,
          currentPath,
          null,
          false,
          undefined,
          abortControllerRef.current || undefined,
        );
      }
      setShowCleanupDialog(false);
      setCancelledJobInfo(null);
      setCurrentImportJobId(null);
      handleImportModelClose({} as React.MouseEvent);
      return;
    }

    // User chose to delete - call cleanup endpoint
    setIsDeletingFiles(true);
    try {
      await axios.post(`${config.backend_api_url}/transfer/${currentImportJobId}/cleanup`);

      Emitter.emit('notification', {
        variant: 'success',
        title: 'Files deleted',
        description: 'All downloaded files have been deleted.',
      });

      // Refresh file browser
      if (selectedLocation && selectedLocation.available) {
        refreshFiles(
          selectedLocation,
          currentPath,
          null,
          false,
          undefined,
          abortControllerRef.current || undefined,
        );
      }
    } catch (error: any) {
      console.error('Failed to cleanup files:', error);
      Emitter.emit('notification', {
        variant: 'warning',
        title: 'Cleanup failed',
        description: error.response?.data?.message || 'Failed to delete downloaded files.',
      });
    } finally {
      setIsDeletingFiles(false);
      setShowCleanupDialog(false);
      setCancelledJobInfo(null);
      setCurrentImportJobId(null);
      handleImportModelClose({} as React.MouseEvent);
    }
  };

  const handleLoadMore = () => {
    if (!isTruncated || isLoadingMore || deepSearchActive || !selectedLocation) {
      return;
    }

    console.log('[handleLoadMore] Loading more results');
    setIsLoadingMore(true);

    if (selectedLocation.type === 's3') {
      // S3: Use continuation token
      refreshFiles(
        selectedLocation,
        currentPath,
        paginationToken,
        true, // append results
        serverSearchActive ? { q: searchObjectText, mode: searchMode } : undefined,
        abortControllerRef.current || undefined,
      ).finally(() => setIsLoadingMore(false));
    } else {
      // Local: Use offset (already tracked in state)
      refreshFiles(
        selectedLocation,
        currentPath,
        null,
        true, // append results
        undefined,
        abortControllerRef.current || undefined,
      ).finally(() => setIsLoadingMore(false));
    }
  };

  // Deep search: auto paginate until we find matches for current searchObjectText (or exhaust pages)
  const initiateDeepSearch = async () => {
    if (serverSearchActive) return; // server handled; disable client deep search
    if (deepSearchActive || !isTruncated || !paginationToken) return;
    setDeepSearchActive(true);
    setDeepSearchPagesScanned(0);
    setDeepSearchCancelled(false);
    try {
      let pages = 0;
      // Loop while more pages and still no matches and not cancelled
      // Recompute filtered arrays after each append; rely on derived variables after state settles
      while (!deepSearchCancelled) {
        // Re-evaluate current matches
        const haveMatches = filteredFiles.length + filteredDirectories.length > 0;
        if (haveMatches) break;
        if (!isTruncated || !paginationToken) break;
        if (selectedLocation && selectedLocation.available) {
          await refreshFiles(
            selectedLocation,
            path || '',
            paginationToken,
            true,
            undefined,
            abortControllerRef.current || undefined,
          );
        }
        pages += 1;
        setDeepSearchPagesScanned(pages);
        // Yield to allow state to update
        await new Promise((r) => setTimeout(r, 10));
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
        <Content component={ContentVariants.h1}>Storage Browser</Content>
      </PageSection>
      {selectedLocation && !selectedLocation.available && (
        <PageSection hasBodyWrapper={false}>
          <Alert variant="warning" title="Location Unavailable" isInline>
            <p>
              The storage location "{selectedLocation.name}" is currently unavailable.
              {selectedLocation.type === 'local' && (
                <span> The directory may be inaccessible or the path may be incorrect.</span>
              )}
            </p>
            <p>File operations are disabled until the location becomes available.</p>
          </Alert>
        </PageSection>
      )}
      <PageSection hasBodyWrapper={false} isFilled={true} className="storage-browser-page-section">
        <Flex direction={{ default: 'row' }}>
          <FlexItem>
            <Flex>
              <FlexItem>
                <Content component={ContentVariants.p}>Storage Location:</Content>
              </FlexItem>
              <FlexItem>
                <FormSelect
                  className="bucket-select"
                  value={formSelectLocation}
                  aria-label="Select storage location"
                  ouiaId="BasicFormSelect"
                  onChange={handleLocationSelectorChange}
                >
                  {locationsLoading ? (
                    <FormSelectOption key="loading" value="" label="Loading locations..." isDisabled />
                  ) : locations.length === 0 ? (
                    <FormSelectOption key="empty" value="" label="No storage locations available" isDisabled />
                  ) : null}

                  {locations.map((loc) => {
                    const label =
                      loc.type === 's3'
                        ? `${loc.name} (S3)`
                        : `${loc.name} (PVC${!loc.available ? ' - Unavailable' : ''})`;

                    return <FormSelectOption key={loc.id} value={loc.id} label={label} isDisabled={!loc.available} />;
                  })}
                </FormSelect>
              </FlexItem>
            </Flex>
          </FlexItem>
          {selectedLocation?.type === 's3' && (
            <FlexItem>
              <Flex>
                <FlexItem>
                  <Content component={ContentVariants.p}>Location override:</Content>
                </FlexItem>
                <FlexItem>
                  <TextInput
                    value={formSelectLocation}
                    onChange={(_event, value) => setFormSelectLocation(value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        handleLocationTextInputSend(event as unknown as React.MouseEvent<HTMLButtonElement>);
                      }
                    }}
                    type="search"
                    aria-label="search text input"
                    placeholder="Enter S3 bucket name..."
                    className="buckets-list-filter-search"
                  />
                </FlexItem>
                <FlexItem>
                  <Button variant="secondary" onClick={handleLocationTextInputSend} ouiaId="RefreshBucket">
                    Set location
                  </Button>
                </FlexItem>
              </Flex>
            </FlexItem>
          )}
        </Flex>
      </PageSection>
      <PageSection hasBodyWrapper={false} isFilled={true}>
        <Flex>
          <FlexItem>
            <Breadcrumb ouiaId="PrefixBreadcrumb">
              <BreadcrumbItem to={`/browse/${locationId}`}>
                <Button
                  variant="link"
                  className="breadcrumb-button"
                  onClick={handlePathClick('')}
                  aria-label="location-name"
                >
                  {selectedLocation?.name || locationId}
                </Button>
              </BreadcrumbItem>
              {(currentPath.endsWith('/') ? currentPath.slice(0, -1) : currentPath)
                .split('/')
                .filter((part) => part) // Remove empty strings from split
                .map((part, index, pathParts) => (
                  <BreadcrumbItem key={index}>
                    <Button
                      variant="link"
                      className="breadcrumb-button"
                      onClick={handlePathClick(pathParts.slice(0, index + 1).join('/') + '/')}
                      isDisabled={index === pathParts.length - 1}
                      aria-label="folder-name"
                    >
                      {part}
                    </Button>
                  </BreadcrumbItem>
                ))}
            </Breadcrumb>
          </FlexItem>
          <FlexItem>
            <Button variant="secondary" onClick={copyPrefixToClipboard} className="copy-path-button" ouiaId="CopyPath">
              Copy Path
            </Button>
          </FlexItem>
        </Flex>
      </PageSection>
      <PageSection hasBodyWrapper={false} isFilled={true}>
        <Flex direction={{ default: 'column' }}>
          <FlexItem>
            <Flex>
              <FlexItem style={{ maxWidth: '300px' }}>
                <TextInput
                  value={searchObjectText}
                  type="search"
                  onChange={(_event, searchText) => setSearchObjectText(searchText)}
                  aria-label="search text input"
                  placeholder="Filter files (min 3 chars to server search)…"
                  customIcon={<SearchIcon />}
                  className="buckets-list-filter-search"
                />
              </FlexItem>
              <FlexItem>
                <FormSelect
                  value={searchMode}
                  aria-label="Search mode"
                  onChange={(_e, v) => setSearchMode(v as any)}
                  isDisabled={!serverSearchActive}
                  ouiaId="SearchModeSelect"
                >
                  <FormSelectOption value="contains" label="Contains" />
                  <FormSelectOption value="startsWith" label="Starts with" />
                </FormSelect>
              </FlexItem>
              {serverSearchActive && (
                <FlexItem>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setSearchObjectText('');
                    }}
                    ouiaId="ClearSearch"
                  >
                    Clear Search
                  </Button>
                </FlexItem>
              )}
              <FlexItem flex={{ default: 'flex_1' }}></FlexItem>
              <FlexItem>
                <Flex>
                  <FlexItem className="file-folder-buttons">
                    <Button variant="primary" onClick={handleCreateFolderModalToggle} ouiaId="ShowCreateFolderModal">
                      Create Folder
                    </Button>
                  </FlexItem>
                  <FlexItem className="file-folder-buttons">
                    <Button
                      variant="primary"
                      onClick={handleUploadSingleFileModalToggle}
                      ouiaId="ShowUploadSingleFileModal"
                    >
                      Upload Single File
                    </Button>
                  </FlexItem>
                  <FlexItem className="file-folder-buttons">
                    <Button
                      variant="primary"
                      onClick={handleUploadFilesModalToggle}
                      ouiaId="ShowUploadMultipleFileModal"
                    >
                      Upload Multiple Files
                    </Button>
                  </FlexItem>
                  <FlexItem className="file-folder-buttons">
                    <Button
                      variant="primary"
                      onClick={handleImportModelModalToggle}
                      icon={<img className="button-logo" src={HfLogo} alt="HuggingFace Logo" />}
                      isDisabled={!selectedLocation || !locationId}
                      ouiaId="ShowImportHFModal"
                    >
                      Import HF Model
                    </Button>
                  </FlexItem>
                </Flex>
              </FlexItem>
            </Flex>
          </FlexItem>
          <FlexItem>
            {selectedItems.size > 0 && (
              <Toolbar>
                <ToolbarContent>
                  <ToolbarItem>
                    <Content component={ContentVariants.p}>
                      {selectedItems.size} item{selectedItems.size > 1 ? 's' : ''} selected
                    </Content>
                  </ToolbarItem>
                  <ToolbarItem>
                    <Button variant="primary" icon={<CopyIcon />} onClick={handleCopySelected}>
                      Copy to...
                    </Button>
                  </ToolbarItem>
                  <ToolbarItem>
                    <Button variant="danger" icon={<TrashIcon />} onClick={handleDeleteSelected}>
                      Delete
                    </Button>
                  </ToolbarItem>
                  <ToolbarItem>
                    <Button variant="link" onClick={() => setSelectedItems(new Set())}>
                      Clear selection
                    </Button>
                  </ToolbarItem>
                </ToolbarContent>
              </Toolbar>
            )}
            <Card component="div">
              <Table aria-label="Files list" isStickyHeader>
                <Thead>
                  <Tr>
                    <Th
                      screenReaderText="Select all"
                      select={{
                        onSelect: (_event, isSelecting) => handleSelectAll(isSelecting),
                        isSelected: selectedItems.size === filteredFiles.length && filteredFiles.length > 0,
                      }}
                    />
                    <Th width={30}>{columnNames.key}</Th>
                    <Th width={10}>{columnNames.lastModified}</Th>
                    <Th width={10}>{columnNames.size}</Th>
                    <Th width={10} screenReaderText="Actions" />
                  </Tr>
                </Thead>
                <Tbody>
                  {filteredDirectories.map((dir, rowIndex) => (
                    <Tr key={dir.path} className="bucket-row">
                      <Td />
                      <Td className="bucket-column">
                        <Button variant="link" onClick={handlePathClick(dir.path)} className="button-folder-link">
                          <FontAwesomeIcon icon={faFolder} className="folder-icon" />
                          {dir.name}
                        </Button>
                      </Td>
                      <Td className="bucket-column">{dir.modified ? new Date(dir.modified).toLocaleString() : '-'}</Td>
                      <Td className="bucket-column">-</Td>
                      <Td className="bucket-column align-right">
                        <Button
                          variant="danger"
                          className="button-file-control"
                          onClick={handleDeleteFolderClick(dir.path)}
                        >
                          <FontAwesomeIcon icon={faTrash} />
                        </Button>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
                <Tbody>
                  {filteredFiles.map((file, rowIndex) => (
                    <Tr
                      key={file.path}
                      className="bucket-row"
                      isRowSelected={selectedItems.has(file.path)}
                      onRowClick={(event) => {
                        if (event?.shiftKey) {
                          handleShiftClick(file.path);
                        }
                      }}
                    >
                      <Td
                        select={{
                          rowIndex: rowIndex,
                          onSelect: (_event, isSelecting) => handleSelectRow(file.path, isSelecting),
                          isSelected: selectedItems.has(file.path),
                        }}
                      />
                      <Td className="bucket-column">
                        <FontAwesomeIcon icon={faFile} className="file-icon" />
                        {file.name}
                      </Td>
                      <Td className="bucket-column">
                        {file.modified ? new Date(file.modified).toLocaleString() : '-'}
                      </Td>
                      <Td className="bucket-column">{file.size ? formatBytes(file.size) : '-'}</Td>
                      <Td className="bucket-column align-right">
                        <ToolbarContent>
                          <ToolbarGroup
                            variant="action-group-plain"
                            align={{ default: 'alignEnd' }}
                            gap={{ default: 'gapMd', md: 'gapMd' }}
                          >
                            <ToolbarItem gap={{ default: 'gapLg' }}>
                              <Tooltip content={<div>View this file.</div>}>
                                <Button
                                  variant="primary"
                                  className="button-file-control"
                                  isDisabled={!validateFileView(file.name, file.size || 0)}
                                  onClick={
                                    selectedLocation?.type === 'local'
                                      ? handleLocalFileViewClick(file.path)
                                      : handleObjectViewClick(file.path)
                                  }
                                >
                                  <FontAwesomeIcon icon={faEye} />
                                </Button>
                              </Tooltip>
                            </ToolbarItem>
                            <ToolbarItem gap={{ default: 'gapLg' }}>
                              <Tooltip content={<div>Download this file.</div>}>
                                <Button
                                  variant="primary"
                                  className="button-file-control"
                                  onClick={() => handleFileDownload(file)}
                                >
                                  <FontAwesomeIcon icon={faDownload} />
                                </Button>
                              </Tooltip>
                            </ToolbarItem>
                            <ToolbarItem variant="separator" />
                            <ToolbarItem>
                              <Tooltip content={<div>Delete this file.</div>}>
                                <Button
                                  variant="danger"
                                  className="button-file-control"
                                  onClick={handleDeleteFileClick(file.path)}
                                >
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
            {/* Pagination Controls */}
            {isTruncated && !serverSearchActive && (
              <Flex direction={{ default: 'row' }} style={{ marginTop: 'var(--pf-t--global--spacer--md)' }}>
                <FlexItem>
                  <Button
                    variant="secondary"
                    onClick={handleLoadMore}
                    isDisabled={isLoadingMore || deepSearchActive}
                    ouiaId="LoadMore"
                  >
                    {isLoadingMore ? 'Loading…' : `Load more (${paginationToken ? 'more available' : 'last page'})`}
                  </Button>
                </FlexItem>
              </Flex>
            )}
            {/* Deep Search UI */}
            {deepSearchActive && (
              <Flex direction={{ default: 'row' }} style={{ marginTop: 'var(--pf-t--global--spacer--md)' }}>
                <FlexItem>
                  <Content component={ContentVariants.p}>
                    Deep search active... scanned {deepSearchPagesScanned} additional page(s)...
                  </Content>
                </FlexItem>
                <FlexItem>
                  <Button variant="secondary" onClick={cancelDeepSearch} ouiaId="CancelDeepSearch">
                    Cancel
                  </Button>
                </FlexItem>
              </Flex>
            )}
            {/* Server Search Messages */}
            {serverSearchActive && filterMeta && (
              <Flex direction={{ default: 'column' }} style={{ marginTop: 'var(--pf-t--global--spacer--md)' }}>
                <FlexItem>
                  <Content component={ContentVariants.p}>
                    Showing partial results. {filterMeta.truncated ? 'More results may be available.' : ''}
                  </Content>
                </FlexItem>
              </Flex>
            )}
            {!serverSearchActive && searchObjectText.length >= 3 && isTruncated && (
              <Flex direction={{ default: 'column' }} style={{ marginTop: 'var(--pf-t--global--spacer--md)' }}>
                <FlexItem>
                  <Content component={ContentVariants.p}>
                    Client-side filtering active. Results may be incomplete. Deep search will auto-trigger if no matches
                    found.
                  </Content>
                </FlexItem>
              </Flex>
            )}
            <Flex direction={{ default: 'column' }}>
              <FlexItem className="file-list-notes" align={{ default: 'alignRight' }}>
                <Content component={ContentVariants.small}>
                  File viewer is only enabled for files smaller than 1MB and supported types.
                </Content>
              </FlexItem>
              <FlexItem className="file-list-notes" align={{ default: 'alignRight' }}>
                <Content component={ContentVariants.small}>
                  Deleting the last item in a folder will delete the folder.
                </Content>
              </FlexItem>
              <FlexItem className="file-list-notes" align={{ default: 'alignRight' }}>
                <Content component={ContentVariants.small}>Download of large files may fail.</Content>
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
          </Button>,
        ]}
        ouiaId="file-viewer-modal"
        className="file-viewer-modal"
      >
        <DocumentRenderer fileData={fileData} fileName={fileName} />
      </Modal>
      <Modal
        title={'Delete file?'}
        titleIconVariant="warning"
        className="bucket-modal"
        isOpen={isDeleteFileModalOpen}
        onClose={handleDeleteFileModalToggle}
        actions={[
          <Button
            key="confirm"
            variant="danger"
            onClick={handleDeleteFileConfirm}
            isDisabled={!validateFileToDelete() || isDeletingFile}
            isLoading={isDeletingFile}
          >
            Delete file
          </Button>,
          <Button key="cancel" variant="secondary" onClick={handleDeleteFileCancel}>
            Cancel
          </Button>,
        ]}
      >
        <Content>
          <Content component={ContentVariants.p}>This action cannot be undone.</Content>
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
            if (event.key === 'Enter') {
              event.preventDefault();
              if (validateFileToDelete()) {
                handleDeleteFileConfirm();
              }
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
          <Button
            key="confirm"
            variant="danger"
            onClick={handleDeleteFolderConfirm}
            isDisabled={!validateFolderToDelete() || isDeletingFolder}
            isLoading={isDeletingFolder}
          >
            Delete folder
          </Button>,
          <Button key="cancel" variant="secondary" onClick={handleDeleteFolderCancel}>
            Cancel
          </Button>,
        ]}
      >
        <Content>
          <Content component={ContentVariants.p}>This action cannot be undone.</Content>
          <Content component={ContentVariants.p}>
            Type <strong>{selectedFolder.replace(/\/$/, '').split('/').pop()}</strong> to confirm deletion.
          </Content>
        </Content>
        <TextInput
          id="delete-folder-modal-input"
          aria-label="Delete folder modal input"
          value={folderToDelete}
          onChange={(_event, folderToDelete) => setFolderToDelete(folderToDelete)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              if (validateFolderToDelete()) {
                handleDeleteFolderConfirm();
              }
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
          <Button
            key="create"
            variant="primary"
            onClick={handleNewFolderCreate}
            isDisabled={newFolderName.length < 1 || newFolderNameRulesVisibility}
          >
            Create
          </Button>,
          <Button key="cancel" variant="link" onClick={handleNewFolderCancel}>
            Cancel
          </Button>,
        ]}
        ouiaId="CreateFolderModal"
      >
        <Form
          onSubmit={(event) => {
            event.preventDefault();
            if (newFolderName.length > 0 && !newFolderNameRulesVisibility) {
              handleNewFolderCreate();
            }
          }}
        >
          <FormGroup label="Folder name" isRequired fieldId="folder-name">
            <TextInput
              isRequired
              type="text"
              id="folder-name"
              name="folder-name"
              aria-describedby="folder-name-helper"
              placeholder="Enter at least 1 character"
              value={newFolderName}
              onChange={(_event, newFolderName) => setNewFolderName(newFolderName)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  if (newFolderName.length > 0 && !newFolderNameRulesVisibility) {
                    handleNewFolderCreate();
                  }
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
        actions={(() => {
          console.log('[HF Import Modal] currentImportJobId:', currentImportJobId);
          const actions = [
            <Button
              key="import"
              variant="primary"
              onClick={handleImportModelConfirm}
              isDisabled={!isHfFormValid() || currentImportJobId !== null}
            >
              Import
            </Button>,
            currentImportJobId !== null && (
              <Button key="cancel-import" variant="danger" onClick={handleCancelImport}>
                Cancel Import
              </Button>
            ),
            <Button key="close" variant="link" onClick={handleImportModelClose}>
              Close
            </Button>,
          ].filter(Boolean);
          console.log('[HF Import Modal] Actions after filter:', actions.length);
          return actions;
        })()}
        ouiaId="ImportModelModal"
      >
        <Form
          onSubmit={(event) => {
            event.preventDefault();
            if (isHfFormValid()) {
              handleImportModelConfirm(event as unknown as React.MouseEvent);
            }
          }}
        >
          <FormGroup label="Model ID" isRequired fieldId="model-name">
            <TextInput
              isRequired
              type="text"
              id="model-name"
              name="model-name"
              aria-describedby="model-name-helper"
              placeholder="e.g., meta-llama/Llama-2-7b-hf"
              value={modelName}
              onChange={(_event, modelName) => setModelName(modelName)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  if (isHfFormValid()) {
                    handleImportModelConfirm(event as unknown as React.MouseEvent);
                  }
                }
              }}
            />
            <FormHelperText>
              <HelperText>
                <HelperTextItem>
                  Enter the HuggingFace model repository ID. Model will be imported to the current location.
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>
        </Form>
        <Flex direction={{ default: 'column' }} className="upload-bars">
          {modelFiles.map((file) => (
            <FlexItem key={file}>
              <Progress
                value={uploadToS3Percentages[file]?.loaded ?? 0}
                title={`${file} - ${uploadToS3Percentages[file]?.status ?? ''}`}
                measureLocation="outside"
                variant={uploadToS3Percentages[file]?.status === 'completed' ? 'success' : undefined}
                size={ProgressSize.sm}
              />
            </FlexItem>
          ))}
        </Flex>
      </Modal>
      <Modal
        title={'Upload file'}
        className="bucket-modal"
        isOpen={isUploadSingleFileModalOpen}
        onClose={handleUploadSingleFileModalToggle}
        actions={[
          <Button key="confirm" variant="primary" onClick={handleUploadFileConfirm} isDisabled={singleFilename === ''}>
            Upload
          </Button>,
          <Button key="cancel" variant="link" onClick={handleUploadFileCancel}>
            Cancel
          </Button>,
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
        <Flex direction={{ default: 'column' }} className="upload-bars">
          <FlexItem hidden={!(uploadPercentages[singleFilename] && uploadPercentages[singleFilename].loaded !== 0)}>
            <Progress
              value={uploadPercentages[singleFilename]?.loaded ?? 0}
              title="Upload to backend progress"
              size={ProgressSize.sm}
            />
          </FlexItem>
          <FlexItem
            hidden={!(uploadToS3Percentages[singleFilename] && uploadToS3Percentages[singleFilename].loaded !== 0)}
          >
            <Progress
              value={uploadToS3Percentages[singleFilename]?.loaded ?? 0}
              title="Upload to storage progress"
              size={ProgressSize.sm}
            />
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
          </Button>,
        ]}
      >
        <MultipleFileUpload onFileDrop={handleFileDrop} isHorizontal={false}>
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
              {currentFiles.map((file) => {
                // Calculate progress key for this file (must match handleFileDrop and handleFileUpload logic)
                const filePath = file.path.replace(/^\//, '');
                const progressKey = currentPath
                  ? currentPath.endsWith('/')
                    ? currentPath + filePath
                    : currentPath + '/' + filePath
                  : filePath;

                // For local/PVC storage, use axios progress (uploadPercentages)
                // For S3 storage, use SSE progress (uploadToS3Percentages)
                const isLocalStorage = selectedLocation?.type === 'local';
                const progressData = isLocalStorage
                  ? uploadPercentages[progressKey]
                  : uploadToS3Percentages[progressKey];

                const progressValue = progressData?.loaded ?? 0;

                // Determine status: use S3 status if available, or infer from uploadedFiles
                const s3Status = uploadToS3Percentages[progressKey]?.status;
                const uploadedFile = uploadedFiles.find((f) => f.path === file.path);
                const inferredStatus =
                  uploadedFile?.loadResult === 'success'
                    ? 'completed'
                    : uploadedFile?.loadResult === 'danger'
                      ? 'failed'
                      : progressValue === 100
                        ? 'completed'
                        : progressValue > 0
                          ? 'uploading'
                          : 'queued';
                const status = s3Status || inferredStatus;

                return (
                  <MultipleFileUploadStatusItem
                    file={file}
                    key={file.path}
                    fileName={file.path + (status ? ' - ' + status : '')}
                    onClearClick={() => removeFiles([file.path])}
                    progressHelperText={createHelperText(file)}
                    customFileHandler={() => {}}
                    progressValue={progressValue}
                    progressVariant={status === 'completed' ? 'success' : undefined}
                  />
                );
              })}
            </MultipleFileUploadStatus>
          )}
        </MultipleFileUpload>
      </Modal>
      <Modal
        title="Import Cancelled - Cleanup Files?"
        titleIconVariant="warning"
        className="bucket-modal"
        isOpen={showCleanupDialog}
        onClose={() => handleCleanupDecision(false)}
        actions={[
          <Button
            key="delete"
            variant="danger"
            onClick={() => handleCleanupDecision(true)}
            isLoading={isDeletingFiles}
            isDisabled={isDeletingFiles}
          >
            Delete All Downloaded Files
          </Button>,
          <Button
            key="keep"
            variant="primary"
            onClick={() => handleCleanupDecision(false)}
            isDisabled={isDeletingFiles}
          >
            Keep Files
          </Button>,
        ]}
        ouiaId="CleanupFilesModal"
      >
        <Content>
          <Content component={ContentVariants.p}>
            The import has been cancelled. The following files were downloaded:
          </Content>
          <ul>
            {cancelledJobInfo?.files?.map((file: any, index: number) => (
              <li key={index}>
                {file.destinationPath.split('/').pop()} - {file.status}
              </li>
            ))}
          </ul>
          <Content component={ContentVariants.p}>
            Do you want to keep these files or delete them?
          </Content>
        </Content>
      </Modal>
      <TransferAction
        isOpen={isTransferModalOpen}
        onClose={() => {
          setIsTransferModalOpen(false);
          // Refresh file list after transfer completes
          if (selectedLocation && selectedLocation.available) {
            refreshFiles(selectedLocation, path || '', null, false, undefined, abortControllerRef.current || undefined);
          }
          // Clear selection
          setSelectedItems(new Set());
        }}
        sourceLocationId={locationId!}
        sourceType={selectedLocation?.type || 's3'}
        sourcePath={currentPath}
        selectedFiles={Array.from(selectedItems)}
      />
    </div>
  );
};

export default StorageBrowser;
