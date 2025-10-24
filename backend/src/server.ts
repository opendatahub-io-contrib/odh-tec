import { fastify } from 'fastify';
import fastifyMultipart from '@fastify/multipart';
import pino from 'pino';
import { APP_ENV, PORT, IP, LOG_LEVEL } from './utils/constants';
import { initializeApp } from './app';
import { AddressInfo } from 'net';
import https from 'https';
import fs from 'fs';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { getCorsConfig } from './config/cors';

const transport =
  APP_ENV === 'development'
    ? pino.transport({
        target: 'pino-pretty',
        options: { colorize: true },
      })
    : undefined;

const app = fastify({
  logger: pino(
    {
      level: LOG_LEVEL,
      redact: [
        'err.response.request.headers.Authorization',
        'response.request.headers.Authorization',
        'request.headers.Authorization',
        'headers.Authorization',
        'Authorization',
      ],
    },
    transport,
  ),
  pluginTimeout: 10000,
  maxParamLength: 1000,
});

// Register CORS with secure configuration
app.register(cors, getCorsConfig());

// Add security headers via Helmet
app.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // PatternFly needs inline styles
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Needed for some assets
  crossOriginResourcePolicy: { policy: 'cross-origin' },
});

app.register(fastifyMultipart);

app.register(initializeApp);

app.listen({ port: PORT, host: IP }, (err) => {
  if (err) {
    app.log.error(err);
    process.exit(1); // eslint-disable-line
  }

  // Validate security configuration
  const corsConfig = getCorsConfig();
  app.log.info({ allowedOrigins: corsConfig.origin }, 'CORS configuration loaded');

  if (Array.isArray(corsConfig.origin) && corsConfig.origin.includes('*')) {
    app.log.warn('WARNING: CORS is configured with wildcard (*). This is insecure for production!');
  }

  // Load CA bundle used in our API calls
  // tls-ca-bundle.pem is the default CA bundle used by the system in CentOS/RHEL
  // ca.crt is the default CA bundle provided by the service account for kubernetes
  // service-ca.crt is the CA bundle provided by the service account for kubernetes used by prometheus
  // odh-ca-bundle.crt and odh-trusted-ca-bundle.crt are the CA bundles provided by the ODH platform
  const caPaths = [
    '/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem',
    '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt',
    '/var/run/secrets/kubernetes.io/serviceaccount/service-ca.crt',
    '/etc/pki/tls/certs/odh-ca-bundle.crt',
    '/etc/pki/tls/certs/odh-trusted-ca-bundle.crt',
  ]
    .map(getCABundle)
    .filter((ca) => ca !== undefined);

  https.globalAgent.options.ca = caPaths as Buffer[];

  const address: AddressInfo = app.server.address() as AddressInfo;
  console.log('Fastify Connected...');
  console.log(`Server listening on >>>  ${address.address}:${address.port}`);
});

const getCABundle = (path: string) => {
  try {
    return fs.readFileSync(path);
  } catch (e) {
    // ignore
  }
  return undefined;
};
