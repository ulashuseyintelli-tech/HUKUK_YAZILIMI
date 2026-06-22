/**
 * Safe Logger
 * 
 * PII-safe logging with allowlist fields only.
 * No raw payloads ever logged.
 */

import type { SafeLogMeta, LoggingConfig } from '../types/config';
import { redactPii } from './redaction';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(message: string, meta?: SafeLogMeta): void;
  info(message: string, meta?: SafeLogMeta): void;
  warn(message: string, meta?: SafeLogMeta): void;
  error(message: string, meta?: SafeLogMeta): void;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Create a safe logger instance.
 * Only logs SafeLogMeta fields - no raw payloads.
 */
export function createSafeLogger(config?: LoggingConfig): Logger {
  const enabled = config?.enabled ?? false;
  const minLevel = config?.level ?? 'info';
  const customLogger = config?.logger;

  const shouldLog = (level: LogLevel): boolean => {
    if (!enabled) return false;
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[minLevel];
  };

  const formatMeta = (meta?: SafeLogMeta): string => {
    if (!meta) return '';
    
    const parts: string[] = [];
    
    if (meta.requestHash) parts.push(`hash=${meta.requestHash}`);
    if (meta.traceId) parts.push(`trace=${meta.traceId}`);
    if (meta.attempt !== undefined) parts.push(`attempt=${meta.attempt}`);
    if (meta.durationMs !== undefined) parts.push(`duration=${meta.durationMs}ms`);
    if (meta.httpStatus !== undefined) parts.push(`status=${meta.httpStatus}`);
    if (meta.errorCode) parts.push(`error=${meta.errorCode}`);
    if (meta.endpoint) parts.push(`endpoint=${meta.endpoint}`);
    
    return parts.length > 0 ? ` [${parts.join(', ')}]` : '';
  };

  const log = (level: LogLevel, message: string, meta?: SafeLogMeta): void => {
    if (!shouldLog(level)) return;

    // Redact any PII that might have slipped into message
    const safeMessage = redactPii(message);

    if (customLogger) {
      customLogger[level](safeMessage, meta);
      return;
    }

    // Default console logging
    const timestamp = new Date().toISOString();
    const formatted = `[${timestamp}] [SDK] [${level.toUpperCase()}] ${safeMessage}${formatMeta(meta)}`;

    switch (level) {
      case 'debug':
        console.debug(formatted);
        break;
      case 'info':
        console.info(formatted);
        break;
      case 'warn':
        console.warn(formatted);
        break;
      case 'error':
        console.error(formatted);
        break;
    }
  };

  return {
    debug: (message, meta) => log('debug', message, meta),
    info: (message, meta) => log('info', message, meta),
    warn: (message, meta) => log('warn', message, meta),
    error: (message, meta) => log('error', message, meta),
  };
}

/**
 * No-op logger for when logging is disabled.
 */
export const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};
