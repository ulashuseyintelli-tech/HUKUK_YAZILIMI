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

const PROJECTORS: Record<string, ApprovalSummaryProjector> = {
  COLLECTION_DISPOSITION_POST: projectCollectionDispositionPost,
  CHANGE_STATUS: projectChangeStatus,
  FINANCIAL_CASE_CLOSE: projectFinancialCaseClose,
  EXPENSE_REQUEST_SEND: projectExpenseSend,
  // Yalnız borçlu sorumluluğu seçimi özetlenir; aynı kodun diğer işlemleri projector içinde "unsafe" kalır.
  CLAIM_ITEM_HIGH_IMPACT_CHANGE: projectClaimItemLiabilitySelection,
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
