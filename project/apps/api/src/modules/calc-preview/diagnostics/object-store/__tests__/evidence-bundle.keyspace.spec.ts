/**
 * Evidence Bundle Keyspace Tests
 * 
 * Phase 9C - Task 1: Object Model & Keyspace
 * 
 * Tests for:
 * - Key builder determinism
 * - Path traversal protection
 * - Segment validation
 * - Key parsing
 */

import {
  buildBundleRootKey,
  buildManifestKey,
  buildItemKey,
  parseManifestKey,
  parseItemKey,
  buildTenantListPrefix,
  buildIncidentListPrefix,
  validateKeySegment,
  validateItemType,
  DEFAULT_BUNDLE_KEY_PREFIX,
  BUNDLE_ITEM_TYPES,
  BundleItemType,
} from '../evidence-bundle.keys';
import { InvalidObjectKeyError } from '../object-store.interface';

describe('Evidence Bundle Keyspace', () => {
  // ==========================================================================
  // Determinism Tests
  // ==========================================================================
  
  describe('Determinism', () => {
    it('should produce same root key for same inputs', () => {
      const key1 = buildBundleRootKey('tenant-1', 'incident-1', 'snapshot-1');
      const key2 = buildBundleRootKey('tenant-1', 'incident-1', 'snapshot-1');
      
      expect(key1).toBe(key2);
      expect(key1).toBe('tenants/tenant-1/incidents/incident-1/snapshots/snapshot-1');
    });
    
    it('should produce same manifest key for same inputs', () => {
      const key1 = buildManifestKey('tenant-1', 'incident-1', 'snapshot-1');
      const key2 = buildManifestKey('tenant-1', 'incident-1', 'snapshot-1');
      
      expect(key1).toBe(key2);
      expect(key1).toBe('tenants/tenant-1/incidents/incident-1/snapshots/snapshot-1/manifest.json');
    });
    
    it('should produce same item key for same inputs', () => {
      const key1 = buildItemKey('tenant-1', 'incident-1', 'snapshot-1', 'calc-result');
      const key2 = buildItemKey('tenant-1', 'incident-1', 'snapshot-1', 'calc-result');
      
      expect(key1).toBe(key2);
      expect(key1).toBe('tenants/tenant-1/incidents/incident-1/snapshots/snapshot-1/items/calc-result.json');
    });
    
    it('should produce different keys for different inputs', () => {
      const key1 = buildManifestKey('tenant-1', 'incident-1', 'snapshot-1');
      const key2 = buildManifestKey('tenant-1', 'incident-1', 'snapshot-2');
      const key3 = buildManifestKey('tenant-1', 'incident-2', 'snapshot-1');
      const key4 = buildManifestKey('tenant-2', 'incident-1', 'snapshot-1');
      
      expect(new Set([key1, key2, key3, key4]).size).toBe(4);
    });
    
    it('should support custom key prefix', () => {
      const key = buildManifestKey('tenant-1', 'incident-1', 'snapshot-1', 'custom-prefix');
      
      expect(key).toBe('custom-prefix/tenant-1/incidents/incident-1/snapshots/snapshot-1/manifest.json');
    });
    
    it('should use default prefix when not specified', () => {
      const key = buildBundleRootKey('tenant-1', 'incident-1', 'snapshot-1');
      
      expect(key.startsWith(DEFAULT_BUNDLE_KEY_PREFIX)).toBe(true);
    });
  });
  
  // ==========================================================================
  // Item Type Tests
  // ==========================================================================
  
  describe('Item Types', () => {
    it.each(BUNDLE_ITEM_TYPES)('should build key for item type: %s', (itemType) => {
      const key = buildItemKey('tenant-1', 'incident-1', 'snapshot-1', itemType);
      
      expect(key).toContain(`/items/${itemType}.json`);
    });
    
    it('should reject invalid item type', () => {
      expect(() => {
        buildItemKey('tenant-1', 'incident-1', 'snapshot-1', 'invalid-type' as BundleItemType);
      }).toThrow(InvalidObjectKeyError);
    });
    
    it('should have correct item types defined', () => {
      expect(BUNDLE_ITEM_TYPES).toContain('calc-result');
      expect(BUNDLE_ITEM_TYPES).toContain('calc-result-norm');
      expect(BUNDLE_ITEM_TYPES).toContain('trace');
      expect(BUNDLE_ITEM_TYPES).toContain('request');
      expect(BUNDLE_ITEM_TYPES).toContain('response');
      expect(BUNDLE_ITEM_TYPES).toContain('meta');
    });
  });
  
  // ==========================================================================
  // Path Traversal Protection Tests
  // ==========================================================================
  
  describe('Path Traversal Protection', () => {
    const traversalAttacks = [
      { input: '..', description: 'parent directory' },
      { input: '../..', description: 'double parent' },
      { input: 'foo/../bar', description: 'embedded traversal' },
      { input: '....', description: 'double dots' },
    ];
    
    it.each(traversalAttacks)('should reject $description attack: $input', ({ input }) => {
      expect(() => {
        buildManifestKey(input, 'incident-1', 'snapshot-1');
      }).toThrow(InvalidObjectKeyError);
    });
    
    it('should reject double slash', () => {
      expect(() => {
        buildManifestKey('tenant//1', 'incident-1', 'snapshot-1');
      }).toThrow(InvalidObjectKeyError);
    });
    
    it('should reject slash in segment', () => {
      expect(() => {
        buildManifestKey('tenant/1', 'incident-1', 'snapshot-1');
      }).toThrow(InvalidObjectKeyError);
    });
    
    it('should reject backslash', () => {
      expect(() => {
        buildManifestKey('tenant\\1', 'incident-1', 'snapshot-1');
      }).toThrow(InvalidObjectKeyError);
    });
    
    it('should reject null byte', () => {
      expect(() => {
        buildManifestKey('tenant\x001', 'incident-1', 'snapshot-1');
      }).toThrow(InvalidObjectKeyError);
    });
    
    it('should reject newlines', () => {
      expect(() => {
        buildManifestKey('tenant\n1', 'incident-1', 'snapshot-1');
      }).toThrow(InvalidObjectKeyError);
      
      expect(() => {
        buildManifestKey('tenant\r1', 'incident-1', 'snapshot-1');
      }).toThrow(InvalidObjectKeyError);
    });
    
    it('should reject single dot segment', () => {
      expect(() => {
        buildManifestKey('.', 'incident-1', 'snapshot-1');
      }).toThrow(InvalidObjectKeyError);
    });
  });
  
  // ==========================================================================
  // URL-Encoded Attack Protection Tests
  // ==========================================================================
  
  describe('URL-Encoded Attack Protection', () => {
    it('should reject %2f (encoded forward slash)', () => {
      expect(() => {
        buildManifestKey('tenant%2f1', 'incident-1', 'snapshot-1');
      }).toThrow(InvalidObjectKeyError);
    });
    
    it('should reject %2F (uppercase encoded forward slash)', () => {
      expect(() => {
        buildManifestKey('tenant%2F1', 'incident-1', 'snapshot-1');
      }).toThrow(InvalidObjectKeyError);
    });
    
    it('should reject %5c (encoded backslash)', () => {
      expect(() => {
        buildManifestKey('tenant%5c1', 'incident-1', 'snapshot-1');
      }).toThrow(InvalidObjectKeyError);
    });
    
    it('should reject %5C (uppercase encoded backslash)', () => {
      expect(() => {
        buildManifestKey('tenant%5C1', 'incident-1', 'snapshot-1');
      }).toThrow(InvalidObjectKeyError);
    });
    
    it('should reject %2e (encoded dot for traversal)', () => {
      expect(() => {
        buildManifestKey('tenant%2e%2e', 'incident-1', 'snapshot-1');
      }).toThrow(InvalidObjectKeyError);
    });
    
    it('should reject %00 (encoded null byte)', () => {
      expect(() => {
        buildManifestKey('tenant%001', 'incident-1', 'snapshot-1');
      }).toThrow(InvalidObjectKeyError);
    });
  });
  
  // ==========================================================================
  // Empty/Whitespace Validation Tests
  // ==========================================================================
  
  describe('Empty and Whitespace Validation', () => {
    it('should reject empty string', () => {
      expect(() => {
        buildManifestKey('', 'incident-1', 'snapshot-1');
      }).toThrow(InvalidObjectKeyError);
    });
    
    it('should reject whitespace-only string', () => {
      expect(() => {
        buildManifestKey('   ', 'incident-1', 'snapshot-1');
      }).toThrow(InvalidObjectKeyError);
    });
    
    it('should reject leading whitespace', () => {
      expect(() => {
        buildManifestKey(' tenant-1', 'incident-1', 'snapshot-1');
      }).toThrow(InvalidObjectKeyError);
    });
    
    it('should reject trailing whitespace', () => {
      expect(() => {
        buildManifestKey('tenant-1 ', 'incident-1', 'snapshot-1');
      }).toThrow(InvalidObjectKeyError);
    });
    
    it('should reject embedded whitespace', () => {
      expect(() => {
        buildManifestKey('tenant 1', 'incident-1', 'snapshot-1');
      }).toThrow(InvalidObjectKeyError);
    });
    
    it('should reject tab character', () => {
      expect(() => {
        buildManifestKey('tenant\t1', 'incident-1', 'snapshot-1');
      }).toThrow(InvalidObjectKeyError);
    });
    
    it('should reject undefined', () => {
      expect(() => {
        buildManifestKey(undefined as unknown as string, 'incident-1', 'snapshot-1');
      }).toThrow(InvalidObjectKeyError);
    });
    
    it('should reject null', () => {
      expect(() => {
        buildManifestKey(null as unknown as string, 'incident-1', 'snapshot-1');
      }).toThrow(InvalidObjectKeyError);
    });
  });
  
  // ==========================================================================
  // Character Allowlist Tests
  // ==========================================================================
  
  describe('Character Allowlist', () => {
    it('should accept alphanumeric characters', () => {
      expect(() => {
        buildManifestKey('tenant123', 'incident456', 'snapshot789');
      }).not.toThrow();
    });
    
    it('should accept hyphens', () => {
      expect(() => {
        buildManifestKey('tenant-1', 'incident-2', 'snapshot-3');
      }).not.toThrow();
    });
    
    it('should accept underscores', () => {
      expect(() => {
        buildManifestKey('tenant_1', 'incident_2', 'snapshot_3');
      }).not.toThrow();
    });
    
    it('should accept mixed case', () => {
      expect(() => {
        buildManifestKey('TenantABC', 'IncidentXYZ', 'SnapshotDEF');
      }).not.toThrow();
    });
    
    it('should reject special characters', () => {
      const specialChars = ['@', '#', '$', '!', '&', '*', '(', ')', '+', '=', '[', ']', '{', '}', '|', ';', ':', '"', "'", '<', '>', ',', '?'];
      
      for (const char of specialChars) {
        expect(() => {
          buildManifestKey(`tenant${char}1`, 'incident-1', 'snapshot-1');
        }).toThrow(InvalidObjectKeyError);
      }
    });
    
    it('should reject unicode characters', () => {
      expect(() => {
        buildManifestKey('tenant-ü', 'incident-1', 'snapshot-1');
      }).toThrow(InvalidObjectKeyError);
    });
    
    it('should reject emoji', () => {
      expect(() => {
        buildManifestKey('tenant-😀', 'incident-1', 'snapshot-1');
      }).toThrow(InvalidObjectKeyError);
    });
  });
  
  // ==========================================================================
  // Length Validation Tests
  // ==========================================================================
  
  describe('Length Validation', () => {
    it('should accept segment at max length (128)', () => {
      const maxSegment = 'a'.repeat(128);
      
      expect(() => {
        buildManifestKey(maxSegment, 'incident-1', 'snapshot-1');
      }).not.toThrow();
    });
    
    it('should reject segment exceeding max length', () => {
      const tooLong = 'a'.repeat(129);
      
      expect(() => {
        buildManifestKey(tooLong, 'incident-1', 'snapshot-1');
      }).toThrow(InvalidObjectKeyError);
    });
  });
  
  // ==========================================================================
  // Key Parsing Tests
  // ==========================================================================
  
  describe('Key Parsing', () => {
    describe('parseManifestKey', () => {
      it('should parse valid manifest key', () => {
        const key = 'tenants/tenant-1/incidents/incident-1/snapshots/snapshot-1/manifest.json';
        const parsed = parseManifestKey(key);
        
        expect(parsed).toEqual({
          keyPrefix: 'tenants',
          tenantId: 'tenant-1',
          incidentId: 'incident-1',
          snapshotId: 'snapshot-1',
        });
      });
      
      it('should parse manifest key with custom prefix', () => {
        const key = 'custom/tenant-1/incidents/incident-1/snapshots/snapshot-1/manifest.json';
        const parsed = parseManifestKey(key);
        
        expect(parsed).toEqual({
          keyPrefix: 'custom',
          tenantId: 'tenant-1',
          incidentId: 'incident-1',
          snapshotId: 'snapshot-1',
        });
      });
      
      it('should return null for invalid format', () => {
        expect(parseManifestKey('invalid/key')).toBeNull();
        expect(parseManifestKey('')).toBeNull();
        expect(parseManifestKey('tenants/tenant-1/manifest.json')).toBeNull();
      });
      
      it('should return null for item key', () => {
        const itemKey = 'tenants/tenant-1/incidents/incident-1/snapshots/snapshot-1/items/calc-result.json';
        expect(parseManifestKey(itemKey)).toBeNull();
      });
    });
    
    describe('parseItemKey', () => {
      it('should parse valid item key', () => {
        const key = 'tenants/tenant-1/incidents/incident-1/snapshots/snapshot-1/items/calc-result.json';
        const parsed = parseItemKey(key);
        
        expect(parsed).toEqual({
          keyPrefix: 'tenants',
          tenantId: 'tenant-1',
          incidentId: 'incident-1',
          snapshotId: 'snapshot-1',
          itemType: 'calc-result',
        });
      });
      
      it.each(BUNDLE_ITEM_TYPES)('should parse item key for type: %s', (itemType) => {
        const key = `tenants/tenant-1/incidents/incident-1/snapshots/snapshot-1/items/${itemType}.json`;
        const parsed = parseItemKey(key);
        
        expect(parsed?.itemType).toBe(itemType);
      });
      
      it('should return null for invalid item type', () => {
        const key = 'tenants/tenant-1/incidents/incident-1/snapshots/snapshot-1/items/invalid-type.json';
        expect(parseItemKey(key)).toBeNull();
      });
      
      it('should return null for manifest key', () => {
        const manifestKey = 'tenants/tenant-1/incidents/incident-1/snapshots/snapshot-1/manifest.json';
        expect(parseItemKey(manifestKey)).toBeNull();
      });
    });
  });
  
  // ==========================================================================
  // List Prefix Tests
  // ==========================================================================
  
  describe('List Prefixes', () => {
    it('should build tenant list prefix', () => {
      const prefix = buildTenantListPrefix('tenant-1');
      
      expect(prefix).toBe('tenants/tenant-1/');
    });
    
    it('should build incident list prefix', () => {
      const prefix = buildIncidentListPrefix('tenant-1', 'incident-1');
      
      expect(prefix).toBe('tenants/tenant-1/incidents/incident-1/');
    });
    
    it('should validate segments in list prefixes', () => {
      expect(() => {
        buildTenantListPrefix('../escape');
      }).toThrow(InvalidObjectKeyError);
      
      expect(() => {
        buildIncidentListPrefix('tenant-1', '../escape');
      }).toThrow(InvalidObjectKeyError);
    });
  });
  
  // ==========================================================================
  // validateKeySegment Direct Tests
  // ==========================================================================
  
  describe('validateKeySegment', () => {
    it('should not throw for valid segment', () => {
      expect(() => validateKeySegment('valid-segment', 'test')).not.toThrow();
    });
    
    it('should throw with correct error type', () => {
      try {
        validateKeySegment('', 'testField');
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidObjectKeyError);
        expect((error as InvalidObjectKeyError).fieldName).toBe('testField');
        expect((error as InvalidObjectKeyError).validationCode).toBe('SEGMENT_EMPTY');
      }
    });
    
    it('should include field name in error', () => {
      try {
        validateKeySegment('../attack', 'tenantId');
        fail('Should have thrown');
      } catch (error) {
        expect((error as InvalidObjectKeyError).fieldName).toBe('tenantId');
      }
    });
  });
  
  // ==========================================================================
  // validateItemType Direct Tests
  // ==========================================================================
  
  describe('validateItemType', () => {
    it('should not throw for valid item type', () => {
      expect(() => validateItemType('calc-result')).not.toThrow();
    });
    
    it('should throw for invalid item type', () => {
      expect(() => validateItemType('invalid')).toThrow(InvalidObjectKeyError);
    });
    
    it('should include validation code in error', () => {
      try {
        validateItemType('invalid');
        fail('Should have thrown');
      } catch (error) {
        expect((error as InvalidObjectKeyError).validationCode).toBe('INVALID_ITEM_TYPE');
      }
    });
  });
});
