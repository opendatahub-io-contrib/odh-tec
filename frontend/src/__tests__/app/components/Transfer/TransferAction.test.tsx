import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TransferAction } from '@app/components/Transfer/TransferAction';
import { StorageLocation, storageService } from '@app/services/storageService';

// Mock the storage service
jest.mock('@app/services/storageService', () => ({
  storageService: {
    getLocations: jest.fn(),
    listFiles: jest.fn(),
    checkConflicts: jest.fn(),
    initiateTransfer: jest.fn(),
  },
}));

// Mock the emitter
jest.mock('@app/utils/emitter', () => ({
  __esModule: true,
  default: {
    emit: jest.fn(),
  },
}));

// Mock EventSource for TransferProgress
global.EventSource = jest.fn(() => ({
  onmessage: null,
  onerror: null,
  close: jest.fn(),
})) as never;

describe('TransferAction', () => {
  const mockLocations: StorageLocation[] = [
    { id: 'bucket1', name: 'Bucket 1', type: 's3', available: true, region: 'us-east-1' },
    { id: 'local-0', name: 'Data Storage', type: 'local', available: true, path: '/mnt/data' },
  ];

  const mockOnClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (storageService.getLocations as jest.Mock).mockResolvedValue(mockLocations);
    (storageService.listFiles as jest.Mock).mockResolvedValue({ files: [] });
    (storageService.checkConflicts as jest.Mock).mockResolvedValue([]);
    (storageService.initiateTransfer as jest.Mock).mockResolvedValue({
      jobId: 'job-123',
      sseUrl: 'http://test.com/progress/job-123',
    });
  });

  it('should show DestinationPicker initially', async () => {
    render(
      <TransferAction
        sourceLocationId="bucket1"
        sourceType="s3"
        sourcePath=""
        selectedFiles={['file1.txt']}
        isOpen={true}
        onClose={mockOnClose}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Select Destination')).toBeInTheDocument();
    });
  });

  it('should check for conflicts after destination selection', async () => {
    const user = userEvent.setup();

    render(
      <TransferAction
        sourceLocationId="bucket1"
        sourceType="s3"
        sourcePath=""
        selectedFiles={['file1.txt', 'file2.txt']}
        isOpen={true}
        onClose={mockOnClose}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    // Select destination
    const select = screen.getByRole('combobox');
    await user.selectOptions(select, 'local-0');

    await waitFor(() => {
      expect(screen.getByText('Select Destination')).toBeInTheDocument();
    });

    const selectButton = screen.getByText('Select Destination');
    await user.click(selectButton);

    await waitFor(() => {
      expect(storageService.checkConflicts).toHaveBeenCalledWith(
        {
          type: 'local',
          locationId: 'local-0',
          path: '',
        },
        ['file1.txt', 'file2.txt']
      );
    });
  });

  it('should show ConflictResolutionModal when conflicts exist', async () => {
    const user = userEvent.setup();
    (storageService.checkConflicts as jest.Mock).mockResolvedValue(['file1.txt']);

    render(
      <TransferAction
        sourceLocationId="bucket1"
        sourceType="s3"
        sourcePath=""
        selectedFiles={['file1.txt', 'file2.txt']}
        isOpen={true}
        onClose={mockOnClose}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    const select = screen.getByRole('combobox');
    await user.selectOptions(select, 'local-0');

    const selectButton = screen.getByText('Select Destination');
    await user.click(selectButton);

    await waitFor(() => {
      expect(screen.getByText(/file\(s\) already exist/i)).toBeInTheDocument();
    });
  });

  it('should skip to transfer when no conflicts exist', async () => {
    const user = userEvent.setup();

    render(
      <TransferAction
        sourceLocationId="bucket1"
        sourceType="s3"
        sourcePath=""
        selectedFiles={['file1.txt']}
        isOpen={true}
        onClose={mockOnClose}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    const select = screen.getByRole('combobox');
    await user.selectOptions(select, 'local-0');

    const selectButton = screen.getByText('Select Destination');
    await user.click(selectButton);

    await waitFor(() => {
      expect(storageService.initiateTransfer).toHaveBeenCalled();
    });
  });

  it('should initiate transfer with correct source parameters', async () => {
    const user = userEvent.setup();

    render(
      <TransferAction
        sourceLocationId="bucket1"
        sourceType="s3"
        sourcePath="folder1"
        selectedFiles={['file1.txt', 'file2.txt']}
        isOpen={true}
        onClose={mockOnClose}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    const select = screen.getByRole('combobox');
    await user.selectOptions(select, 'local-0');

    // Wait for the location to be selected and button to be enabled
    await waitFor(() => {
      const selectButton = screen.getByRole('button', { name: /select destination/i });
      expect(selectButton).not.toBeDisabled();
    });

    const selectButton = screen.getByRole('button', { name: /select destination/i });
    await user.click(selectButton);

    // Wait for transfer to be initiated
    await waitFor(() => {
      expect(storageService.initiateTransfer).toHaveBeenCalled();
    });

    // Verify the source and file parameters are correct
    const callArgs = (storageService.initiateTransfer as jest.Mock).mock.calls[0][0];
    expect(callArgs.source).toEqual({
      type: 's3',
      locationId: 'bucket1',
      path: 'folder1',
    });
    expect(callArgs.files).toEqual(['file1.txt', 'file2.txt']);
    expect(callArgs.conflictResolution).toBe('rename');
  });

  it('should show TransferProgress after initiating transfer', async () => {
    const user = userEvent.setup();

    render(
      <TransferAction
        sourceLocationId="bucket1"
        sourceType="s3"
        sourcePath=""
        selectedFiles={['file1.txt']}
        isOpen={true}
        onClose={mockOnClose}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    const select = screen.getByRole('combobox');
    await user.selectOptions(select, 'local-0');

    const selectButton = screen.getByText('Select Destination');
    await user.click(selectButton);

    await waitFor(() => {
      expect(screen.getByText('File Transfers')).toBeInTheDocument();
    });
  });

  it('should reset state when modal closes and reopens', async () => {
    const { rerender } = render(
      <TransferAction
        sourceLocationId="bucket1"
        sourceType="s3"
        sourcePath=""
        selectedFiles={['file1.txt']}
        isOpen={true}
        onClose={mockOnClose}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Select Destination')).toBeInTheDocument();
    });

    // Close modal
    rerender(
      <TransferAction
        sourceLocationId="bucket1"
        sourceType="s3"
        sourcePath=""
        selectedFiles={['file1.txt']}
        isOpen={false}
        onClose={mockOnClose}
      />
    );

    // Reopen modal
    rerender(
      <TransferAction
        sourceLocationId="bucket1"
        sourceType="s3"
        sourcePath=""
        selectedFiles={['file1.txt']}
        isOpen={true}
        onClose={mockOnClose}
      />
    );

    // Should be back at destination picker
    await waitFor(() => {
      expect(screen.getByText('Select Destination')).toBeInTheDocument();
    });
  });

  it('should handle conflict resolution and proceed to transfer', async () => {
    const user = userEvent.setup();
    (storageService.checkConflicts as jest.Mock).mockResolvedValue(['file1.txt']);

    render(
      <TransferAction
        sourceLocationId="bucket1"
        sourceType="s3"
        sourcePath=""
        selectedFiles={['file1.txt']}
        isOpen={true}
        onClose={mockOnClose}
      />
    );

    // Select destination
    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    const select = screen.getByRole('combobox');
    await user.selectOptions(select, 'local-0');

    const selectButton = screen.getByText('Select Destination');
    await user.click(selectButton);

    // Wait for conflict modal
    await waitFor(() => {
      expect(screen.getByText(/file\(s\) already exist/i)).toBeInTheDocument();
    });

    // Proceed with transfer
    const proceedButton = screen.getByText('Proceed with Transfer');
    await user.click(proceedButton);

    await waitFor(() => {
      expect(storageService.initiateTransfer).toHaveBeenCalled();
    });
  });

  it('should call onClose when cancel is clicked', async () => {
    const user = userEvent.setup();

    render(
      <TransferAction
        sourceLocationId="bucket1"
        sourceType="s3"
        sourcePath=""
        selectedFiles={['file1.txt']}
        isOpen={true}
        onClose={mockOnClose}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    const cancelButton = screen.getByText('Cancel');
    await user.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });
});
