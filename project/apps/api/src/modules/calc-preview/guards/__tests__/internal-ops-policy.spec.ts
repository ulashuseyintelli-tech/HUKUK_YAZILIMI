/**
 * PR-1: Internal Ops Policy — Unit Tests
 *
 * Tests the shared policy function that both ManifestAdminAuthGuard
 * and trace endpoint guards consume.
 */

import {
  evaluateInternalOpsPolicy,
  INTERNAL_OPS_ROLES,
  IBreakGlassFlag,
  EnvBreakGlassFlag,
  InternalOpsUser,
} from '../internal-ops-policy';

// ============================================================================
// Helpers
// ============================================================================

class MockBreakGlass implements IBreakGlassFlag {
  constructor(private open: boolean) {}
  isBreakGlassOpen(): boolean { return this.open; }
  setOpen(v: boolean) { this.open = v; }
}

// ============================================================================
// Tests
// ============================================================================

describe('evaluateInternalOpsPolicy', () => {
  describe('GATE 1: break-glass', () => {
    it('returns BREAK_GLASS_CLOSED when flag is off', () => {
      const result = evaluateInternalOpsPolicy(
        { id: 'u1', roles: ['ops_admin'] },
        new MockBreakGlass(false),
      );
      expect(result.allowed).toBe(false);
      expect(result.code).toBe('BREAK_GLASS_CLOSED');
    });
  });

  describe('GATE 2: authentication', () => {
    it('returns UNAUTHORIZED when user is undefined', () => {
      const result = evaluateInternalOpsPolicy(undefined, new MockBreakGlass(true));
      expect(result.allowed).toBe(false);
      expect(result.code).toBe('UNAUTHORIZED');
    });

    it('returns UNAUTHORIZED when user is null', () => {
      const result = evaluateInternalOpsPolicy(null, new MockBreakGlass(true));
      expect(result.allowed).toBe(false);
      expect(result.code).toBe('UNAUTHORIZED');
    });
  });

  describe('GATE 3: role check', () => {
    it('returns INSUFFICIENT_ROLE when user has no roles', () => {
      const result = evaluateInternalOpsPolicy(
        { id: 'u1', roles: [] },
        new MockBreakGlass(true),
      );
      expect(result.allowed).toBe(false);
      expect(result.code).toBe('INSUFFICIENT_ROLE');
    });

    it('returns INSUFFICIENT_ROLE when user has wrong role', () => {
      const result = evaluateInternalOpsPolicy(
        { id: 'u1', roles: ['viewer', 'editor'] },
        new MockBreakGlass(true),
      );
      expect(result.allowed).toBe(false);
      expect(result.code).toBe('INSUFFICIENT_ROLE');
    });

    it('returns INSUFFICIENT_ROLE when roles is undefined', () => {
      const result = evaluateInternalOpsPolicy(
        { id: 'u1' } as InternalOpsUser,
        new MockBreakGlass(true),
      );
      expect(result.allowed).toBe(false);
      expect(result.code).toBe('INSUFFICIENT_ROLE');
    });

    it('returns ALLOWED when user has ops_admin', () => {
      const result = evaluateInternalOpsPolicy(
        { id: 'u1', roles: ['ops_admin'] },
        new MockBreakGlass(true),
      );
      expect(result.allowed).toBe(true);
      expect(result.code).toBe('ALLOWED');
      expect(result.actorId).toBe('u1');
    });

    it('returns ALLOWED when ops_admin is among other roles', () => {
      const result = evaluateInternalOpsPolicy(
        { id: 'u1', roles: ['viewer', 'ops_admin', 'editor'] },
        new MockBreakGlass(true),
      );
      expect(result.allowed).toBe(true);
    });
  });

  describe('INTERNAL_OPS_ROLES constant', () => {
    it('contains ops_admin', () => {
      expect(INTERNAL_OPS_ROLES).toContain('ops_admin');
    });

    it('is frozen (immutable)', () => {
      expect(Object.isFrozen(INTERNAL_OPS_ROLES)).toBe(true);
    });
  });

  describe('EnvBreakGlassFlag', () => {
    const ENV_KEY = 'TEST_BG_FLAG_POLICY';

    afterEach(() => {
      delete process.env[ENV_KEY];
    });

    it('returns false when env var is not set', () => {
      const flag = new EnvBreakGlassFlag(ENV_KEY);
      expect(flag.isBreakGlassOpen()).toBe(false);
    });

    it('returns false when env var is "false"', () => {
      process.env[ENV_KEY] = 'false';
      const flag = new EnvBreakGlassFlag(ENV_KEY);
      expect(flag.isBreakGlassOpen()).toBe(false);
    });

    it('returns true when env var is "true"', () => {
      process.env[ENV_KEY] = 'true';
      const flag = new EnvBreakGlassFlag(ENV_KEY);
      expect(flag.isBreakGlassOpen()).toBe(true);
    });
  });
});
