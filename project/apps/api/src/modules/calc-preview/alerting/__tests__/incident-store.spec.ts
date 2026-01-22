/**
 * Incident Store Tests
 * 
 * Production Alerting System - Sprint 1 Gate A
 * 
 * Tests for IIncidentStore implementations:
 * - InMemoryIncidentStore
 * - RedisIncidentStore (with mock client)
 * 
 * Test categories:
 * A) Invariants - same alertKey → same incident, resolve removes active, etc.
 * B) Atomicity - concurrent createOrGetActive must produce single incident
 * C) Global outage listing
 * 
 * @see .kiro/specs/production-alerting-system/design.md
 * @see Requirements 12.2, 13.1, 16.1
 */

import {
  AlertCategory,
  AlertSeverity,
  IncidentStatus,
  ResolutionReason,
  TenantScope,
  AvailabilityAlertTypes,
  SecurityAlertTypes,
} from '../types/alerting.types';
import { StoreNotFoundError } from '../errors/alerting.errors';
import { FakeClock } from '../core/clock';
import {
  IIncidentStore,
  CreateOrGetActiveInput,
  Incident,
} from '../stores/inci