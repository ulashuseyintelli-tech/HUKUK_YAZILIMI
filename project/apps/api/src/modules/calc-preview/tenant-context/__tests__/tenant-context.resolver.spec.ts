/**
 * TenantContextResolver Tests
 * 
 * GATE 1 VERIFICATION:
 * - JWT tenant extraction works correctly
 * - HMAC validation is enforced
 * - Header spoof attempts are rejected
 * - Invalid signatures are rejected
 */

import { TenantContextResolver, TenantContextRequest } from '../tenant-context.resolver';
// Types imported for reference but not directly used in tests
// import { TenantContextConfig, DEFAULT_TENANT_CONTEXT_CONFIG } from '../tenant-context.types';
import * as crypto from 'crypto';

describe('TenantContextResolver', () => {
  let resolver: TenantContextResolver;
  const testSecret = 'test-hmac-secret-32-chars-long!!';

  beforeEach(() => {
    process.env.INTERNAL_HMAC_SECRET = testSecret;
    resolver = new TenantContextResolver();
  });

  afterEach(() => {
    delete process.env.INTERNAL_HMAC_SECRET;
  });

  describe('JWT Resolution', () => {
    it('should resolve tenant context from valid JWT', () => {
      const request: TenantContextRequest = {
        headers: {},
        user: {
          sub: 'user-123',
          tenantId: 'tenant-abc',
          email: 'user@example.com',
          name: 'Test User',
          iss: 'https://auth.example.com',
          aud: 'calc-preview-api',
          exp: Math.floor(Date.now() / 1000) + 3600,
          scopes: ['read', 'write'],
        },
      };

      const result = resolver.resolve(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.context.tenantId).toBe('tenant-abc');
        expect(result.context.actor.id).toBe('user-123');
        expect(result.context.actor.type).toBe('USER');
        expect(result.context.authType).toBe('JWT');
        expect(result.context.scopes).toEqual(['read', 'write']);
      }
    });

    it('should reject JWT without tenantId claim', () => {
      const request: TenantContextRequest = {
        headers: {},
        user: {
          sub: 'user-123',
          // tenantId missing
          iss: 'https://auth.example.com',
          aud: 'calc-preview-api',
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
      };

      const result = resolver.resolve(request);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('MISSING_TENANT_CLAIM');
      }
    });

    it('should reject expired JWT', () => {
      const request: TenantContextRequest = {
        headers: {},
        user: {
          sub: 'user-123',
          tenantId: 'tenant-abc',
          iss: 'https://auth.example.com',
          aud: 'calc-preview-api',
          exp: Math.floor(Date.now() / 1000) - 3600, // expired 1 hour ago
        },
      };

      const result = resolver.resolve(request);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('EXPIRED_TOKEN');
      }
    });

    it('should reject JWT with untrusted issuer', () => {
      const request: TenantContextRequest = {
        headers: {},
        user: {
          sub: 'user-123',
          tenantId: 'tenant-abc',
          iss: 'https://evil.example.com', // untrusted
          aud: 'calc-preview-api',
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
      };

      const result = resolver.resolve(request);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_ISSUER');
      }
    });

    it('should reject JWT with wrong audience', () => {
      const request: TenantContextRequest = {
        headers: {},
        user: {
          sub: 'user-123',
          tenantId: 'tenant-abc',
          iss: 'https://auth.example.com',
          aud: 'wrong-api', // wrong audience
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
      };

      const result = resolver.resolve(request);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_AUDIENCE');
      }
    });

    it('should resolve service account JWT', () => {
      const request: TenantContextRequest = {
        headers: {},
        user: {
          sub: 'service-worker-1',
          tenantId: 'tenant-abc',
          iss: 'https://auth.example.com/service',
          aud: 'calc-preview-api-internal',
          exp: Math.floor(Date.now() / 1000) + 3600,
          type: 'service',
        },
      };

      const result = resolver.resolve(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.context.tenantId).toBe('tenant-abc');
        expect(result.context.actor.type).toBe('SERVICE');
        expect(result.context.authType).toBe('SERVICE_ACCOUNT');
      }
    });
  });

  describe('Internal HMAC Resolution', () => {
    const generateValidHeaders = (tenantId: string, method = 'GET', path = '/test') => {
      const timestamp = Date.now().toString();
      const message = `${method}|${path}|${timestamp}|${tenantId}`;
      const signature = crypto
        .createHmac('sha256', testSecret)
        .update(message)
        .digest('hex');

      return {
        'x-internal-tenant-id': tenantId,
        'x-internal-signature': signature,
        'x-internal-timestamp': timestamp,
        'x-internal-nonce': crypto.randomUUID(),
        'x-internal-service-id': 'test-service',
        'x-original-method': method,
        'x-original-path': path,
      };
    };

    it('should resolve tenant context from valid HMAC headers', () => {
      const headers = generateValidHeaders('tenant-xyz');
      const request: TenantContextRequest = { headers };

      const result = resolver.resolve(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.context.tenantId).toBe('tenant-xyz');
        expect(result.context.authType).toBe('INTERNAL_HMAC');
        expect(result.context.actor.type).toBe('SERVICE');
      }
    });

    it('should reject HMAC header without signature (GATE 1 - spoof prevention)', () => {
      const request: TenantContextRequest = {
        headers: {
          'x-internal-tenant-id': 'spoofed-tenant',
          // signature missing - this is a spoof attempt
        },
      };

      const result = resolver.resolve(request);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('MISSING_HMAC');
        expect(result.error.message).toContain('signature');
      }
    });

    it('should reject invalid HMAC signature (GATE 1 - tamper prevention)', () => {
      const request: TenantContextRequest = {
        headers: {
          'x-internal-tenant-id': 'tenant-xyz',
          'x-internal-signature': 'invalid-signature-attempt',
          'x-internal-timestamp': Date.now().toString(),
          'x-original-method': 'GET',
          'x-original-path': '/test',
        },
      };

      const result = resolver.resolve(request);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_HMAC');
      }
    });

    it('should reject expired timestamp (replay protection)', () => {
      const tenantId = 'tenant-xyz';
      const oldTimestamp = (Date.now() - 10 * 60 * 1000).toString(); // 10 minutes ago
      const message = `GET|/test|${oldTimestamp}|${tenantId}`;
      const signature = crypto
        .createHmac('sha256', testSecret)
        .update(message)
        .digest('hex');

      const request: TenantContextRequest = {
        headers: {
          'x-internal-tenant-id': tenantId,
          'x-internal-signature': signature,
          'x-internal-timestamp': oldTimestamp,
          'x-original-method': 'GET',
          'x-original-path': '/test',
        },
      };

      const result = resolver.resolve(request);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_HMAC');
        expect(result.error.message).toContain('replay');
      }
    });

    it('should reject reused nonce (replay protection)', () => {
      const headers = generateValidHeaders('tenant-xyz');
      const request: TenantContextRequest = { headers };

      // First request should succeed
      const result1 = resolver.resolve(request);
      expect(result1.success).toBe(true);

      // Same nonce should be rejected
      const result2 = resolver.resolve(request);
      expect(result2.success).toBe(false);
      if (!result2.success) {
        expect(result2.error.code).toBe('INVALID_HMAC');
        expect(result2.error.message).toContain('replay');
      }
    });

    it('should reject signature computed with wrong tenant ID', () => {
      // Generate signature for tenant-a but claim to be tenant-b
      const headers = generateValidHeaders('tenant-a');
      headers['x-internal-tenant-id'] = 'tenant-b'; // tamper with tenant ID

      const request: TenantContextRequest = { headers };

      const result = resolver.resolve(request);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_HMAC');
      }
    });
  });

  describe('No Authentication', () => {
    it('should reject request with no auth', () => {
      const request: TenantContextRequest = {
        headers: {},
      };

      const result = resolver.resolve(request);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('MISSING_AUTH');
      }
    });
  });

  describe('generateInternalHeaders utility', () => {
    it('should generate valid headers for internal calls', () => {
      const headers = resolver.generateInternalHeaders(
        'tenant-123',
        'POST',
        '/api/v1/data',
        'worker-service',
        'Worker Service',
      );

      expect(headers['x-internal-tenant-id']).toBe('tenant-123');
      expect(headers['x-internal-signature']).toBeDefined();
      expect(headers['x-internal-timestamp']).toBeDefined();
      expect(headers['x-internal-nonce']).toBeDefined();
      expect(headers['x-internal-service-id']).toBe('worker-service');
      expect(headers['x-original-method']).toBe('POST');
      expect(headers['x-original-path']).toBe('/api/v1/data');

      // Verify the generated headers work
      const request: TenantContextRequest = { headers };
      const result = resolver.resolve(request);
      expect(result.success).toBe(true);
    });
  });

  describe('Correlation ID', () => {
    it('should use provided correlation ID', () => {
      const request: TenantContextRequest = {
        headers: {
          'x-correlation-id': 'my-correlation-123',
        },
        user: {
          sub: 'user-123',
          tenantId: 'tenant-abc',
          iss: 'https://auth.example.com',
          aud: 'calc-preview-api',
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
      };

      const result = resolver.resolve(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.context.correlationId).toBe('my-correlation-123');
      }
    });

    it('should generate correlation ID if not provided', () => {
      const request: TenantContextRequest = {
        headers: {},
        user: {
          sub: 'user-123',
          tenantId: 'tenant-abc',
          iss: 'https://auth.example.com',
          aud: 'calc-preview-api',
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
      };

      const result = resolver.resolve(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.context.correlationId).toBeDefined();
        expect(result.context.correlationId.length).toBeGreaterThan(0);
      }
    });
  });
});
