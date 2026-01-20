/**
 * JtiAnomalyDetectorService
 * 
 * Detects anomalous token usage patterns based on jti (JWT ID).
 * 
 * Purpose:
 * - Track token usage frequency
 * - Detect potential token replay attacks
 * - Emit metrics for alerting
 * 
 * Note: This is observability/detection only - does NOT block access.
 * Blocking would be a policy decision requiring careful consideration.
 */

import { Injectable, Logger } from '@nestjs/common';

/**
 * JTI usage record
 */
interface JtiUsageRecord {
  /** First seen timestamp */
  firstSeenAt: number;
  /** Usage count */
  count: number;
  /** Last seen timestamp */
  lastSeenAt: number;
  /** Grant ID associated with this jti */
  grantId: string;
  /** Actor IDs that used this jti */
  actors: Set<string>;
}

/**
 * Anomaly detection configuration
 */
export interface JtiAnomalyConfig {
  /** Window size in ms for tracking (default: 5 minutes) */
  windowMs: number;
  /** Threshold for high usage alert (default: 100 uses per window) */
  highUsageThreshold: number;
  /** Threshold for multi-actor alert (default: 3 different actors) */
  multiActorThreshold: number;
  /** Max entries to track (LRU eviction) */
  maxEntries: number;
}

const DEFAULT_CONFIG: JtiAnomalyConfig = {
  windowMs: 5 * 60 * 1000, // 5 minutes
  highUsageThreshold: 100,
  multiActorThreshold: 3,
  maxEntries: 10000,
};

/**
 * Anomaly types
 */
export type AnomalyType = 'HIGH_USAGE' | 'MULTI_ACTOR' | 'RAPID_BURST';

/**
 * Detected anomaly
 */
export interface DetectedAnomaly {
  type: AnomalyType;
  jti: string;
  grantId: string;
  details: {
    usageCount?: number;
    actorCount?: number;
    windowMs?: number;
    threshold?: number;
  };
  detectedAt: string;
}

@Injectable()
export class JtiAnomalyDetectorService {
  private readonly logger = new Logger(JtiAnomalyDetectorService.name);
  private readonly config: JtiAnomalyConfig;
  
  /** JTI usage tracking (in-memory, would be Redis in production) */
  private readonly jtiUsage = new Map<string, JtiUsageRecord>();
  
  /** Insertion order for LRU eviction */
  private readonly insertionOrder: string[] = [];
  
  /** Metrics counters */
  private metrics = {
    totalRecorded: 0,
    anomaliesDetected: 0,
    highUsageAnomalies: 0,
    multiActorAnomalies: 0,
  };

  constructor(config?: Partial<JtiAnomalyConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Record token usage and check for anomalies
   * 
   * @returns Array of detected anomalies (empty if none)
   */
  recordUsage(jti: string, grantId: string, actorId: string): DetectedAnomaly[] {
    const now = Date.now();
    const anomalies: DetectedAnomaly[] = [];
    
    // Get or create usage record
    let record = this.jtiUsage.get(jti);
    
    if (!record) {
      // New jti - create record
      record = {
        firstSeenAt: now,
        count: 0,
        lastSeenAt: now,
        grantId,
        actors: new Set(),
      };
      this.jtiUsage.set(jti, record);
      this.insertionOrder.push(jti);
      
      // LRU eviction if needed
      this.evictIfNeeded();
    }
    
    // Check if within window
    if (now - record.firstSeenAt > this.config.windowMs) {
      // Window expired - reset
      record.firstSeenAt = now;
      record.count = 0;
      record.actors.clear();
    }
    
    // Update record
    record.count++;
    record.lastSeenAt = now;
    record.actors.add(actorId);
    
    this.metrics.totalRecorded++;
    
    // Check for anomalies
    
    // 1. High usage anomaly
    if (record.count >= this.config.highUsageThreshold) {
      const anomaly: DetectedAnomaly = {
        type: 'HIGH_USAGE',
        jti,
        grantId,
        details: {
          usageCount: record.count,
          windowMs: this.config.windowMs,
          threshold: this.config.highUsageThreshold,
        },
        detectedAt: new Date().toISOString(),
      };
      anomalies.push(anomaly);
      this.metrics.highUsageAnomalies++;
      this.emitAnomalyMetric(anomaly);
    }
    
    // 2. Multi-actor anomaly (same jti used by multiple actors)
    if (record.actors.size >= this.config.multiActorThreshold) {
      const anomaly: DetectedAnomaly = {
        type: 'MULTI_ACTOR',
        jti,
        grantId,
        details: {
          actorCount: record.actors.size,
          threshold: this.config.multiActorThreshold,
        },
        detectedAt: new Date().toISOString(),
      };
      anomalies.push(anomaly);
      this.metrics.multiActorAnomalies++;
      this.emitAnomalyMetric(anomaly);
    }
    
    if (anomalies.length > 0) {
      this.metrics.anomaliesDetected += anomalies.length;
    }
    
    return anomalies;
  }

  /**
   * Get current metrics
   */
  getMetrics(): Readonly<typeof this.metrics> {
    return { ...this.metrics };
  }

  /**
   * Get usage stats for a specific jti
   */
  getJtiStats(jti: string): JtiUsageRecord | null {
    const record = this.jtiUsage.get(jti);
    if (!record) return null;
    
    return {
      ...record,
      actors: new Set(record.actors), // Copy to prevent mutation
    };
  }

  /**
   * Clear all tracking data (for testing)
   * @internal
   */
  _clearForTesting(): void {
    this.jtiUsage.clear();
    this.insertionOrder.length = 0;
    this.metrics = {
      totalRecorded: 0,
      anomaliesDetected: 0,
      highUsageAnomalies: 0,
      multiActorAnomalies: 0,
    };
  }

  /**
   * LRU eviction when max entries reached
   */
  private evictIfNeeded(): void {
    while (this.jtiUsage.size > this.config.maxEntries) {
      const oldest = this.insertionOrder.shift();
      if (oldest) {
        this.jtiUsage.delete(oldest);
      }
    }
  }

  /**
   * Emit anomaly metric for alerting
   * Also emits audit event for post-mortem analysis
   */
  private emitAnomalyMetric(anomaly: DetectedAnomaly): void {
    // Metric for alerting
    this.logger.warn('METRIC: break_glass_jti_anomaly_detected', {
      metric: 'break_glass_jti_anomaly_detected',
      labels: {
        anomaly_type: anomaly.type,
        grant_id: anomaly.grantId,
      },
      value: 1,
      timestamp: anomaly.detectedAt,
      details: anomaly.details,
    });
    
    // Audit event for post-mortem (structured log that can be ingested)
    this.logger.warn('AUDIT_EVENT: BREAK_GLASS_JTI_ANOMALY_DETECTED', {
      eventType: 'BREAK_GLASS_JTI_ANOMALY_DETECTED',
      eventId: `anomaly-${anomaly.jti}-${Date.now()}`,
      anomalyType: anomaly.type,
      jti: anomaly.jti,
      grantId: anomaly.grantId,
      details: anomaly.details,
      severity: anomaly.type === 'MULTI_ACTOR' ? 'HIGH' : 'MEDIUM',
      timestamp: anomaly.detectedAt,
      // This event should be linked to grant audit trail
      recommendation: this.getAnomalyRecommendation(anomaly.type),
    });
  }

  /**
   * Get recommendation for anomaly type
   */
  private getAnomalyRecommendation(type: AnomalyType): string {
    switch (type) {
      case 'HIGH_USAGE':
        return 'Review grant usage patterns. Consider if automation is appropriate or if token is being shared.';
      case 'MULTI_ACTOR':
        return 'CRITICAL: Same token used by multiple actors. Investigate potential token sharing or compromise.';
      case 'RAPID_BURST':
        return 'Unusual burst pattern detected. May indicate automated abuse.';
      default:
        return 'Review grant audit trail for suspicious activity.';
    }
  }
}
