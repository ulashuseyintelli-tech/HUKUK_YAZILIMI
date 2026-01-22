/**
 * Evidence Bundle Feature Flag Tests
 * 
 * Phase 9C - Task 0: Foundation Gates
 * 
 * Tests for feature flag behavior:
 * 1. Flag kapalı → OBJECT_STORE_CLIENT provider yok
 * 2. Flag açık, config eksik → app boot fail
 * 3. Flag açık, config tam → app boot ok, "enabled" log var
 * 
 * @see .kiro/specs/phase-9c-object-storage-migration/PHASE-9C-IMPLEMENTATION-CHECKLIST.md
 */

import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import {
  isEvidenceBundleS3Enabled,
  validateObjectStoreConfig,
  loadObjectStoreConfig,
  ObjectStoreConfigError,
} from '../object-store.config';
import { EvidenceBundleModule } from '../evidence-bundle.module';
import { OBJECT_STORE_CLIENT, EvidenceBundleDisabledError } from '../evidence-bundle.tokens';
import { IObjectStoreClient } from '../object-store.interface';

// ============================================================================
// Test Helpers
// ============================================================================

function createEnv(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    EVIDENCE_BUNDLE_S3_ENABLED: undefined,
    S3_ENDPOINT: undefined,
    S3_BUCKET: undefined,
    S3_REGION: undefined,
    S3_ACCESS_KEY: undefined,
    S3_SECRET_KEY: undefined,
    S3_FORCE_PATH_STYLE: undefined,
    BUNDLE_KEY_PREFIX: undefined,
    ...overrides,
  };
}

function createValidEnv(): Record<string, string | undefined> {
  return createEnv({
    EVIDENCE_BUNDLE_S3_ENABLED: 'true',
    S3_ENDPOINT: 'http://localhost:9000',
    S3_BUCKET: 'test-bucket',
    S3_REGION: 'us-east-1',
    S3_ACCESS_KEY: 'minioadmin',
    S3_SECRET_KEY: 'minioadmin',
    S3_FORCE_PATH_STYLE: 'true',
  });
}

// ============================================================================
// Feature Flag Tests
// ============================================================================

describe('Evidence Bundle Feature Flag', () => {
  describe('isEvidenceBundleS3Enabled', () => {
    it('should return false when flag is not set', () => {
      const env = createEnv();
      expect(isEvidenceBundleS3Enabled(env)).toBe(false);
    });

    it('should return false when flag is empty string', () => {
      const env = createEnv({ EVIDENCE_BUNDLE_S3_ENABLED: '' });
      expect(isEvidenceBundleS3Enabled(env)).toBe(false);
    });

    it('should return false when flag is "false"', () => {
      const env = createEnv({ EVIDENCE_BUNDLE_S3_ENABLED: 'false' });
      expect(isEvidenceBundleS3Enabled(env)).toBe(false);
    });

    it('should return false when flag is "0"', () => {
      const env = createEnv({ EVIDENCE_BUNDLE_S3_ENABLED: '0' });
      expect(isEvidenceBundleS3Enabled(env)).toBe(false);
    });

    it('should return false when flag is "TRUE" (case sensitive)', () => {
      const env = createEnv({ EVIDENCE_BUNDLE_S3_ENABLED: 'TRUE' });
      expect(isEvidenceBundleS3Enabled(env)).toBe(false);
    });

    it('should return true ONLY when flag is exactly "true"', () => {
      const env = createEnv({ EVIDENCE_BUNDLE_S3_ENABLED: 'true' });
      expect(isEvidenceBundleS3Enabled(env)).toBe(true);
    });
  });

  describe('validateObjectStoreConfig', () => {
    it('should return null when flag is disabled', () => {
      const env = createEnv({ EVIDENCE_BUNDLE_S3_ENABLED: 'false' });
      expect(validateObjectStoreConfig(env)).toBeNull();
    });

    it('should throw when flag is enabled but config is missing', () => {
      const env = createEnv({ EVIDENCE_BUNDLE_S3_ENABLED: 'true' });
      expect(() => validateObjectStoreConfig(env)).toThrow(ObjectStoreConfigError);
    });

    it('should return config when flag is enabled and config is valid', () => {
      const env = createValidEnv();
      const config = validateObjectStoreConfig(env);
      
      expect(config).not.toBeNull();
      expect(config?.endpoint).toBe('http://localhost:9000');
      expect(config?.bucket).toBe('test-bucket');
      expect(config?.region).toBe('us-east-1');
      expect(config?.forcePathStyle).toBe(true);
    });
  });

  describe('loadObjectStoreConfig', () => {
    it('should throw with detailed error message when endpoint is missing', () => {
      const env = createEnv({
        S3_BUCKET: 'test-bucket',
        S3_REGION: 'us-east-1',
        S3_ACCESS_KEY: 'key',
        S3_SECRET_KEY: 'secret',
      });
      
      expect(() => loadObjectStoreConfig(env)).toThrow(ObjectStoreConfigError);
      
      try {
        loadObjectStoreConfig(env);
      } catch (error) {
        expect(error).toBeInstanceOf(ObjectStoreConfigError);
        expect((error as ObjectStoreConfigError).message).toContain('S3_ENDPOINT');
      }
    });

    it('should throw when endpoint is not a valid URL', () => {
      const env = createEnv({
        S3_ENDPOINT: 'not-a-url',
        S3_BUCKET: 'test-bucket',
        S3_REGION: 'us-east-1',
        S3_ACCESS_KEY: 'key',
        S3_SECRET_KEY: 'secret',
      });
      
      expect(() => loadObjectStoreConfig(env)).toThrow(ObjectStoreConfigError);
    });

    it('should use default values for optional fields', () => {
      const env = createEnv({
        S3_ENDPOINT: 'http://localhost:9000',
        S3_BUCKET: 'test-bucket',
        S3_ACCESS_KEY: 'key',
        S3_SECRET_KEY: 'secret',
      });
      
      const config = loadObjectStoreConfig(env);
      
      expect(config.region).toBe('us-east-1'); // default
      expect(config.forcePathStyle).toBe(true); // default
      expect(config.keyPrefix).toBe('tenants'); // default
      expect(config.tlsInsecure).toBe(false); // default
    });
  });
});

// ============================================================================
// Module Loading Tests
// ============================================================================

describe('EvidenceBundleModule', () => {
  // Suppress logger output during tests
  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  describe('forRoot with flag disabled', () => {
    it('should NOT provide OBJECT_STORE_CLIENT when flag is disabled', async () => {
      const env = createEnv({ EVIDENCE_BUNDLE_S3_ENABLED: 'false' });
      
      const module = await Test.createTestingModule({
        imports: [EvidenceBundleModule.forRoot(env)],
      }).compile();
      
      // Attempting to get OBJECT_STORE_CLIENT should throw
      expect(() => module.get(OBJECT_STORE_CLIENT)).toThrow();
      
      await module.close();
    });

    it('should return empty providers when flag is disabled', () => {
      const env = createEnv({ EVIDENCE_BUNDLE_S3_ENABLED: 'false' });
      
      const dynamicModule = EvidenceBundleModule.forRoot(env);
      
      expect(dynamicModule.providers).toEqual([]);
      expect(dynamicModule.exports).toEqual([]);
    });

    it('should report isEnabled() as false when flag is disabled', () => {
      const env = createEnv({ EVIDENCE_BUNDLE_S3_ENABLED: 'false' });
      
      EvidenceBundleModule.forRoot(env);
      
      expect(EvidenceBundleModule.isEnabled()).toBe(false);
    });
  });

  describe('forRoot with flag enabled but config missing', () => {
    it('should throw ObjectStoreConfigError when config is incomplete', () => {
      const env = createEnv({ EVIDENCE_BUNDLE_S3_ENABLED: 'true' });
      
      expect(() => EvidenceBundleModule.forRoot(env)).toThrow(ObjectStoreConfigError);
    });

    it('should throw with helpful error message listing required env vars', () => {
      const env = createEnv({ EVIDENCE_BUNDLE_S3_ENABLED: 'true' });
      
      try {
        EvidenceBundleModule.forRoot(env);
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ObjectStoreConfigError);
        const message = (error as ObjectStoreConfigError).message;
        expect(message).toContain('S3_ENDPOINT');
        expect(message).toContain('S3_BUCKET');
        expect(message).toContain('S3_ACCESS_KEY');
        expect(message).toContain('S3_SECRET_KEY');
      }
    });
  });

  describe('forRoot with flag enabled and valid config', () => {
    it('should provide OBJECT_STORE_CLIENT when config is valid', async () => {
      const env = createValidEnv();
      
      const module = await Test.createTestingModule({
        imports: [EvidenceBundleModule.forRoot(env)],
      }).compile();
      
      const client = module.get<IObjectStoreClient>(OBJECT_STORE_CLIENT);
      
      expect(client).toBeDefined();
      expect(typeof client.putObject).toBe('function');
      expect(typeof client.headObject).toBe('function');
      expect(typeof client.getObject).toBe('function');
      
      await module.close();
    });

    it('should report isEnabled() as true when flag is enabled', () => {
      const env = createValidEnv();
      
      EvidenceBundleModule.forRoot(env);
      
      expect(EvidenceBundleModule.isEnabled()).toBe(true);
    });

    it('should store config accessible via getConfig()', () => {
      const env = createValidEnv();
      
      EvidenceBundleModule.forRoot(env);
      
      const config = EvidenceBundleModule.getConfig();
      expect(config).not.toBeNull();
      expect(config?.bucket).toBe('test-bucket');
      expect(config?.endpoint).toBe('http://localhost:9000');
    });
  });
});

// ============================================================================
// EvidenceBundleDisabledError Tests
// ============================================================================

describe('EvidenceBundleDisabledError', () => {
  it('should have correct error code', () => {
    const error = new EvidenceBundleDisabledError();
    expect(error.code).toBe('EVIDENCE_BUNDLE_DISABLED');
  });

  it('should have descriptive message', () => {
    const error = new EvidenceBundleDisabledError();
    expect(error.message).toContain('EVIDENCE_BUNDLE_S3_ENABLED');
    expect(error.message).toContain('disabled');
  });

  it('should be instanceof Error', () => {
    const error = new EvidenceBundleDisabledError();
    expect(error).toBeInstanceOf(Error);
  });
});
