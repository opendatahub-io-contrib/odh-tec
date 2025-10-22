import {
  Alert,
  Button,
  Card,
  CardBody,
  CardTitle,
  Drawer,
  DrawerCloseButton,
  DrawerContent,
  DrawerContentBody,
  DrawerHead,
  Flex,
  FlexItem,
  Label,
  Progress,
  Title,
} from '@patternfly/react-core';
import * as React from 'react';
import { storageService } from '@app/services/storageService';
import Emitter from '@app/utils/emitter';

interface TransferProgressProps {
  isOpen: boolean;
  jobId: string | null;
  sseUrl: string | null;
  onClose: () => void;
}

interface TransferEvent {
  file: string;
  status: 'transferring' | 'completed' | 'error';
  loaded?: number;
  total?: number;
  error?: string;
}

// Helper function for formatting file sizes
const formatSize = (bytes?: number): string => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
};

export const TransferProgress: React.FC<TransferProgressProps> = ({
  isOpen,
  jobId,
  sseUrl,
  onClose,
}) => {
  const [transfers, setTransfers] = React.useState<Map<string, TransferEvent>>(new Map());

  React.useEffect(() => {
    if (!sseUrl || !jobId) return;

    const eventSource = new EventSource(sseUrl);

    eventSource.onmessage = (event) => {
      try {
        const data: TransferEvent = JSON.parse(event.data);
        setTransfers((prev) => new Map(prev).set(data.file, data));
      } catch (error) {
        console.error('Failed to parse SSE message:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
      Emitter.emit('notification', {
        variant: 'danger',
        title: 'Transfer connection error',
        description: 'Lost connection to transfer progress updates',
      });
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [sseUrl, jobId]);

  const handleCancel = async () => {
    if (jobId) {
      try {
        await storageService.cancelTransfer(jobId);
        Emitter.emit('notification', {
          variant: 'info',
          title: 'Transfer cancelled',
          description: 'The file transfer has been cancelled',
        });
      } catch (error) {
        console.error('Failed to cancel transfer:', error);
        Emitter.emit('notification', {
          variant: 'danger',
          title: 'Failed to cancel transfer',
          description: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
    onClose();
  };

  const panelContent = (
    <DrawerHead>
      <Title headingLevel="h2">File Transfers</Title>
      <DrawerCloseButton onClick={onClose} />
    </DrawerHead>
  );

  return (
    <Drawer isExpanded={isOpen}>
      <DrawerContent panelContent={panelContent}>
        <DrawerContentBody>
          {Array.from(transfers.values()).map((transfer) => (
            <Card key={transfer.file} isCompact style={{ marginBottom: '1rem' }}>
              <CardTitle>
                <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }}>
                  <FlexItem>{transfer.file}</FlexItem>
                  <FlexItem>
                    {transfer.status === 'error' ? (
                      <Label color="red">Error</Label>
                    ) : transfer.status === 'completed' ? (
                      <Label color="green">Complete</Label>
                    ) : (
                      <Label color="blue">Transferring</Label>
                    )}
                  </FlexItem>
                </Flex>
              </CardTitle>
              <CardBody>
                {transfer.status === 'transferring' && transfer.loaded && transfer.total && (
                  <Progress
                    value={(transfer.loaded / transfer.total) * 100}
                    title={`${formatSize(transfer.loaded)} / ${formatSize(transfer.total)}`}
                  />
                )}
                {transfer.error && (
                  <Alert variant="danger" title="Transfer error" isInline>
                    {transfer.error}
                  </Alert>
                )}
              </CardBody>
            </Card>
          ))}

          {transfers.size === 0 && (
            <Alert variant="info" title="No transfers" isInline>
              No active transfers
            </Alert>
          )}

          <Button variant="danger" onClick={handleCancel} style={{ marginTop: '1rem' }}>
            Cancel Transfer
          </Button>
        </DrawerContentBody>
      </DrawerContent>
    </Drawer>
  );
};
