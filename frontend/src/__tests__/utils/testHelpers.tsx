import React from 'react';
import { RenderOptions, render } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import MockAdapter from 'axios-mock-adapter';
import axios from 'axios';

/**
 * Custom render function that includes common providers
 */
export function renderWithRouter(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <BrowserRouter>{children}</BrowserRouter>
  );

  return render(ui, { wrapper: Wrapper, ...options });
}

/**
 * Creates an axios mock adapter for API testing
 */
export function createAxiosMock() {
  return new MockAdapter(axios);
}

/**
 * Mock EventSource for SSE testing
 */
export class MockEventSource {
  url: string;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onopen: ((event: Event) => void) | null = null;
  readyState: number = 0;
  CONNECTING = 0;
  OPEN = 1;
  CLOSED = 2;

  constructor(url: string) {
    this.url = url;
    // Simulate connection opening
    setTimeout(() => {
      this.readyState = this.OPEN;
      if (this.onopen) {
        this.onopen(new Event('open'));
      }
    }, 0);
  }

  close() {
    this.readyState = this.CLOSED;
  }

  // Test helper to simulate receiving a message
  simulateMessage(data: unknown) {
    if (this.onmessage) {
      const event = new MessageEvent('message', {
        data: JSON.stringify(data)
      });
      this.onmessage(event);
    }
  }

  // Test helper to simulate an error
  simulateError() {
    if (this.onerror) {
      this.onerror(new Event('error'));
    }
  }
}

/**
 * Replace global EventSource with mock
 */
export function setupEventSourceMock() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global as any).EventSource = MockEventSource;
}

/**
 * Restore original EventSource
 */
export function teardownEventSourceMock() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (global as any).EventSource;
}

/**
 * Wait for async updates in tests
 */
export const waitForAsync = () => new Promise(resolve => setTimeout(resolve, 0));

/**
 * Simulate file selection in input
 */
export function createMockFile(
  name: string,
  size: number,
  type: string = 'text/plain'
): File {
  const blob = new Blob(['a'.repeat(size)], { type });
  return new File([blob], name, { type });
}

/**
 * Mock storage service
 */
export function createMockStorageService() {
  return {
    getLocations: jest.fn(),
    listFiles: jest.fn(),
    uploadFile: jest.fn(),
    downloadFile: jest.fn(),
    deleteFile: jest.fn(),
    createDirectory: jest.fn(),
    checkConflicts: jest.fn(),
    initiateTransfer: jest.fn(),
    cancelTransfer: jest.fn()
  };
}
