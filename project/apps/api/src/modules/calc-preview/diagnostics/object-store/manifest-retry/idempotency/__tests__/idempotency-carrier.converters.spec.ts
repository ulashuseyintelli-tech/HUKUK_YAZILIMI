/**
 * Idempotency Carrier Converters Tests
 * 
 * Phase 10.4 - PR-10.4.1 (P0)
 * 
 * Tests contextToCarrier() and carrierToContext() converters.
 */

import {
  contextToCarrier,
  carrierToContext,
  captureCarrier,
} from '../idempotency-carrier.converters';
import { IdempotencyContext } from '../idempotency-context';
import { IdempotencyContextCarrier, CARRIER_VERSION } from '../idempotency-carrier.types';

describe('contextToCarrier', () => {
  const sampleContext: IdempotencyContext = {
    requestId: 'req-123',
    actionId: 'act-456',
    actionType: 'ADMIN_RETRY',
    resourceType: 'BUNDLE',
    resourceId: 'bundle-789',
    takeover: false,
    previousActorId: null,
  };

  it('should convert context to carrier with version', () => {
    const carrier = contextToCarrier(sampleContext);
    
    expect(carrier.version).toBe(CARRIER_VERSION);
    expect(carrier.requestId).toBe('req-123');
    expect(carrier.actionId).toBe('act-456');
    expect(carrier.actionType).toBe('ADMIN_RETRY');
    expect(carrier.resourceType).toBe('BUNDLE');
    expect(carrier.resourceId).toBe('bundle-789');
    expect(carrier.takeover).toBe(false);
    expect(carrier.previousActorId).toBeNull();
  });

  it('should preserve null resourceId', () => {
    const ctx: IdempotencyContext = { ...sampleContext, resourceId: null };
    const carrier = contextToCarrier(ctx);
    expect(carrier.resourceId).toBeNull();
  });

  it('should preserve takeover=true', () => {
    const ctx: IdempotencyContext = {
      ...sampleContext,
      takeover: true,
      previousActorId: 'prev-actor',
    };
    const carrier = contextToCarrier(ctx);
    expect(carrier.takeover).toBe(true);
    expect(carrier.previousActorId).toBe('prev-actor');
  });

  it('should always set version to CARRIER_VERSION', () => {
    const carrier = contextToCarrier(sampleContext);
    expect(carrier.version).toBe(1);
  });
});

describe('carrierToContext', () => {
  const sampleCarrier: IdempotencyContextCarrier = {
    version: 1,
    requestId: 'req-123',
    actionId: 'act-456',
    actionType: 'ADMIN_RETRY',
    resourceType: 'BUNDLE',
    resourceId: 'bundle-789',
    takeover: false,
    previousActorId: null,
  };

  it('should convert carrier to context', () => {
    const ctx = carrierToContext(sampleCarrier);
    
    expect(ctx.requestId).toBe('req-123');
    expect(ctx.actionId).toBe('act-456');
    expect(ctx.actionType).toBe('ADMIN_RETRY');
    expect(ctx.resourceType).toBe('BUNDLE');
    expect(ctx.resourceId).toBe('bundle-789');
    expect(ctx.takeover).toBe(false);
    expect(ctx.previousActorId).toBeNull();
  });

  it('should not include version in context', () => {
    const ctx = carrierToContext(sampleCarrier);
    expect((ctx as any).version).toBeUndefined();
  });

  it('should preserve null resourceId', () => {
    const carrier: IdempotencyContextCarrier = { ...sampleCarrier, resourceId: null };
    const ctx = carrierToContext(carrier);
    expect(ctx.resourceId).toBeNull();
  });

  it('should preserve takeover=true', () => {
    const carrier: IdempotencyContextCarrier = {
      ...sampleCarrier,
      takeover: true,
      previousActorId: 'prev-actor',
    };
    const ctx = carrierToContext(carrier);
    expect(ctx.takeover).toBe(true);
    expect(ctx.previousActorId).toBe('prev-actor');
  });
});

describe('Round-trip conversion', () => {
  const testCases: IdempotencyContext[] = [
    {
      requestId: 'req-1',
      actionId: 'act-1',
      actionType: 'ADMIN_RETRY',
      resourceType: 'BUNDLE',
      resourceId: 'bundle-1',
      takeover: false,
      previousActorId: null,
    },
    {
      requestId: 'req-2',
      actionId: 'act-2',
      actionType: 'DLQ_REDRIVE',
      resourceType: 'DLQ_ENTRY',
      resourceId: null,
      takeover: false,
      previousActorId: null,
    },
    {
      requestId: 'req-3',
      actionId: 'act-3',
      actionType: 'DLQ_RESOLVE',
      resourceType: 'DLQ_ENTRY',
      resourceId: 'dlq-entry-1',
      takeover: true,
      previousActorId: 'prev-actor-1',
    },
    {
      requestId: 'req-4',
      actionId: 'act-4',
      actionType: 'ADMIN_RETRY',
      resourceType: 'BUNDLE',
      resourceId: 'bundle-4',
      takeover: true,
      previousActorId: null, // takeover but no previous actor (edge case)
    },
  ];

  it.each(testCases)('should preserve context through round-trip: %#', (original) => {
    const carrier = contextToCarrier(original);
    const restored = carrierToContext(carrier);
    
    expect(restored).toEqual(original);
  });

  it('should be idempotent (multiple round-trips)', () => {
    const original: IdempotencyContext = {
      requestId: 'req-multi',
      actionId: 'act-multi',
      actionType: 'ADMIN_RETRY',
      resourceType: 'BUNDLE',
      resourceId: 'bundle-multi',
      takeover: true,
      previousActorId: 'prev-multi',
    };

    // First round-trip
    const carrier1 = contextToCarrier(original);
    const ctx1 = carrierToContext(carrier1);

    // Second round-trip
    const carrier2 = contextToCarrier(ctx1);
    const ctx2 = carrierToContext(carrier2);

    // Third round-trip
    const carrier3 = contextToCarrier(ctx2);
    const ctx3 = carrierToContext(carrier3);

    expect(ctx1).toEqual(original);
    expect(ctx2).toEqual(original);
    expect(ctx3).toEqual(original);
  });
});

describe('captureCarrier', () => {
  it('should return null when getContext returns undefined', () => {
    const carrier = captureCarrier(() => undefined);
    expect(carrier).toBeNull();
  });

  it('should return carrier when getContext returns context', () => {
    const ctx: IdempotencyContext = {
      requestId: 'req-capture',
      actionId: 'act-capture',
      actionType: 'TEST',
      resourceType: 'TEST',
      resourceId: null,
      takeover: false,
      previousActorId: null,
    };
    
    const carrier = captureCarrier(() => ctx);
    
    expect(carrier).not.toBeNull();
    expect(carrier!.version).toBe(CARRIER_VERSION);
    expect(carrier!.requestId).toBe('req-capture');
    expect(carrier!.actionId).toBe('act-capture');
  });

  it('should use default getContext that returns undefined', () => {
    // Default function returns undefined
    const carrier = captureCarrier();
    expect(carrier).toBeNull();
  });
});
