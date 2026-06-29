// P4-4 — OfficeApproval API DTO'ları (request validation + response projeksiyonu + explicit mapper).
//
// KESİN (Ulaş kilidi):
//  - RESPONSE raw Prisma entity DÖNMEZ → her zaman toSummaryDto/toDetailDto ile kontrollü projeksiyon (gelecek-kolon sızıntısı yok).
//  - LIST (summary) ham savedIntent/replacementSavedIntent/decisionNote İÇERMEZ (dar yüzey).
//  - DETAIL ham savedIntent + replacementSavedIntent + decisionNote EXPOSE EDER (approver gördüğünü onaylar; sınır=tenant-scope+visibility, controller'da).
//  - savedIntent/replacementSavedIntent passthrough'tur; DTO bunları YENİDEN SERİLEŞTİRMEZ/MUTATE ETMEZ (payloadHash bütünlüğü).
//  - AuditLog'a hiçbir ham alan girmez (servis hash-only; bu DTO'lar yalnız HTTP response içindir).

import { IsString, MinLength, IsOptional, IsDefined, IsObject } from 'class-validator';
import { Transform } from 'class-transformer';
import { OfficeApprovalRequest } from '@prisma/client';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

// ───────────────────────── request DTO'ları (global ValidationPipe transform+validate) ─────────────────────────

/** approve: not opsiyonel. */
export class ApproveOfficeApprovalDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  note?: string;
}

/** reject: gerekçe ZORUNLU (trim sonrası >=1). Servis de boş notu reddeder (defense-in-depth). */
export class RejectOfficeApprovalDto {
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Reddetme gerekçesi zorunludur.' })
  note!: string;
}

/** request-revision: revizyon notu ZORUNLU. REVISION_REQUESTED ≠ REJECTED. */
export class RequestRevisionOfficeApprovalDto {
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Revizyon notu zorunludur.' })
  note!: string;
}

/** approve-with-changes: replacementSavedIntent ZORUNLU, opaque obje (iç şekil DOĞRULANMAZ — action-agnostic). */
export class ApproveWithChangesOfficeApprovalDto {
  @IsDefined({ message: 'replacementSavedIntent zorunludur.' })
  @IsObject({ message: 'replacementSavedIntent bir nesne olmalıdır.' })
  replacementSavedIntent!: Record<string, unknown>;

  @IsOptional()
  @Transform(trim)
  @IsString()
  note?: string;
}

// ───────────────────────── response projeksiyonları ─────────────────────────

/** LIST (inbox/mine) özet — raw payload İÇERMEZ. */
export interface OfficeApprovalSummaryDto {
  id: string;
  actionCode: string;
  targetType: string;
  targetRef: string;
  status: string;
  executionStatus: string;
  requesterUserId: string;
  approverUserId: string | null;
  hasReplacement: boolean; // replacementSavedIntent var mı (raw'ı list'te göstermeden)
  reason: string | null;
  createdAt: Date;
  decidedAt: Date | null;
  expiresAt: Date | null;
}

/** DETAIL/karar yanıtı — Ulaş kilidi: ham savedIntent + replacementSavedIntent + decisionNote EXPOSE. */
export interface OfficeApprovalDetailDto extends OfficeApprovalSummaryDto {
  savedIntent: unknown;
  payloadHash: string;
  replacementSavedIntent: unknown | null;
  replacementPayloadHash: string | null;
  decisionNote: string | null;
  executedAt: Date | null;
}

/** Özet projeksiyon (LIST). Raw Prisma entity DÖNMEZ; ham niyet alanları DIŞARIDA. */
export function toSummaryDto(r: OfficeApprovalRequest): OfficeApprovalSummaryDto {
  return {
    id: r.id,
    actionCode: r.actionCode,
    targetType: r.targetType,
    targetRef: r.targetRef,
    status: r.status,
    executionStatus: r.executionStatus,
    requesterUserId: r.requesterUserId,
    approverUserId: r.approverUserId,
    hasReplacement: r.replacementSavedIntent !== null && r.replacementSavedIntent !== undefined,
    reason: r.reason,
    createdAt: r.createdAt,
    decidedAt: r.decidedAt,
    expiresAt: r.expiresAt,
  };
}

/** Detay projeksiyon (DETAIL + karar yanıtları). savedIntent/replacementSavedIntent passthrough (mutate YOK). */
export function toDetailDto(r: OfficeApprovalRequest): OfficeApprovalDetailDto {
  return {
    ...toSummaryDto(r),
    savedIntent: r.savedIntent,
    payloadHash: r.payloadHash,
    replacementSavedIntent: r.replacementSavedIntent ?? null,
    replacementPayloadHash: r.replacementPayloadHash ?? null,
    decisionNote: r.decisionNote,
    executedAt: r.executedAt,
  };
}
