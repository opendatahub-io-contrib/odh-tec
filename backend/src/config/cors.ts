import { FastifyCorsOptions } from '@fastify/cors';

export function getCorsConfig(): FastifyCorsOptions {
  // Read from environment or use defaults
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : ['http://localhost:8888', 'http://localhost:3000']; // Development defaults

  return {
    origin: allowedOrigins,
    methods: ['GET', 'PUT', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Disposition'],
    credentials: true, // Allow cookies for auth
  };
}
