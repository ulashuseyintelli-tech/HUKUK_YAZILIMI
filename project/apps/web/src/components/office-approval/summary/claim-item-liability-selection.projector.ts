// CLAIM_ITEM_HIGH_IMPACT_CHANGE — yalnız borçlu sorumluluğu seçimi (operation = LIABILITY_SELECTION, sürüm V1) için okunur özet.
// Kaynak: kayıtlı niyet (talep anındaki kayıt). Alan yoksa UYDURULMAZ; eksiklik uyarı tonuyla açıkça yazılır.
// Aynı eylem kodunun diğer işlemleri (alan yaması vb.) ve tanınmayan sürümler → "unsafe" (bugünkü güvenli geri dönüş).
import type { ApprovalSummaryField, ApprovalSummaryProjector, ApprovalSummaryResult } from "./types";
import { UNSAFE_SUMMARY_REASON } from "./types";
import { formatDecimalString } from "./format";
import { isNonEmptyString, isRecord } from "./guards";
import { humanizeClaimItemName } from "@/components/claim-item/claim-item-labels";

export const LIABILITY_SELECTION_INTENT_VERSION = "CLAIM_ITEM_LIABILITY_SELECTION_V1";
export const LIABILITY_SELECTION_OPERATION = "LIABILITY_SELECTION";

const MODE_LABELS: Record<string, string> = {
  JOINT_AND_SEVERAL: "Müteselsil",
  PROPORTIONAL: "Paylı",
  CAPPED: "Tutarla sınırlı",
  UNDETERMINED: "Belirlenmedi",
};

const BASIS_LABELS: Record<string, string> = {
  COURT_JUDGMENT: "İlam / mahkeme kararı",
  CONTRACT: "Sözleşme",
  STATUTE: "Kanun hükmü",
  NEGOTIABLE_INSTRUMENT: "Kambiyo senedi",
  LAWYER_ASSESSMENT: "Avukat değerlendirmesi",
  OTHER: "Diğer",
};
const BASES_REQUIRING_NOTE = new Set(["LAWYER_ASSESSMENT", "OTHER"]);

const LIMIT_SCOPE_LABELS: Record<string, string> = {
  ITEM_AMOUNT: "Yalnız bu kalemin kayıtlı tutarı (kaleme işleyen faiz ve diğer kalemler hariç)",
};

export const LIABILITY_SELECTION_UNSUPPORTED_REASON =
  "Bu sorumluluk talebi tanınmayan bir kayıt biçiminde; okunur özet üretilemiyor. Ayrıntı yalnız teknik bölümdedir.";

const IMPACT_ALWAYS = "Onaylanınca seçim kaleme yazılır; önceki tahsilat ve mahsup kayıtları değiştirilmez.";
const IMPACT_RESTRICTED =
  "Borçlunun sorumluluğunu aşan ödeme başka borçluya aktarılmaz; borçlu adına fazla ödeme olarak izlenir.";

const unsupported = (): ApprovalSummaryResult => ({ kind: "unsafe", fields: [], reason: LIABILITY_SELECTION_UNSUPPORTED_REASON });

/**
 * Kayıtlı satırdaki tavan tutarını Türkçe biçimde gösterir ("tavan 3000.00" → "tavan 3.000,00"). Yalnız biçim değişir; değer,
 * ad ve sıra kayıttaki gibidir. Biçimlenemeyen tutar olduğu gibi kalır.
 */
function formatRecordedLine(line: string): string {
  return line.replace(/(tavan )(-?\d+(?:\.\d+)?)/g, (_match, prefix: string, amount: string) => prefix + (formatDecimalString(amount) ?? amount));
}

function partyLines(parties: unknown[]): string[] {
  return parties.map((party, index) => {
    const prefix = `${index + 1}. borçlu (adı kayıtta yok)`;
    if (!isRecord(party)) return `${prefix}: ayrıntı kayıtta yok`;
    if (party.shareWeight !== null && party.shareWeight !== undefined) return `${prefix}: pay ağırlığı ${String(party.shareWeight)}`;
    if (party.unlimited === true) return `${prefix}: tavan yok`;
    if (isNonEmptyString(party.limitAmount)) return `${prefix}: tavan ${formatDecimalString(party.limitAmount) ?? party.limitAmount}`;
    return prefix;
  });
}

function selectionFields(selection: Record<string, unknown>, prefix: string): ApprovalSummaryField[] {
  const fields: ApprovalSummaryField[] = [];
  const display = isRecord(selection.display) ? selection.display : null;
  const mode = typeof selection.mode === "string" ? selection.mode : "";
  const parties = Array.isArray(selection.parties) ? selection.parties : [];

  fields.push(
    display && isNonEmptyString(display.kalem)
      ? // Açıklaması boş kalemde kayıtlı ad ham tür kodudur (ör. "PRINCIPAL"); okuma anında Türkçe ada çevrilir, kayıt değişmez.
        { label: `${prefix}Kalem`, value: humanizeClaimItemName(display.kalem) }
      : { label: `${prefix}Kalem`, value: "Kalem adı kayıtta yok", tone: "warning" },
  );

  fields.push(
    MODE_LABELS[mode]
      ? { label: `${prefix}Sorumluluk türü`, value: MODE_LABELS[mode] }
      : { label: `${prefix}Sorumluluk türü`, value: "Tanımsız tür", tone: "warning" },
  );

  const recordedLines =
    display && Array.isArray(display.taraflar) && display.taraflar.every(isNonEmptyString) ? (display.taraflar as string[]) : null;
  if (mode === "UNDETERMINED" && parties.length === 0) {
    fields.push({ label: `${prefix}Borçlular`, value: "Borçlu seçilmez" });
  } else if (recordedLines && recordedLines.length > 0) {
    fields.push({ label: `${prefix}Borçlular / pay / tavan`, value: recordedLines.map(formatRecordedLine).join("; ") });
  } else if (parties.length > 0) {
    fields.push({ label: `${prefix}Borçlular / pay / tavan`, value: partyLines(parties).join("; "), tone: "warning" });
  } else {
    fields.push({ label: `${prefix}Borçlular`, value: "Borçlu bilgisi kayıtta yok", tone: "warning" });
  }

  const limitScope = selection.limitScope;
  if (typeof limitScope === "string") {
    fields.push(
      LIMIT_SCOPE_LABELS[limitScope]
        ? { label: `${prefix}Tavan kapsamı`, value: LIMIT_SCOPE_LABELS[limitScope] }
        : { label: `${prefix}Tavan kapsamı`, value: "Tanımsız kapsam", tone: "warning" },
    );
  } else if (mode === "CAPPED") {
    fields.push({ label: `${prefix}Tavan kapsamı`, value: "Kapsam kayıtta yok", tone: "warning" });
  }

  const basis = selection.basis;
  if (typeof basis === "string" && basis.length > 0) {
    fields.push(
      BASIS_LABELS[basis]
        ? { label: `${prefix}Dayanak`, value: BASIS_LABELS[basis] }
        : { label: `${prefix}Dayanak`, value: "Tanımsız dayanak", tone: "warning" },
    );
  } else if (mode !== "UNDETERMINED") {
    fields.push({ label: `${prefix}Dayanak`, value: "Dayanak kayıtta yok", tone: "warning" });
  }

  if (isNonEmptyString(selection.basisNote)) {
    fields.push({ label: `${prefix}Açıklama`, value: selection.basisNote });
  } else if (typeof basis === "string" && BASES_REQUIRING_NOTE.has(basis)) {
    fields.push({ label: `${prefix}Açıklama`, value: "Açıklama kayıtta yok", tone: "warning" });
  }

  if (isNonEmptyString(selection.basisDocumentId)) {
    fields.push({ label: `${prefix}Dayanak belgesi`, value: "Belge bağlı" });
  }
  return fields;
}

export const projectClaimItemLiabilitySelection: ApprovalSummaryProjector = (savedIntent) => {
  if (!isRecord(savedIntent) || savedIntent.operation !== LIABILITY_SELECTION_OPERATION) {
    // Bu eylem kodunun başka işlemleri için özet tanımlı değil → genel güvenli geri dönüş (bugünkü davranış).
    return { kind: "unsafe", fields: [], reason: UNSAFE_SUMMARY_REASON };
  }
  if (savedIntent.version !== LIABILITY_SELECTION_INTENT_VERSION) return unsupported();
  const selections = savedIntent.selections;
  if (!Array.isArray(selections) || selections.length === 0) return unsupported();
  if (!selections.every((selection) => isRecord(selection) && isNonEmptyString(selection.claimItemId) && typeof selection.mode === "string")) {
    return unsupported();
  }

  const fields: ApprovalSummaryField[] = [];
  const many = selections.length > 1;
  fields.push({
    label: "Uygulama",
    value: savedIntent.appliedVia === "BULK" ? `Toplu (${selections.length} kalem)` : many ? `${selections.length} kalem` : "Tek kalem",
  });
  // Talep gerekçesi detay başlığında zaten gösterilir; özet onu tekrar etmez.
  selections.forEach((selection, index) => {
    fields.push(...selectionFields(selection as Record<string, unknown>, many ? `${index + 1}. kalem · ` : ""));
  });

  const restricted = selections.some((selection) => {
    const mode = (selection as Record<string, unknown>).mode;
    return mode === "PROPORTIONAL" || mode === "CAPPED";
  });
  return { kind: "summary", fields, impactNotes: restricted ? [IMPACT_ALWAYS, IMPACT_RESTRICTED] : [IMPACT_ALWAYS] };
};
