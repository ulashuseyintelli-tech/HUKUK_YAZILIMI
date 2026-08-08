import type { CollectionDispositionLineType } from '@prisma/client';
import { canonicalMoney } from './client-financial-disclosure-canonical';
import {
  freezeClientFinancialDisclosureRenderOutput,
  type ClientFinancialDisclosureRenderInputV1,
  type ClientFinancialDisclosureRenderOutputV1,
} from './client-financial-disclosure-renderer.contract';

/** Owner-ratified label for the sole client-visible file reference source: Case.fileNumber. */
export const CLIENT_FINANCIAL_DISCLOSURE_FILE_NUMBER_LABEL = 'Büro dosya no' as const;

const LINE_ORDER: Readonly<Record<CollectionDispositionLineType, number>> = Object.freeze({
  CLIENT_PAYABLE: 0,
  CONTRACTUAL_FEE_WITHHELD: 1,
  FIRM_EXPENSE_REIMBURSEMENT: 2,
  CLIENT_EXPENSE_REIMBURSEMENT: 3,
  OFFSET_CLIENT_ADVANCE: 4,
  HELD_PENDING_DISTRIBUTION: 5,
  OTHER: 6,
});

const LINE_LABEL: Readonly<Record<CollectionDispositionLineType, string>> = Object.freeze({
  CLIENT_PAYABLE: 'Müvekkile ödenecek net tutar',
  CONTRACTUAL_FEE_WITHHELD: 'Sözleşmesel ücret kesintisi',
  FIRM_EXPENSE_REIMBURSEMENT: 'Büro masraf iadesi',
  CLIENT_EXPENSE_REIMBURSEMENT: 'Müvekkil masraf iadesi',
  OFFSET_CLIENT_ADVANCE: 'Müvekkil avans mahsubu',
  HELD_PENDING_DISTRIBUTION: 'Dağıtım tamamlanana kadar bekletilen tutar',
  OTHER: 'Diğer dağıtım kalemi',
});

/**
 * CLIENT-ACCOUNTING-DELIVERY R01 / X2-B02 — pure deterministic Turkish renderer.
 *
 * No clock, randomness, environment locale or mutable module state is read. All presentation
 * decisions are explicit and the versioned input is already restricted by the B01 allowlist.
 */
export function renderClientFinancialDisclosure(
  input: ClientFinancialDisclosureRenderInputV1,
): ClientFinancialDisclosureRenderOutputV1 {
  assertSafeText(input.fileNumber);
  assertSafeText(input.currency);

  const lines = [...input.lines].sort((a, b) => {
    const typeOrder = LINE_ORDER[a.type] - LINE_ORDER[b.type];
    if (typeOrder !== 0) return typeOrder;
    const left = canonicalMoney(a.amount);
    const right = canonicalMoney(b.amount);
    return left < right ? -1 : left > right ? 1 : 0;
  });

  const text = [
    'Müvekkil finansal bilgilendirmesi',
    '',
    `${CLIENT_FINANCIAL_DISCLOSURE_FILE_NUMBER_LABEL}: ${input.fileNumber}`,
    `Yayın tarihi: ${formatPublishedAt(input.publishedAt)}`,
    `Para birimi: ${input.currency}`,
    `Tahsil edilen toplam: ${formatMoney(input.totalCollected, input.currency)}`,
    `Müvekkil net payı: ${formatMoney(input.clientNetAmount, input.currency)}`,
    '',
    'Kesinti ve dağıtım kalemleri:',
    ...lines.map(
      (line) => `- ${LINE_LABEL[line.type]}: ${formatMoney(line.amount, input.currency)}`,
    ),
  ].join('\n');

  return freezeClientFinancialDisclosureRenderOutput({
    subject: `Müvekkil finansal bilgilendirmesi — ${CLIENT_FINANCIAL_DISCLOSURE_FILE_NUMBER_LABEL}: ${input.fileNumber}`,
    text,
  });
}

function formatMoney(value: string, currency: string): string {
  const canonical = canonicalMoney(value);
  const [integer, fraction] = canonical.split('.');
  const negative = integer.startsWith('-');
  const digits = negative ? integer.slice(1) : integer;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '-' : ''}${grouped},${fraction} ${currency}`;
}

function formatPublishedAt(value: string | null): string {
  if (value === null) return 'Henüz yayımlanmadı';
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime()) || instant.toISOString() !== value) {
    throw new TypeError('publishedAt must be a canonical UTC ISO-8601 instant');
  }
  const date = [
    twoDigits(instant.getUTCDate()),
    twoDigits(instant.getUTCMonth() + 1),
    instant.getUTCFullYear(),
  ].join('.');
  const time = `${twoDigits(instant.getUTCHours())}:${twoDigits(instant.getUTCMinutes())}`;
  return `${date} ${time} UTC`;
}

function twoDigits(value: number): string {
  return value.toString().padStart(2, '0');
}

function assertSafeText(value: string): void {
  if (value.length === 0 || value.trim() !== value || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new TypeError('Renderer text fields must be non-empty and free of control characters');
  }
}
