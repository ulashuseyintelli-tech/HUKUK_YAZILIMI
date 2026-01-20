/**
 * Redis Incident Store
 * 
 * Production Alerting System - Sprint 1
 * 
 * Redis implementation with Lua script for atomic createOrGetActive.
 * 
 * Key design:
 * - inc:{incidentId} → JSON (Incident)
 * - active:{alertKey} → incidentId (string)
 * - corr:{correlationId} → SET of incidentIds
 * - global:active → SET of incidentIds (global outages)
 * 
 * @see .kiro/specs/production-alerting-system/design.md
 */

import { IncidentStatus } from '../types/alerting.types';
import { makeIncidentId } from '../core/keys';
import { StoreNotFoundError, StoreConnectionError, StoreOperationError } from '../errors/alerting.errors';
import {
  IIncidentStore,
  Incident,
  CreateOrGetActiveInput,
  CreateOrGetActiveResult,
  ResolveInput,
  AppendAlertInput,
} from './incident-store.interface';

/**
 * Redis client interface (minimal subset needed)
 * Compatible with ioredis
 */
export interface IRedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<'OK'>;
  del(...keys: string[]): Promise<number>;
  sadd(key: string, ...members: string[]): Promise<number>;
  srem(key: string, ...members: string[]): Promise<number>;
  smembers(key: string): Promise<string[]>;
  mget(...keys: string[]): Promise<(string | null)[]>;
  eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown>;
}

/**
 * Lua script for atomic createOrGetActive
 * 
 * KEYS[1] = active:{alertKey}
 * KEYS[2] = inc:{newIncidentId}
 * KEYS[3] = corr:{correlationId}
 * KEYS[4] = global:active (optional, only if global outage)
 * 
 * ARGV[1] = newIncidentId
 * ARGV[2] = incidentJson
 * ARGV[3] = isGlobalOutage (0 or 1)
 * 
 * Returns: [created (0 or 1), incidentJson]
 */
const CREATE_OR_GET_ACTIVE_LUA = `
local activeKey = KEYS[1]
local incKey = KEYS[2]
local corrKey = KEYS[3]
local globalKey = KEYS[4]

local newIncidentId = ARGV[1]
local incidentJson = ARGV[2]
local isGlobalOutage = tonumber(ARGV[3])

-- Check if active incident exists
local existingId = redis.call('GET', activeKey)
if existingId then
  -- Get existing incident
  local existingJson = redis.call('GET', 'inc:' .. existingId)
  if existingJson then
    return {0, existingJson}
  end
end

-- No active incident, create new one
-- SET NX for active key (atomic check-and-set)
local setResult = redis.call('SET', activeKey, newIncidentId, 'NX')
if not setResult then
  -- Race condition: another process created it
  local winnerId = redis.call('GET', activeKey)
  local winnerJson = redis.call('GET', 'inc:' .. winnerId)
  return {0, winnerJson}
end

-- We won the race, create the incident
redis.call('SET', incKey, incidentJson)
redis.call('SADD', corrKey, newIncidentId)

-- Add to global outage index if applicable
if isGlobalOutage == 1 and globalKey then
  redis.call('SADD', globalKey, newIncidentId)
end

return {1, incidentJson}
`;

/**
 * Redis key prefixes
 */
const KEYS = {
  incident: (id: string) => `inc:${id}`,
  active: (alertKey: string) => `active:${alertKey}`,
  correlation: (corrId: string) => `corr:${corrId}`,
  globalActive: 'global:active',
} as const;

/**
 * Redis Incident Store
 */
export class RedisIncidentStore implements IIncidentStore {
  constructor(private readonly redis: IRedisClient) {}

  async createOrGetActive(input: CreateOrGetActiveInput): Promise<CreateOrGetActiveResult> {
    const { alertKey, correlationId, nowMs, initial } = input;
    
    // Generate new incident ID
    const newIncidentId = makeIncidentId({ alertKey, timestampMs: nowMs });
    const nowIso = new Date(nowMs).toISOString();
    
    // Build incident object
    const incident: Incident = {
      incidentId: newIncidentId,
      alertKey,
      correlationId,
      alertType: initial.alertType,
      category: initial.category,
      severity: initial.severity,
      tenantScope: initial.tenantScope,
      tenantId: initial.tenantId,
      status: IncidentStatus.Open,
      createdAt: nowIso,
      updatedAt: nowIso,
      alertCount: 1,
      lastAlertAt: nowIso,
      component: initial.component,
      kind: initial.kind ?? 'INCIDENT',
    };

    const incidentJson = JSON.stringify(incident);
    const isGlobalOutage = incident.kind === 'GLOBAL_OUTAGE' ? 1 : 0;

    try {
      // Execute Lua script for atomic operation
      const result = await this.redis.eval(
        CREATE_OR_GET_ACTIVE_LUA,
        4, // number of keys
        KEYS.active(alertKey),
        KEYS.incident(newIncidentId),
        KEYS.correlation(correlationId),
        KEYS.globalActive,
        newIncidentId,
        incidentJson,
        isGlobalOutage,
      ) as [number, string];

      const [created, resultJson] = result;
      const resultIncident = JSON.parse(resultJson) as Incident;

      return {
        incident: resultIncident,
        created: created === 1,
      };
    } catch (error) {
      throw new StoreOperationError(
        'RedisIncidentStore',
        'createOrGetActive',
        error instanceof Error ? error.message : String(error),
        { alertKey, correlationId },
      );
    }
  }

  async get(incidentId: string): Promise<Incident | null> {
    try {
      const json = await this.redis.get(KEYS.incident(incidentId));
      if (!json) return null;
      return JSON.parse(json) as Incident;
    } catch (error) {
      throw new StoreOperationError(
        'RedisIncidentStore',
        'get',
        error instanceof Error ? error.message : String(error),
        { incidentId },
      );
    }
  }

  async findActiveByAlertKey(alertKey: string): Promise<Incident | null> {
    try {
      const incidentId = await this.redis.get(KEYS.active(alertKey));
      if (!incidentId) return null;
      
      const json = await this.redis.get(KEYS.incident(incidentId));
      if (!json) return null;
      
      const incident = JSON.parse(json) as Incident;
      if (incident.status !== IncidentStatus.Open) {
        return null;
      }
      
      return incident;
    } catch (error) {
      throw new StoreOperationError(
        'RedisIncidentStore',
        'findActiveByAlertKey',
        error instanceof Error ? error.message : String(error),
        { alertKey },
      );
    }
  }

  async findByCorrelationId(correlationId: string): Promise<Incident[]> {
    try {
      const incidentIds = await this.redis.smembers(KEYS.correlation(correlationId));
      if (incidentIds.length === 0) return [];

      const keys = incidentIds.map(id => KEYS.incident(id));
      const jsons = await this.redis.mget(...keys);

      const incidents: Incident[] = [];
      for (const json of jsons) {
        if (json) {
          incidents.push(JSON.parse(json) as Incident);
        }
      }

      return incidents;
    } catch (error) {
      throw new StoreOperationError(
        'RedisIncidentStore',
        'findByCorrelationId',
        error instanceof Error ? error.message : String(error),
        { correlationId },
      );
    }
  }

  async resolve(incidentId: string, input: ResolveInput): Promise<Incident> {
    try {
      // Get current incident
      const json = await this.redis.get(KEYS.incident(incidentId));
      if (!json) {
        throw new StoreNotFoundError('RedisIncidentStore', incidentId);
      }

      const incident = JSON.parse(json) as Incident;
      const { nowMs, reason, resolvedBy, rootCauseHint } = input;
      const nowIso = new Date(nowMs).toISOString();
      const createdAtMs = new Date(incident.createdAt).getTime();
      const durationMs = nowMs - createdAtMs;

      // Update incident
      incident.status = IncidentStatus.Resolved;
      incident.resolvedAt = nowIso;
      incident.updatedAt = nowIso;
      incident.resolution = {
        reason,
        resolvedBy,
        rootCauseHint,
        durationMs,
      };

      // Save updated incident
      await this.redis.set(KEYS.incident(incidentId), JSON.stringify(incident));

      // CRITICAL: Remove from active index
      await this.redis.del(KEYS.active(incident.alertKey));

      // Remove from global outage index if applicable
      if (incident.kind === 'GLOBAL_OUTAGE') {
        await this.redis.srem(KEYS.globalActive, incidentId);
      }

      return incident;
    } catch (error) {
      if (error instanceof StoreNotFoundError) throw error;
      throw new StoreOperationError(
        'RedisIncidentStore',
        'resolve',
        error instanceof Error ? error.message : String(error),
        { incidentId },
      );
    }
  }

  async appendAlert(incidentId: string, input: AppendAlertInput): Promise<Incident> {
    try {
      // Get current incident
      const json = await this.redis.get(KEYS.incident(incidentId));
      if (!json) {
        throw new StoreNotFoundError('RedisIncidentStore', incidentId);
      }

      const incident = JSON.parse(json) as Incident;
      const { nowMs } = input;
      const nowIso = new Date(nowMs).toISOString();

      // Update incident
      incident.alertCount += 1;
      incident.lastAlertAt = nowIso;
      incident.updatedAt = nowIso;

      // Save updated incident
      await this.redis.set(KEYS.incident(incidentId), JSON.stringify(incident));

      return incident;
    } catch (error) {
      if (error instanceof StoreNotFoundError) throw error;
      throw new StoreOperationError(
        'RedisIncidentStore',
        'appendAlert',
        error instanceof Error ? error.message : String(error),
        { incidentId },
      );
    }
  }

  async listActiveGlobalOutages(): Promise<Incident[]> {
    try {
      const incidentIds = await this.redis.smembers(KEYS.globalActive);
      if (incidentIds.length === 0) return [];

      const keys = incidentIds.map(id => KEYS.incident(id));
      const jsons = await this.redis.mget(...keys);

      const incidents: Incident[] = [];
      for (const json of jsons) {
        if (json) {
          const incident = JSON.parse(json) as Incident;
          // Double-check status (defensive)
          if (incident.status === IncidentStatus.Open) {
            incidents.push(incident);
          }
        }
      }

      return incidents;
    } catch (error) {
      throw new StoreOperationError(
        'RedisIncidentStore',
        'listActiveGlobalOutages',
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}

/**
 * Create a mock Redis client for testing
 * Wraps InMemoryIncidentStore behavior in Redis-like interface
 */
export function createMockRedisClient(): IRedisClient {
  const data = new Map<string, string>();
  const sets = new Map<string, Set<string>>();

  return {
    async get(key: string) {
      return data.get(key) ?? null;
    },
    async set(key: string, value: string) {
      data.set(key, value);
      return 'OK' as const;
    },
    async del(...keys: string[]) {
      let count = 0;
      for (const key of keys) {
        if (data.delete(key)) count++;
        if (sets.delete(key)) count++;
      }
      return count;
    },
    async sadd(key: string, ...members: string[]) {
      let set = sets.get(key);
      if (!set) {
        set = new Set();
        sets.set(key, set);
      }
      let added = 0;
      for (const member of members) {
        if (!set.has(member)) {
          set.add(member);
          added++;
        }
      }
      return added;
    },
    async srem(key: string, ...members: string[]) {
      const set = sets.get(key);
      if (!set) return 0;
      let removed = 0;
      for (const member of members) {
        if (set.delete(member)) removed++;
      }
      return removed;
    },
    async smembers(key: string) {
      const set = sets.get(key);
      return set ? Array.from(set) : [];
    },
    async mget(...keys: string[]) {
      return keys.map(key => data.get(key) ?? null);
    },
    async eval(script: string, numKeys: number, ...args: (string | number)[]) {
      // Simplified Lua script emulation for createOrGetActive
      const keys = args.slice(0, numKeys) as string[];
      const argv = args.slice(numKeys) as string[];
      
      const activeKey = keys[0];
      const incKey = keys[1];
      const corrKey = keys[2];
      const globalKey = keys[3];
      
      const newIncidentId = argv[0];
      const incidentJson = argv[1];
      const isGlobalOutage = parseInt(argv[2], 10);

      // Check existing
      const existingId = data.get(activeKey);
      if (existingId) {
        const existingJson = data.get(`inc:${existingId}`);
        if (existingJson) {
          return [0, existingJson];
        }
      }

      // Try to set (simulate SET NX)
      if (!data.has(activeKey)) {
        data.set(activeKey, newIncidentId);
        data.set(incKey, incidentJson);
        
        // Add to correlation set
        let corrSet = sets.get(corrKey);
        if (!corrSet) {
          corrSet = new Set();
          sets.set(corrKey, corrSet);
        }
        corrSet.add(newIncidentId);

        // Add to global outage set if applicable
        if (isGlobalOutage === 1 && globalKey) {
          let globalSet = sets.get(globalKey);
          if (!globalSet) {
            globalSet = new Set();
            sets.set(globalKey, globalSet);
          }
          globalSet.add(newIncidentId);
        }

        return [1, incidentJson];
      }

      // Race lost
      const winnerId = data.get(activeKey)!;
      const winnerJson = data.get(`inc:${winnerId}`)!;
      return [0, winnerJson];
    },
  };
}
