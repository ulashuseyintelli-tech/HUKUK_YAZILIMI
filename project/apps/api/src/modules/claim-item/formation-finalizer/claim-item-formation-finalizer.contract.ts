import { ConflictException } from '@nestjs/common';

export const CLAIM_ITEM_FORMATION_FINALIZATION_ERROR_CODES = [
  'FINALIZER_DISABLED',
  'FORMATION_INTENT_NOT_FOUND',
  'FORMATION_INTENT_EXPIRED',
  'FORMATION_INTENT_INTEGRITY_MISMATCH',
  'FORMATION_APPROVAL_MISMATCH',
  'FORMATION_SOURCE_MISMATCH',
  'FORMATION_LEGAL_BASIS_MISMATCH',
  'FORMATION_PROJECTION_INVALID',
  'FORMATION_EXECUTION_CONFLICT',
] as const;

export type ClaimItemFormationFinalizationErrorCode =
  (typeof CLAIM_ITEM_FORMATION_FINALIZATION_ERROR_CODES)[number];

export class ClaimItemFormationFinalizationError extends ConflictException {
  constructor(readonly code: ClaimItemFormationFinalizationErrorCode) {
    super({
      statusCode: 409,
      error: 'Claim Item Formation Finalization Failed',
      code,
      message: finalizationMessage(code),
    });
    this.name = 'ClaimItemFormationFinalizationError';
  }
}

export interface FinalizeClaimItemFormationInput {
  readonly tenantId: string;
  readonly formationIntentId: string;
}

export interface ClaimItemFormationFinalizationResult {
  readonly formationIntentId: string;
  readonly approvalRequestId: string;
  readonly claimItemId: string;
  readonly snapshotId: string;
  readonly replayed: boolean;
}

function finalizationMessage(code: ClaimItemFormationFinalizationErrorCode): string {
  const messages: Record<ClaimItemFormationFinalizationErrorCode, string> = {
    FINALIZER_DISABLED: 'Claim formation finalizer is disabled.',
    FORMATION_INTENT_NOT_FOUND: 'Claim formation intent was not found in the requested tenant.',
    FORMATION_INTENT_EXPIRED: 'Claim formation intent is expired or temporally invalid.',
    FORMATION_INTENT_INTEGRITY_MISMATCH: 'Claim formation intent integrity verification failed.',
    FORMATION_APPROVAL_MISMATCH: 'Office approval does not exactly bind the formation intent.',
    FORMATION_SOURCE_MISMATCH: 'Exact document source revalidation failed.',
    FORMATION_LEGAL_BASIS_MISMATCH: 'Exact legal basis revalidation failed.',
    FORMATION_PROJECTION_INVALID: 'Exact ClaimItem persistence projection is invalid.',
    FORMATION_EXECUTION_CONFLICT: 'Claim formation execution state is inconsistent.',
  };
  return messages[code];
}
