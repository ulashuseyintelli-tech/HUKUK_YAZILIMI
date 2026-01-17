/**
 * Phase 5.6 - Policy Engine Contract Schema (v1)
 * 
 * JSON shape validation using Zod.
 * Bu schema DONMUŞ - breaking change için v2 oluştur.
 * 
 * Phase 6A: PolicyExplanation schema eklendi
 * 
 * @see contracts/README.md
 */

import { z } from 'zod';

// ============================================================================
// ALLOWED VALUES
// ============================================================================

export const ALLOWED_OUTCOMES = ['PASS', 'WARN', 'BLOCK'] as const;
export const ALLOWED_SEVERITIES = ['INFO', 'WARNING', 'ERROR', 'CRITICAL'] as const;
export const ALLOWED_GATE_SEVERITIES = ['HARD', 'SOFT'] as const;
export const ALLOWED_EXPLANATION_SEVERITIES = ['INFO', 'WARNING', 'ERROR'] as const;

// ============================================================================
// REASON SCHEMA
// ============================================================================

export const PolicyReasonSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  severity: z.enum(ALLOWED_SEVERITIES),
  gateCode: z.string().optional(),
  context: z.record(z.unknown()).optional(),
});

export type PolicyReason = z.infer<typeof PolicyReasonSchema>;

// ============================================================================
// POLICY EXPLANATION SCHEMA (Phase 6A)
// ============================================================================

/**
 * Human-readable explanation for a policy decision.
 * UX Contract: Frontend relies on this structure.
 */
export const PolicyExplanationSchema = z.object({
  /** Original reason code from PolicyEngine */
  reasonCode: z.string().min(1),
  /** Human-readable message (Turkish for MVP) */
  message: z.string().min(1),
  /** Severity level - determines display priority */
  severity: z.enum(ALLOWED_EXPLANATION_SEVERITIES),
  /** What user should do - actionable guidance */
  suggestedAction: z.string().min(1),
  /** Which policy rule triggered this (optional) */
  sourceRule: z.string().optional(),
});

export type PolicyExplanation = z.infer<typeof PolicyExplanationSchema>;

// ============================================================================
// SOFT CHECK RESULT SCHEMA
// ============================================================================

export const PolicySoftCheckResultSchema = z.object({
  outcome: z.enum(ALLOWED_OUTCOMES),
  reasons: z.array(PolicyReasonSchema),
  gatesChecked: z.array(z.string()),
  policyVersion: z.string().min(1),
  checkedAt: z.string(), // ISO datetime
});

export type PolicySoftCheckResult = z.infer<typeof PolicySoftCheckResultSchema>;

// ============================================================================
// POLICY PREVIEW RESPONSE SCHEMA (for calc-preview)
// ============================================================================

export const PolicyPreviewResponseSchema = z.object({
  softCheck: PolicySoftCheckResultSchema,
  warnings: z.array(z.object({
    code: z.string(),
    message: z.string(),
    severity: z.enum(['INFO', 'WARNING']),
  })).optional(),
});

export type PolicyPreviewResponse = z.infer<typeof PolicyPreviewResponseSchema>;

// ============================================================================
// GATE RESULT SCHEMA
// ============================================================================

export const GateResultSchema = z.object({
  blocked: z.boolean(),
  gateCode: z.string().optional(),
  reason: z.string(),
  severity: z.enum(ALLOWED_GATE_SEVERITIES).optional(),
  factsUsed: z.array(z.string()).optional(),
});

export type GateResult = z.infer<typeof GateResultSchema>;

// ============================================================================
// SCHEMA VERSION
// ============================================================================

export const POLICY_ENGINE_SCHEMA_VERSION = 'v1';

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

export function validatePolicyReason(data: unknown): { success: true; data: PolicyReason } | { success: false; errors: z.ZodError } {
  const result = PolicyReasonSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error };
}

export function validatePolicySoftCheckResult(data: unknown): { success: true; data: PolicySoftCheckResult } | { success: false; errors: z.ZodError } {
  const result = PolicySoftCheckResultSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error };
}

export function validatePolicyPreviewResponse(data: unknown): { success: true; data: PolicyPreviewResponse } | { success: false; errors: z.ZodError } {
  const result = PolicyPreviewResponseSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error };
}
