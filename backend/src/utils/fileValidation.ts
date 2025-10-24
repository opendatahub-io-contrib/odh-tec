import path from 'path';

// Allowed file extensions for ML/data workloads
const ALLOWED_EXTENSIONS = [
  // Model files
  '.safetensors',
  '.bin',
  '.pt',
  '.pth',
  '.onnx',
  '.gguf',
  '.h5',
  // Data files
  '.csv',
  '.json',
  '.jsonl',
  '.parquet',
  '.arrow',
  '.feather',
  // Text files
  '.txt',
  '.md',
  '.yaml',
  '.yml',
  // Archives
  '.tar',
  '.gz',
  '.zip',
  '.tgz',
  // Images (for datasets)
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.bmp',
  // Audio/Video (for datasets)
  '.wav',
  '.mp3',
  '.mp4',
  '.avi',
  // Notebooks
  '.ipynb',
];

// Blocked file extensions (security risk)
const BLOCKED_EXTENSIONS = [
  // Executables
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.sh',
  '.bat',
  '.cmd',
  '.com',
  // Scripts
  '.js',
  '.ts',
  '.py',
  '.rb',
  '.pl',
  '.php',
  // System files
  '.sys',
  '.drv',
];

export interface FileValidationResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Validate if file type is allowed
 * @param filename - Name of the file to validate
 * @returns Validation result with allowed flag and optional reason
 */
export function validateFileType(filename: string): FileValidationResult {
  const ext = path.extname(filename).toLowerCase();

  // No extension
  if (!ext) {
    return {
      allowed: false,
      reason: 'Files without extensions are not allowed',
    };
  }

  // Check blocked list first (takes precedence)
  if (BLOCKED_EXTENSIONS.includes(ext)) {
    return {
      allowed: false,
      reason: `File type ${ext} is blocked for security reasons`,
    };
  }

  // Check allowed list
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return {
      allowed: false,
      reason: `File type ${ext} is not in the allowed list`,
    };
  }

  return { allowed: true };
}

/**
 * Get list of allowed extensions
 */
export function getAllowedExtensions(): string[] {
  return [...ALLOWED_EXTENSIONS];
}
