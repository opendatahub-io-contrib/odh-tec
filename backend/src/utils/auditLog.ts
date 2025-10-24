import { User } from '../plugins/auth';

/**
 * Audit log function for security events
 *
 * NOTE: In production, this should be replaced with a dedicated audit service
 * that writes to a persistent, tamper-proof audit log (e.g., database, SIEM system)
 *
 * @param user - The authenticated user
 * @param action - The action being performed (e.g., 'list', 'download', 'upload', 'delete', 'transfer')
 * @param resource - The resource being accessed (e.g., 'local:home/file.txt', 's3:bucket/key')
 * @param status - The status of the action ('success' | 'failure' | 'denied')
 * @param details - Optional additional details about the action
 */
export function auditLog(
  user: User,
  action: string,
  resource: string,
  status: 'success' | 'failure' | 'denied',
  details?: string,
): void {
  const logEntry = {
    timestamp: new Date().toISOString(),
    userId: user.id,
    username: user.username,
    action,
    resource,
    status,
    details: details || undefined,
  };

  // Log as JSON for structured logging
  console.log(JSON.stringify(logEntry));
}
