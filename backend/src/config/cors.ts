import { FastifyCorsOptions } from '@fastify/cors';

export function getCorsConfig(): FastifyCorsOptions {
  // Read from environment or use defaults
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : [
        'http://localhost:8888', // Backend dev server
        'http://localhost:9000', // Frontend webpack dev server
        'http://localhost:3000', // Alternative dev port
        'http://127.0.0.1:8888', // Backend via 127.0.0.1
        'http://127.0.0.1:9000', // Frontend via 127.0.0.1
      ]; // Development defaults

  return {
    origin: allowedOrigins,
    methods: ['GET', 'PUT', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Disposition'],
    credentials: true, // Allow cookies for auth
  };
}
