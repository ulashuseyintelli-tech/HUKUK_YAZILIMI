/**
 * @hukuk/calc-preview-sdk
 * 
 * Read-only SDK for CalcPreview API.
 * Preview + Trace access. No writes, no side effects.
 * 
 * @version 0.1.0
 * @see .kiro/specs/sdk-readonly-v0.1
 */

// Version
export const SDK_VERSION = '0.1.0';

// Types
export * from './types';

// Errors
export * from './errors';

// Clients
export * from './clients';

// SDK
export { CalcPreviewSdk } from './sdk';

// Mock (for testing)
export * from './mock';

// Constants
export * from './constants';

// Validation
export { validateConfig, normalizeConfig, type NormalizedConfig } from './validation';

// Logging
export { createSafeLogger, noopLogger, type Logger, type LogLevel } from './logging';
export { redactPii, isPiiField, sanitizeObject } from './logging';
