import * as React from 'react';
import config from '@app/config';
import axios from 'axios';
import { S3Object, S3Objects, S3Prefix, S3Prefixes, ExtendedFile, BucketsList, Bucket, Owner } from './objectBrowserTypes';
import Emitter from '../../utils/emitter';
import { NavigateFunction } from 'react-router';

// Abort controller for in-flight object listings (pagination aware)
let currentObjectsFetchAbort: AbortController | null = null;

// Helper: determine if a string is likely base64 (non-empty & reversible)
const isBase64 = (value: string): boolean => {
    if (!value || /[^A-Za-z0-9+/=]/.test(value)) return false;
    try {
        return btoa(atob(value)) === value;
    } catch {
        return false;
    }
};

// Fetches the buckets from the backend and updates the state
export const loadBuckets = (bucketName: string, navigate: NavigateFunction, setBucketsList) => {
    axios.get(`${config.backend_api_url}/buckets`)
        .then(response => {
            if (response.status === 200) {
                const { owner, defaultBucket, buckets } = response.data;
                const newBucketsState = new BucketsList(
                    buckets.map((bucket: any) => new Bucket(bucket.Name, bucket.CreationDate)),
                    new Owner(owner.DisplayName, owner.ID)
                );
                setBucketsList(newBucketsState);
                if (bucketName === ':bucketName') {
                    if (defaultBucket !== '')
                        navigate(`/objects/${defaultBucket}`);
                    else {
                        navigate(`/objects/${buckets[0].Name}`);
                    }
                }
            } else {
                Emitter.emit('notification', { variant: 'warning', title: 'Error fetching buckets', description: 'Failed to fetch buckets from the backend.' });
            }
        })
        .catch(error => {
            console.error(error);
            Emitter.emit('notification', { variant: 'warning', title: error.response?.data?.error || 'Error Fetching Buckets', description: error.response?.data?.message || 'Failed to fetch buckets from the backend.' });
        });
}

// Fetches the objects from the backend and updates the state WITH pagination support
export const refreshObjects = (
    bucketName: string,
    prefix: string,
    setDecodedPrefix,
    setS3Objects,
    setS3Prefixes,
    setNextContinuationToken?: (v: string | null) => void,
    setIsTruncated?: (v: boolean) => void,
    continuationToken?: string | null,
    append: boolean = false,
    searchOptions?: { q?: string; mode?: 'startsWith' | 'contains' },
    setFilterMeta?: (meta: any) => void,
    abortController?: AbortController // Accept external abort controller
): Promise<void> => {
    if (bucketName === ':bucketName') {
        return Promise.resolve();
    }

    // Use provided abort controller or create new one
    const controller = abortController || new AbortController();

    // Only abort the global controller if no external controller is provided
    if (!abortController && currentObjectsFetchAbort) {
        currentObjectsFetchAbort.abort();
    }
    if (!abortController) {
        currentObjectsFetchAbort = controller;
    }

    let url = '';
    // Root listing when no prefix provided or placeholder
    if (!prefix || prefix === ':prefix') {
        setDecodedPrefix('');
        url = `${config.backend_api_url}/objects/${bucketName}`;
    } else if (isBase64(prefix)) {
        // Prefix provided as encoded (normal flow)
        try {
            const decoded = atob(prefix);
            setDecodedPrefix(decoded);
            url = `${config.backend_api_url}/objects/${bucketName}/${prefix}`;
        } catch {
            // Fallback to root if decoding fails
            setDecodedPrefix('');
            url = `${config.backend_api_url}/objects/${bucketName}`;
        }
    } else {
        // Prefix appears already decoded (e.g. older call sites) – encode for request
        const encoded = btoa(prefix);
        setDecodedPrefix(prefix);
        url = `${config.backend_api_url}/objects/${bucketName}/${encoded}`;
    }

    if (continuationToken) {
        url += `${url.includes('?') ? '&' : '?'}continuationToken=${encodeURIComponent(continuationToken)}`;
    }
    if (searchOptions?.q && searchOptions.q.length >= 3) {
        url += `${url.includes('?') ? '&' : '?'}q=${encodeURIComponent(searchOptions.q)}`;
        if (searchOptions.mode) {
            url += `&mode=${encodeURIComponent(searchOptions.mode)}`;
        }
    }

    return axios.get(url, { signal: controller.signal })
        .then((response) => {
            const { objects, prefixes, nextContinuationToken, isTruncated, filter } = response.data;
            if (setFilterMeta) setFilterMeta(filter || null);

            if (setNextContinuationToken) setNextContinuationToken(nextContinuationToken || null);
            if (setIsTruncated) setIsTruncated(!!isTruncated);

            const newS3Objects = objects !== undefined ? new S3Objects(
                objects.map((s3Object: any) => new S3Object(s3Object.Key, s3Object.LastModified, s3Object.Size))
            ) : null;
            const newS3Prefixes = prefixes !== undefined ? new S3Prefixes(
                prefixes.map((s3Prefix: any) => new S3Prefix(s3Prefix.Prefix))
            ) : null;

            if (append) {
                if (newS3Objects) {
                    setS3Objects((prev) => {
                        if (!prev) return newS3Objects;
                        const existingKeys = new Set(prev.s3Objects.map(o => o.Key));
                        const merged = [...prev.s3Objects];
                        for (const o of newS3Objects.s3Objects) {
                            if (!existingKeys.has(o.Key)) merged.push(o);
                        }
                        return new S3Objects(merged);
                    });
                }
                if (newS3Prefixes) {
                    setS3Prefixes((prev) => {
                        if (!prev) return newS3Prefixes;
                        const existingPref = new Set(prev.s3Prefixes.map(p => p.Prefix));
                        const merged = [...prev.s3Prefixes];
                        for (const p of newS3Prefixes.s3Prefixes) {
                            if (!existingPref.has(p.Prefix)) merged.push(p);
                        }
                        return new S3Prefixes(merged);
                    });
                }
            } else {
                setS3Objects(newS3Objects);
                setS3Prefixes(newS3Prefixes);
            }
        })
        .catch((error) => {
            // Preserve existing data if append failed; only reset on initial load failures
            if (!append) {
                setS3Objects(null);
                setS3Prefixes(null);
                if (setNextContinuationToken) setNextContinuationToken(null);
                if (setIsTruncated) setIsTruncated(false);
            }
            if (!axios.isCancel(error)) {
                console.error('Error fetching objects', error);
                Emitter.emit('notification', { variant: 'warning', title: error.response?.data?.error || 'Error Fetching Objects', description: error.response?.data?.message || 'Failed to fetch objects from the backend.' });
            }
        })
        .finally(() => {
            if (currentObjectsFetchAbort === controller) {
                currentObjectsFetchAbort = null;
            }
        });
}

// Uploads a single file to the backend
export const uploadSingleFile = async (file: ExtendedFile, decodedPrefix: string, bucketName: string, setDecodedPrefix, setS3Objects, setS3Prefixes, resetUploadPanel) => {
    const formData = new FormData();
    formData.append('file', file);

    const encodedKey = btoa(decodedPrefix + file.path.replace(/^[\\/]/, '')); // normalize leading slash

    axios.post(`${config.backend_api_url}/objects/upload/${bucketName}/${encodedKey}`, formData, {
        headers: {
            'Content-Type': 'multipart/form-data'
        },
        onUploadProgress: (progressEvent) => {
            // progress hook intentionally left blank (handled elsewhere)
        }
    })
        .then(response => {
            // Refresh using decoded prefix (refreshObjects will encode if needed)
            refreshObjects(bucketName, decodedPrefix, setDecodedPrefix, setS3Objects, setS3Prefixes);
        })
        .catch(error => {
            console.error('Error uploading file', error);
            Emitter.emit('notification', { variant: 'warning', title: error.response?.data?.error || 'File Upload Failed', description: error.response?.data?.message || String(error) });
            resetUploadPanel();
        });
}

// Deletes a file from the backend
export const deleteFile = (bucketName: string, decodedPrefix: string, selectedFile: string, navigate: NavigateFunction, setFileToDelete, setIsDeleteFileModalOpen) => {
    axios.delete(`${config.backend_api_url}/objects/${bucketName}/${btoa(selectedFile)}`)
        .then(response => {
            Emitter.emit('notification', { variant: 'success', title: 'File deleted', description: 'File "' + selectedFile.split('/').pop() + '" has been successfully deleted.' });
            navigate(`/objects/${bucketName}/${btoa(decodedPrefix)}`);
            setFileToDelete('');
            setIsDeleteFileModalOpen(false);
        })
        .catch(error => {
            console.error('Error deleting file', error);
            Emitter.emit('notification', { variant: 'warning', title: error.response?.data?.error || 'File Deletion Failed', description: error.response?.data?.message || String(error) });
        });
}

// Deletes a folder from the backend
export const deleteFolder = (bucketName: string, decodedPrefix: string, selectedFolder: string, navigate: NavigateFunction, setFolderToDelete, setIsDeleteFolderModalOpen) => {
    axios.delete(`${config.backend_api_url}/objects/${bucketName}/${btoa(selectedFolder)}`)
        .then(response => {
            Emitter.emit('notification', { variant: 'success', title: 'Folder deleted', description: 'Folder "' + selectedFolder.slice(0, -1).split('/').pop() + '" has been successfully deleted.' });
            navigate(`/objects/${bucketName}/${btoa(decodedPrefix)}`);
            setFolderToDelete('');
            setIsDeleteFolderModalOpen(false);
        })
        .catch(error => {
            console.error('Error deleting folder', error);
            Emitter.emit('notification', { variant: 'warning', title: error.response?.data?.error || 'Folder Deletion Failed', description: error.response?.data?.message || String(error) });
        });
}

// Creates a new folder in the current path
export const createFolder = (bucketName: string, decodedPrefix: string, newFolderName: string, navigate: NavigateFunction, setNewFolderName, setIsCreateFolderModalOpen) => {
    const formData = new FormData();
    const emptyFile = new File([''], '.s3keep');
    formData.append('file', emptyFile);
    const encodedKey = btoa(decodedPrefix + newFolderName + '/.s3keep');
    axios.post(`${config.backend_api_url}/objects/upload/${bucketName}/${encodedKey}`, formData, {
        headers: {
            'Content-Type': 'multipart/form-data'
        }
    })
        .then(response => {
            Emitter.emit('notification', { variant: 'success', title: 'Folder created', description: 'Folder "' + newFolderName + '" has been successfully created.' });
            setNewFolderName('');
            setIsCreateFolderModalOpen(false)
            navigate(`/objects/${bucketName}/${btoa(decodedPrefix)}`);
        })
        .catch(error => {
            console.error('Error creating folder', error);
            Emitter.emit('notification', { variant: 'warning', title: error.response?.data?.error || 'Folder Creation Failed', description: error.response?.data?.message || String(error) });
        });
}
