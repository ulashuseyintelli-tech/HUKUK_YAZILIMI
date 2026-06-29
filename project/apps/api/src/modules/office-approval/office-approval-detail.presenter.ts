import { OfficeApprovalRequest } from '@prisma/client';
import { OfficeApprovalDetailDto, toDetailDto } from './dto/office-approval.dto';

type JsonRecord = Record<string, unknown>;

export type OfficeApprovalDetailVisibilityLevel = 'LEGACY_FULL' | 'CONTROLLED_FULL' | 'MASKED';

export interface OfficeApprovalDetailViewerContext {
  actorUserId: string;
  tenantId: string;
  isRequester: boolean;
  isEligibleApprover: boolean;
}

export interface OfficeApprovalDetailMaskingMetadata {
  applied: boolean;
  level: OfficeApprovalDetailVisibilityLevel;
  contractVersion: string | null;
  maskedFields: string[];
}

export type OfficeApprovalSafeDetailDto = OfficeApprovalDetailDto & {
  financeVisibility?: OfficeApprovalDetailMaskingMetadata;
};

const MASKED = '[MASKED]';

/**
 * OfficeApproval detail/action response presenter.
 * Finance savedIntent payloads with the server-side masking contract are projected before HTTP response.
 *
 * /// <remarks>
 * /// Cagrildigi yerler:
 * ///  - OfficeApprovalController.detail() -> GET /office-approvals/:id
 * ///  - OfficeApprovalController.approve() -> POST /office-approvals/:id/approve
 * ///  - OfficeApprovalController.reject() -> POST /office-approvals/:id/reject
 * ///  - OfficeApprovalController.requestRevision() -> POST /office-approvals/:id/request-revision
 * ///  - OfficeApprovalController.approveWithChanges() -> POST /office-approvals/:id/approve-with-changes
 * ///  - OfficeApprovalController.cancel() -> POST /office-approvals/:id/cancel
 * /// </remarks>
 */
export function toDetailDtoForViewer(
  request: OfficeApprovalRequest,
  context: OfficeApprovalDetailViewerContext,
): OfficeApprovalSafeDetailDto {
  const dto = toDetailDto(request) as OfficeApprovalSafeDetailDto;
  const shouldMaskSavedIntent = requiresServerSideFinanceMasking(dto.savedIntent);
  const shouldMaskReplacementIntent =
    requiresServerSideFinanceMasking(dto.replacementSavedIntent) || shouldMaskSavedIntent;

  if (!shouldMaskSavedIntent && !shouldMaskReplacementIntent) {
    return dto;
  }

  const level = context.isEligibleApprover && !context.isRequester ? 'CONTROLLED_FULL' : 'MASKED';
  const contractVersion = extractMaskingContractVersion(dto.savedIntent) ?? extractMaskingContractVersion(dto.replacementSavedIntent);
  const maskedFields = new Set<string>();

  return {
    ...dto,
    savedIntent: shouldMaskSavedIntent
      ? maskFinanceIntent(dto.savedIntent, level, maskedFields, 'savedIntent')
      : dto.savedIntent,
    replacementSavedIntent:
      dto.replacementSavedIntent && shouldMaskReplacementIntent
        ? maskFinanceIntent(dto.replacementSavedIntent, level, maskedFields, 'replacementSavedIntent')
        : dto.replacementSavedIntent,
    financeVisibility: {
      applied: true,
      level,
      contractVersion,
      maskedFields: Array.from(maskedFields).sort(),
    },
  };
}

function requiresServerSideFinanceMasking(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const visibility = value.visibility;
  return isRecord(visibility) && visibility.detailRequiresServerSideMasking === true;
}

function extractMaskingContractVersion(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const visibility = value.visibility;
  if (!isRecord(visibility) || typeof visibility.version !== 'string') return null;
  return visibility.version;
}

function maskFinanceIntent(
  value: unknown,
  level: OfficeApprovalDetailVisibilityLevel,
  maskedFields: Set<string>,
  prefix: string,
): unknown {
  if (!isRecord(value)) return null;
  const clean = removeSensitiveFields(value, maskedFields, prefix) as JsonRecord;

  if (level === 'MASKED') {
    const lines = Array.isArray(clean.lines) ? clean.lines : [];
    maskedFields.add(`${prefix}.lines`);
    return {
      version: clean.version ?? null,
      policyVersion: clean.policyVersion ?? null,
      actionCode: clean.actionCode ?? null,
      targetType: clean.targetType ?? null,
      targetRef: clean.targetRef ?? null,
      totalAmount: clean.totalAmount ?? null,
      currency: clean.currency ?? null,
      lineCount: lines.length,
      risk: clean.risk ?? null,
      visibility: clean.visibility ?? null,
    };
  }

  if (Array.isArray(clean.lines)) {
    clean.lines = clean.lines.map((line, index) => {
      if (!isRecord(line)) return line;
      if ('note' in line && line.note !== null && line.note !== undefined) {
        maskedFields.add(`${prefix}.lines.${index}.note`);
      }
      return { ...line, note: line.note === null || line.note === undefined ? null : MASKED };
    });
  }

  return clean;
}

function removeSensitiveFields(value: unknown, maskedFields: Set<string>, path: string): unknown {
  if (Array.isArray(value)) {
    return value.map((item, index) => removeSensitiveFields(item, maskedFields, `${path}.${index}`));
  }
  if (!isRecord(value)) return value;

  const result: JsonRecord = {};
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (isHiddenFinanceField(key)) {
      maskedFields.add(childPath);
      continue;
    }
    result[key] = removeSensitiveFields(child, maskedFields, childPath);
  }
  return result;
}

function isHiddenFinanceField(key: string): boolean {
  return [
    'internalMessage',
    'privateExplanation',
    'thresholdValues',
    'journalPreview',
    'attorneyFeeRevenue',
    'feeRevenue',
    'officeRevenue',
    'manualReviewInternalNote',
  ].includes(key);
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
