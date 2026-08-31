/**
 * WealthGenie Structured Logger (Winston)
 *
 * Production:  JSON lines to stdout — parseable by Railway Logs, Datadog, Grafana Loki.
 * Development: Colorized, human-readable console output.
 *
 * Usage:
 *   import logger from './utils/logger.js';
 *   logger.info('Server started', { port: 5000 });
 *   logger.warn('Slow query', { durationMs: 3200 });
 *   logger.error('Unhandled error', { err });
 */

import { createLogger, format, transports } from 'winston';

const isProduction = process.env.NODE_ENV === 'production';

const SENSITIVE_KEY = /(password|secret|token|api[_-]?key|authorization|cookie|credential)/i;

function redactString(value) {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/(mongodb(?:\+srv)?:\/\/)[^\s/@]+(?::[^\s/@]*)?@/gi, '$1[REDACTED]@');
}

function redactValue(value, seen, depth = 0) {
  if (typeof value === 'string') return redactString(value);
  if (!value || typeof value !== 'object' || depth > 8 || seen.has(value)) return value;
  seen.add(value);
  for (const key of Object.keys(value)) {
    if (SENSITIVE_KEY.test(key)) value[key] = '[REDACTED]';
    else value[key] = redactValue(value[key], seen, depth + 1);
  }
  return value;
}

const redactSecrets = format((info) => {
  redactValue(info, new WeakSet());
  return info;
});

const logger = createLogger({
  level: isProduction ? 'info' : 'debug',
  defaultMeta: {
    service: 'wealthgenie-api',
    version: process.env.npm_package_version || '1.0.0',
    env: process.env.NODE_ENV || 'development',
  },
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
    format.errors({ stack: !isProduction }),
    redactSecrets(),
    isProduction
      ? format.json()
      : format.combine(format.colorize(), format.printf(({ timestamp, level, message, service, ...meta }) => {
          const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
          return `${timestamp} [${level}] ${message}${metaStr}`;
        }))
  ),
  transports: [new transports.Console()],
  // Prevent crashes from unhandled rejections / uncaught exceptions
  exitOnError: false,
});

/**
 * Morgan-compatible stream — pipe HTTP request logs through Winston.
 */
export const morganStream = {
  write: (message) => {
    logger.http(message.trim());
  },
};

export default logger;
