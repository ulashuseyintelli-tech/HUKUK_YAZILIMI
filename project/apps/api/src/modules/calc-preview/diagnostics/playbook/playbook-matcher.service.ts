/**
 * Playbook Matcher Service
 * 
 * Phase 7B - Sprint 1 - Task 1.5
 * 
 * Incident'ı uygun playbook'a eşleştiren bileşen.
 * 
 * Priority: tenant-specific > global
 * 
 * @see .kiro/specs/ops-playbook/design.md
 */

import { Injectable, Logger } from '@nestjs/common';
import { PlaybookRegistry } from './playbook-registry.service';
import {
  Playbook,
  PlaybookMatch,
  WhenClause,
} from './playbook.types';
import { DiagnosticsIncident } from '../diagnostics.types';

// ============================================================================
// MATCHER SERVICE
// ============================================================================

@Injectable()
export class PlaybookMatcher {
  private readonly logger = new Logger(PlaybookMatcher.name);

  constructor(
    private readonly registry: PlaybookRegistry,
  ) {}

  /**
   * Find matching playbook for incident
   * 
   * Returns the highest priority matching playbook.
   * Priority: tenant-specific > global (same priority → higher priority value wins)
   */
  findMatch(incident: DiagnosticsIncident): PlaybookMatch | null {
    const playbooks = this.registry.getAllPlaybooks();
    
    if (playbooks.length === 0) {
      this.logger.debug('[PlaybookMatcher] No playbooks registered');
      return null;
    }

    const matches: PlaybookMatch[] = [];

    for (const playbook of playbooks) {
      const match = this.evaluateMatch(playbook, incident);
      if (match) {
        matches.push(match);
      }
    }

    if (matches.length === 0) {
      this.logger.debug('[PlaybookMatcher] No matching playbook found', {
        incidentType: incident.type,
        severity: incident.severity,
        tenantId: incident.tenantId,
      });
      return null;
    }

    // Sort by match score (higher is better)
    // Tenant-specific gets +100 bonus
    matches.sort((a, b) => b.matchScore - a.matchScore);

    const bestMatch = matches[0];
    
    this.logger.debug('[PlaybookMatcher] Found match', {
      playbookId: bestMatch.playbook.id,
      matchScore: bestMatch.matchScore,
      incidentType: incident.type,
      totalCandidates: matches.length,
    });

    return bestMatch;
  }

  /**
   * Find all matching playbooks (for debugging)
   */
  findAllMatches(incident: DiagnosticsIncident): PlaybookMatch[] {
    const playbooks = this.registry.getAllPlaybooks();
    const matches: PlaybookMatch[] = [];

    for (const playbook of playbooks) {
      const match = this.evaluateMatch(playbook, incident);
      if (match) {
        matches.push(match);
      }
    }

    return matches.sort((a, b) => b.matchScore - a.matchScore);
  }

  /**
   * Check if playbook matches incident
   */
  matches(playbook: Playbook, incident: DiagnosticsIncident): boolean {
    return this.evaluateMatch(playbook, incident) !== null;
  }

  /**
   * Evaluate match and calculate score
   */
  private evaluateMatch(playbook: Playbook, incident: DiagnosticsIncident): PlaybookMatch | null {
    const matchedCriteria = {
      incidentType: false,
      severity: false,
      tenantScope: false,
      whenClauses: true, // Default true if no when clauses
    };

    // 1. Incident type must match exactly
    if (playbook.match.incidentType !== incident.type) {
      return null;
    }
    matchedCriteria.incidentType = true;

    // 2. Severity must be in the list
    if (!playbook.match.severity.includes(incident.severity)) {
      return null;
    }
    matchedCriteria.severity = true;

    // 3. Tenant scope check
    const tenantMatches = this.checkTenantScope(playbook.match.tenantScope, incident.tenantId);
    if (!tenantMatches) {
      return null;
    }
    matchedCriteria.tenantScope = true;

    // 4. When clauses (all must pass)
    if (playbook.when && playbook.when.length > 0) {
      const whenPassed = playbook.when.every(clause => 
        this.evaluateWhenClause(clause, incident)
      );
      if (!whenPassed) {
        return null;
      }
      matchedCriteria.whenClauses = true;
    }

    // Calculate match score
    let matchScore = playbook.priority;

    // Tenant-specific playbook gets +100 bonus
    if (this.isTenantSpecific(playbook.match.tenantScope, incident.tenantId)) {
      matchScore += 100;
    }

    // When clauses add +10 per clause (more specific = higher score)
    if (playbook.when) {
      matchScore += playbook.when.length * 10;
    }

    return {
      playbook,
      matchScore,
      matchedCriteria,
    };
  }


  /**
   * Check tenant scope
   */
  private checkTenantScope(scope: string | string[], tenantId: string): boolean {
    // "*" matches all tenants
    if (scope === '*') {
      return true;
    }

    // Array of tenant IDs
    if (Array.isArray(scope)) {
      return scope.includes(tenantId) || scope.includes('*');
    }

    // Single tenant ID
    return scope === tenantId;
  }

  /**
   * Check if playbook is tenant-specific (not global)
   */
  private isTenantSpecific(scope: string | string[], tenantId: string): boolean {
    if (scope === '*') {
      return false;
    }

    if (Array.isArray(scope)) {
      // If array contains "*", it's global
      if (scope.includes('*')) {
        return false;
      }
      // If array contains specific tenant, it's tenant-specific
      return scope.includes(tenantId);
    }

    // Single tenant ID = tenant-specific
    return scope === tenantId;
  }

  /**
   * Evaluate when clause (whitelist DSL only)
   */
  evaluateWhenClause(clause: WhenClause, incident: DiagnosticsIncident): boolean {
    const fieldValue = this.getFieldValue(clause.field, incident);

    switch (clause.operator) {
      case 'eq':
        return fieldValue === clause.value;

      case 'ne':
        return fieldValue !== clause.value;

      case 'in':
        return clause.values?.includes(fieldValue as string | number) ?? false;

      case 'not_in':
        if (!clause.values) return true;
        return !clause.values.includes(fieldValue as string | number);

      case 'gt':
        return typeof fieldValue === 'number' && 
               typeof clause.value === 'number' && 
               fieldValue > clause.value;

      case 'lt':
        return typeof fieldValue === 'number' && 
               typeof clause.value === 'number' && 
               fieldValue < clause.value;

      case 'gte':
        return typeof fieldValue === 'number' && 
               typeof clause.value === 'number' && 
               fieldValue >= clause.value;

      case 'lte':
        return typeof fieldValue === 'number' && 
               typeof clause.value === 'number' && 
               fieldValue <= clause.value;

      default:
        this.logger.warn(`[PlaybookMatcher] Unknown operator: ${clause.operator}`);
        return false;
    }
  }

  /**
   * Get field value from incident using dot notation
   */
  private getFieldValue(field: string, incident: DiagnosticsIncident): unknown {
    const parts = field.split('.');
    let value: unknown = incident;

    for (const part of parts) {
      if (value === null || value === undefined) {
        return undefined;
      }
      value = (value as Record<string, unknown>)[part];
    }

    return value;
  }

  /**
   * Get matching statistics (for diagnostics)
   */
  getMatchingStats(): {
    totalPlaybooks: number;
    byIncidentType: Record<string, number>;
    bySeverity: Record<string, number>;
    globalPlaybooks: number;
    tenantSpecificPlaybooks: number;
  } {
    const playbooks = this.registry.getAllPlaybooks();
    
    const byIncidentType: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    let globalPlaybooks = 0;
    let tenantSpecificPlaybooks = 0;

    for (const playbook of playbooks) {
      // By incident type
      const type = playbook.match.incidentType;
      byIncidentType[type] = (byIncidentType[type] || 0) + 1;

      // By severity
      for (const severity of playbook.match.severity) {
        bySeverity[severity] = (bySeverity[severity] || 0) + 1;
      }

      // Global vs tenant-specific
      if (playbook.match.tenantScope === '*') {
        globalPlaybooks++;
      } else {
        tenantSpecificPlaybooks++;
      }
    }

    return {
      totalPlaybooks: playbooks.length,
      byIncidentType,
      bySeverity,
      globalPlaybooks,
      tenantSpecificPlaybooks,
    };
  }
}
