/**
 * Jest Setup File
 * 
 * Configures test environment to ensure clean exit codes.
 * 
 * Key configurations:
 * - Suppress Nest.js Logger DEBUG/LOG output in tests
 * - Set LOG_LEVEL=error for clean CI output
 */

import { Logger } from '@nestjs/common';

// Suppress Nest.js Logger in tests unless explicitly enabled
// This prevents DEBUG/LOG output from causing exit code issues
if (process.env.TEST_LOG_LEVEL !== 'debug') {
  Logger.overrideLogger(['error', 'warn']);
}

// Increase timeout for slower CI environments
jest.setTimeout(30000);
