/**
 * BreakGlassGrantService
 * 
 * Manages break-glass grants: issue, renew, revoke, expire.
 * 
 * Key behaviors:
 * - Issue grant with 15min TTL
 * - Renewal cap enforcement (max 3)
 * - Token generation with distinct issuer
 * - Post-mortem requirement tracking
 * - DB status check with 10s TTL cache (fail-closed)
 */

import { Injectable, Inject, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as jwt from 'jsonwebtoken';
import {
  BreakGlassGrant,
  BreakGlassRequest,
  BreakGlassTokenClaims,
  MAX_AUTHORIZED_ACTORS,
  RevocationReason,
} from '../../break-glass.types';
import { BreakGlassConfigService } from '../../break-glass.config';

/**
 * DI tokens - declared first to avoid hoisting issues
 */
export const BREAK_GLASS_GRANT_REPOSITORY = 'BREAK_GLASS_GRANT_REPOSITORY';
export const POST_MORTEM_REPOSITORY = 'POST_MORTEM_REPOSITORY';

/**
 * Grant repository interface
 */
export interface IBreakGlassGrantRepository {
  save(grant: BreakGlassGrant): Promise<void>;
  findById(grantId: string): Promise<BreakGlassGrant | null>;
  findByRequestId(requestId: string): Promise<BreakGlassGrant | null>;
  findActiveByTenant(tenantId: string): Promise<BreakGlassGrant[]>;
  update(grant: BreakGlassGrant): Promise<void>;
  findExpired(): Promise<BreakGlassGrant[]>;
}

/**
 * Post-mortem requirement interface
 */
export interface PostMortemRequirement {
  grantId: string;
  requesterId: string;
  ticketRef: string;
  deadlineAt: string;
  completedAt?: string;
  isOverdue: boolean;
}

/**
 * Post-mortem repository interface
 */
export interface IPostMortemRepository {
  create(requirement: PostMortemRequirement): Promise<void>;
  findByGrantId(grantId: string): Promise<PostMortemRequirement | null>;
  findOverdueByRequester(requesterId: string): Promise<PostMortemRequirement[]>;
  markCompleted(grantId: string): Promise<void>;
}

/**
 * In-memory grant repository for development/testing
 */
@Injectable()
export class InMemoryBreakGlassGrantRepository implements IBreakGlassGrantRepository {
  private readonly grants = new Map<string, BreakGlassGrant>();

  async save(grant: BreakGlassGrant): Promise<void> {
    this.grants.set(grant.grantId, { ...grant });
  }

  async findById(grantId: string): Promise<BreakGlassGrant | null> {
    return this.grants.get(grantId) || null;
  }

  async findByRequestId(requestId: string): Promise<BreakGlassGrant | null> {
    for (const grant of this.grants.values()) {
      if (grant.requestId === requestId) {
        return grant;
      }
    }
    return null;
  }

  async findActiveByTenant(tenantId: string): Promise<BreakGlassGrant[]> {
    const now = new Date().toISOString();
    return Array.from(this.grants.values()).filter(
      g => g.targetTenantId === tenantId && g.isActive && g.expiresAt > now,
    );
  }

  async update(grant: BreakGlassGrant): Promise<void> {
    if (!this.grants.has(grant.grantId)) {
      throw new Error(`Grant not found: ${grant.grantId}`);
    }
    this.grants.set(grant.grantId, { ...grant });
  }

  async findExpired(): Promise<BreakGlassGrant[]> {
    const now = new Date().toISOString();
    return Array.from(this.grants.values()).filter(
      g => g.isActive && g.expiresAt <= now,
    );
  }

  /**
   * For testing only
   * @internal
   */
  _clearForTesting(): void {
    this.grants.clear();
  }
}

/**
 * In-memory post-mortem repository for development/testing
 */
@Injectable()
export class InMemoryPostMortemRepository implements IPostMortemRepository {
  private readonly requirements = new Map<string, PostMortemRequirement>();

  async create(requirement: PostMortemRequirement): Promise<void> {
    this.requirements.set(requirement.grantId, { ...requirement });
  }

  async findByGrantId(grantId: string): Promise<PostMortemRequirement | null> {
    return this.requirements.get(grantId) || null;
  }

  async findOverdueByRequester(requesterId: string): Promise<PostMortemRequirement[]> {
    const now = new Date().toISOString();
    return Array.from(this.requirements.values()).filter(
      r => r.requesterId === requesterId && !r.completedAt && r.deadlineAt < now,
    );
  }

  async markCompleted(grantId: string): Promise<void> {
    const req = this.requirements.get(grantId);
    if (req) {
      req.completedAt = new Date().toISOString();
      req.isOverdue = false;
    }
  }

  /**
   * For testing only
   * @internal
   */
  _clearForTesting(): void {
    this.requirements.clear();
  }
}

/**
 * Grant status cache entry
 */
interface GrantStatusCacheEntry {
  isActive: boolean;
  cachedAt: number;
}

/**
 * Options for issuing a grant
 */
export interface IssueGrantOptions {
  /** Include approver in authorizedActors (default: false) */
  includeApproverAsAuthorizedActor?: boolean;
  /** Additional authorized actors (max total: 5) */
  additionalAuthorizedActors?: string[];
}

/**
 * Grant service
 */
@Injectable()
export class BreakGlassGrantService {
  private readonly logger = new Logger(BreakGlassGrantService.name);
  
  /** Status cache with 10s TTL (fail-closed) */
  private readonly statusCache = new Map<string, GrantStatusCacheEntry>();
  private readonly STATUS_CACHE_TTL_MS = 10_000; // 10 seconds

  constructor(
    private readonly config: BreakGlassConfigService,
    @Inject(BREAK_GLASS_GRANT_REPOSITORY)
    private readonly grantRepository: IBreakGlassGrantRepository,
    @Inject(POST_MORTEM_REPOSITORY)
    private readonly postMortemRepository: IPostMortemRepository,
  ) {}

  /**
   * Issue a new grant for an approved request
   * 
   * Actor Binding (Option A):
   * - Default authorizedActors: [requesterId]
   * - If includeApproverAsAuthorizedActor: [requesterId, approverId]
   * - Max 5 actors total
   */
  async issue(
    request: BreakGlassRequest,
    approverId: string,
    approverName?: string,
    options?: IssueGrantOptions,
  ): Promise<{ grant: BreakGlassGrant; token: string }> {
    const timingConfig = this.config.getTimingConfig();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + timingConfig.grantTtlMinutes * 60 * 1000);

    const grant: BreakGlassGrant = {
      grantId: randomUUID(),
      requestId: request.requestId,
      approverId,
      targetTenantId: request.targetTenantId,
      grantedScopes: request.requestedScopes,
      grantedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      renewalCount: 0,
      maxRenewals: timingConfig.maxRenewals,
      isActive: true,
    };
    
    if (approverName) {
      grant.approverName = approverName;
    }

    await this.grantRepository.save(grant);

    // Build authorizedActors list (Option A - explicit ID list)
    const authorizedActors = this.buildAuthorizedActors(
      request.requesterId,
      approverId,
      options,
    );

    // Generate token with actor binding
    const token = this.generateToken(grant, request.requesterId, approverId, authorizedActors);

    this.logger.log('Grant issued', {
      grantId: grant.grantId,
      requestId: request.requestId,
      targetTenantId: grant.targetTenantId,
      expiresAt: grant.expiresAt,
      authorizedActors,
    });

    return { grant, token };
  }

  /**
   * Build authorizedActors list
   * Default: [requesterId]
   * If includeApproverAsAuthorizedActor: [requesterId, approverId]
   * Max: MAX_AUTHORIZED_ACTORS (5)
   */
  private buildAuthorizedActors(
    requesterId: string,
    approverId: string,
    options?: IssueGrantOptions,
  ): string[] {
    const actors = new Set<string>([requesterId]);

    if (options?.includeApproverAsAuthorizedActor) {
      actors.add(approverId);
    }

    if (options?.additionalAuthorizedActors) {
      for (const actor of options.additionalAuthorizedActors) {
        if (actors.size >= MAX_AUTHORIZED_ACTORS) {
          this.logger.warn('Max authorized actors reached, ignoring additional', {
            max: MAX_AUTHORIZED_ACTORS,
            ignored: actor,
          });
          break;
        }
        actors.add(actor);
      }
    }

    return Array.from(actors);
  }

  /**
   * Renew an existing grant
   * 
   * Enforcement: renewalsLeft > 0 (not >= 0)
   * This is the ONLY place where renewalsLeft is enforced.
   * Guard does NOT check renewalsLeft - only exp and DB ACTIVE.
   * 
   * Note: authorizedActors is preserved from original grant.
   * In production, this would be stored in grant or looked up from previous token.
   */
  async renew(
    grantId: string,
    actorId: string,
    previousAuthorizedActors?: string[],
  ): Promise<{ grant: BreakGlassGrant; token: string }> {
    const grant = await this.grantRepository.findById(grantId);
    
    if (!grant) {
      throw new GrantNotFoundException(grantId);
    }

    if (!grant.isActive) {
      throw new GrantNotActiveException(grantId);
    }

    // Strict enforcement: renewalsLeft > 0 (not >= 0)
    const renewalsLeft = grant.maxRenewals - grant.renewalCount;
    if (renewalsLeft <= 0) {
      throw new RenewalCapExceededException(grantId, grant.maxRenewals);
    }

    // Update grant
    const timingConfig = this.config.getTimingConfig();
    const now = new Date();
    const newExpiresAt = new Date(now.getTime() + timingConfig.grantTtlMinutes * 60 * 1000);

    grant.renewalCount += 1;
    grant.expiresAt = newExpiresAt.toISOString();

    await this.grantRepository.update(grant);

    // Invalidate cache
    this.statusCache.delete(grantId);

    // Preserve authorizedActors from previous token or use actorId as fallback
    // Cap at MAX_AUTHORIZED_ACTORS for safety
    let authorizedActors = previousAuthorizedActors || [actorId];
    if (authorizedActors.length > MAX_AUTHORIZED_ACTORS) {
      this.logger.warn('Renew: authorizedActors exceeds max, truncating', {
        grantId,
        original: authorizedActors.length,
        max: MAX_AUTHORIZED_ACTORS,
      });
      authorizedActors = authorizedActors.slice(0, MAX_AUTHORIZED_ACTORS);
    }

    // Generate new token
    const token = this.generateToken(grant, actorId, grant.approverId, authorizedActors);

    this.logger.log('Grant renewed', {
      grantId: grant.grantId,
      renewalCount: grant.renewalCount,
      maxRenewals: grant.maxRenewals,
      renewalsLeft: grant.maxRenewals - grant.renewalCount,
      newExpiresAt: grant.expiresAt,
      authorizedActors,
    });

    return { grant, token };
  }

  /**
   * Revoke a grant
   * 
   * @param grantId - Grant to revoke
   * @param revokedBy - Actor ID who is revoking (or 'system' for auto-revoke)
   * @param reason - Revocation reason category
   * @param description - Optional description (max 500 chars)
   */
  async revoke(
    grantId: string,
    revokedBy: string,
    reason: RevocationReason,
    description?: string,
  ): Promise<BreakGlassGrant> {
    const grant = await this.grantRepository.findById(grantId);
    
    if (!grant) {
      throw new GrantNotFoundException(grantId);
    }

    const now = new Date().toISOString();
    
    grant.isActive = false;
    grant.revokedAt = now; // Backward compatibility
    grant.revocationReason = reason; // Backward compatibility
    
    // New structured revocation audit
    grant.revocation = {
      revokedBy,
      reason,
      revokedAt: now,
    };
    
    if (description) {
      grant.revocation.description = description.substring(0, 500);
    }

    await this.grantRepository.update(grant);

    // Invalidate cache
    this.statusCache.delete(grantId);

    this.logger.log('Grant revoked', {
      grantId: grant.grantId,
      revokedBy,
      reason,
      description: description?.substring(0, 100),
    });

    return grant;
  }

  /**
   * Expire grants that have passed their TTL
   */
  async expireGrants(): Promise<BreakGlassGrant[]> {
    const expired = await this.grantRepository.findExpired();
    const timingConfig = this.config.getTimingConfig();
    const now = new Date().toISOString();

    for (const grant of expired) {
      grant.isActive = false;
      grant.revokedAt = now; // Backward compatibility
      grant.revocationReason = 'expiry'; // Backward compatibility
      
      // New structured revocation audit
      grant.revocation = {
        revokedBy: 'system',
        reason: 'expiry',
        revokedAt: now,
      };
      
      await this.grantRepository.update(grant);

      // Invalidate cache
      this.statusCache.delete(grant.grantId);

      // Create post-mortem requirement
      const deadline = new Date();
      deadline.setHours(deadline.getHours() + timingConfig.postMortemDeadlineHours);

      await this.postMortemRepository.create({
        grantId: grant.grantId,
        requesterId: '', // Would need to look up from request
        ticketRef: '', // Would need to look up from request
        deadlineAt: deadline.toISOString(),
        isOverdue: false,
      });

      this.logger.log('Grant expired', { 
        grantId: grant.grantId,
        revokedBy: 'system',
        reason: 'expiry',
      });
    }

    return expired;
  }

  /**
   * Check if grant is active (with 10s TTL cache, fail-closed)
   */
  async isGrantActive(grantId: string): Promise<boolean> {
    // Check cache first
    const cached = this.statusCache.get(grantId);
    if (cached && Date.now() - cached.cachedAt < this.STATUS_CACHE_TTL_MS) {
      return cached.isActive;
    }

    // Cache miss or expired - check DB
    try {
      const grant = await this.grantRepository.findById(grantId);
      
      if (!grant) {
        // Grant not found - fail closed (deny access)
        this.statusCache.set(grantId, { isActive: false, cachedAt: Date.now() });
        return false;
      }

      const now = new Date().toISOString();
      const isActive = grant.isActive && grant.expiresAt > now;

      // Update cache
      this.statusCache.set(grantId, { isActive, cachedAt: Date.now() });

      return isActive;
    } catch (error) {
      // DB error - fail closed (deny access)
      this.logger.error('Failed to check grant status - failing closed', {
        grantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Get grant by ID
   */
  async getGrant(grantId: string): Promise<BreakGlassGrant | null> {
    return this.grantRepository.findById(grantId);
  }

  /**
   * Check if requester has overdue post-mortems
   */
  async hasOverduePostMortems(requesterId: string): Promise<boolean> {
    const overdue = await this.postMortemRepository.findOverdueByRequester(requesterId);
    return overdue.length > 0;
  }

  /**
   * Generate break-glass token
   * 
   * Security Notes:
   * - ticketRef is NOT included (minimum disclosure)
   * - requestId is included for audit lookup
   * - authorizedActors enforces actor binding (Option A)
   * - jti is unique per token for replay/anomaly detection
   */
  private generateToken(
    grant: BreakGlassGrant,
    requesterId: string,
    approverId: string,
    authorizedActors: string[],
  ): string {
    const tokenConfig = this.config.getTokenConfig();

    const claims: BreakGlassTokenClaims = {
      bg: true,
      jti: randomUUID(), // Unique token ID for replay detection
      grantId: grant.grantId,
      targetTenantId: grant.targetTenantId,
      scopes: grant.grantedScopes,
      renewalsLeft: grant.maxRenewals - grant.renewalCount,
      authorizedActors,
      requesterId,
      approverId,
      requestId: grant.requestId,
      iss: tokenConfig.issuer as 'break-glass-authority',
      aud: tokenConfig.audience as 'internal-ops',
      sub: approverId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(new Date(grant.expiresAt).getTime() / 1000),
    };

    return jwt.sign(claims, tokenConfig.secret);
  }
}

/**
 * Grant not found exception
 */
export class GrantNotFoundException extends Error {
  constructor(grantId: string) {
    super(`Grant not found: ${grantId}`);
    this.name = 'GrantNotFoundException';
  }
}

/**
 * Grant not active exception
 */
export class GrantNotActiveException extends Error {
  constructor(grantId: string) {
    super(`Grant is not active: ${grantId}`);
    this.name = 'GrantNotActiveException';
  }
}

/**
 * Renewal cap exceeded exception
 */
export class RenewalCapExceededException extends Error {
  constructor(grantId: string, maxRenewals: number) {
    super(`Grant ${grantId} has exceeded maximum renewals (${maxRenewals})`);
    this.name = 'RenewalCapExceededException';
  }
}
