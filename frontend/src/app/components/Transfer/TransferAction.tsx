import * as React from 'react';
import {
  StorageType,
  TransferConflict,
  TransferRequest,
  storageService,
} from '@app/services/storageService';
import { DestinationPicker } from './DestinationPicker';
import { ConflictResolutionModal } from './ConflictResolutionModal';
import { TransferProgress } from './TransferProgress';
import Emitter from '@app/utils/emitter';

interface TransferActionProps {
  sourceLocationId: string;
  sourceType: StorageType;
  sourcePath: string;
  selectedFiles: string[];
  isOpen: boolean;
  onClose: () => void;
}

/**
 * TransferAction - Orchestrates the complete transfer workflow
 *
 * Workflow:
 * 1. Pick destination → DestinationPicker
 * 2. Check for conflicts → storageService.checkConflicts
 * 3. If conflicts exist, resolve them → ConflictResolutionModal
 * 4. Initiate transfer → storageService.initiateTransfer
 * 5. Show progress → TransferProgress
 */
export const TransferAction: React.FC<TransferActionProps> = ({
  sourceLocationId,
  sourceType,
  sourcePath,
  selectedFiles,
  isOpen,
  onClose,
}) => {
  const [step, setStep] = React.useState<'destination' | 'conflicts' | 'progress'>('destination');
  const [destinationLocationId, setDestinationLocationId] = React.useState<string>('');
  const [destinationPath, setDestinationPath] = React.useState<string>('');
  const [destinationType, setDestinationType] = React.useState<StorageType>('s3');
  const [conflicts, setConflicts] = React.useState<TransferConflict[]>([]);
  const [jobId, setJobId] = React.useState<string | null>(null);
  const [sseUrl, setSseUrl] = React.useState<string | null>(null);

  // Reset state when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setStep('destination');
      setDestinationLocationId('');
      setDestinationPath('');
      setConflicts([]);
      setJobId(null);
      setSseUrl(null);
    }
  }, [isOpen]);

  const handleDestinationSelected = async (locationId: string, path: string) => {
    setDestinationLocationId(locationId);
    setDestinationPath(path);

    // Determine destination type from location ID
    const locations = await storageService.getLocations();
    const location = locations.find((loc) => loc.id === locationId);
    if (location) {
      setDestinationType(location.type);
    }

    // Check for conflicts
    try {
      const conflictPaths = await storageService.checkConflicts(
        {
          type: location?.type || 's3',
          locationId,
          path,
        },
        selectedFiles,
      );

      if (conflictPaths.length > 0) {
        // Map conflict paths to TransferConflict objects
        const conflictObjects: TransferConflict[] = conflictPaths.map((p) => ({
          path: p,
        }));
        setConflicts(conflictObjects);
        setStep('conflicts');
      } else {
        // No conflicts, proceed with transfer
        await initiateTransfer('rename');
      }
    } catch (error) {
      console.error('Failed to check conflicts:', error);
      Emitter.emit('notification', {
        variant: 'danger',
        title: 'Failed to check for conflicts',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  const handleConflictsResolved = async (
    resolutions: Record<string, 'overwrite' | 'skip' | 'rename'>,
  ) => {
    // For simplicity, use the first resolution as the default
    // In a more advanced implementation, we could handle per-file resolutions
    const firstResolution = Object.values(resolutions)[0] || 'rename';
    await initiateTransfer(firstResolution);
  };

  const initiateTransfer = async (conflictResolution: 'overwrite' | 'skip' | 'rename') => {
    const transferRequest: TransferRequest = {
      source: {
        type: sourceType,
        locationId: sourceLocationId,
        path: sourcePath,
      },
      destination: {
        type: destinationType,
        locationId: destinationLocationId,
        path: destinationPath,
      },
      files: selectedFiles,
      conflictResolution,
    };

    try {
      const response = await storageService.initiateTransfer(transferRequest);
      setJobId(response.jobId);
      setSseUrl(response.sseUrl);
      setStep('progress');

      Emitter.emit('notification', {
        variant: 'success',
        title: 'Transfer started',
        description: `Transferring ${selectedFiles.length} file(s)`,
      });
    } catch (error) {
      console.error('Failed to initiate transfer:', error);
      Emitter.emit('notification', {
        variant: 'danger',
        title: 'Failed to start transfer',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
      onClose();
    }
  };

  const handleCancel = () => {
    setStep('destination');
    setDestinationLocationId('');
    setDestinationPath('');
    setConflicts([]);
    setJobId(null);
    setSseUrl(null);
    onClose();
  };

  return (
    <>
      {step === 'destination' && (
        <DestinationPicker
          isOpen={isOpen}
          onSelect={handleDestinationSelected}
          onCancel={handleCancel}
        />
      )}

      {step === 'conflicts' && (
        <ConflictResolutionModal
          isOpen={true}
          conflicts={conflicts}
          onResolve={handleConflictsResolved}
          onCancel={handleCancel}
        />
      )}

      {step === 'progress' && (
        <TransferProgress isOpen={true} jobId={jobId} sseUrl={sseUrl} onClose={handleCancel} />
      )}
    </>
  );
};
