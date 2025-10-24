import { FastifyReply, FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';

/**
 * User interface representing an authenticated user
 */
export interface User {
  id: string;
  username: string;
  roles: string[];
  allowedLocations: string[];
}

/**
 * Check if authentication is disabled via environment variable
 * Defaults to DISABLED (true) unless explicitly set to 'false'
 * This matches the OAuth proxy deployment pattern where auth is handled externally
 */
function isAuthDisabled(): boolean {
  // Default to disabled (true) unless explicitly set to 'false'
  // This matches the OAuth proxy deployment pattern where auth is external
  return process.env.DISABLE_AUTH !== 'false';
}

/**
 * Create a mock admin user for when authentication is disabled
 * This allows the app to work behind an OAuth proxy without JWT tokens
 */
function createMockUser(): User {
  return {
    id: 'proxy-user',
    username: 'proxy-user',
    roles: ['admin'],
    allowedLocations: [], // Empty array is OK since admin role bypasses location checks
  };
}

/**
 * Authenticate user from JWT token in Authorization header
 * If DISABLE_AUTH=true, bypasses JWT validation and creates a mock admin user
 * Throws 401 if token is invalid or missing (when auth is enabled)
 */
export async function authenticateUser(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  // If authentication is disabled (OAuth proxy mode), create a mock admin user
  if (isAuthDisabled()) {
    request.log.debug('Authentication disabled - using mock admin user');
    request.user = createMockUser();
    return;
  }

  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.code(401).send({
      error: 'Unauthorized',
      message: 'Missing or invalid Authorization header',
    });
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    request.log.error('JWT_SECRET environment variable is not set');
    return reply.code(500).send({
      error: 'Internal Server Error',
      message: 'Server configuration error',
    });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret) as User;

    // Validate decoded token has required fields
    if (!decoded.id || !decoded.username || !Array.isArray(decoded.roles)) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Invalid token payload',
      });
    }

    // Attach user to request
    request.user = decoded;
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Token has expired',
      });
    } else if (error.name === 'JsonWebTokenError') {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Invalid token',
      });
    } else {
      request.log.error(error, 'Error verifying JWT token');
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Authentication error',
      });
    }
  }
}

/**
 * Authorize user access to a storage location
 * Throws 403 if user doesn't have access to the location
 */
export function authorizeLocation(user: User, locationId: string): void {
  // Admin role has access to all locations
  if (user.roles.includes('admin')) {
    return;
  }

  // Check if user has access to this specific location
  if (!user.allowedLocations || !user.allowedLocations.includes(locationId)) {
    throw new Error(`Access denied to location: ${locationId}`);
  }
}
