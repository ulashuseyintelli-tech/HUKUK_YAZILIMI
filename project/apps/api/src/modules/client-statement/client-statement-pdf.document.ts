import { ClientStatementLineType, ClientStatementStatus } from '@prisma/client';
import type { ClientStatementRenderV1 } from './client-statement-render.contract';

/**
 * CAD C3-B02 — EKSTRE PDF BELGE TANIMI (saf, deterministik).
 *
 * Byte üretimi (pdfmake) ayrı dosyadadır; burada YALNIZ belge tanımı kurulur. Ayrım
 * bilinçlidir: belge tanımı saf ve tam test edilebilir, renderer ince kalır.
 *
 * KURALLAR (C3 sayfası):
 * - Enum teknik adı kullanıcıya BASILMAZ → TR etiket sözlüğü (aşağıda) tek kaynaktır.
 * - Bilgi satırları (debit=0 ve credit=0) bakiyeyi oynatmaz; bu AÇIKÇA görünür.
 * - İç ID render'a girmez — girdi zaten allowlist'li render sözleşmesidir.
 * - Dosya referansı X2 primitifinden gelir; etiketi de primitif taşır (C3 uydurmaz).
 * - SUPERSEDED/VOID ekstre PDF'e DÖNÜŞTÜRÜLEMEZ (fail-closed; assertRenderable).
 */

/** Enum → kullanıcıya gösterilecek Türkçe etiket. Eksik anahtar derleme hatasıdır. */
export const CLIENT_STATEMENT_LINE_LABELS_TR: Readonly<Record<ClientStatementLineType, string>> = {
  ADVANCE_CREDIT: 'Avans / alacak kaydı',
  CLIENT_PAYMENT: 'Müvekkil ödemesi',
  EXPENSE_ACTUAL: 'Gerçekleşen masraf',
  EXPENSE_REQUESTED: 'Masraf talebi (bilgi)',
  REFUND: 'İade',
  ADJUST: 'Düzeltme kaydı',
  CASE_COLLECTION_PAYABLE: 'Tahsilattan müvekkile aktarılacak tutar',
  CONTRACTUAL_FEE_WITHHELD: 'Sözleşmesel vekâlet ücreti (bilgi)',
  FIRM_EXPENSE_REIMBURSEMENT: 'Büro masraf iadesi (bilgi)',
  CLIENT_EXPENSE_REIMBURSEMENT: 'Müvekkile masraf iadesi',
  COLLECTION_OFFSET_ADVANCE: 'Avans mahsubu (bilgi)',
  CLIENT_PAYOUT_SENT: 'Müvekkile yapılan ödeme',
  CLIENT_OFFSET_PAYABLE_APPLIED: 'Mahsup: müvekkile borç azaldı',
  CLIENT_OFFSET_EXPENSE_APPLIED: 'Mahsup: masraf borcu azaldı',
  CLIENT_OFFSET_PAYABLE_REVERSED: 'Mahsup iptali: müvekkile borç geri yüklendi',
  CLIENT_OFFSET_EXPENSE_REVERSED: 'Mahsup iptali: masraf borcu geri yüklendi',
};

export const CLIENT_STATEMENT_PDF_INFO_NOTE =
  'Bilgi satırları (borç ve alacak sütunu 0) bakiyeyi değiştirmez; yalnız bilgilendirme amaçlıdır.';

/** SUPERSEDED/VOID ekstre gönderilemez ve PDF'e dönüştürülemez. */
export class ClientStatementNotRenderableError extends Error {
  constructor(readonly status: ClientStatementStatus) {
    super(`Ekstre bu durumdayken PDF üretilemez veya gönderilemez: ${status}`);
    this.name = 'ClientStatementNotRenderableError';
  }
}

export function assertStatementRenderable(status: ClientStatementStatus): void {
  if (status !== ClientStatementStatus.ACTIVE) {
    throw new ClientStatementNotRenderableError(status);
  }
}

export function lineLabelTr(type: ClientStatementLineType): string {
  return CLIENT_STATEMENT_LINE_LABELS_TR[type];
}

const dateTr = (d: Date): string => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
};

/** Deterministik belge tanımı (saat/rastgelelik KULLANILMAZ). */
export function buildClientStatementPdfDocument(render: ClientStatementRenderV1): {
  info: { title: string; author: string };
  content: unknown[];
} {
  const scopeLabel = render.scope === 'CLIENT_LEVEL' ? 'Genel (tüm dosyalar)' : 'Dosya bazlı';
  const headerRows: string[][] = [
    ['Ofis', render.officeName],
    ['Müvekkil', render.clientName],
    ['Kapsam', scopeLabel],
    ['Dönem', `${dateTr(render.periodStart)} – ${dateTr(render.periodEnd)}`],
    ['Para birimi', render.currency],
  ];
  if (render.fileReference) {
    headerRows.push([render.fileReference.label, render.fileReference.value]);
  }

  const showFileColumn = render.lines.some((l) => l.fileReference !== null);
  const columns = ['Tarih', 'İşlem', ...(showFileColumn ? ['Dosya'] : []), 'Açıklama', 'Borç', 'Alacak', 'Bakiye'];

  const body = render.lines.map((l) => [
    dateTr(l.lineDate),
    l.label,
    ...(showFileColumn ? [l.fileReference ? l.fileReference.value : '—'] : []),
    l.note ?? '',
    l.isInformational ? '—' : l.debit,
    l.isInformational ? '—' : l.credit,
    l.isInformational ? `${l.runningBalance} (değişmedi)` : l.runningBalance,
  ]);

  return {
    info: { title: `Müvekkil Ekstresi ${dateTr(render.periodStart)}–${dateTr(render.periodEnd)}`, author: render.officeName },
    content: [
      { text: 'MÜVEKKİL EKSTRESİ', style: 'title' },
      { table: { body: headerRows }, style: 'meta' },
      { text: `Açılış bakiyesi: ${render.openingBalance} ${render.currency}`, style: 'balance' },
      { table: { headerRows: 1, body: [columns, ...body] }, style: 'lines' },
      { text: `Kapanış bakiyesi: ${render.closingBalance} ${render.currency}`, style: 'balance' },
      { text: CLIENT_STATEMENT_PDF_INFO_NOTE, style: 'footnote' },
    ],
  };
}
