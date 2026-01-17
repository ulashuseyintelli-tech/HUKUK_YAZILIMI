/**
 * Retention Policy Tests
 * 
 * Phase 8 - Sprint 2C
 * 
 * Tests for retention policy hierarchy and transition rules.
 * 
 * @see .kiro/specs/whatif-simulation/design.md
 */

import {
  RetentionPolicy,
  RETENTION_HOURS,
  POLICY_RANK,
  isTransitionAllowed,
  validateTransition,
  calculateExpiresAt,
  isExpired,
  getPolicyDescription,
} from '../retention-policy';

describe('Retention Policy', () => {
  describe('RETENTION_HOURS', () => {
    it('should have correct hours for STANDARD', () => {
      expect(RETENTION_HOURS.STANDARD).toBe(72);
    });

    it('should have correct hours for PROMOTED', () => {
      expect(RETENTION_HOURS.PROMOTED).toBe(168);
    });

    it('should have null for LEGAL_HOLD (indefinite)', () => {
      expect(RETENTION_HOURS.LEGAL_HOLD).toBeNull();
    });
  });

  describe('POLICY_RANK', () => {
    it('should have correct hierarchy (LEGAL_HOLD > PROMOTED > STANDARD)', () => {
      expect(POLICY_RANK.LEGAL_HOLD).toBeGreaterThan(POLICY_RANK.PROMOTED);
      expect(POLICY_RANK.PROMOTED).toBeGreaterThan(POLICY_RANK.STANDARD);
    });
  });

  describe('isTransitionAllowed', () => {
    describe('upgrades (allowed)', () => {
      it('should allow STANDARD → PROMOTED', () => {
        expect(isTransitionAllowed('STANDARD', 'PROMOTED')).toBe(true);
      });

      it('should allow STANDARD → LEGAL_HOLD', () => {
        expect(isTransitionAllowed('STANDARD', 'LEGAL_HOLD')).toBe(true);
      });

      it('should allow PROMOTED → LEGAL_HOLD', () => {
        expect(isTransitionAllowed('PROMOTED', 'LEGAL_HOLD')).toBe(true);
      });
    });

    describe('same policy (allowed - no-op)', () => {
      it('should allow STANDARD → STANDARD', () => {
        expect(isTransitionAllowed('STANDARD', 'STANDARD')).toBe(true);
      });

      it('should allow PROMOTED → PROMOTED', () => {
        expect(isTransitionAllowed('PROMOTED', 'PROMOTED')).toBe(true);
      });

      it('should allow LEGAL_HOLD → LEGAL_HOLD', () => {
        expect(isTransitionAllowed('LEGAL_HOLD', 'LEGAL_HOLD')).toBe(true);
      });
    });

    describe('downgrades (FORBIDDEN)', () => {
      it('should NOT allow PROMOTED → STANDARD', () => {
        expect(isTransitionAllowed('PROMOTED', 'STANDARD')).toBe(false);
      });

      it('should NOT allow LEGAL_HOLD → STANDARD', () => {
        expect(isTransitionAllowed('LEGAL_HOLD', 'STANDARD')).toBe(false);
      });

      it('should NOT allow LEGAL_HOLD → PROMOTED', () => {
        expect(isTransitionAllowed('LEGAL_HOLD', 'PROMOTED')).toBe(false);
      });
    });
  });

  describe('validateTransition', () => {
    describe('successful upgrades', () => {
      it('should return success with changed=true for STANDARD → PROMOTED', () => {
        const result = validateTransition('STANDARD', 'PROMOTED');
        
        expect(result.success).toBe(true);
        expect(result.changed).toBe(true);
        expect(result.previousPolicy).toBe('STANDARD');
        expect(result.newPolicy).toBe('PROMOTED');
        expect(result.error).toBeUndefined();
      });

      it('should return success with changed=true for STANDARD → LEGAL_HOLD', () => {
        const result = validateTransition('STANDARD', 'LEGAL_HOLD');
        
        expect(result.success).toBe(true);
        expect(result.changed).toBe(true);
        expect(result.previousPolicy).toBe('STANDARD');
        expect(result.newPolicy).toBe('LEGAL_HOLD');
      });

      it('should return success with changed=true for PROMOTED → LEGAL_HOLD', () => {
        const result = validateTransition('PROMOTED', 'LEGAL_HOLD');
        
        expect(result.success).toBe(true);
        expect(result.changed).toBe(true);
        expect(result.previousPolicy).toBe('PROMOTED');
        expect(result.newPolicy).toBe('LEGAL_HOLD');
      });
    });

    describe('no-op (same policy)', () => {
      it('should return success with changed=false for same policy', () => {
        const policies: RetentionPolicy[] = ['STANDARD', 'PROMOTED', 'LEGAL_HOLD'];
        
        for (const policy of policies) {
          const result = validateTransition(policy, policy);
          
          expect(result.success).toBe(true);
          expect(result.changed).toBe(false);
          expect(result.previousPolicy).toBe(policy);
          expect(result.newPolicy).toBe(policy);
          expect(result.error).toBeUndefined();
        }
      });
    });

    describe('forbidden downgrades', () => {
      it('should return error for PROMOTED → STANDARD', () => {
        const result = validateTransition('PROMOTED', 'STANDARD');
        
        expect(result.success).toBe(false);
        expect(result.changed).toBe(false);
        expect(result.previousPolicy).toBe('PROMOTED');
        expect(result.newPolicy).toBe('PROMOTED'); // Stays the same
        expect(result.error).toBe('RETENTION_DOWNGRADE_FORBIDDEN');
        expect(result.errorMessage).toContain('Cannot downgrade');
      });

      it('should return error for LEGAL_HOLD → STANDARD', () => {
        const result = validateTransition('LEGAL_HOLD', 'STANDARD');
        
        expect(result.success).toBe(false);
        expect(result.error).toBe('RETENTION_DOWNGRADE_FORBIDDEN');
      });

      it('should return error for LEGAL_HOLD → PROMOTED', () => {
        const result = validateTransition('LEGAL_HOLD', 'PROMOTED');
        
        expect(result.success).toBe(false);
        expect(result.error).toBe('RETENTION_DOWNGRADE_FORBIDDEN');
      });
    });
  });

  describe('calculateExpiresAt', () => {
    const baseTime = new Date('2026-01-17T12:00:00Z');

    it('should calculate 72h expiry for STANDARD', () => {
      const expiresAt = calculateExpiresAt(baseTime, 'STANDARD');
      
      expect(expiresAt).not.toBeNull();
      const expected = new Date(baseTime.getTime() + 72 * 60 * 60 * 1000);
      expect(expiresAt).toBe(expected.toISOString());
    });

    it('should calculate 168h expiry for PROMOTED', () => {
      const expiresAt = calculateExpiresAt(baseTime, 'PROMOTED');
      
      expect(expiresAt).not.toBeNull();
      const expected = new Date(baseTime.getTime() + 168 * 60 * 60 * 1000);
      expect(expiresAt).toBe(expected.toISOString());
    });

    it('should return null for LEGAL_HOLD', () => {
      const expiresAt = calculateExpiresAt(baseTime, 'LEGAL_HOLD');
      
      expect(expiresAt).toBeNull();
    });
  });

  describe('isExpired', () => {
    const baseTime = new Date('2026-01-17T12:00:00Z');

    describe('STANDARD policy', () => {
      it('should return false before 72h', () => {
        const expiresAt = new Date(baseTime.getTime() + 72 * 60 * 60 * 1000).toISOString();
        const now = new Date(baseTime.getTime() + 71 * 60 * 60 * 1000 + 59 * 60 * 1000); // 71h59m
        
        expect(isExpired(expiresAt, 'STANDARD', now)).toBe(false);
      });

      it('should return true at exactly 72h (>= comparison)', () => {
        const expiresAt = new Date(baseTime.getTime() + 72 * 60 * 60 * 1000).toISOString();
        const now = new Date(baseTime.getTime() + 72 * 60 * 60 * 1000); // Exactly 72h
        
        expect(isExpired(expiresAt, 'STANDARD', now)).toBe(true);
      });

      it('should return true after 72h', () => {
        const expiresAt = new Date(baseTime.getTime() + 72 * 60 * 60 * 1000).toISOString();
        const now = new Date(baseTime.getTime() + 73 * 60 * 60 * 1000); // 73h
        
        expect(isExpired(expiresAt, 'STANDARD', now)).toBe(true);
      });
    });

    describe('PROMOTED policy', () => {
      it('should return false before 168h', () => {
        const expiresAt = new Date(baseTime.getTime() + 168 * 60 * 60 * 1000).toISOString();
        const now = new Date(baseTime.getTime() + 167 * 60 * 60 * 1000 + 59 * 60 * 1000); // 167h59m
        
        expect(isExpired(expiresAt, 'PROMOTED', now)).toBe(false);
      });

      it('should return true at exactly 168h (>= comparison)', () => {
        const expiresAt = new Date(baseTime.getTime() + 168 * 60 * 60 * 1000).toISOString();
        const now = new Date(baseTime.getTime() + 168 * 60 * 60 * 1000); // Exactly 168h
        
        expect(isExpired(expiresAt, 'PROMOTED', now)).toBe(true);
      });

      it('should return true after 168h', () => {
        const expiresAt = new Date(baseTime.getTime() + 168 * 60 * 60 * 1000).toISOString();
        const now = new Date(baseTime.getTime() + 169 * 60 * 60 * 1000); // 169h
        
        expect(isExpired(expiresAt, 'PROMOTED', now)).toBe(true);
      });
    });

    describe('LEGAL_HOLD policy', () => {
      it('should NEVER expire regardless of time', () => {
        const now1000h = new Date(baseTime.getTime() + 1000 * 60 * 60 * 1000);
        
        expect(isExpired(null, 'LEGAL_HOLD', now1000h)).toBe(false);
      });

      it('should NEVER expire even with expiresAt set (policy takes precedence)', () => {
        // Edge case: if somehow expiresAt is set but policy is LEGAL_HOLD
        const expiresAt = new Date(baseTime.getTime() + 1 * 60 * 60 * 1000).toISOString(); // 1h
        const now = new Date(baseTime.getTime() + 100 * 60 * 60 * 1000); // 100h
        
        expect(isExpired(expiresAt, 'LEGAL_HOLD', now)).toBe(false);
      });
    });
  });

  describe('getPolicyDescription', () => {
    it('should return description for STANDARD', () => {
      expect(getPolicyDescription('STANDARD')).toContain('72h');
    });

    it('should return description for PROMOTED', () => {
      expect(getPolicyDescription('PROMOTED')).toContain('168h');
    });

    it('should return description for LEGAL_HOLD', () => {
      expect(getPolicyDescription('LEGAL_HOLD')).toContain('indefinite');
    });
  });
});
