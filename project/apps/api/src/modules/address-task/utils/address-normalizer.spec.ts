import * as fc from 'fast-check';
import {
  normalizeAddress,
  hashAddress,
  normalizeAndHashAddress,
  turkishToAscii,
  standardizeAbbreviations,
} from './address-normalizer';

describe('Address Normalizer', () => {
  describe('turkishToAscii', () => {
    it('should convert Turkish characters to ASCII', () => {
      expect(turkishToAscii('İstanbul')).toBe('Istanbul');
      expect(turkishToAscii('Şişli')).toBe('SISlI'); // ş->S, i->I, ş->S, l->l, i->I
      expect(turkishToAscii('Çankaya')).toBe('Cankaya');
      expect(turkishToAscii('Üsküdar')).toBe('UskUdar'); // ü->U, ü->U
      expect(turkishToAscii('Ödemiş')).toBe('OdemIS'); // ö->O, i->I, ş->S
      expect(turkishToAscii('Ağrı')).toBe('AGrI'); // ğ->G, ı->I
    });

    it('should handle mixed text', () => {
      expect(turkishToAscii('Atatürk Cad. No:5')).toBe('AtatUrk Cad. No:5'); // ü->U
    });
  });

  describe('normalizeAddress', () => {
    it('should return empty string for empty input', () => {
      expect(normalizeAddress('')).toBe('');
      expect(normalizeAddress(null as any)).toBe('');
      expect(normalizeAddress(undefined as any)).toBe('');
    });

    it('should convert to uppercase', () => {
      expect(normalizeAddress('istanbul')).toBe('ISTANBUL');
    });

    it('should normalize whitespace', () => {
      expect(normalizeAddress('Atatürk   Cad.   No:5')).toBe('ATATURK CADDESI NO 5');
    });

    it('should handle newlines', () => {
      expect(normalizeAddress('Atatürk Cad.\nNo:5')).toBe('ATATURK CADDESI NO 5');
    });

    it('should standardize abbreviations', () => {
      expect(normalizeAddress('Atatürk Mah. Cumhuriyet Cad. No:10')).toContain('MAHALLESI');
      expect(normalizeAddress('Atatürk Mah. Cumhuriyet Cad. No:10')).toContain('CADDESI');
    });
  });

  describe('hashAddress', () => {
    it('should return empty string for empty input', () => {
      expect(hashAddress('')).toBe('');
    });

    it('should return consistent hash for same input', () => {
      const address = 'ATATURK MAHALLESI CUMHURIYET CADDESI NO 10';
      const hash1 = hashAddress(address);
      const hash2 = hashAddress(address);
      expect(hash1).toBe(hash2);
    });

    it('should return different hash for different input', () => {
      const hash1 = hashAddress('ATATURK MAHALLESI');
      const hash2 = hashAddress('CUMHURIYET MAHALLESI');
      expect(hash1).not.toBe(hash2);
    });

    it('should return 64 character hex string', () => {
      const hash = hashAddress('TEST ADDRESS');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('normalizeAndHashAddress', () => {
    it('should return both normalized and hash', () => {
      const result = normalizeAndHashAddress('Atatürk Mah.');
      expect(result.normalized).toBe('ATATURK MAHALLESI');
      expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  // Property-based tests
  describe('Property Tests', () => {
    /**
     * Property 2: Address Deduplication
     * For any two addresses with the same normalized content, they should produce the same hash
     */
    describe('Property 2: Address Deduplication', () => {
      it('same normalized content produces same hash', () => {
        fc.assert(
          fc.property(fc.string({ minLength: 1, maxLength: 200 }), (address) => {
            const result1 = normalizeAndHashAddress(address);
            const result2 = normalizeAndHashAddress(address);
            
            // Same input should always produce same output
            return result1.normalized === result2.normalized && result1.hash === result2.hash;
          }),
          { numRuns: 100 }
        );
      });

      it('whitespace variations produce same hash', () => {
        fc.assert(
          fc.property(
            fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 2, maxLength: 5 }),
            (words) => {
              // Create two versions with different whitespace
              const address1 = words.join(' ');
              const address2 = words.join('  '); // Double spaces
              const address3 = words.join('\n'); // Newlines
              
              const hash1 = normalizeAndHashAddress(address1).hash;
              const hash2 = normalizeAndHashAddress(address2).hash;
              const hash3 = normalizeAndHashAddress(address3).hash;
              
              // All should produce same hash after normalization
              return hash1 === hash2 && hash2 === hash3;
            }
          ),
          { numRuns: 50 }
        );
      });

      it('case variations produce same hash', () => {
        fc.assert(
          fc.property(fc.string({ minLength: 1, maxLength: 100 }), (address) => {
            const hash1 = normalizeAndHashAddress(address.toLowerCase()).hash;
            const hash2 = normalizeAndHashAddress(address.toUpperCase()).hash;
            
            return hash1 === hash2;
          }),
          { numRuns: 50 }
        );
      });

      it('Turkish character variations produce same hash', () => {
        const testCases = [
          ['İstanbul', 'Istanbul', 'ISTANBUL'],
          ['Şişli', 'Sisli', 'SISLI'],
          ['Çankaya', 'Cankaya', 'CANKAYA'],
          ['Üsküdar', 'Uskudar', 'USKUDAR'],
        ];

        for (const [turkish, ascii, upper] of testCases) {
          const hash1 = normalizeAndHashAddress(turkish).hash;
          const hash2 = normalizeAndHashAddress(ascii).hash;
          const hash3 = normalizeAndHashAddress(upper).hash;
          
          expect(hash1).toBe(hash2);
          expect(hash2).toBe(hash3);
        }
      });

      it('abbreviation variations produce same hash', () => {
        const testCases = [
          ['Atatürk Mah.', 'Atatürk Mahallesi'],
          ['Cumhuriyet Cad.', 'Cumhuriyet Caddesi'],
          ['Gül Sk.', 'Gül Sokak'],
          ['No:5', 'No 5'],
        ];

        for (const [abbrev, full] of testCases) {
          const hash1 = normalizeAndHashAddress(abbrev).hash;
          const hash2 = normalizeAndHashAddress(full).hash;
          
          expect(hash1).toBe(hash2);
        }
      });
    });

    /**
     * Property: Hash uniqueness for different addresses
     * Different normalized addresses should (almost always) produce different hashes
     */
    describe('Hash Uniqueness', () => {
      it('different addresses produce different hashes', () => {
        fc.assert(
          fc.property(
            fc.string({ minLength: 5, maxLength: 100 }),
            fc.string({ minLength: 5, maxLength: 100 }),
            (addr1, addr2) => {
              // Skip if addresses normalize to the same thing
              const norm1 = normalizeAddress(addr1);
              const norm2 = normalizeAddress(addr2);
              
              if (norm1 === norm2) return true; // Same normalized = same hash is expected
              
              const hash1 = hashAddress(norm1);
              const hash2 = hashAddress(norm2);
              
              return hash1 !== hash2;
            }
          ),
          { numRuns: 100 }
        );
      });
    });

    /**
     * Property: Normalization is idempotent
     * Normalizing an already normalized address should produce the same result
     */
    describe('Normalization Idempotency', () => {
      it('normalizing twice produces same result', () => {
        fc.assert(
          fc.property(fc.string({ minLength: 1, maxLength: 200 }), (address) => {
            const once = normalizeAddress(address);
            const twice = normalizeAddress(once);
            
            return once === twice;
          }),
          { numRuns: 100 }
        );
      });
    });

    /**
     * Property: Hash is deterministic
     * Same input always produces same output
     */
    describe('Hash Determinism', () => {
      it('hash is deterministic', () => {
        fc.assert(
          fc.property(fc.string({ minLength: 1, maxLength: 200 }), (address) => {
            const hash1 = hashAddress(address);
            const hash2 = hashAddress(address);
            const hash3 = hashAddress(address);
            
            return hash1 === hash2 && hash2 === hash3;
          }),
          { numRuns: 100 }
        );
      });
    });

    /**
     * Property: Hash format is always valid
     * Hash should always be 64 hex characters (SHA-256)
     */
    describe('Hash Format', () => {
      it('hash is always 64 hex characters for non-empty input', () => {
        fc.assert(
          fc.property(fc.string({ minLength: 1, maxLength: 200 }), (address) => {
            const hash = hashAddress(address);
            
            if (address.trim() === '') {
              // Empty or whitespace-only input may produce empty hash
              return hash === '' || /^[a-f0-9]{64}$/.test(hash);
            }
            
            return /^[a-f0-9]{64}$/.test(hash);
          }),
          { numRuns: 100 }
        );
      });
    });
  });
});
