/**
 * Playbook Matcher Tests
 * 
 * Phase 7B - Sprint 1
 * 
 * Tests for incident → playbook matching.
 */

import { PlaybookMatcher } from '../playbook-matcher.service';
import { PlaybookRegistry } from '../playbook-registry.service';
import { PlaybookYAMLValidator } from '../playbook-yaml-validator.service';
import { Playbook } from '../playbook.types';
import { DiagnosticsIncident } from '../../diagnostics.types';

describe('PlaybookMatcher', () => {
  let matcher: PlaybookMatcher;
  let registry: PlaybookRegistry;
  let validator: PlaybookYAMLValidator;

  const createIncident = (overrides: Partial<DiagnosticsIncident> = {}): DiagnosticsIncident => ({
    id: 'incident-1',
    type: 'CIRCUIT_BREAKER_OPEN',
    severity: 'WARNING',
    status: 'ONGOING',
    title: 'Test Incident',
    description: 'Test description',
    recommendation: 'Test recommendation',
    startedAt: new Date().toISOString(),
    evidence: {
      source: 'circuit_breaker',
      breakerName: 'rate_provider',
      value: 'OPEN',
      threshold: 'CLOSED',
      timestamp: new Date().toISOString(),
    },
    tenantId: 'tenant-1',
    ...overrides,
  });

  const createPlaybook = (overrides: Partial<Playbook> = {}): Playbook => ({
    id: 'test-playbook',
    version: '1.0.0',
    name: 'Test Playbook',
    description: 'Test',
    match: {
      incidentType: 'CIRCUIT_BREAKER_OPEN',
      severity: ['WARNING', 'CRITICAL'],
      tenantScope: '*',
    },
    priority: 100,
    dryRun: true,
    actions: [
      { id: 'notify', type: 'notification', channel: 'console', template: 'test' },
    ],
    ...overrides,
  });

  beforeEach(() => {
    validator = new PlaybookYAMLValidator();
    registry = new PlaybookRegistry(validator);
    matcher = new PlaybookMatcher(registry);
  });

  describe('Basic Matching', () => {
    it('should match incident to playbook by type', () => {
      const playbook = createPlaybook();
      registry.registerPlaybook(playbook);

      const incident = createIncident();
      const match = matcher.findMatch(incident);

      expect(match).not.toBeNull();
      expect(match!.playbook.id).toBe('test-playbook');
    });

    it('should not match when incident type differs', () => {
      const playbook = createPlaybook({
        match: {
          incidentType: 'HIGH_ERROR_RATE',
          severity: ['WARNING'],
          tenantScope: '*',
        },
      });
      registry.registerPlaybook(playbook);

      const incident = createIncident({ type: 'CIRCUIT_BREAKER_OPEN' });
      const match = matcher.findMatch(incident);

      expect(match).toBeNull();
    });

    it('should not match when severity not in list', () => {
      const playbook = createPlaybook({
        match: {
          incidentType: 'CIRCUIT_BREAKER_OPEN',
          severity: ['CRITICAL'], // Only CRITICAL
          tenantScope: '*',
        },
      });
      registry.registerPlaybook(playbook);

      const incident = createIncident({ severity: 'WARNING' });
      const match = matcher.findMatch(incident);

      expect(match).toBeNull();
    });

    it('should return null when no playbooks registered', () => {
      const incident = createIncident();
      const match = matcher.findMatch(incident);

      expect(match).toBeNull();
    });
  });

  describe('Tenant Scope Matching', () => {
    it('should match global playbook (*) for any tenant', () => {
      const playbook = createPlaybook({
        match: {
          incidentType: 'CIRCUIT_BREAKER_OPEN',
          severity: ['WARNING'],
          tenantScope: '*',
        },
      });
      registry.registerPlaybook(playbook);

      const incident = createIncident({ tenantId: 'any-tenant' });
      const match = matcher.findMatch(incident);

      expect(match).not.toBeNull();
    });

    it('should match tenant-specific playbook', () => {
      const playbook = createPlaybook({
        id: 'tenant-specific',
        match: {
          incidentType: 'CIRCUIT_BREAKER_OPEN',
          severity: ['WARNING'],
          tenantScope: 'tenant-1',
        },
      });
      registry.registerPlaybook(playbook);

      const incident = createIncident({ tenantId: 'tenant-1' });
      const match = matcher.findMatch(incident);

      expect(match).not.toBeNull();
      expect(match!.playbook.id).toBe('tenant-specific');
    });

    it('should not match tenant-specific playbook for different tenant', () => {
      const playbook = createPlaybook({
        match: {
          incidentType: 'CIRCUIT_BREAKER_OPEN',
          severity: ['WARNING'],
          tenantScope: 'tenant-1',
        },
      });
      registry.registerPlaybook(playbook);

      const incident = createIncident({ tenantId: 'tenant-2' });
      const match = matcher.findMatch(incident);

      expect(match).toBeNull();
    });

    it('should match playbook with tenant array', () => {
      const playbook = createPlaybook({
        match: {
          incidentType: 'CIRCUIT_BREAKER_OPEN',
          severity: ['WARNING'],
          tenantScope: ['tenant-1', 'tenant-2'],
        },
      });
      registry.registerPlaybook(playbook);

      const incident1 = createIncident({ tenantId: 'tenant-1' });
      const incident2 = createIncident({ tenantId: 'tenant-2' });
      const incident3 = createIncident({ tenantId: 'tenant-3' });

      expect(matcher.findMatch(incident1)).not.toBeNull();
      expect(matcher.findMatch(incident2)).not.toBeNull();
      expect(matcher.findMatch(incident3)).toBeNull();
    });
  });


  describe('Priority Resolution', () => {
    it('should select higher priority playbook', () => {
      const lowPriority = createPlaybook({
        id: 'low-priority',
        priority: 50,
      });
      const highPriority = createPlaybook({
        id: 'high-priority',
        priority: 100,
      });

      registry.registerPlaybook(lowPriority);
      registry.registerPlaybook(highPriority);

      const incident = createIncident();
      const match = matcher.findMatch(incident);

      expect(match!.playbook.id).toBe('high-priority');
    });

    it('should prefer tenant-specific over global (same priority)', () => {
      const global = createPlaybook({
        id: 'global',
        priority: 100,
        match: {
          incidentType: 'CIRCUIT_BREAKER_OPEN',
          severity: ['WARNING'],
          tenantScope: '*',
        },
      });
      const tenantSpecific = createPlaybook({
        id: 'tenant-specific',
        priority: 100, // Same priority
        match: {
          incidentType: 'CIRCUIT_BREAKER_OPEN',
          severity: ['WARNING'],
          tenantScope: 'tenant-1',
        },
      });

      registry.registerPlaybook(global);
      registry.registerPlaybook(tenantSpecific);

      const incident = createIncident({ tenantId: 'tenant-1' });
      const match = matcher.findMatch(incident);

      // Tenant-specific gets +100 bonus
      expect(match!.playbook.id).toBe('tenant-specific');
    });
  });

  describe('When Clause Evaluation', () => {
    it('should match when all when clauses pass', () => {
      const playbook = createPlaybook({
        when: [
          { field: 'severity', operator: 'eq', value: 'WARNING' },
          { field: 'evidence.breakerName', operator: 'eq', value: 'rate_provider' },
        ],
      });
      registry.registerPlaybook(playbook);

      const incident = createIncident({
        severity: 'WARNING',
        evidence: {
          source: 'circuit_breaker',
          breakerName: 'rate_provider',
          value: 'OPEN',
          threshold: 'CLOSED',
          timestamp: new Date().toISOString(),
        },
      });

      const match = matcher.findMatch(incident);
      expect(match).not.toBeNull();
    });

    it('should not match when any when clause fails', () => {
      const playbook = createPlaybook({
        when: [
          { field: 'severity', operator: 'eq', value: 'CRITICAL' }, // Will fail
        ],
      });
      registry.registerPlaybook(playbook);

      const incident = createIncident({ severity: 'WARNING' });
      const match = matcher.findMatch(incident);

      expect(match).toBeNull();
    });

    it('should evaluate in operator correctly', () => {
      const playbook = createPlaybook({
        when: [
          {
            field: 'evidence.breakerName',
            operator: 'in',
            values: ['rate_provider', 'tariff_provider'],
          },
        ],
      });
      registry.registerPlaybook(playbook);

      const matchingIncident = createIncident({
        evidence: {
          source: 'circuit_breaker',
          breakerName: 'rate_provider',
          value: 'OPEN',
          threshold: 'CLOSED',
          timestamp: new Date().toISOString(),
        },
      });

      const nonMatchingIncident = createIncident({
        evidence: {
          source: 'circuit_breaker',
          breakerName: 'cache',
          value: 'OPEN',
          threshold: 'CLOSED',
          timestamp: new Date().toISOString(),
        },
      });

      expect(matcher.findMatch(matchingIncident)).not.toBeNull();
      expect(matcher.findMatch(nonMatchingIncident)).toBeNull();
    });

    it('should evaluate not_in operator correctly', () => {
      const playbook = createPlaybook({
        when: [
          {
            field: 'evidence.breakerName',
            operator: 'not_in',
            values: ['cache'],
          },
        ],
      });
      registry.registerPlaybook(playbook);

      const matchingIncident = createIncident({
        evidence: {
          source: 'circuit_breaker',
          breakerName: 'rate_provider',
          value: 'OPEN',
          threshold: 'CLOSED',
          timestamp: new Date().toISOString(),
        },
      });

      expect(matcher.findMatch(matchingIncident)).not.toBeNull();
    });

    it('should give higher score to playbooks with more when clauses', () => {
      const simplePlaybook = createPlaybook({
        id: 'simple',
        priority: 100,
        // No when clauses
      });
      const specificPlaybook = createPlaybook({
        id: 'specific',
        priority: 100, // Same priority
        when: [
          { field: 'severity', operator: 'eq', value: 'WARNING' },
          { field: 'evidence.breakerName', operator: 'eq', value: 'rate_provider' },
        ],
      });

      registry.registerPlaybook(simplePlaybook);
      registry.registerPlaybook(specificPlaybook);

      const incident = createIncident({
        severity: 'WARNING',
        evidence: {
          source: 'circuit_breaker',
          breakerName: 'rate_provider',
          value: 'OPEN',
          threshold: 'CLOSED',
          timestamp: new Date().toISOString(),
        },
      });

      const match = matcher.findMatch(incident);
      // More when clauses = +10 per clause
      expect(match!.playbook.id).toBe('specific');
    });
  });

  describe('findAllMatches', () => {
    it('should return all matching playbooks sorted by score', () => {
      const playbook1 = createPlaybook({ id: 'p1', priority: 50 });
      const playbook2 = createPlaybook({ id: 'p2', priority: 100 });
      const playbook3 = createPlaybook({
        id: 'p3',
        priority: 75,
        match: {
          incidentType: 'HIGH_ERROR_RATE', // Different type
          severity: ['WARNING'],
          tenantScope: '*',
        },
      });

      registry.registerPlaybook(playbook1);
      registry.registerPlaybook(playbook2);
      registry.registerPlaybook(playbook3);

      const incident = createIncident();
      const matches = matcher.findAllMatches(incident);

      expect(matches).toHaveLength(2); // p1 and p2 match
      expect(matches[0].playbook.id).toBe('p2'); // Higher priority first
      expect(matches[1].playbook.id).toBe('p1');
    });
  });

  describe('getMatchingStats', () => {
    it('should return correct statistics', () => {
      const playbook1 = createPlaybook({
        id: 'p1',
        match: {
          incidentType: 'CIRCUIT_BREAKER_OPEN',
          severity: ['WARNING', 'CRITICAL'],
          tenantScope: '*',
        },
      });
      const playbook2 = createPlaybook({
        id: 'p2',
        match: {
          incidentType: 'HIGH_ERROR_RATE',
          severity: ['WARNING'],
          tenantScope: 'tenant-1',
        },
      });

      registry.registerPlaybook(playbook1);
      registry.registerPlaybook(playbook2);

      const stats = matcher.getMatchingStats();

      expect(stats.totalPlaybooks).toBe(2);
      expect(stats.byIncidentType['CIRCUIT_BREAKER_OPEN']).toBe(1);
      expect(stats.byIncidentType['HIGH_ERROR_RATE']).toBe(1);
      expect(stats.globalPlaybooks).toBe(1);
      expect(stats.tenantSpecificPlaybooks).toBe(1);
    });
  });
});
