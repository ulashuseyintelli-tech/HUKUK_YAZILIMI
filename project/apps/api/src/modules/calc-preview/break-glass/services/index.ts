/**
 * Break-Glass Services Module Exports
 * 
 * Service build order (dependency order):
 * 1. Audit → 2. CircuitBreaker → 3. Grant → 4. Request → 5. Approval
 */

// Audit (no dependencies)
export * from './audit';

// Circuit Breaker (depends on config only)
export * from './circuit-breaker';

// Grant (depends on config)
export * from './grant';

// Request (depends on audit, grant)
export * from './request';

// Approval (depends on all above)
export * from './approval';
