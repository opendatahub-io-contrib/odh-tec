export interface UploadedFile {
    fileName: string;
    path?: string;
    loadResult?: 'danger' | 'success';
    loadError?: DOMException;
}

export interface ExtendedFile extends File {
    path: string;
    uploadProgress?: number;
    uploadS3Progress?: number;
}

export class Bucket {
    Name: string;
    CreationDate: string;

    constructor(name: string, creationDate: string) {
        this.Name = name;
        this.CreationDate = creationDate;
    }
}

export class Owner {
    DisplayName: string;
    ID: string;

    constructor(displayName: string, id: string) {
        this.DisplayName = displayName;
        this.ID = id;
    }
}

export class BucketsList {
    buckets: Bucket[];
    owner: Owner;

    constructor(buckets: Bucket[], owner: Owner) {
        this.buckets = buckets;
        this.owner = owner;
    }
}

const formatBytes = (bytes: number): string => {
    if (bytes === 0) {
        return '0 B';
    }
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const value = parseFloat((bytes / Math.pow(k, i)).toFixed(2));
    return `${value} ${sizes[i]}`;
};

export class S3Object {
    Key: string;
    LastModified: string;
    Size: string;
    OriginalSize: number;

    constructor(key: string, lastModified: string, originalSize: string) {
        this.Key = key;
        this.LastModified = lastModified;
        this.Size = formatBytes(parseInt(originalSize));
        this.OriginalSize = parseInt(originalSize);
    }
}

export class S3Objects {
    s3Objects: S3Object[];

    constructor(Objects: S3Object[]) {
        this.s3Objects = Objects;
    }
}

export class S3Prefix {
    Prefix: string;

    constructor(prefix: string) {
        this.Prefix = prefix;
    }
}

export class S3Prefixes {
    s3Prefixes: S3Prefix[];

    constructor(Prefixes: S3Prefix[]) {
        this.s3Prefixes = Prefixes;
    }
}

export interface ObjectRow {
    key: string;
    lastModified: string;
    size: string;
    originalSize: number;
}

export interface PrefixRow {
    prefix: string;
}