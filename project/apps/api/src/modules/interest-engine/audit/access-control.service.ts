/**
 * Task 11.7 - RBAC Access Control Service
 * 
 * AccessLevel enum, rol-erişim matrisi
 * KVKK m.12 uyumlu
 */

import { Injectable } from '@nestjs/common';

// ═══════════════════════════════════════════════════════════════════════════
// ACCESS LEVELS
// ═══════════════════════════════════════════════════════════════════════════

export enum AccessLevel {
  NONE = 0,
  READ_MASKED = 1,      // Can read with PII masked
  READ_FULL = 2,        // Can read full data
  WRITE = 3,            // Can create/update
  DELETE = 4,           // Can delete
  ADMIN = 5,            // Full access including audit logs
}

// ═══════════════════════════════════════════════════════════════════════════
// ROLES
// ═══════════════════════════════════════════════════════════════════════════

export enum Role {
  GUEST = 'GUEST',
  INTERN = 'INTERN',
  PARALEGAL = 'PARALEGAL',
  LAWYER = 'LAWYER',
  SENIOR_LAWYER = 'SENIOR_LAWYER',
  PARTNER = 'PARTNER',
  ADMIN = 'ADMIN',
  SYSTEM = 'SYSTEM',
}

// ═══════════════════════════════════════════════════════════════════════════
// RESOURCE TYPES
// ═══════════════════════════════════════════════════════════════════════════

export enum ResourceType {
  CALCULATION_RECORD = 'CALCULATION_RECORD',
  CALCULATION_TRACE = 'CALCULATION_TRACE',
  PREVIEW_RECORD = 'PREVIEW_RECORD',
  ACCESS_LOG = 'ACCESS_LOG',
  RATE_TABLE = 'RATE_TABLE',
  LEGAL_REPORT = 'LEGAL_REPORT',
}

// ═══════════════════════════════════════════════════════════════════════════
// ACCESS MATRIX
// ═══════════════════════════════════════════════════════════════════════════

type AccessMatrix = Record<Role, Record<ResourceType, AccessLevel>>;

const ACCESS_MATRIX: AccessMatrix = {
  [Role.GUEST]: {
    [ResourceType.CALCULATION_RECORD]: AccessLevel.NONE,
    [ResourceType.CALCULATION_TRACE]: AccessLevel.NONE,
    [ResourceType.PREVIEW_RECORD]: AccessLevel.NONE,
    [ResourceType.ACCESS_LOG]: AccessLevel.NONE,
    [ResourceType.RATE_TABLE]: AccessLevel.READ_MASKED,
    [ResourceType.LEGAL_REPORT]: AccessLevel.NONE,
  },
  [Role.INTERN]: {
    [ResourceType.CALCULATION_RECORD]: AccessLevel.READ_MASKED,
    [ResourceType.CALCULATION_TRACE]: AccessLevel.NONE,
    [ResourceType.PREVIEW_RECORD]: AccessLevel.READ_MASKED,
    [ResourceType.ACCESS_LOG]: AccessLevel.NONE,
    [ResourceType.RATE_TABLE]: AccessLevel.READ_FULL,
    [ResourceType.LEGAL_REPORT]: AccessLevel.READ_MASKED,
  },
  [Role.PARALEGAL]: {
    [ResourceType.CALCULATION_RECORD]: AccessLevel.READ_FULL,
    [ResourceType.CALCULATION_TRACE]: AccessLevel.READ_MASKED,
    [ResourceType.PREVIEW_RECORD]: AccessLevel.WRITE,
    [ResourceType.ACCESS_LOG]: AccessLevel.NONE,
    [ResourceType.RATE_TABLE]: AccessLevel.READ_FULL,
    [ResourceType.LEGAL_REPORT]: AccessLevel.READ_FULL,
  },
  [Role.LAWYER]: {
    [ResourceType.CALCULATION_RECORD]: AccessLevel.WRITE,
    [ResourceType.CALCULATION_TRACE]: AccessLevel.READ_FULL,
    [ResourceType.PREVIEW_RECORD]: AccessLevel.WRITE,
    [ResourceType.ACCESS_LOG]: AccessLevel.NONE,
    [ResourceType.RATE_TABLE]: AccessLevel.READ_FULL,
    [ResourceType.LEGAL_REPORT]: AccessLevel.WRITE,
  },
  [Role.SENIOR_LAWYER]: {
    [ResourceType.CALCULATION_RECORD]: AccessLevel.WRITE,
    [ResourceType.CALCULATION_TRACE]: AccessLevel.READ_FULL,
    [ResourceType.PREVIEW_RECORD]: AccessLevel.DELETE,
    [ResourceType.ACCESS_LOG]: AccessLevel.READ_MASKED,
    [ResourceType.RATE_TABLE]: AccessLevel.WRITE,
    [ResourceType.LEGAL_REPORT]: AccessLevel.WRITE,
  },
  [Role.PARTNER]: {
    [ResourceType.CALCULATION_RECORD]: AccessLevel.DELETE,
    [ResourceType.CALCULATION_TRACE]: AccessLevel.READ_FULL,
    [ResourceType.PREVIEW_RECORD]: AccessLevel.DELETE,
    [ResourceType.ACCESS_LOG]: AccessLevel.READ_FULL,
    [ResourceType.RATE_TABLE]: AccessLevel.WRITE,
    [ResourceType.LEGAL_REPORT]: AccessLevel.DELETE,
  },
  [Role.ADMIN]: {
    [ResourceType.CALCULATION_RECORD]: AccessLevel.ADMIN,
    [ResourceType.CALCULATION_TRACE]: AccessLevel.ADMIN,
    [ResourceType.PREVIEW_RECORD]: AccessLevel.ADMIN,
    [ResourceType.ACCESS_LOG]: AccessLevel.ADMIN,
    [ResourceType.RATE_TABLE]: AccessLevel.ADMIN,
    [ResourceType.LEGAL_REPORT]: AccessLevel.ADMIN,
  },
  [Role.SYSTEM]: {
    [ResourceType.CALCULATION_RECORD]: AccessLevel.ADMIN,
    [ResourceType.CALCULATION_TRACE]: AccessLevel.ADMIN,
    [ResourceType.PREVIEW_RECORD]: AccessLevel.ADMIN,
    [ResourceType.ACCESS_LOG]: AccessLevel.ADMIN,
    [ResourceType.RATE_TABLE]: AccessLevel.ADMIN,
    [ResourceType.LEGAL_REPORT]: AccessLevel.ADMIN,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// ACCESS CHECK RESULT
// ═══════════════════════════════════════════════════════════════════════════

export interface AccessCheckResult {
  allowed: boolean;
  level: AccessLevel;
  reason?: string;
  requiresMasking: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// ACCESS CONTROL SERVICE
// ═══════════════════════════════════════════════════════════════════════════

@Injectable()
export class AccessControlService {
  /**
   * Check if user has required access level
   */
  checkAccess(
    role: Role,
    resource: ResourceType,
    requiredLevel: AccessLevel,
  ): AccessCheckResult {
    const userLevel = ACCESS_MATRIX[role][resource];
    const allowed = userLevel >= requiredLevel;

    return {
      allowed,
      level: userLevel,
      reason: allowed ? undefined : `${role} rolü ${resource} için ${AccessLevel[requiredLevel]} erişimine sahip değil`,
      requiresMasking: userLevel === AccessLevel.READ_MASKED,
    };
  }

  /**
   * Check if user can read resource
   */
  canRead(role: Role, resource: ResourceType): AccessCheckResult {
    return this.checkAccess(role, resource, AccessLevel.READ_MASKED);
  }

  /**
   * Check if user can read full (unmasked) data
   */
  canReadFull(role: Role, resource: ResourceType): AccessCheckResult {
    return this.checkAccess(role, resource, AccessLevel.READ_FULL);
  }

  /**
   * Check if user can write
   */
  canWrite(role: Role, resource: ResourceType): AccessCheckResult {
    return this.checkAccess(role, resource, AccessLevel.WRITE);
  }

  /**
   * Check if user can delete
   */
  canDelete(role: Role, resource: ResourceType): AccessCheckResult {
    return this.checkAccess(role, resource, AccessLevel.DELETE);
  }

  /**
   * Get access level for role and resource
   */
  getAccessLevel(role: Role, resource: ResourceType): AccessLevel {
    return ACCESS_MATRIX[role][resource];
  }

  /**
   * Get all accessible resources for a role
   */
  getAccessibleResources(role: Role, minLevel: AccessLevel = AccessLevel.READ_MASKED): ResourceType[] {
    return Object.entries(ACCESS_MATRIX[role])
      .filter(([_, level]) => level >= minLevel)
      .map(([resource]) => resource as ResourceType);
  }

  /**
   * Get roles that can access a resource at given level
   */
  getRolesWithAccess(resource: ResourceType, minLevel: AccessLevel): Role[] {
    return Object.entries(ACCESS_MATRIX)
      .filter(([_, resources]) => resources[resource] >= minLevel)
      .map(([role]) => role as Role);
  }
}
