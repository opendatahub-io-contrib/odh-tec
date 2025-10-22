import { createMockFilesystem, createMockS3Client } from './testHelpers';
import { PATH_TRAVERSAL_ATTACKS } from './fixtures';

describe('Test Infrastructure', () => {
  it('should create mock filesystem', () => {
    const fs = createMockFilesystem({ '/test/file.txt': 'content' });
    expect(fs.existsSync('/test/file.txt')).toBe(true);
  });

  it('should create S3 mock client', () => {
    const s3Mock = createMockS3Client();
    expect(s3Mock).toBeDefined();
  });

  it('should have path traversal attack vectors', () => {
    expect(PATH_TRAVERSAL_ATTACKS.length).toBeGreaterThan(0);
  });
});
