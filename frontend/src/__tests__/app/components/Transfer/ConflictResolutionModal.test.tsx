import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConflictResolutionModal } from '@app/components/Transfer/ConflictResolutionModal';
import { TransferConflict } from '@app/services/storageService';

describe('ConflictResolutionModal', () => {
  const mockConflicts: TransferConflict[] = [
    {
      path: 'file1.txt',
      existingSize: 1024,
      existingModified: new Date('2024-01-01'),
    },
    {
      path: 'file2.txt',
      existingSize: 2048,
      existingModified: new Date('2024-01-02'),
    },
  ];

  const mockOnResolve = jest.fn();
  const mockOnCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should display all conflicts', () => {
    render(
      <ConflictResolutionModal
        isOpen={true}
        conflicts={mockConflicts}
        onResolve={mockOnResolve}
        onCancel={mockOnCancel}
      />
    );

    expect(screen.getByText('file1.txt')).toBeInTheDocument();
    expect(screen.getByText('file2.txt')).toBeInTheDocument();
    expect(screen.getByText(/2 file\(s\) already exist/)).toBeInTheDocument();
  });

  it('should display file metadata', () => {
    render(
      <ConflictResolutionModal
        isOpen={true}
        conflicts={mockConflicts}
        onResolve={mockOnResolve}
        onCancel={mockOnCancel}
      />
    );

    expect(screen.getByText(/1\.00 KB/)).toBeInTheDocument();
    expect(screen.getByText(/2\.00 KB/)).toBeInTheDocument();
  });

  it('should allow selecting resolution per file', async () => {
    const user = userEvent.setup();
    render(
      <ConflictResolutionModal
        isOpen={true}
        conflicts={mockConflicts}
        onResolve={mockOnResolve}
        onCancel={mockOnCancel}
      />
    );

    // Get all radios - should be 6 (3 for each conflict)
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(6);

    // Select overwrite for first file (index 0)
    await user.click(radios[0]);
    expect(radios[0]).toBeChecked();
  });

  it('should apply resolution to all conflicts when "Apply to all" is selected', async () => {
    const user = userEvent.setup();
    render(
      <ConflictResolutionModal
        isOpen={true}
        conflicts={mockConflicts}
        onResolve={mockOnResolve}
        onCancel={mockOnCancel}
      />
    );

    // Select "Overwrite all" in apply to all dropdown
    const applyToAllSelect = screen.getByRole('combobox');
    await user.selectOptions(applyToAllSelect, 'overwrite');

    // Click proceed
    const proceedButton = screen.getByText('Proceed with Transfer');
    await user.click(proceedButton);

    expect(mockOnResolve).toHaveBeenCalledWith({
      'file1.txt': 'overwrite',
      'file2.txt': 'overwrite',
    });
  });

  it('should use "rename" as default resolution when none selected', async () => {
    const user = userEvent.setup();
    render(
      <ConflictResolutionModal
        isOpen={true}
        conflicts={mockConflicts}
        onResolve={mockOnResolve}
        onCancel={mockOnCancel}
      />
    );

    const proceedButton = screen.getByText('Proceed with Transfer');
    await user.click(proceedButton);

    expect(mockOnResolve).toHaveBeenCalledWith({
      'file1.txt': 'rename',
      'file2.txt': 'rename',
    });
  });

  it('should call onResolve with mixed resolutions', async () => {
    const user = userEvent.setup();
    render(
      <ConflictResolutionModal
        isOpen={true}
        conflicts={mockConflicts}
        onResolve={mockOnResolve}
        onCancel={mockOnCancel}
      />
    );

    // Select overwrite for first file and skip for second
    const radios = screen.getAllByRole('radio');
    // First set of 3 radios is for file1, click "overwrite" (index 0)
    await user.click(radios[0]);
    // Second set of 3 radios is for file2, click "skip" (index 4)
    await user.click(radios[4]);

    const proceedButton = screen.getByText('Proceed with Transfer');
    await user.click(proceedButton);

    expect(mockOnResolve).toHaveBeenCalledWith({
      'file1.txt': 'overwrite',
      'file2.txt': 'skip',
    });
  });

  it('should call onCancel when cancel is clicked', async () => {
    const user = userEvent.setup();
    render(
      <ConflictResolutionModal
        isOpen={true}
        conflicts={mockConflicts}
        onResolve={mockOnResolve}
        onCancel={mockOnCancel}
      />
    );

    const cancelButton = screen.getByText('Cancel');
    await user.click(cancelButton);

    expect(mockOnCancel).toHaveBeenCalledTimes(1);
  });

  it('should show all three resolution options for each conflict', () => {
    render(
      <ConflictResolutionModal
        isOpen={true}
        conflicts={[mockConflicts[0]]}
        onResolve={mockOnResolve}
        onCancel={mockOnCancel}
      />
    );

    const radios = screen.getAllByRole('radio');
    // Should have 3 radio buttons for the single conflict
    expect(radios).toHaveLength(3);
    expect(screen.getByText('Overwrite')).toBeInTheDocument();
    expect(screen.getByText('Skip')).toBeInTheDocument();
    expect(screen.getByText('Keep both (rename)')).toBeInTheDocument();
  });

  it('should not render when modal is closed', () => {
    render(
      <ConflictResolutionModal
        isOpen={false}
        conflicts={mockConflicts}
        onResolve={mockOnResolve}
        onCancel={mockOnCancel}
      />
    );

    expect(screen.queryByText('File Conflicts Detected')).not.toBeInTheDocument();
  });

  it('should show warning alert', () => {
    render(
      <ConflictResolutionModal
        isOpen={true}
        conflicts={mockConflicts}
        onResolve={mockOnResolve}
        onCancel={mockOnCancel}
      />
    );

    // The modal title is in the dialog
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/2 file\(s\) already exist/)).toBeInTheDocument();
  });
});
