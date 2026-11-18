// actionCode -> summary projector registry. Yeni actionCode eklemek için: projector yaz + PROJECTORS'a
// ekle (+ istenirse action-behavior-catalog.ts'e "onaylanırsa ne değişir" girdisi ekle). Bilinmeyen
// actionCode veya beklenmeyen payload şekli ASLA yarım/hatalı özet üretmez -> "unsafe" fallback.
import type { ApprovalSummaryContext, ApprovalSummaryProjector, ApprovalSummaryResult } from "./types";
import { UNSAFE_SUMMARY_REASON } from "./types";
import { projectCollectionDispositionPost } from "./collection-disposition-post.projector";
import { projectChangeStatus } from "./change-status.projector";
import { projectFinancialCaseClose } from "./financial-case-close.projector";
import { actionBehaviorNotes } from "./action-behavior-catalog";
import { projectExpenseSend } from './expense-send.projector';
import { projectClaimItemLiabilitySelection } from "./claim-item-liability-selection.projector";
import { CLAIM_ITEM_UPDATE_OPERATION, projectClaimItemUpdate } from "./claim-item-update.projector";
import { CASE_DUE_CHANGE_INTENT_VERSION, projectCaseDueChange } from "./case-due-change.projector";

/**
 * Aynı eylem kodu üç niyet ailesini taşır: dosya kalemi (Due) talebi (kayıtlı niyet sürümüyle ayrışır), borçlu
 * sorumluluğu seçimi ve kalem alanı değişikliği (UPDATE). Diğer işlemler (ör. kalem oluşturma / silme) özetlenmez →
 * seçim projector'ının "unsafe" dönüşü (bugünkü davranış).
 */
const projectClaimItemHighImpact: ApprovalSummaryProjector = (savedIntent, ctx) => {
  const version = savedIntent && typeof savedIntent === "object" ? (savedIntent as Record<string, unknown>).version : undefined;
  if (version === CASE_DUE_CHANGE_INTENT_VERSION) return projectCaseDueChange(savedIntent, ctx);
  const operation = savedIntent && typeof savedIntent === "object" ? (savedIntent as Record<string, unknown>).operation : undefined;
  return operation === CLAIM_ITEM_UPDATE_OPERATION ? projectClaimItemUpdate(savedIntent, ctx) : projectClaimItemLiabilitySelection(savedIntent, ctx);
};

const PROJECTORS: Record<string, ApprovalSummaryProjector> = {
  COLLECTION_DISPOSITION_POST: projectCollectionDispositionPost,
  CHANGE_STATUS: projectChangeStatus,
  FINANCIAL_CASE_CLOSE: projectFinancialCaseClose,
  EXPENSE_REQUEST_SEND: projectExpenseSend,
  CLAIM_ITEM_HIGH_IMPACT_CHANGE: projectClaimItemHighImpact,
};

const unsafe = (): ApprovalSummaryResult => ({ kind: "unsafe", fields: [], reason: UNSAFE_SUMMARY_REASON });

export function getApprovalSummary(
  actionCode: string,
  savedIntent: unknown,
  ctx: ApprovalSummaryContext = {},
): ApprovalSummaryResult {
  const projector = PROJECTORS[actionCode];
  if (!projector) return unsafe();

  let result: ApprovalSummaryResult;
  try {
    result = projector(savedIntent, ctx);
  } catch {
    return unsafe();
  }

  if (result.kind !== "summary") return result;

  // İşlem türüne özgü notları projector verebilir (aynı eylem kodunda birden çok işlem); yoksa eylem kataloğu.
  if (result.impactNotes && result.impactNotes.length > 0) return result;
  const notes = actionBehaviorNotes(actionCode);
  return notes ? { ...result, impactNotes: notes } : result;
}
