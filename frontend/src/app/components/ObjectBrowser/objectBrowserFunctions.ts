import * as React from 'react';
import config from '@app/config';
import axios from 'axios';
import { S3Object, S3Objects, S3Prefix, S3Prefixes, ExtendedFile, BucketsList, Bucket, Owner } from './objectBrowserTypes';
import Emitter from '../../utils/emitter';
import { NavigateFunction } from 'react-router';

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

// Fetches the objects from the backend and updates the state
export const refreshObjects = (bucketName: string, prefix: string, setDecodedPrefix, setS3Objects, setS3Prefixes) => {
    let url = '';
    if (bucketName === ':bucketName') {
        return;
    }
    if (prefix === undefined || prefix === ':prefix') {
        setDecodedPrefix('');
        url = `${config.backend_api_url}/objects/${bucketName}`;
    } else {
        setDecodedPrefix(atob(prefix));
        url = `${config.backend_api_url}/objects/${bucketName}/${prefix}`;
    }
    axios.get(url)
        .then((response) => {
            const { objects, prefixes } = response.data;
            if (objects !== undefined) {
                const newS3Objects = new S3Objects(
                    objects.map((s3Object: any) => new S3Object(s3Object.Key, s3Object.LastModified, s3Object.Size))
                );
                setS3Objects(newS3Objects);
            } else {
                setS3Objects(null);
            }
            if (prefixes !== undefined) {
                const newS3Prefixes = new S3Prefixes(
                    prefixes.map((s3Prefix: any) => new S3Prefix(s3Prefix.Prefix))
                );
                setS3Prefixes(newS3Prefixes);
            } else {
                setS3Prefixes(null);
            }
        })
        .catch((error) => {
            setS3Objects(null);
            setS3Prefixes(null);
            console.error('Error fetching objects', error);
            Emitter.emit('notification', { variant: 'warning', title: error.response?.data?.error || 'Error Fetching Objects', description: error.response?.data?.message || 'Failed to fetch objects from the backend.' });
        });
}

// Uploads a single file to the backend
export const uploadSingleFile = async (file: ExtendedFile, decodedPrefix: string, bucketName: string, setDecodedPrefix, setS3Objects, setS3Prefixes, resetUploadPanel) => {
    const formData = new FormData();
    formData.append('file', file);

    const encodedKey = btoa(decodedPrefix + file.path.replace(/^\//, '')); // remove leading slash in case of folder upload

    axios.post(`${config.backend_api_url}/objects/upload/${bucketName}/${encodedKey}`, formData, {
        headers: {
            'Content-Type': 'multipart/form-data'
        },
        onUploadProgress: (progressEvent) => {
            //setUploadedPercentage(Math.round((progressEvent.loaded / fileSize) * 100));
        }
    })
        .then(response => {
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
