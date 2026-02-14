/**
 * ScenarioFactory — Deterministic test data generator
 *
 * Synthetic Load Validation — Task 1.3
 *
 * Seed + counter → deterministic IDs.
 * Test prefix: synthetic_{seed}_ — cleanup query'leri bu prefix'i baz alır.
 *
 * @see .kiro/specs/synthetic-load-validation/design.md
 */

import { createHash } from 'crypto';

const DEFAULT_SEED = 1337;

export class ScenarioFactory {
  private counter = 0;
  private readonly prefix: string;

  constructor(private readonly seed: number = DEFAULT_SEED) {
    this.prefix = `synthetic_${seed}`;
  }

  /** Get the test data prefix for cleanup queries */
  getPrefix(): string {
    return this.prefix;
  }

  /** Get the seed value */
  getSeed(): number {
    return this.seed;
  }

  /** Generate a deterministic UUID-like ID from seed + counter + tag */
  private generateId(tag: string): string {
    const input = `${this.seed}:${tag}:${this.counter++}`;
    const hash = createHash('sha256').update(input).digest('hex');
    // Format as UUID-like: 8-4-4-4-12
    return [
      hash.slice(0, 8),
      hash.slice(8, 12),
      hash.slice(12, 16),
      hash.slice(16, 20),
      hash.slice(20, 32),
    ].join('-');
  }

  /** Create a single incident ID with optional tenant prefix */
  createIncidentId(tenantId?: string): string {
    const id = this.generateId('inc');
    const tenant = tenantId ? `${tenantId}_` : '';
    return `${this.prefix}_${tenant}inc_${id}`;
  }

  /** Create a single run ID */
  createRunId(): string {
    const id = this.generateId('run');
    return `${this.prefix}_run_${id}`;
  }

  /** Create a single request ID */
  createRequestId(): string {
    const id = this.generateId('req');
    return `${this.prefix}_req_${id}`;
  }

  /** Create a single actor ID */
  createActorId(): string {
    return `${this.prefix}_actor_load_test`;
  }

  /** Create bulk incident IDs */
  createBulkIncidentIds(count: number, tenantId?: string): string[] {
    return Array.from({ length: count }, () => this.createIncidentId(tenantId));
  }

  /** Create bulk run IDs */
  createBulkRunIds(count: number): string[] {
    return Array.from({ length: count }, () => this.createRunId());
  }

  /** Reset counter (for reproducibility within a scenario) */
  resetCounter(): void {
    this.counter = 0;
  }
}
