import path from 'path';

// Default allowed file extensions for ML/data workloads and documents
const DEFAULT_ALLOWED_EXTENSIONS = [
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
  // Document files
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.odt',
  '.ods',
  '.odp',
  '.rtf',
  // Markup/style files
  '.xml',
  '.html',
  '.css',
  // Backup/misc files
  '.old',
  '.bak',
  '.backup',
  '.tmp',
  // Log files
  '.log',
  '.sql',
];

// Default blocked file extensions (security risk)
const DEFAULT_BLOCKED_EXTENSIONS = [
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

/**
 * Parse comma-separated file extensions from environment variable
 * Ensures all extensions start with a dot and are lowercase
 */
function parseExtensions(envValue: string | undefined): string[] {
  if (!envValue || envValue.trim() === '') {
    return [];
  }

  return envValue
    .split(',')
    .map((ext) => ext.trim().toLowerCase())
    .filter((ext) => ext.length > 0)
    .map((ext) => (ext.startsWith('.') ? ext : `.${ext}`));
}

/**
 * Build allowed extensions list based on defaults and environment variables
 * Priority: ALLOWED_FILE_EXTENSIONS (override) > ALLOWED_FILE_EXTENSIONS_APPEND (append) > defaults
 */
function buildAllowedExtensions(): string[] {
  const override = process.env.ALLOWED_FILE_EXTENSIONS;
  const append = process.env.ALLOWED_FILE_EXTENSIONS_APPEND;

  if (override !== undefined) {
    return parseExtensions(override);
  }

  const extensions = [...DEFAULT_ALLOWED_EXTENSIONS];
  if (append !== undefined) {
    extensions.push(...parseExtensions(append));
  }

  return extensions;
}

/**
 * Build blocked extensions list based on defaults and environment variables
 * Priority: BLOCKED_FILE_EXTENSIONS (override) > BLOCKED_FILE_EXTENSIONS_APPEND (append) > defaults
 */
function buildBlockedExtensions(): string[] {
  const override = process.env.BLOCKED_FILE_EXTENSIONS;
  const append = process.env.BLOCKED_FILE_EXTENSIONS_APPEND;

  if (override !== undefined) {
    return parseExtensions(override);
  }

  const extensions = [...DEFAULT_BLOCKED_EXTENSIONS];
  if (append !== undefined) {
    extensions.push(...parseExtensions(append));
  }

  return extensions;
}

// Build final extension lists (computed once at module load)
const ALLOWED_EXTENSIONS = buildAllowedExtensions();
const BLOCKED_EXTENSIONS = buildBlockedExtensions();

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
 * Get list of allowed extensions (includes env var overrides/appends)
 */
export function getAllowedExtensions(): string[] {
  return [...ALLOWED_EXTENSIONS];
}

/**
 * Get list of blocked extensions (includes env var overrides/appends)
 */
export function getBlockedExtensions(): string[] {
  return [...BLOCKED_EXTENSIONS];
}
