/**
 * Snapshot Store Backend Tests
 * 
 * Phase 9B.5 - Task 2: Production Safety Gate
 * 
 * Tests for resolveSnapshotStoreBackend() function.
 * Ensures production safety gate works correctly.
 * 
 * @see snapshot-store-backend.ts
 */

import {
  resolveSnapshotStoreBackend,
  getBackendLogMessage,
  isDurableEnvironment,
  assertInMemoryAllowed,
  StartupConfigurationError,
  BackendEnvironment,
} from '../snapshot-store-backend';

describe('resolveSnapshotStoreBackend', () => {
  // ==========================================================================
  // Rule 1: Hard Fail - production/staging + inmemory
  // ==========================================================================
  
  describe('Rule 1: Hard Fail (durable + inmemory)', () => {
    it('throws StartupConfigurationError for production + inmemory', () => {
      const env: BackendEnvironment = {
        APP_ENV: 'production',
        SNAPSHOT_STORE_BACKEND: 'inmemory',
      };
      
      expect(() => resolveSnapshotStoreBackend(env)).toThrow(StartupConfigurationError);
      expect(() => resolveSnapshotStoreBackend(env)).toThrow(/FORBIDDEN/);
      expect(() => resolveSnapshotStoreBackend(env)).toThrow(/production/);
    });
    
    it('throws StartupConfigurationError for staging + inmemory', () => {
      const env: BackendEnvironment = {
        APP_ENV: 'staging',
        SNAPSHOT_STORE_BACKEND: 'inmemory',
      };
      
      expect(() => resolveSnapshotStoreBackend(env)).toThrow(StartupConfigurationError);
      expect(() => resolveSnapshotStoreBackend(env)).toThrow(/FORBIDDEN/);
      expect(() => resolveSnapshotStoreBackend(env)).toThrow(/staging/);
    });
    
    it('error message includes actionable guidance', () => {
      const env: BackendEnvironment = {
        APP_ENV: 'production',
        SNAPSHOT_STORE_BACKEND: 'inmemory',
      };
      
      try {
        resolveSnapshotStoreBackend(env);
        fail('Expected StartupConfigurationError');
      } catch (error) {
        expect(error).toBeInstanceOf(StartupConfigurationError);
        const message = (error as StartupConfigurationError).message;
        expect(message).toContain('SNAPSHOT_STORE_BACKEND=postgres');
        expect(message).toContain('APP_ENV=development/test');
        expect(message).toContain('data loss');
      }
    });
  });
  
  // ==========================================================================
  // Rule 2: Default - production/staging + undefined → postgres
  // ==========================================================================
  
  describe('Rule 2: Default (durable + undefined → postgres)', () => {
    it('returns postgres for production + undefined backend', () => {
      const env: BackendEnvironment = {
        APP_ENV: 'production',
        SNAPSHOT_STORE_BACKEND: undefined,
      };
      
      expect(resolveSnapshotStoreBackend(env)).toBe('postgres');
    });
    
    it('returns postgres for staging + undefined backend', () => {
      const env: BackendEnvironment = {
        APP_ENV: 'staging',
        SNAPSHOT_STORE_BACKEND: undefined,
      };
      
      expect(resolveSnapshotStoreBackend(env)).toBe('postgres');
    });
    
    it('returns postgres for production + empty string backend', () => {
      const env: BackendEnvironment = {
        APP_ENV: 'production',
        SNAPSHOT_STORE_BACKEND: '',
      };
      
      expect(resolveSnapshotStoreBackend(env)).toBe('postgres');
    });
    
    it('returns postgres for production + explicit postgres', () => {
      const env: BackendEnvironment = {
        APP_ENV: 'production',
        SNAPSHOT_STORE_BACKEND: 'postgres',
      };
      
      expect(resolveSnapshotStoreBackend(env)).toBe('postgres');
    });
  });
  
  // ==========================================================================
  // Rule 3: Explicit opt-in - development + inmemory
  // ==========================================================================
  
  describe('Rule 3: Explicit opt-in (development)', () => {
    it('returns inmemory for development + explicit inmemory', () => {
      const env: BackendEnvironment = {
        APP_ENV: 'development',
        SNAPSHOT_STORE_BACKEND: 'inmemory',
      };
      
      expect(resolveSnapshotStoreBackend(env)).toBe('inmemory');
    });
    
    it('returns postgres for development + undefined (default)', () => {
      const env: BackendEnvironment = {
        APP_ENV: 'development',
        SNAPSHOT_STORE_BACKEND: undefined,
      };
      
      expect(resolveSnapshotStoreBackend(env)).toBe('postgres');
    });
    
    it('returns postgres for development + explicit postgres', () => {
      const env: BackendEnvironment = {
        APP_ENV: 'development',
        SNAPSHOT_STORE_BACKEND: 'postgres',
      };
      
      expect(resolveSnapshotStoreBackend(env)).toBe('postgres');
    });
  });
  
  // ==========================================================================
  // Rule 4: Test environment
  // ==========================================================================
  
  describe('Rule 4: Test environment', () => {
    it('returns inmemory for test + undefined (convenience default)', () => {
      const env: BackendEnvironment = {
        APP_ENV: 'test',
        SNAPSHOT_STORE_BACKEND: undefined,
      };
      
      expect(resolveSnapshotStoreBackend(env)).toBe('inmemory');
    });
    
    it('returns inmemory for test + explicit inmemory', () => {
      const env: BackendEnvironment = {
        APP_ENV: 'test',
        SNAPSHOT_STORE_BACKEND: 'inmemory',
      };
      
      expect(resolveSnapshotStoreBackend(env)).toBe('inmemory');
    });
    
    it('returns postgres for test + explicit postgres', () => {
      const env: BackendEnvironment = {
        APP_ENV: 'test',
        SNAPSHOT_STORE_BACKEND: 'postgres',
      };
      
      expect(resolveSnapshotStoreBackend(env)).toBe('postgres');
    });
  });
  
  // ==========================================================================
  // Edge Cases
  // ==========================================================================
  
  describe('Edge Cases', () => {
    it('handles case-insensitive APP_ENV', () => {
      expect(resolveSnapshotStoreBackend({ APP_ENV: 'PRODUCTION' })).toBe('postgres');
      expect(resolveSnapshotStoreBackend({ APP_ENV: 'Production' })).toBe('postgres');
      expect(resolveSnapshotStoreBackend({ APP_ENV: 'DEVELOPMENT' })).toBe('postgres');
    });
    
    it('handles case-insensitive SNAPSHOT_STORE_BACKEND', () => {
      expect(resolveSnapshotStoreBackend({
        APP_ENV: 'development',
        SNAPSHOT_STORE_BACKEND: 'INMEMORY',
      })).toBe('inmemory');
      
      expect(resolveSnapshotStoreBackend({
        APP_ENV: 'development',
        SNAPSHOT_STORE_BACKEND: 'POSTGRES',
      })).toBe('postgres');
    });
    
    it('handles whitespace in values', () => {
      expect(resolveSnapshotStoreBackend({
        APP_ENV: '  production  ',
        SNAPSHOT_STORE_BACKEND: '  postgres  ',
      })).toBe('postgres');
    });
    
    it('defaults to development when APP_ENV is undefined', () => {
      const env: BackendEnvironment = {
        APP_ENV: undefined,
        SNAPSHOT_STORE_BACKEND: undefined,
      };
      
      // development + undefined → postgres
      expect(resolveSnapshotStoreBackend(env)).toBe('postgres');
    });
    
    it('throws for invalid APP_ENV', () => {
      const env: BackendEnvironment = {
        APP_ENV: 'invalid',
      };
      
      expect(() => resolveSnapshotStoreBackend(env)).toThrow(StartupConfigurationError);
      expect(() => resolveSnapshotStoreBackend(env)).toThrow(/Invalid APP_ENV/);
    });
    
    it('throws for invalid SNAPSHOT_STORE_BACKEND', () => {
      const env: BackendEnvironment = {
        APP_ENV: 'development',
        SNAPSHOT_STORE_BACKEND: 'redis',
      };
      
      expect(() => resolveSnapshotStoreBackend(env)).toThrow(StartupConfigurationError);
      expect(() => resolveSnapshotStoreBackend(env)).toThrow(/Invalid SNAPSHOT_STORE_BACKEND/);
    });
  });
});

describe('getBackendLogMessage', () => {
  it('returns correct message for postgres in production', () => {
    const message = getBackendLogMessage('postgres', 'production');
    
    expect(message).toContain('backend=postgres');
    expect(message).toContain('APP_ENV=production');
    expect(message).toContain('durable environment');
    expect(message).toContain('inmemory forbidden');
  });
  
  it('returns correct message for postgres in development', () => {
    const message = getBackendLogMessage('postgres', 'development');
    
    expect(message).toContain('backend=postgres');
    expect(message).toContain('APP_ENV=development');
    expect(message).not.toContain('durable environment');
  });
  
  it('returns correct message for inmemory in test', () => {
    const message = getBackendLogMessage('inmemory', 'test');
    
    expect(message).toContain('backend=inmemory');
    expect(message).toContain('APP_ENV=test');
  });
});

describe('isDurableEnvironment', () => {
  it('returns true for production', () => {
    expect(isDurableEnvironment('production')).toBe(true);
  });
  
  it('returns true for staging', () => {
    expect(isDurableEnvironment('staging')).toBe(true);
  });
  
  it('returns false for development', () => {
    expect(isDurableEnvironment('development')).toBe(false);
  });
  
  it('returns false for test', () => {
    expect(isDurableEnvironment('test')).toBe(false);
  });
});

describe('assertInMemoryAllowed', () => {
  it('throws in production environment', () => {
    expect(() => assertInMemoryAllowed({ APP_ENV: 'production' }))
      .toThrow(StartupConfigurationError);
  });
  
  it('throws in staging environment', () => {
    expect(() => assertInMemoryAllowed({ APP_ENV: 'staging' }))
      .toThrow(StartupConfigurationError);
  });
  
  it('does not throw in development environment', () => {
    expect(() => assertInMemoryAllowed({ APP_ENV: 'development' }))
      .not.toThrow();
  });
  
  it('does not throw in test environment', () => {
    expect(() => assertInMemoryAllowed({ APP_ENV: 'test' }))
      .not.toThrow();
  });
  
  it('does not throw when APP_ENV is undefined (defaults to development)', () => {
    expect(() => assertInMemoryAllowed({ APP_ENV: undefined }))
      .not.toThrow();
  });
});

describe('StartupConfigurationError', () => {
  it('has correct error code', () => {
    const error = new StartupConfigurationError('test message');
    
    expect(error.code).toBe('STARTUP_CONFIGURATION_ERROR');
    expect(error.name).toBe('StartupConfigurationError');
    expect(error.message).toBe('test message');
  });
  
  it('is instanceof Error', () => {
    const error = new StartupConfigurationError('test');
    
    expect(error).toBeInstanceOf(Error);
  });
});
