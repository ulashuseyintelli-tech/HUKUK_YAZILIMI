/**
 * TenantContextResolver
 * 
 * THE SINGLE SOURCE OF TRUTH for tenant identity extraction.
 * 
 * GATE 1 ENFORCEMENT:
 * - This is the ONLY component that may read tenant identity from requests
 * - No other component may access JWT claims, headers, or path params for tenant ID
 * - All tenant context flows through this resolver
 * 
 * @see design.md "Gate 1: TenantContext Source Authority is Singular"
 */

import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import {
  TenantContext,
  TenantContextResult,
  TenantContextConfig,
  ActorIdentity,
  TenantAuthType,
  DEFAULT_TENANT_CONTEXT_CONFIG,
} from './tenant-context.types';

/**
 * Minimal request interface - only what we need
 */
export interface TenantContextRequest {
  headers: Record<string, string | string[] | undefined>;
  user?: {
    sub?: string;
    tenantId?: string;
    email?: string;
    name?: string;
    iss?: string;
    aud?: string | string[];
    exp?: number;
    iat?: number;
    type?: string;
    scopes?: string[];
  };
}

@Injectable()
export class TenantContextResolver {
  private readonly logger = new Logger(TenantContextResolver.name);
  private readonly config: TenantContextConfig;
  private readonly hmacSecret: string;
  private readonly nonceCache = new Map<string, number>();
  private readonly NONCE_CACHE_MAX_SIZE = 10000;

  constructor(config?: Partial<TenantContextConfig>) {
    this.config = { ...DEFAULT_TENANT_CONTEXT_CONFIG, ...config };
    this.hmacSecret = process.env.INTERNAL_HMAC_SECRET || 'dev-secret-change-in-prod';
    
    // Warn if using default secret in non-test environment
    if (this.hmacSecret === 'dev-secret-change-in-prod' && process.env.NODE_ENV === 'production') {
      this.logger.error('SECURITY: Using default HMAC secret in production!');
    }
  }

  /**
   * Resolve tenant context from request
   * 
   * Resolution order:
   * 1. JWT (user or service account)
   * 2. Internal HMAC header (for service-to-service)
   */
  resolve(request: TenantContextRequest): TenantContextResult {
    const correlationId = this.extractCorrelationId(request);

    // Try JWT first (most common case)
    if (request.user) {
      return this.resolveFromJwt(request.user, correlationId);
    }

    // Try internal HMAC header
    if (this.config.internalHmac.enabled && this.hasInternalHeaders(request)) {
      return this.resolveFromInternalHmac(request, correlationId);
    }

    // No valid auth found
    return {
      success: false,
      error: {
        code: 'MISSING_AUTH',
        message: 'No valid authentication provided',
      },
    };
  }

  /**
   * Resolve from JWT claims (user or service account)
   */
  private resolveFromJwt(
    user: NonNullable<TenantContextRequest['user']>,
    correlationId: string,
  ): TenantContextResult {
    // Check expiration
    if (user.exp && user.exp * 1000 < Date.now()) {
      return {
        success: false,
        error: {
          code: 'EXPIRED_TOKEN',
          message: 'JWT has expired',
        },
      };
    }

    // Determine if this is a service account or user JWT
    const isServiceAccount = user.iss === this.config.serviceAccount.issuer;
    const authType: TenantAuthType = isServiceAccount ? 'SERVICE_ACCOUNT' : 'JWT';

    // Validate issuer
    const validIssuers = isServiceAccount
      ? [this.config.serviceAccount.issuer]
      : this.config.jwt.issuers;
    
    if (user.iss && !validIssuers.includes(user.iss)) {
      return {
        success: false,
        error: {
          code: 'INVALID_ISSUER',
          message: `Untrusted issuer: ${user.iss}`,
          details: { issuer: user.iss, expected: validIssuers },
        },
      };
    }

    // Validate audience
    const validAudiences = isServiceAccount
      ? [this.config.serviceAccount.audience]
      : this.config.jwt.audiences;
    
    const tokenAudiences = Array.isArray(user.aud) ? user.aud : user.aud ? [user.aud] : [];
    const hasValidAudience = tokenAudiences.some(aud => validAudiences.includes(aud));
    
    if (tokenAudiences.length > 0 && !hasValidAudience) {
      return {
        success: false,
        error: {
          code: 'INVALID_AUDIENCE',
          message: 'Token audience mismatch',
          details: { audience: tokenAudiences, expected: validAudiences },
        },
      };
    }

    // Extract tenant ID
    const tenantId = user.tenantId;
    if (!tenantId) {
      return {
        success: false,
        error: {
          code: 'MISSING_TENANT_CLAIM',
          message: `JWT missing required claim: ${this.config.jwt.tenantIdClaim}`,
        },
      };
    }

    // Build actor identity
    const actor: ActorIdentity = {
      id: user.sub || 'unknown',
      type: isServiceAccount ? 'SERVICE' : 'USER',
    };
    if (user.name) actor.name = user.name;
    if (user.email) actor.email = user.email;

    // Build context
    const context: TenantContext = {
      tenantId,
      actor,
      authType,
      scopes: Object.freeze(user.scopes || []),
      resolvedAt: new Date().toISOString(),
      correlationId,
    };

    return { success: true, context };
  }

  /**
   * Resolve from internal HMAC-signed headers
   * 
   * Used for service-to-service calls where JWT may not be available.
   * Requires HMAC signature for security.
   */
  private resolveFromInternalHmac(
    request: TenantContextRequest,
    correlationId: string,
  ): TenantContextResult {
    const { tenantIdHeader, signatureHeader, timestampHeader } = this.config.internalHmac;

    const tenantId = this.getHeader(request, tenantIdHeader);
    const signature = this.getHeader(request, signatureHeader);
    const timestamp = this.getHeader(request, timestampHeader);

    // Validate required headers
    if (!tenantId) {
      return {
        success: false,
        error: {
          code: 'MISSING_AUTH',
          message: `Missing required header: ${tenantIdHeader}`,
        },
      };
    }

    if (!signature) {
      return {
        success: false,
        error: {
          code: 'MISSING_HMAC',
          message: `Internal tenant header present but missing signature: ${signatureHeader}`,
        },
      };
    }

    if (!timestamp) {
      return {
        success: false,
        error: {
          code: 'MISSING_HMAC',
          message: `Missing required header: ${timestampHeader}`,
        },
      };
    }

    // Validate timestamp (replay protection)
    const timestampMs = parseInt(timestamp, 10);
    if (isNaN(timestampMs)) {
      return {
        success: false,
        error: {
          code: 'INVALID_HMAC',
          message: 'Invalid timestamp format',
        },
      };
    }

    const age = Date.now() - timestampMs;
    if (age > this.config.internalHmac.maxTimestampAgeMs || age < -30000) {
      return {
        success: false,
        error: {
          code: 'INVALID_HMAC',
          message: 'Timestamp out of valid range (possible replay attack)',
          details: { age, maxAge: this.config.internalHmac.maxTimestampAgeMs },
        },
      };
    }

    // Check nonce (additional replay protection)
    const nonce = this.getHeader(request, 'x-internal-nonce');
    if (nonce) {
      if (this.nonceCache.has(nonce)) {
        return {
          success: false,
          error: {
            code: 'INVALID_HMAC',
            message: 'Nonce already used (replay attack detected)',
          },
        };
      }
      this.addNonce(nonce);
    }

    // Validate HMAC signature
    const method = this.getHeader(request, 'x-original-method') || 'GET';
    const path = this.getHeader(request, 'x-original-path') || '/';
    const expectedSignature = this.computeHmac(method, path, timestamp, tenantId);

    if (!this.secureCompare(signature, expectedSignature)) {
      this.logger.warn('HMAC signature mismatch', { tenantId, path });
      return {
        success: false,
        error: {
          code: 'INVALID_HMAC',
          message: 'HMAC signature validation failed',
        },
      };
    }

    // Build context
    const serviceName = this.getHeader(request, 'x-internal-service-name');
    const actor: ActorIdentity = {
      id: this.getHeader(request, 'x-internal-service-id') || 'internal-service',
      type: 'SERVICE',
    };
    if (serviceName) actor.name = serviceName;

    const context: TenantContext = {
      tenantId,
      actor,
      authType: 'INTERNAL_HMAC',
      scopes: Object.freeze([]),
      resolvedAt: new Date().toISOString(),
      correlationId,
    };

    return { success: true, context };
  }

  /**
   * Check if request has internal HMAC headers
   */
  private hasInternalHeaders(request: TenantContextRequest): boolean {
    return !!this.getHeader(request, this.config.internalHmac.tenantIdHeader);
  }

  /**
   * Get header value (handles array case)
   */
  private getHeader(request: TenantContextRequest, name: string): string | undefined {
    const value = request.headers[name.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
  }

  /**
   * Extract correlation ID from request
   */
  private extractCorrelationId(request: TenantContextRequest): string {
    return (
      this.getHeader(request, 'x-correlation-id') ||
      this.getHeader(request, 'x-request-id') ||
      crypto.randomUUID()
    );
  }

  /**
   * Compute HMAC signature
   */
  private computeHmac(method: string, path: string, timestamp: string, tenantId: string): string {
    const message = `${method}|${path}|${timestamp}|${tenantId}`;
    return crypto
      .createHmac('sha256', this.hmacSecret)
      .update(message)
      .digest('hex');
  }

  /**
   * Timing-safe string comparison
   */
  private secureCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  }

  /**
   * Add nonce to cache with cleanup
   */
  private addNonce(nonce: string): void {
    // Cleanup old entries if cache is too large
    if (this.nonceCache.size >= this.NONCE_CACHE_MAX_SIZE) {
      const cutoff = Date.now() - this.config.internalHmac.maxTimestampAgeMs;
      for (const [key, timestamp] of this.nonceCache) {
        if (timestamp < cutoff) {
          this.nonceCache.delete(key);
        }
      }
    }
    this.nonceCache.set(nonce, Date.now());
  }

  /**
   * Generate HMAC headers for internal service calls
   * 
   * Utility method for services making internal calls
   */
  generateInternalHeaders(
    tenantId: string,
    method: string,
    path: string,
    serviceId: string,
    serviceName?: string,
  ): Record<string, string> {
    const timestamp = Date.now().toString();
    const nonce = crypto.randomUUID();
    const signature = this.computeHmac(method, path, timestamp, tenantId);

    return {
      [this.config.internalHmac.tenantIdHeader]: tenantId,
      [this.config.internalHmac.signatureHeader]: signature,
      [this.config.internalHmac.timestampHeader]: timestamp,
      'x-internal-nonce': nonce,
      'x-internal-service-id': serviceId,
      'x-internal-service-name': serviceName || serviceId,
      'x-original-method': method,
      'x-original-path': path,
    };
  }
}
