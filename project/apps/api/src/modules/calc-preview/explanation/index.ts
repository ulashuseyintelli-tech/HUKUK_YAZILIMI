/**
 * Phase 6A - Explainable Policy Preview
 * 
 * Module exports for explanation layer.
 */

// Types
export * from './explanation.types';

// Services
export { ExplanationService, PolicySoftCheckResult, PolicyReason } from './explanation.service';
export { ReasonCodeRegistry, MVP_REASON_CODES } from './reason-code-registry';
