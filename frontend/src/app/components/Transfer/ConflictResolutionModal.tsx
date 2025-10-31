import {
  Modal,
  Form,
  FormGroup,
  FormSelect,
  FormSelectOption,
  Alert,
  DataList,
  DataListItem,
  DataListItemRow,
  DataListItemCells,
  DataListCell,
  Radio,
  Button,
} from '@patternfly/react-core';
import * as React from 'react';
import { TransferConflict } from '@app/services/storageService';

interface ConflictResolutionModalProps {
  isOpen: boolean;
  conflicts: TransferConflict[];
  onResolve: (resolutions: Record<string, 'overwrite' | 'skip' | 'rename'>) => void;
  onCancel: () => void;
}

// Helper functions for formatting
const formatSize = (bytes?: number): string => {
  if (!bytes) return 'Unknown size';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
};

const formatDate = (date?: Date): string => {
  if (!date) return 'Unknown date';
  return new Date(date).toLocaleString();
};

export const ConflictResolutionModal: React.FC<ConflictResolutionModalProps> = ({
  isOpen,
  conflicts,
  onResolve,
  onCancel,
}) => {
  const [resolutions, setResolutions] = React.useState<Record<string, string>>({});
  const [applyToAll, setApplyToAll] = React.useState<string>('');

  const handleResolve = () => {
    const finalResolutions: Record<string, 'overwrite' | 'skip' | 'rename'> = {};

    conflicts.forEach((conflict) => {
      const resolution = resolutions[conflict.path] || applyToAll || 'rename';
      finalResolutions[conflict.path] = resolution as 'overwrite' | 'skip' | 'rename';
    });

    onResolve(finalResolutions);
  };

  return (
    <Modal
      title="File Conflicts Detected"
      isOpen={isOpen}
      onClose={onCancel}
      variant="medium"
      actions={[
        <Button key="proceed" variant="primary" onClick={handleResolve}>
          Proceed with Transfer
        </Button>,
        <Button key="cancel" variant="link" onClick={onCancel}>
          Cancel
        </Button>,
      ]}
    >
      <Alert variant="warning" title={`${conflicts.length} file(s) already exist`} isInline />

      <DataList aria-label="Conflict list">
        {conflicts.map((conflict) => (
          <DataListItem key={conflict.path}>
            <DataListItemRow>
              <DataListItemCells
                dataListCells={[
                  <DataListCell key="info">
                    <div>
                      <strong>{conflict.path}</strong>
                      {conflict.existingSize && (
                        <small>
                          <br />
                          Existing: {formatSize(conflict.existingSize)}, modified{' '}
                          {formatDate(conflict.existingModified)}
                        </small>
                      )}
                    </div>
                  </DataListCell>,
                  <DataListCell key="resolution">
                    <div>
                      <Radio
                        name={`resolution-${conflict.path}`}
                        id={`${conflict.path}-overwrite`}
                        value="overwrite"
                        label="Overwrite"
                        isChecked={resolutions[conflict.path] === 'overwrite'}
                        onChange={() =>
                          setResolutions({ ...resolutions, [conflict.path]: 'overwrite' })
                        }
                      />
                      <Radio
                        name={`resolution-${conflict.path}`}
                        id={`${conflict.path}-skip`}
                        value="skip"
                        label="Skip"
                        isChecked={resolutions[conflict.path] === 'skip'}
                        onChange={() =>
                          setResolutions({ ...resolutions, [conflict.path]: 'skip' })
                        }
                      />
                      <Radio
                        name={`resolution-${conflict.path}`}
                        id={`${conflict.path}-rename`}
                        value="rename"
                        label="Keep both (rename)"
                        isChecked={resolutions[conflict.path] === 'rename'}
                        onChange={() =>
                          setResolutions({ ...resolutions, [conflict.path]: 'rename' })
                        }
                      />
                    </div>
                  </DataListCell>,
                ]}
              />
            </DataListItemRow>
          </DataListItem>
        ))}
      </DataList>

      <FormGroup label="Apply to all">
        <FormSelect
          id="apply-to-all-select"
          aria-label="Apply resolution to all conflicts"
          value={applyToAll}
          onChange={(_e, val) => setApplyToAll(val as string)}
        >
          <FormSelectOption value="" label="Choose individually" />
          <FormSelectOption value="overwrite" label="Overwrite all" />
          <FormSelectOption value="skip" label="Skip all" />
          <FormSelectOption value="rename" label="Rename all" />
        </FormSelect>
      </FormGroup>
    </Modal>
  );
};
