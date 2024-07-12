import * as path from 'path';
import './dotenv';

export const PORT = Number(process.env.PORT) || Number(process.env.BACKEND_PORT) || 8080;
export const IP = process.env.IP || '0.0.0.0';
export const LOG_LEVEL = process.env.FASTIFY_LOG_LEVEL || process.env.LOG_LEVEL || 'info';
export const LOG_DIR = path.join(__dirname, '../../../logs');
export const DEV_MODE = process.env.APP_ENV === 'development';
export const APP_ENV = process.env.APP_ENV;
