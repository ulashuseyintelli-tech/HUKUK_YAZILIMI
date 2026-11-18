// CLAIM_ITEM_HIGH_IMPACT_CHANGE — dosya kalemi (Due) talebi (niyet sürümü CASE_DUE_CHANGE_V1) için okunur özet.
// İşlemler: DUE_CREATE (yeni dosya kalemi), DUE_UPDATE (hesap / dışa aktarım çıktısını etkileyen değişiklik),
// DUE_DELETE (bağlı alacak kalemi olmayan dosya kaleminin silinmesi).
// Kaynak: kayıtlı niyet. Alan yoksa UYDURULMAZ; tanınmayan alan, değer ya da biçim → "unsafe" (yarım özet yok).
import type { ApprovalSummaryField, ApprovalSummaryProjector, ApprovalSummaryResult } from "./types";
import { formatAmountWithCurrency, formatDecimalString } from "./format";
import { isNonEmptyString, isRecord } from "./guards";
import { ATTORNEY_FEE_BASIS_LABELS, type AttorneyFeeBasis, INTEREST_ACCRUAL_STATUS_LABELS } from "@/components/claim-item/claim-item-labels";
import { getInterestReadDisplayLabel } from "@/lib/interest-type-resolver";

export const CASE_DUE_CHANGE_INTENT_VERSION = "CASE_DUE_CHANGE_V1";
export const CASE_DUE_CHANGE_OPERATIONS = ["DUE_CREATE", "DUE_UPDATE", "DUE_DELETE"] as const;

export const CASE_DUE_CHANGE_UNSUPPORTED_REASON =
  "Bu dosya kalemi talebi tanınmayan bir alan ya da değer içeriyor; okunur özet üretilemiyor. Ayrıntı yalnız teknik bölümdedir.";

const DUE_TYPE_LABELS: Record<string, string> = {
  PRINCIPAL: "Ana Para (Asıl Alacak)",
  INTEREST: "Faiz",
  EXPENSE: "Masraf",
  VEKALET_UCRETI: "Vekalet Ücreti",
  HARC: "Harç",
  TAZMINAT: "Tazminat",
  CEZAI_SART: "Cezai Şart",
  NAFAKA: "Nafaka",
  KIRA: "Kira Alacağı",
  AIDAT: "Aidat",
  KOMISYON: "Komisyon",
  PRIM: "Prim/İkramiye",
  YARGILAMA_GIDERI: "Yargılama Gideri",
  OTHER: "Diğer",
};

const IMPACT_CREATE = [
  "Onaylanınca dosya kalemi ve — türü eşleniyorsa — bağlı alacak kalemi oluşturulur ve borca girer.",
  "Onaylanana kadar kalem dosyada yoktur: borca, tahsilat dağıtımına ve dışa aktarıma girmez.",
];
const IMPACT_UPDATE = [
  "Onaylanınca değişiklik dosya kalemine yazılır; hesap özeti, masraf matrahı, belgeler ve UYAP dışa aktarımı yeni değeri kullanır.",
  "Onaylanana kadar dosya kalemi değişmez. Talepten sonra kalem değiştiyse onay uygulanmaz; yeniden talep gerekir.",
];
const IMPACT_DELETE = [
  "Onaylanınca dosya kalemi silinir ve hesap / dışa aktarım çıktılarından çıkar.",
  "Onaylanana kadar dosya kalemi yerinde kalır.",
];

class Unsupported extends Error {}
const unsupported = (): ApprovalSummaryResult => ({ kind: "unsafe", fields: [], reason: CASE_DUE_CHANGE_UNSUPPORTED_REASON });

type Kind = "type" | "amount" | "rate" | "date" | "text" | "currency" | "interestTypeCode" | "interestType" | "status" | "attorneyFeeBasis" | "bool" | "number";

/** Özetlenebilen alanlar (sıra = gösterim sırası). Listede olmayan alan → unsafe. */
const FIELDS: { key: string; label: string; kind: Kind }[] = [
  { key: "type", label: "Tür", kind: "type" },
  { key: "amount", label: "Tutar", kind: "amount" },
  { key: "currency", label: "Para birimi", kind: "currency" },
  { key: "dueDate", label: "Vade tarihi", kind: "date" },
  { key: "description", label: "Açıklama", kind: "text" },
  { key: "interestTypeCode", label: "Faiz türü", kind: "interestTypeCode" },
  { key: "interestType", label: "Faiz türü (eski kod)", kind: "interestType" },
  { key: "interestRate", label: "Faiz oranı (%)", kind: "rate" },
  { key: "interestAccrualStatus", label: "Faiz durumu", kind: "status" },
  { key: "noInterestReason", label: "Faiz işlememe gerekçesi", kind: "text" },
  { key: "interestStartDate", label: "Faiz başlangıcı", kind: "date" },
  { key: "interestEndDate", label: "Faiz bitişi", kind: "date" },
  { key: "attorneyFeeBasis", label: "Vekâlet ücreti türü", kind: "attorneyFeeBasis" },
  { key: "sourceDocumentNo", label: "Kaynak belge no", kind: "text" },
  { key: "hasKdv", label: "KDV dahil", kind: "bool" },
  { key: "kdvRate", label: "KDV oranı (%)", kind: "rate" },
  { key: "isFinalized", label: "Kesinleşti", kind: "bool" },
  { key: "finalizationDate", label: "Kesinleşme tarihi", kind: "date" },
  { key: "finalizationNote", label: "Kesinleşme notu", kind: "text" },
  { key: "sortOrder", label: "Sıra no", kind: "number" },
  { key: "isPrimary", label: "Ana kalem", kind: "bool" },
];
const FIELD_BY_KEY = new Map(FIELDS.map((field) => [field.key, field]));

const isEmpty = (value: unknown) => value === null || value === undefined || value === "";

function datePart(value: unknown): string {
  if (typeof value !== "string") throw new Unsupported();
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) throw new Unsupported();
  return `${match[3]}.${match[2]}.${match[1]}`;
}

function numberText(value: unknown): string {
  const raw = typeof value === "number" && Number.isFinite(value) ? String(value) : typeof value === "string" ? value : null;
  if (raw === null) throw new Unsupported();
  const formatted = formatDecimalString(raw);
  if (formatted === null) throw new Unsupported();
  return formatted;
}

function show(kind: Kind, value: unknown): string {
  if (isEmpty(value)) return "—";
  switch (kind) {
    case "type": {
      const label = typeof value === "string" ? DUE_TYPE_LABELS[value] : undefined;
      if (!label) throw new Unsupported();
      return label;
    }
    case "amount":
    case "rate":
    case "number":
      return numberText(value);
    case "date":
      return datePart(value);
    case "currency":
      if (typeof value !== "string" || !/^[A-Z]{3}$/.test(value)) throw new Unsupported();
      return value;
    case "text":
      if (typeof value !== "string") throw new Unsupported();
      return value;
    case "interestTypeCode":
    case "interestType": {
      if (typeof value !== "string") throw new Unsupported();
      let label: string | null;
      try {
        label = getInterestReadDisplayLabel(kind === "interestTypeCode" ? { interestTypeCode: value } : { interestType: value });
      } catch {
        throw new Unsupported(); // tanınmayan faiz türü kodu
      }
      if (!isNonEmptyString(label)) throw new Unsupported();
      return label;
    }
    case "status": {
      const label = typeof value === "string" ? INTEREST_ACCRUAL_STATUS_LABELS[value as keyof typeof INTEREST_ACCRUAL_STATUS_LABELS] : undefined;
      if (!label) throw new Unsupported();
      return label;
    }
    case "attorneyFeeBasis": {
      const label = typeof value === "string" ? ATTORNEY_FEE_BASIS_LABELS[value as AttorneyFeeBasis] : undefined;
      if (!label) throw new Unsupported();
      return label;
    }
    case "bool":
      if (typeof value !== "boolean") throw new Unsupported();
      return value ? "Evet" : "Hayır";
  }
}

/** Kayıtlı içerikteki alanları gösterim sırasıyla döner; tanınmayan alan → unsafe. */
function knownEntries(content: Record<string, unknown>): { key: string; label: string; kind: Kind; value: unknown }[] {
  for (const key of Object.keys(content)) if (!FIELD_BY_KEY.has(key)) throw new Unsupported();
  return FIELDS.filter((field) => Object.prototype.hasOwnProperty.call(content, field.key)).map((field) => ({ ...field, value: content[field.key] }));
}

function createFields(intent: Record<string, unknown>): ApprovalSummaryField[] {
  if (!isRecord(intent.due)) throw new Unsupported();
  const due = intent.due;
  if (isEmpty(due.type) || isEmpty(due.amount) || isEmpty(due.currency) || isEmpty(due.dueDate)) throw new Unsupported();
  const fields: ApprovalSummaryField[] = [{ label: "İşlem", value: "Yeni dosya kalemi ekleme" }];
  for (const entry of knownEntries(due)) {
    if (entry.key === "currency") continue; // tutarla birlikte gösterilir
    if (entry.key === "amount") {
      fields.push({ label: "Tutar", value: formatAmountWithCurrency(String(due.amount), show("currency", due.currency)) });
      if (formatDecimalString(String(due.amount)) === null) throw new Unsupported();
      continue;
    }
    if (isEmpty(entry.value) && entry.kind !== "bool") continue; // boş bırakılan alan özetlenmez
    fields.push({ label: entry.label, value: show(entry.kind, entry.value) });
  }
  return fields;
}

function updateFields(intent: Record<string, unknown>): ApprovalSummaryField[] {
  if (!isRecord(intent.patch) || !isRecord(intent.before)) throw new Unsupported();
  const effective = Array.isArray(intent.effectiveFields) ? intent.effectiveFields.filter((field): field is string => typeof field === "string") : [];
  if (effective.length === 0) throw new Unsupported();
  const before = intent.before;
  const entries = knownEntries(intent.patch);
  if (entries.length === 0) throw new Unsupported();
  const fields: ApprovalSummaryField[] = [{ label: "İşlem", value: "Dosya kalemi değişikliği" }];
  // Hangi kalem: talep anındaki tür ve tutar.
  fields.push({ label: "Kalem (talep anında)", value: `${show("type", before.type)} — ${formatAmountWithCurrency(String(before.amount), show("currency", before.currency))}` });
  for (const entry of entries) {
    const hasBefore = Object.prototype.hasOwnProperty.call(before, entry.key);
    const next = show(entry.kind, entry.value);
    const value = hasBefore ? `${show(entry.kind, before[entry.key])} → ${next}` : next;
    fields.push({ label: entry.label, value, ...(effective.includes(entry.key) ? { tone: "warning" as const } : {}) });
  }
  return fields;
}

function deleteFields(intent: Record<string, unknown>): ApprovalSummaryField[] {
  if (!isRecord(intent.before)) throw new Unsupported();
  const before = intent.before;
  const fields: ApprovalSummaryField[] = [
    { label: "İşlem", value: "Dosya kalemi silme", tone: "danger" },
    { label: "Tür", value: show("type", before.type) },
    { label: "Tutar", value: formatAmountWithCurrency(String(before.amount), show("currency", before.currency)) },
    { label: "Vade tarihi", value: show("date", before.dueDate) },
  ];
  if (formatDecimalString(String(before.amount)) === null) throw new Unsupported();
  if (isNonEmptyString(before.description)) fields.push({ label: "Açıklama", value: before.description });
  return fields;
}

export const projectCaseDueChange: ApprovalSummaryProjector = (savedIntent) => {
  if (!isRecord(savedIntent) || savedIntent.version !== CASE_DUE_CHANGE_INTENT_VERSION) return unsupported();
  try {
    switch (savedIntent.operation) {
      case "DUE_CREATE":
        return { kind: "summary", fields: createFields(savedIntent), impactNotes: IMPACT_CREATE };
      case "DUE_UPDATE":
        return { kind: "summary", fields: updateFields(savedIntent), impactNotes: IMPACT_UPDATE };
      case "DUE_DELETE":
        return { kind: "summary", fields: deleteFields(savedIntent), impactNotes: IMPACT_DELETE };
      default:
        return unsupported();
    }
  } catch (error) {
    if (error instanceof Unsupported) return unsupported();
    throw error;
  }
};
