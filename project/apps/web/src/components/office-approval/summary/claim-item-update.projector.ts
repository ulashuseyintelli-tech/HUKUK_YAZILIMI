// CLAIM_ITEM_HIGH_IMPACT_CHANGE — alacak kalemi alan değişikliği (operation = UPDATE, sürüm OWN29D_CLAIM_ITEM_HIGH_IMPACT_V1) için okunur özet.
// Kaynak: kayıtlı niyet (talep anındaki kalem görüntüsü `currentSnapshot` + önerilen yama `proposedPatch`). Yalnız DEĞİŞEN alanlar
// "önce → sonra" yazılır. Tanınmayan alan, tanınmayan değer ya da beklenmeyen biçim → "unsafe" (yarım / uydurma özet yok).
import type { ApprovalSummaryField, ApprovalSummaryProjector, ApprovalSummaryResult } from "./types";
import { isRecord } from "./guards";
import {
  ATTORNEY_FEE_BASIS_LABELS,
  type AttorneyFeeBasis,
  CLAIM_ITEM_TYPE_LABELS,
  INTEREST_ACCRUAL_STATUS_LABELS,
  INTEREST_START_PROVENANCE_LABELS,
  humanizeClaimItemName,
} from "@/components/claim-item/claim-item-labels";
import { getInterestReadDisplayLabel } from "@/lib/interest-type-resolver";

export const CLAIM_ITEM_UPDATE_INTENT_VERSION = "OWN29D_CLAIM_ITEM_HIGH_IMPACT_V1";
export const CLAIM_ITEM_UPDATE_OPERATION = "UPDATE";

export const CLAIM_ITEM_UPDATE_UNSUPPORTED_REASON =
  "Bu kalem değişikliği tanınmayan bir alan ya da değer içeriyor; okunur özet üretilemiyor. Ayrıntı yalnız teknik bölümdedir.";

const unsupported = (): ApprovalSummaryResult => ({ kind: "unsafe", fields: [], reason: CLAIM_ITEM_UPDATE_UNSUPPORTED_REASON });

class UnknownValue extends Error {}

type Kind = "text" | "date" | "number" | "status" | "provenance" | "attorneyFeeBasis" | "interestTypeCode" | "interestType" | "confirmer";

/** Özetlenebilen alanlar (sıra = gösterim sırası). Listede olmayan alan → unsafe. */
const FIELDS: { key: string; label: string; kind: Kind }[] = [
  { key: "attorneyFeeBasis", label: "Vekâlet ücreti türü", kind: "attorneyFeeBasis" },
  { key: "interestAccrualStatus", label: "Faiz durumu", kind: "status" },
  { key: "interestTypeCode", label: "Faiz türü", kind: "interestTypeCode" },
  { key: "interestType", label: "Faiz türü (eski kod)", kind: "interestType" },
  { key: "interestStartDate", label: "Faiz başlangıcı", kind: "date" },
  { key: "interestStartDateProvenance", label: "Faiz başlangıcının dayanağı", kind: "provenance" },
  { key: "interestEndDate", label: "Faiz bitişi", kind: "date" },
  { key: "interestRate", label: "Faiz oranı (%)", kind: "number" },
  { key: "noInterestReason", label: "Faiz işlememe gerekçesi", kind: "text" },
  { key: "noInterestConfirmedById", label: "Faizsizliği teyit eden", kind: "confirmer" },
  { key: "dueDate", label: "Vade tarihi", kind: "date" },
  { key: "description", label: "Açıklama", kind: "text" },
  { key: "referenceNo", label: "Referans no", kind: "text" },
  { key: "sortOrder", label: "Sıra no", kind: "number" },
];
const KNOWN_KEYS = new Set(FIELDS.map((field) => field.key));

const isEmpty = (value: unknown) => value === null || value === undefined || value === "";

function datePart(value: unknown): string {
  if (typeof value !== "string") throw new UnknownValue();
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) throw new UnknownValue();
  return `${match[1]}-${match[2]}-${match[3]}`;
}

/** Karşılaştırma anahtarı: aynı anlamdaki iki değer aynı anahtarı verir (ör. tarih saat kısmı, "24" ile 24). */
function comparable(kind: Kind, value: unknown): string {
  if (isEmpty(value)) return "";
  if (kind === "date") return datePart(value);
  if (kind === "number") {
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) throw new UnknownValue();
    return String(n);
  }
  if (typeof value !== "string") throw new UnknownValue();
  return value;
}

function display(kind: Kind, value: unknown): string {
  if (isEmpty(value)) return kind === "attorneyFeeBasis" ? ATTORNEY_FEE_BASIS_LABELS.UNKNOWN : "Boş";
  switch (kind) {
    case "date": {
      const [y, m, d] = datePart(value).split("-");
      return `${d}.${m}.${y}`;
    }
    case "number":
      return comparable("number", value).replace(".", ",");
    case "status": {
      const label = INTEREST_ACCRUAL_STATUS_LABELS[value as keyof typeof INTEREST_ACCRUAL_STATUS_LABELS];
      if (!label) throw new UnknownValue();
      return label;
    }
    case "provenance": {
      const label = INTEREST_START_PROVENANCE_LABELS[value as string];
      if (!label) throw new UnknownValue();
      return label;
    }
    case "attorneyFeeBasis": {
      const label = ATTORNEY_FEE_BASIS_LABELS[value as AttorneyFeeBasis];
      if (!label || value === "UNKNOWN") throw new UnknownValue();
      return label;
    }
    case "interestTypeCode": {
      let label: string | null;
      try {
        label = getInterestReadDisplayLabel({ interestTypeCode: value as string });
      } catch {
        throw new UnknownValue();
      }
      if (!label) throw new UnknownValue();
      return label;
    }
    case "interestType": {
      const label = getInterestReadDisplayLabel({ interestType: value as string });
      if (!label || label === value) throw new UnknownValue();
      return label;
    }
    case "confirmer":
      // Sunucu bu alanı talep edenin hesabıyla doldurur (faizsizlik beyanı); kimlik gösterilmez.
      return "Talep eden";
    case "text":
      if (typeof value !== "string") throw new UnknownValue();
      return value;
  }
}

function itemName(snapshot: Record<string, unknown>): ApprovalSummaryField {
  const type = typeof snapshot.itemType === "string" ? CLAIM_ITEM_TYPE_LABELS[snapshot.itemType] : undefined;
  const description = typeof snapshot.description === "string" && snapshot.description.trim() ? humanizeClaimItemName(snapshot.description) : null;
  if (!type && !description) return { label: "Kalem", value: "Kalem adı kayıtta yok", tone: "warning" };
  return { label: "Kalem", value: type && description && description !== type ? `${type} — ${description}` : (type ?? description)! };
}

export const projectClaimItemUpdate: ApprovalSummaryProjector = (savedIntent) => {
  if (!isRecord(savedIntent) || savedIntent.operation !== CLAIM_ITEM_UPDATE_OPERATION) return unsupported();
  if (savedIntent.version !== CLAIM_ITEM_UPDATE_INTENT_VERSION) return unsupported();
  const patch = savedIntent.proposedPatch;
  const snapshot = savedIntent.currentSnapshot;
  if (!isRecord(patch) || !isRecord(snapshot)) return unsupported();
  if (!Object.keys(patch).every((key) => KNOWN_KEYS.has(key))) return unsupported();

  try {
    const fields: ApprovalSummaryField[] = [itemName(snapshot)];
    let changed = 0;
    for (const field of FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(patch, field.key)) continue;
      const before = snapshot[field.key];
      const after = patch[field.key];
      if (comparable(field.kind, before) === comparable(field.kind, after)) continue;
      fields.push({ label: field.label, value: `${display(field.kind, before)} → ${display(field.kind, after)}` });
      changed += 1;
    }
    if (changed === 0) fields.push({ label: "Değişiklik", value: "Kayıtlı değere göre değişen alan yok", tone: "warning" });
    return {
      kind: "summary",
      fields,
      impactNotes: ["Onaylanınca yalnız listelenen alanlar kaleme yazılır; tutar ve kalem türü değişmez."],
    };
  } catch (error) {
    if (error instanceof UnknownValue) return unsupported();
    throw error;
  }
};
