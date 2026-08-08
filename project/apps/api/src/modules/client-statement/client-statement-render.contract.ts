import {
  createClientSafeFileReferenceFromCaseFileNumber,
  type ClientSafeFileReferenceV1,
} from '../client-financial-disclosure/client-safe-file-reference.contract';

/**
 * CAD C3-B01 — EKSTRE RENDER SÖZLEŞMESİ (PDF ve mail özetinin TEK girdi kapısı).
 *
 * POL-4: müvekkile giden hiçbir yüzey iç teknik kimlik taşımaz. Bu dosya, ekstre
 * render'ının **allowlist**'idir; C3-B02 (PDF) ve C3-B03 (mail eki) yalnız buradan
 * üretilen dondurulmuş nesneyi tüketir — ham Prisma satırı render'a GİRMEZ.
 *
 * XL-B: "client-safe insan-okur dosya referansı" primitifinin TEK YAZARI X2'dir
 * (`client-safe-file-reference.contract.ts`). Bu modül onu READ-ONLY tüketir;
 * kendi kaynağını, fallback'ini veya etiket politikasını TANIMLAMAZ.
 * Owner amendment (ratifiye): kaynak yalnız `Case.fileNumber`; alan yoksa referans
 * ÜRETİLMEZ (executionFileNumber/caseId gibi başka alana DÜŞÜLMEZ).
 */

/** Render'a ASLA girmeyecek iç alanlar (C3-B01 characterization ile kilitli). */
export const CLIENT_STATEMENT_RENDER_FORBIDDEN_FIELDS = [
  'id',
  'statementId',
  'refId',
  'refType',
  'caseClientId',
  'caseId',
  'clientId',
  'tenantId',
  'generatedById',
] as const;

export const CLIENT_STATEMENT_RENDER_CONTRACT_VERSION = 'ClientStatementRenderV1' as const;

export type ClientStatementRenderScope = 'CLIENT_LEVEL' | 'CASE_LEVEL';

export interface ClientStatementRenderLineV1 {
  readonly lineDate: Date;
  /** Türkçe, kullanıcıya gösterilebilir etiket. Enum teknik adı BASILMAZ (C3-B02). */
  readonly label: string;
  readonly note: string | null;
  readonly debit: string;
  readonly credit: string;
  readonly runningBalance: string;
  /** Bakiyeyi oynatmayan bilgi satırı mı? (POL-2'nin görsel karşılığı) */
  readonly isInformational: boolean;
  /** X2 primitifinden gelen client-safe dosya referansı; yoksa null (fallback YOK). */
  readonly fileReference: ClientSafeFileReferenceV1 | null;
}

export interface ClientStatementRenderV1 {
  readonly contractVersion: typeof CLIENT_STATEMENT_RENDER_CONTRACT_VERSION;
  readonly scope: ClientStatementRenderScope;
  readonly officeName: string;
  readonly clientName: string;
  readonly currency: string;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly openingBalance: string;
  readonly closingBalance: string;
  /** Case-level ekstrede başlık düzeyindeki dosya referansı; client-level'da null. */
  readonly fileReference: ClientSafeFileReferenceV1 | null;
  readonly lines: readonly ClientStatementRenderLineV1[];
}

/**
 * X2 primitifinin TEK tüketim noktası. Çağıran, `fileNumber`'ı tenant + müvekkil
 * kapsamı DOĞRULANMIŞ bir sorgudan getirmek zorundadır (bkz. resolveClientSafeFileReferences).
 * Alan yok/boşsa null döner — politika uydurulmaz, başka alana düşülmez.
 */
export function toClientSafeFileReference(
  fileNumber: string | null | undefined,
): ClientSafeFileReferenceV1 | null {
  const trimmed = typeof fileNumber === 'string' ? fileNumber.trim() : '';
  if (trimmed.length === 0) return null;
  try {
    return createClientSafeFileReferenceFromCaseFileNumber(trimmed);
  } catch {
    // Primitifin kendi doğrulaması reddederse referans ÜRETİLMEZ (fail-closed).
    return null;
  }
}

/** Render nesnesini dondurarak üretir; allowlist dışı alan derleme zamanında hatadır. */
export function createClientStatementRender(input: {
  scope: ClientStatementRenderScope;
  officeName: string;
  clientName: string;
  currency: string;
  periodStart: Date;
  periodEnd: Date;
  openingBalance: string;
  closingBalance: string;
  fileReference: ClientSafeFileReferenceV1 | null;
  lines: readonly ClientStatementRenderLineV1[];
}): ClientStatementRenderV1 {
  return Object.freeze({
    contractVersion: CLIENT_STATEMENT_RENDER_CONTRACT_VERSION,
    scope: input.scope,
    officeName: input.officeName,
    clientName: input.clientName,
    currency: input.currency,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    openingBalance: input.openingBalance,
    closingBalance: input.closingBalance,
    fileReference: input.fileReference,
    lines: Object.freeze(
      input.lines.map((l) =>
        Object.freeze({
          lineDate: l.lineDate,
          label: l.label,
          note: l.note,
          debit: l.debit,
          credit: l.credit,
          runningBalance: l.runningBalance,
          isInformational: l.isInformational,
          fileReference: l.fileReference,
        }),
      ),
    ),
  });
}
