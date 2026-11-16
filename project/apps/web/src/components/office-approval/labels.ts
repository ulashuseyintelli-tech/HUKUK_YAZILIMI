// Onay Kutusu — teknik kodların Türkçe karşılıkları (tek kaynak; liste + detay). Bilinmeyen kod UYDURULMAZ:
// "Tanımsız …" etiketi döner, ham kod yalnız "Teknik ayrıntı" bölümünde görünür.
import { isRecord } from "./summary/guards";

const ACTION_LABELS: Record<string, string> = {
  CHANGE_STATUS: "Dosya durumu değişikliği",
  FINANCIAL_CASE_CLOSE: "Mali dosya kapama",
  CLAIM_ITEM_HIGH_IMPACT_CHANGE: "Alacak kalemi — yüksek etkili değişiklik",
  COLLECTION_DISPOSITION_POST: "Tahsilat dağıtımının kesinleştirilmesi",
  COLLECTION_VOID: "Tahsilat iptali",
  CLIENT_PAYOUT_POST: "Müvekkile ödeme",
  CLIENT_FINANCIAL_DISCLOSURE_APPROVE: "Müvekkile mali bildirim onayı",
  EXPENSE_REQUEST_SEND: "Masraf talebinin müvekkile gönderilmesi",
};

/** Aynı eylem kodu altında kayıtlı niyetin işlem türüne göre daha dar ad (yalnız tanınan sürüm). */
const OPERATION_LABELS: Record<string, Record<string, string>> = {
  CLAIM_ITEM_HIGH_IMPACT_CHANGE: {
    LIABILITY_SELECTION: "Borçlu sorumluluğu seçimi",
  },
};

const TARGET_TYPE_LABELS: Record<string, string> = {
  LegalCase: "Dosya",
  CLAIM_ITEM: "Alacak kalemi",
  CLAIM_ITEM_CASE: "Dosyanın alacak kalemleri (toplu)",
  COLLECTION: "Tahsilat",
  COLLECTION_DISPOSITION: "Tahsilat dağıtımı",
  CLIENT_PAYOUT_REQUEST: "Müvekkile ödeme talebi",
  ClientFinancialDisclosureVersion: "Mali bildirim sürümü",
  ExpenseRequest: "Masraf talebi",
};

const EXECUTION_STATUS_LABELS: Record<string, string> = {
  NOT_RUN: "Henüz yürütülmedi",
  RUNNING: "Yürütülüyor",
  SUCCEEDED: "Yürütüldü",
  FAILED: "Yürütme başarısız",
  STALE: "Yürütülemedi (kayıt değişmiş)",
};

export function actionLabel(actionCode: string, savedIntent?: unknown): string {
  if (isRecord(savedIntent) && typeof savedIntent.operation === "string") {
    const narrow = OPERATION_LABELS[actionCode]?.[savedIntent.operation];
    if (narrow) return narrow;
  }
  return ACTION_LABELS[actionCode] ?? "Tanımsız işlem türü";
}

export function targetTypeLabel(targetType: string): string {
  return TARGET_TYPE_LABELS[targetType] ?? "Tanımsız hedef türü";
}

export function executionStatusLabel(executionStatus: string): string {
  return EXECUTION_STATUS_LABELS[executionStatus] ?? "Tanımsız yürütme durumu";
}
