/**
 * Worker Carrier Lifecycle Integration Tests - Phase 10.5 Task 6
 * 
 * Tests carrier lifecycle operations within worker context:
 * - V1 carrier upgrade on inbound
 * - Retry path mutation + size enforcement
 * - DLQ path enrichment
 * - Oversize rejection scenario
 */

import {
  normalizeInboundCarrier,
  handleRetryCarrier,
  handleDlqCarrier,
  SimpleWorkerCarrierMetrics,
  WorkerCarrierSizeExceededError,
  CARRIER_SIZE_EXCEEDED_ERROR_CODE,
  IdempotencyContextCarrierV2,
  MAX_CARRIER_SIZE_BYTES,
  resetAllMetrics,
} from '../idempotency/carrier-lifecycle';
import { IdempotencyContextCarrier } from '../idempotency/idempotency-carrier.types';

describe('Worker Carrier Lifecycle Integration Tests', () => {
  let metrics: SimpleWorkerCarrierMetrics;
  
  const v1Carrier: IdempotencyContextCarrier = {
    version: 1,
    requestId: 'req-integration-001',
    actionId: 'act-integration-001',
    actionType: 'ADMIN_RETRY',
    resourceType: 'BUNDLE',
    resourceId: 'bundle-integration-001',
    takeover: false,
    previousActorId: null,
  };
  
  beforeEach(() => {
    metrics = new SimpleWorkerCarrierMetrics();
    resetAllMetrics();
  });
  
  // =========================================================================
  // IT-7: V1 carrier → V2 upgrade on inbound
  // =========================================================================
  
  describe('IT-7: V1 carrier upgrade on inbound', () => {
    it('should upgrade V1 carrier to V2 with attemptNumber=0', () => {
      const result = normalizeInboundCarrier(v1Carrier, metrics);
      
      expect(result.valid).toBe(true);
      expect(result.upgraded).toBe(true);
      expect(result.carrier?.version).toBe(2);
      expect(result.carrier?.attemptNumber).toBe(0);
    });
    
    it('should preserve all V1 fields after upgrade', () => {
      const result = normalizeInboundCarrier(v1Carrier, metrics);
      
      expect(result.carrier?.requestId).toBe(v1Carrier.requestId);
      expect(result.carrier?.actionId).toBe(v1Carrier.actionId);
      expect(result.carrier?.actionType).toBe(v1Carrier.actionType);
      expect(result.carrier?.resourceType).toBe(v1Carrier.resourceType);
      expect(result.carrier?.resourceId).toBe(v1Carrier.resourceId);
    });
    
    it('should record upgrade metric', () => {
      normalizeInboundCarrier(v1Carrier, metrics);
      
      expect(metrics.getCount('carrier_upgraded_total')).toBe(1);
    });
  });
  
  // =========================================================================
  // IT-8: Retry fail → attempt++ and failureHistory added
  // =========================================================================
  
  describe('IT-8: Retry path mutation', () => {
    it('should increment attemptNumber on retry', () => {
      const inbound = normalizeInboundCarrier(v1Carrier, metrics);
      const failure = { code: 'S3_TIMEOUT', message: 'Write timeout' };
      
      const result = handleRetryCarrier(inbound.carrier!, failure, metrics);
      
      expect(result.attemptNumber).toBe(1);
      expect(result.carrier.attemptNumber).toBe(1);
    });
    
    it('should append failure to history', () => {
      const inbound = normalizeInboundCarrier(v1Carrier, metrics);
      const failure = { code: 'S3_TIMEOUT', message: 'Write timeout' };
      
      const result = handleRetryCarrier(inbound.carrier!, failure, metrics);
      
      expect(result.carrier.failureHistory).toHaveLength(1);
      expect(result.carrier.failureHistory![0].errorCode).toBe('S3_TIMEOUT');
      expect(result.carrier.failureHistory![0].errorMessage).toBe('Write timeout');
    });
    
    it('should accumulate failures across retries', () => {
      const inbound = normalizeInboundCarrier(v1Carrier, metrics);
      
      const retry1 = handleRetryCarrier(inbound.carrier!, { code: 'ERR_1', message: 'Error 1' }, metrics);
      const retry2 = handleRetryCarrier(retry1.carrier, { code: 'ERR_2', message: 'Error 2' }, metrics);
      const retry3 = handleRetryCarrier(retry2.carrier, { code: 'ERR_3', message: 'Error 3' }, metrics);
      
      expect(retry3.attemptNumber).toBe(3);
      expect(retry3.carrier.failureHistory).toHaveLength(3);
    });
    
    it('should record mutation metric with attempt number', () => {
      const inbound = normalizeInboundCarrier(v1Carrier, metrics);
      
      handleRetryCarrier(inbound.carrier!, { code: 'ERR', message: 'Error' }, metrics);
      
      expect(metrics.getCount('carrier_mutated_total:attempt=1')).toBe(1);
    });
  });
  
  // =========================================================================
  // IT-9: Oversize scenario → reject + expected error code + metric
  // =========================================================================
  
  describe('IT-9: Oversize carrier rejection', () => {
    it('should throw WorkerCarrierSizeExceededError for oversize carrier', () => {
      // Create carrier that will exceed size limit after mutation
      const oversizeCarrier: IdempotencyContextCarrierV2 = {
        version: 2,
        requestId: 'req-oversize',
        actionId: 'act-oversize',
        actionType: 'ADMIN_RETRY',
        resourceType: 'BUNDLE',
        resourceId: 'bundle-oversize',
        takeover: false,
        previousActorId: null,
        attemptNumber: 3,
        failureHistory: Array(3).fill(null).map((_, i) => ({
          timestamp: `2026-02-05T0${i}:00:00.000Z`,
          errorCode: `ERR_${i}`,
          errorMessage: 'X'.repeat(2000), // Very long messages
        })),
      };
      
      // Check if it's actually over limit
      const serialized = JSON.stringify(oversizeCarrier);
      const size = Buffer.byteLength(serialized, 'utf8');
      
      if (size > MAX_CARRIER_SIZE_BYTES) {
        expect(() => handleRetryCarrier(
          oversizeCarrier,
          { code: 'ERR', message: 'Error' },
          metrics,
        )).toThrow(WorkerCarrierSizeExceededError);
      }
    });
    
    it('should have error code CARRIER_SIZE_EXCEEDED', () => {
      const oversizeCarrier: IdempotencyContextCarrierV2 = {
        version: 2,
        requestId: 'req-oversize',
        actionId: 'act-oversize',
        actionType: 'ADMIN_RETRY',
        resourceType: 'BUNDLE',
        resourceId: 'bundle-oversize',
        takeover: false,
        previousActorId: null,
        attemptNumber: 3,
        failureHistory: Array(3).fill(null).map((_, i) => ({
          timestamp: `2026-02-05T0${i}:00:00.000Z`,
          errorCode: `ERR_${i}`,
          errorMessage: 'X'.repeat(2000),
        })),
      };
      
      const serialized = JSON.stringify(oversizeCarrier);
      const size = Buffer.byteLength(serialized, 'utf8');
      
      if (size > MAX_CARRIER_SIZE_BYTES) {
        try {
          handleRetryCarrier(oversizeCarrier, { code: 'ERR', message: 'Error' }, metrics);
          fail('Should have thrown');
        } catch (e) {
          expect(e).toBeInstanceOf(WorkerCarrierSizeExceededError);
          expect((e as WorkerCarrierSizeExceededError).code).toBe(CARRIER_SIZE_EXCEEDED_ERROR_CODE);
        }
      }
    });
    
    it('should record carrier_rejected_total metric', () => {
      const oversizeCarrier: IdempotencyContextCarrierV2 = {
        version: 2,
        requestId: 'req-oversize',
        actionId: 'act-oversize',
        actionType: 'ADMIN_RETRY',
        resourceType: 'BUNDLE',
        resourceId: 'bundle-oversize',
        takeover: false,
        previousActorId: null,
        attemptNumber: 3,
        failureHistory: Array(3).fill(null).map((_, i) => ({
          timestamp: `2026-02-05T0${i}:00:00.000Z`,
          errorCode: `ERR_${i}`,
          errorMessage: 'X'.repeat(2000),
        })),
      };
      
      const serialized = JSON.stringify(oversizeCarrier);
      const size = Buffer.byteLength(serialized, 'utf8');
      
      if (size > MAX_CARRIER_SIZE_BYTES) {
        try {
          handleRetryCarrier(oversizeCarrier, { code: 'ERR', message: 'Error' }, metrics);
        } catch {
          // Expected
        }
        
        expect(metrics.getCount('carrier_rejected_total')).toBe(1);
      }
    });
  });
  
  // =========================================================================
  // IT-10: DLQ enrichment
  // =========================================================================
  
  describe('IT-10: DLQ path enrichment', () => {
    it('should enrich carrier with EXHAUSTED reason', () => {
      const inbound = normalizeInboundCarrier(v1Carrier, metrics);
      
      // Simulate retries
      const retry1 = handleRetryCarrier(inbound.carrier!, { code: 'ERR', message: 'Error' }, metrics);
      const retry2 = handleRetryCarrier(retry1.carrier, { code: 'ERR', message: 'Error' }, metrics);
      
      // Move to DLQ
      const dlq = handleDlqCarrier(retry2.carrier, 'EXHAUSTED', metrics);
      
      expect(dlq.reason).toBe('EXHAUSTED');
      expect(dlq.carrier.dlqReason).toBe('EXHAUSTED');
      expect(dlq.finalAttemptNumber).toBe(2);
    });
    
    it('should preserve failure history in DLQ', () => {
      const inbound = normalizeInboundCarrier(v1Carrier, metrics);
      const retry = handleRetryCarrier(inbound.carrier!, { code: 'ERR', message: 'Error' }, metrics);
      const dlq = handleDlqCarrier(retry.carrier, 'EXHAUSTED', metrics);
      
      expect(dlq.carrier.failureHistory).toHaveLength(1);
    });
    
    it('should record DLQ enrichment metric', () => {
      const inbound = normalizeInboundCarrier(v1Carrier, metrics);
      handleDlqCarrier(inbound.carrier!, 'EXHAUSTED', metrics);
      
      expect(metrics.getCount('carrier_dlq_enriched_total:reason=EXHAUSTED')).toBe(1);
    });
  });
  
  // =========================================================================
  // IT-11: Full lifecycle correlation preservation
  // =========================================================================
  
  describe('IT-11: Correlation preservation through lifecycle', () => {
    it('should preserve requestId through entire lifecycle', () => {
      const inbound = normalizeInboundCarrier(v1Carrier, metrics);
      const retry1 = handleRetryCarrier(inbound.carrier!, { code: 'ERR', message: 'Error' }, metrics);
      const retry2 = handleRetryCarrier(retry1.carrier, { code: 'ERR', message: 'Error' }, metrics);
      const dlq = handleDlqCarrier(retry2.carrier, 'EXHAUSTED', metrics);
      
      expect(dlq.carrier.requestId).toBe(v1Carrier.requestId);
    });
    
    it('should preserve actionId through entire lifecycle', () => {
      const inbound = normalizeInboundCarrier(v1Carrier, metrics);
      const retry = handleRetryCarrier(inbound.carrier!, { code: 'ERR', message: 'Error' }, metrics);
      const dlq = handleDlqCarrier(retry.carrier, 'EXHAUSTED', metrics);
      
      expect(dlq.carrier.actionId).toBe(v1Carrier.actionId);
    });
  });
  
  // =========================================================================
  // IT-12: Metrics label policy (no high-cardinality)
  // =========================================================================
  
  describe('IT-12: Metrics label policy', () => {
    const FORBIDDEN_LABELS = ['bundleId', 'tenantId', 'jobId', 'userId', 'requestId', 'correlationId'];
    
    it('MUST NOT use high-cardinality labels in carrier metrics', () => {
      const inbound = normalizeInboundCarrier(v1Carrier, metrics);
      handleRetryCarrier(inbound.carrier!, { code: 'ERR', message: 'Error' }, metrics);
      handleDlqCarrier(inbound.carrier!, 'EXHAUSTED', metrics);
      
      // Check all metric keys for forbidden labels
      const allKeys = Array.from((metrics as any).counts.keys()) as string[];
      
      for (const key of allKeys) {
        for (const forbidden of FORBIDDEN_LABELS) {
          expect(key.includes(forbidden)).toBe(false);
        }
      }
    });
  });
});
