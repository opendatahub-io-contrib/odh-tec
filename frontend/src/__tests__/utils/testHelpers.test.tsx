import { MockEventSource, createAxiosMock, createMockFile, waitForAsync } from './testHelpers';
import { MOCK_FILE_ENTRIES, MOCK_STORAGE_LOCATIONS } from './fixtures';

describe('Test Infrastructure', () => {
  it('should create axios mock adapter', () => {
    const axiosMock = createAxiosMock();
    expect(axiosMock).toBeDefined();
  });

  it('should create mock file', () => {
    const file = createMockFile('test.txt', 100);
    expect(file.name).toBe('test.txt');
    expect(file.size).toBe(100);
  });

  it('should have mock storage locations', () => {
    expect(MOCK_STORAGE_LOCATIONS.length).toBeGreaterThan(0);
    expect(MOCK_STORAGE_LOCATIONS[0]).toHaveProperty('id');
    expect(MOCK_STORAGE_LOCATIONS[0]).toHaveProperty('name');
  });

  it('should have mock file entries', () => {
    expect(MOCK_FILE_ENTRIES.length).toBeGreaterThan(0);
    expect(MOCK_FILE_ENTRIES[0]).toHaveProperty('name');
    expect(MOCK_FILE_ENTRIES[0]).toHaveProperty('type');
  });

  it('should provide waitForAsync helper', async () => {
    const promise = waitForAsync();
    expect(promise).toBeInstanceOf(Promise);
    await promise;
  });

  it('should create MockEventSource', () => {
    const mockEventSource = new MockEventSource('http://test.com/events');
    expect(mockEventSource.url).toBe('http://test.com/events');
    expect(mockEventSource.readyState).toBe(0);
  });
});
