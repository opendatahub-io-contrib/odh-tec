import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TransferProgress } from '@app/components/Transfer/TransferProgress';
import { storageService } from '@app/services/storageService';
import { MockEventSource } from '../../../utils/testHelpers';

// Mock the storage service
jest.mock('@app/services/storageService', () => ({
  storageService: {
    cancelTransfer: jest.fn(),
  },
}));

// Mock the emitter
jest.mock('@app/utils/emitter', () => ({
  __esModule: true,
  default: {
    emit: jest.fn(),
  },
}));

describe('TransferProgress', () => {
  let mockEventSource: MockEventSource;

  beforeEach(() => {
    jest.clearAllMocks();

    // Replace global EventSource with mock
    mockEventSource = new MockEventSource('http://test.com/events');
    global.EventSource = jest.fn(() => mockEventSource) as never;
  });

  afterEach(() => {
    mockEventSource.close();
  });

  it('should establish SSE connection when opened with jobId and sseUrl', async () => {
    render(
      <TransferProgress
        isOpen={true}
        jobId="job-123"
        sseUrl="http://test.com/progress/job-123"
        onClose={jest.fn()}
      />
    );

    expect(global.EventSource).toHaveBeenCalledWith('http://test.com/progress/job-123');
  });

  it('should display transfer progress updates', async () => {
    render(
      <TransferProgress
        isOpen={true}
        jobId="job-123"
        sseUrl="http://test.com/progress/job-123"
        onClose={jest.fn()}
      />
    );

    // Simulate receiving a progress update
    mockEventSource.simulateMessage({
      file: 'test-file.txt',
      status: 'transferring',
      loaded: 512,
      total: 1024,
    });

    await waitFor(() => {
      expect(screen.getByText('test-file.txt')).toBeInTheDocument();
      expect(screen.getByText('Transferring')).toBeInTheDocument();
    });
  });

  it('should show completed status for finished transfers', async () => {
    render(
      <TransferProgress
        isOpen={true}
        jobId="job-123"
        sseUrl="http://test.com/progress/job-123"
        onClose={jest.fn()}
      />
    );

    mockEventSource.simulateMessage({
      file: 'test-file.txt',
      status: 'completed',
      loaded: 1024,
      total: 1024,
    });

    await waitFor(() => {
      expect(screen.getByText('test-file.txt')).toBeInTheDocument();
      expect(screen.getByText('Complete')).toBeInTheDocument();
    });
  });

  it('should show error status for failed transfers', async () => {
    render(
      <TransferProgress
        isOpen={true}
        jobId="job-123"
        sseUrl="http://test.com/progress/job-123"
        onClose={jest.fn()}
      />
    );

    mockEventSource.simulateMessage({
      file: 'test-file.txt',
      status: 'error',
      error: 'Network error',
    });

    await waitFor(() => {
      expect(screen.getByText('test-file.txt')).toBeInTheDocument();
      expect(screen.getByText('Error')).toBeInTheDocument();
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('should display progress bar for transferring files', async () => {
    render(
      <TransferProgress
        isOpen={true}
        jobId="job-123"
        sseUrl="http://test.com/progress/job-123"
        onClose={jest.fn()}
      />
    );

    mockEventSource.simulateMessage({
      file: 'test-file.txt',
      status: 'transferring',
      loaded: 512,
      total: 1024,
    });

    await waitFor(() => {
      expect(screen.getByText(/512\.00 B.*1\.00 KB/)).toBeInTheDocument();
    });
  });

  it('should handle multiple file transfers', async () => {
    render(
      <TransferProgress
        isOpen={true}
        jobId="job-123"
        sseUrl="http://test.com/progress/job-123"
        onClose={jest.fn()}
      />
    );

    mockEventSource.simulateMessage({
      file: 'file1.txt',
      status: 'transferring',
      loaded: 512,
      total: 1024,
    });

    mockEventSource.simulateMessage({
      file: 'file2.txt',
      status: 'completed',
      loaded: 2048,
      total: 2048,
    });

    await waitFor(() => {
      expect(screen.getByText('file1.txt')).toBeInTheDocument();
      expect(screen.getByText('file2.txt')).toBeInTheDocument();
    });
  });

  it('should call cancelTransfer when cancel button clicked', async () => {
    const user = userEvent.setup();
    const mockOnClose = jest.fn();

    render(
      <TransferProgress
        isOpen={true}
        jobId="job-123"
        sseUrl="http://test.com/progress/job-123"
        onClose={mockOnClose}
      />
    );

    const cancelButton = screen.getByText('Cancel Transfer');
    await user.click(cancelButton);

    expect(storageService.cancelTransfer).toHaveBeenCalledWith('job-123');
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should show "No active transfers" when no transfers exist', () => {
    render(
      <TransferProgress
        isOpen={true}
        jobId="job-123"
        sseUrl="http://test.com/progress/job-123"
        onClose={jest.fn()}
      />
    );

    expect(screen.getByText('No active transfers')).toBeInTheDocument();
  });

  it('should close SSE connection when component unmounts', () => {
    const closeSpy = jest.spyOn(mockEventSource, 'close');

    const { unmount } = render(
      <TransferProgress
        isOpen={true}
        jobId="job-123"
        sseUrl="http://test.com/progress/job-123"
        onClose={jest.fn()}
      />
    );

    unmount();

    expect(closeSpy).toHaveBeenCalled();
  });

  it('should not establish connection when jobId is null', () => {
    render(
      <TransferProgress
        isOpen={true}
        jobId={null}
        sseUrl={null}
        onClose={jest.fn()}
      />
    );

    expect(global.EventSource).not.toHaveBeenCalled();
  });

  it('should handle SSE error events', async () => {
    render(
      <TransferProgress
        isOpen={true}
        jobId="job-123"
        sseUrl="http://test.com/progress/job-123"
        onClose={jest.fn()}
      />
    );

    // Simulate SSE error
    mockEventSource.simulateError();

    // EventSource should be closed on error
    await waitFor(() => {
      expect(mockEventSource.readyState).toBe(mockEventSource.CLOSED);
    });
  });

  it('should update existing file transfer on new message', async () => {
    render(
      <TransferProgress
        isOpen={true}
        jobId="job-123"
        sseUrl="http://test.com/progress/job-123"
        onClose={jest.fn()}
      />
    );

    // First update
    mockEventSource.simulateMessage({
      file: 'test-file.txt',
      status: 'transferring',
      loaded: 512,
      total: 1024,
    });

    await waitFor(() => {
      expect(screen.getByText(/512\.00 B/)).toBeInTheDocument();
    });

    // Second update for same file
    mockEventSource.simulateMessage({
      file: 'test-file.txt',
      status: 'transferring',
      loaded: 1024,
      total: 1024,
    });

    await waitFor(() => {
      expect(screen.getByText(/1\.00 KB.*1\.00 KB/)).toBeInTheDocument();
    });
  });
});
