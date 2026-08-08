import type { ClientSafeFileReferenceV1 } from '../client-financial-disclosure/client-safe-file-reference.contract';
import { lineLabelTr } from './client-statement-pdf.document';
import {
  createClientStatementRender,
  type ClientStatementRenderLineV1,
  type ClientStatementRenderV1,
} from './client-statement-render.contract';

/**
 * CAD C3-B04 — kalıcı ekstre kaydı → render sözleşmesi eşlemesi.
 *
 * Eşleme SAFtır: iç ID taşıyan hiçbir alan (id, statementId, refId, refType,
 * caseClientId, caseId, clientId, tenantId, generatedById) kopyalanmaz — render
 * sözleşmesinin POL-4 sınırı burada uygulanır. Dosya referansı X2 primitifinden
 * gelen hazır değerdir; bu modül kendi referansını ÜRETMEZ (XL-B).
 */

/** Eşleme için gereken minimum kalıcı kayıt şekli (Prisma tipinden bağımsız — test edilebilirlik). */
export interface StatementRecordForRender {
  caseId: string | null;
  currency: string;
  periodStart: Date;
  periodEnd: Date;
  openingBalance: { toString(): string };
  closingBalance: { toString(): string };
  lines: readonly StatementLineForRender[];
}

export interface StatementLineForRender {
  caseId: string | null;
  lineDate: Date;
  lineType: Parameters<typeof lineLabelTr>[0];
  debit: { toString(): string };
  credit: { toString(): string };
  runningBalance: { toString(): string };
  note: string | null;
}

function isZeroAmount(value: string): boolean {
  return Number(value) === 0;
}

export function buildClientStatementRender(input: {
  statement: StatementRecordForRender;
  officeName: string;
  clientName: string;
  fileReferences: ReadonlyMap<string, ClientSafeFileReferenceV1>;
}): ClientStatementRenderV1 {
  const { statement, fileReferences } = input;

  const lines: ClientStatementRenderLineV1[] = statement.lines.map((line) => {
    const debit = line.debit.toString();
    const credit = line.credit.toString();
    return {
      lineDate: line.lineDate,
      label: lineLabelTr(line.lineType),
      note: line.note ?? null,
      debit,
      credit,
      runningBalance: line.runningBalance.toString(),
      isInformational: isZeroAmount(debit) && isZeroAmount(credit),
      fileReference: (line.caseId ? fileReferences.get(line.caseId) : undefined) ?? null,
    };
  });

  return createClientStatementRender({
    scope: statement.caseId ? 'CASE_LEVEL' : 'CLIENT_LEVEL',
    officeName: input.officeName,
    clientName: input.clientName,
    currency: statement.currency,
    periodStart: statement.periodStart,
    periodEnd: statement.periodEnd,
    openingBalance: statement.openingBalance.toString(),
    closingBalance: statement.closingBalance.toString(),
    fileReference: (statement.caseId ? fileReferences.get(statement.caseId) : undefined) ?? null,
    lines,
  });
}
