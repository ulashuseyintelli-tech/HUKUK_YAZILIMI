/**
 * Audit Service Metrics
 * 
 * Phase 10.2 - Task 2.1
 * 
 * In-memory metrics for audit service observability.
 * Compatible with existing metrics pattern in the project.
 */

// ============================================================================
// Metrics State
// ============================================================================

let bufferSize = 0;
let eventsFlushedTotal = 0;
let dbWriteFailedTotal = 0;
let serviceMode: 0 | 1 = 0; // 0=NORMAL, 1=DEGRADED
let fileWritesTotal = 0;
let bufferOverflowTotal = 0;
let fileSinkFailedTotal = 0;
let degradedFilePendingBytes = 0;

// Histogram for flush duration
const flushDurationBuckets = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5];
let flushDurationHistogram = {
  buckets: new Array(flushDurationBuckets.length).fill(0),
  sum: 0,
  count: 0,
};

// ============================================================================
// Metric Setters
// ============================================================================

export function setServiceMode(mode: 'NORMAL' | 'DEGRADED'): void {
  serviceMode = mode === 'DEGRADED' ? 1 : 0;
}

export function updateBufferSize(size: number): void {
  bufferSize = size;
}

export function recordFlush(count: number, durationMs: number): void {
  eventsFlushedTotal += count;
  
  // Update histogram
  const durationSeconds = durationMs / 1000;
  flushDurationHistogram.sum += durationSeconds;
  flushDurationHistogram.count++;
  
  for (let i = 0; i < flushDurationBuckets.length; i++) {
    if (durationSeconds <= flushDurationBuckets[i]) {
      flushDurationHistogram.buckets[i]++;
    }
  }
}

export function recordDbWriteFailure(): void {
  dbWriteFailedTotal++;
}

export function recordFileWrite(count: number): void {
  fileWritesTotal += count;
}

export function recordBufferOverflow(count: number = 1): void {
  bufferOverflowTotal += count;
}

export function recordFileSinkFailure(): void {
  fileSinkFailedTotal++;
}

export function updateDegradedFilePendingBytes(bytes: number): void {
  degradedFilePendingBytes = bytes;
}

// ============================================================================
// Metric Getters
// ============================================================================

export function getBufferSize(): number {
  return bufferSize;
}

export function getEventsFlushedTotal(): number {
  return eventsFlushedTotal;
}

export function getDbWriteFailedTotal(): number {
  return dbWriteFailedTotal;
}

export function getServiceMode(): 0 | 1 {
  return serviceMode;
}

export function getFileWritesTotal(): number {
  return fileWritesTotal;
}

export function getBufferOverflowTotal(): number {
  return bufferOverflowTotal;
}

export function getFileSinkFailedTotal(): number {
  return fileSinkFailedTotal;
}

export function getDegradedFilePendingBytes(): number {
  return degradedFilePendingBytes;
}

// ============================================================================
// Prometheus Export
// ============================================================================

export function toPrometheusText(): string {
  const lines: string[] = [];

  // Buffer size
  lines.push('# HELP audit_buffer_size Current number of audit events in buffer');
  lines.push('# TYPE audit_buffer_size gauge');
  lines.push(`audit_buffer_size ${bufferSize}`);

  // Events flushed
  lines.push('# HELP audit_events_flushed_total Total audit events successfully flushed to database');
  lines.push('# TYPE audit_events_flushed_total counter');
  lines.push(`audit_events_flushed_total ${eventsFlushedTotal}`);

  // Flush duration histogram
  lines.push('# HELP audit_flush_duration_seconds Duration of audit flush operations');
  lines.push('# TYPE audit_flush_duration_seconds histogram');
  for (let i = 0; i < flushDurationBuckets.length; i++) {
    lines.push(`audit_flush_duration_seconds_bucket{le="${flushDurationBuckets[i]}"} ${flushDurationHistogram.buckets[i]}`);
  }
  lines.push(`audit_flush_duration_seconds_bucket{le="+Inf"} ${flushDurationHistogram.count}`);
  lines.push(`audit_flush_duration_seconds_sum ${flushDurationHistogram.sum}`);
  lines.push(`audit_flush_duration_seconds_count ${flushDurationHistogram.count}`);

  // DB write failures
  lines.push('# HELP audit_db_write_failed_total Total audit database write failures');
  lines.push('# TYPE audit_db_write_failed_total counter');
  lines.push(`audit_db_write_failed_total ${dbWriteFailedTotal}`);

  // Service mode
  lines.push('# HELP audit_service_mode Audit service mode (0=NORMAL, 1=DEGRADED)');
  lines.push('# TYPE audit_service_mode gauge');
  lines.push(`audit_service_mode ${serviceMode}`);

  // File writes
  lines.push('# HELP audit_file_writes_total Total audit events written to file sink');
  lines.push('# TYPE audit_file_writes_total counter');
  lines.push(`audit_file_writes_total ${fileWritesTotal}`);

  // Buffer overflow
  lines.push('# HELP audit_buffer_overflow_total Total audit events dropped due to buffer overflow');
  lines.push('# TYPE audit_buffer_overflow_total counter');
  lines.push(`audit_buffer_overflow_total ${bufferOverflowTotal}`);

  // File sink failures
  lines.push('# HELP audit_file_sink_failed_total Total file sink write failures');
  lines.push('# TYPE audit_file_sink_failed_total counter');
  lines.push(`audit_file_sink_failed_total ${fileSinkFailedTotal}`);

  // Degraded file pending bytes
  lines.push('# HELP audit_degraded_file_pending_bytes Total bytes in degraded audit files pending manual import');
  lines.push('# TYPE audit_degraded_file_pending_bytes gauge');
  lines.push(`audit_degraded_file_pending_bytes ${degradedFilePendingBytes}`);

  return lines.join('\n');
}

// ============================================================================
// Reset (for testing)
// ============================================================================

export function reset(): void {
  bufferSize = 0;
  eventsFlushedTotal = 0;
  dbWriteFailedTotal = 0;
  serviceMode = 0;
  fileWritesTotal = 0;
  bufferOverflowTotal = 0;
  fileSinkFailedTotal = 0;
  degradedFilePendingBytes = 0;
  flushDurationHistogram = {
    buckets: new Array(flushDurationBuckets.length).fill(0),
    sum: 0,
    count: 0,
  };
}
