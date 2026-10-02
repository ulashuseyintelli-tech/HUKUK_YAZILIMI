import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  AccountingAccountCode,
  AccountingJournalDirection,
  AccountingJournalSourceType,
} from './accounting-journal.types';
import type {
  FinancialStatementMovement,
  FinancialStatementReadReport,
  FinancialStatementReadRequest,
  FinancialStatementReconciliation,
  FinancialStatementReconciliationWarning,
  FinancialStatementWarningCode,
} from './accounting-journal-financial-statement.types';

type StatementJournalLine = {
  lineNo: number;
  accountCode: AccountingAccountCode;
  direction: AccountingJournalDirection;
  amount: Prisma.Decimal;
  currency: string;
  caseId: string | null;
  clientId: string | null;
  caseClientId: string | null;
  journalEntry: {
    sourceType: AccountingJournalSourceType;
    sourceAction: string;
    postedAt: Date;
  };
};

const CLIENT_CASE_STATEMENT_ACCOUNT: AccountingAccountCode = 'CLIENT_PAYABLE';
const ZERO = new Prisma.Decimal(0);

@Injectable()
export class AccountingJournalFinancialStatementProjectionService {
  constructor(private readonly prisma: PrismaService) {}

  /// <remarks>
  /// Cagrildigi yerler:
  /// - AccountingJournalFinancialStatementController.getFinancialStatement() -> GET /accounting-journal/financial-statements (Muhasebe Defteri paneli; salt okuma).
  /// - ACCT-5B service/spec contract -> read-only financial statement projection from persisted journal lines; must remain journal-derived and must not post, write, or switch legal/TBK100 authority.
  ///
  /// Müvekkil kapsamı (owner kararı 2026-10-01, S1): bir günlük satırı istenen müvekkile aittir, eğer
  ///   (a) satır o `clientId`'yi taşıyorsa, YA DA
  ///   (b) satırda `clientId` yoksa ama satır müvekkilin bu dosyadaki CaseClient kaydına (`caseClientId`) bağlıysa.
  /// Müvekkile ödeme (ClientPayout) günlük satırları ve bunların genel ters kayıtları yalnız `caseClientId` taşır
  /// (kanonik finansal bağ); yalnız `clientId` ile süzmek ödemeyi ekstreden düşürüyordu. (b) dalı yalnız EKLER:
  /// (a) ile bugüne dek görünen hiçbir satır kapsam dışına çıkmaz. Günlük verisine dokunulmaz.
  /// </remarks>
  async getClientCaseStatement(request: FinancialStatementReadRequest): Promise<FinancialStatementReadReport> {
    const normalized = normalizeRequest(request);
    const caseClientIds = await this.resolveCaseClientIds(normalized);
    const lines = (await this.prisma.accountingJournalLine.findMany({
      where: {
        tenantId: normalized.tenantId,
        accountCode: CLIENT_CASE_STATEMENT_ACCOUNT,
        currency: normalized.currency,
        caseId: normalized.scope.caseId,
        ...clientScopeFilter(normalized.scope, caseClientIds),
        journalEntry: {
          tenantId: normalized.tenantId,
          postedAt: dateRange(normalized.period.from, normalized.period.to),
        },
      },
      select: {
        lineNo: true,
        accountCode: true,
        direction: true,
        amount: true,
        currency: true,
        caseId: true,
        clientId: true,
        caseClientId: true,
        journalEntry: {
          select: {
            sourceType: true,
            sourceAction: true,
            postedAt: true,
          },
        },
      },
      orderBy: [
        { journalEntry: { postedAt: 'asc' } },
        { journalEntryId: 'asc' },
        { lineNo: 'asc' },
      ],
    })) as StatementJournalLine[];

    const movements = lines.map((line, index) => movementFromLine(line, index + 1, normalized.scope.clientId));
    const closingAmount = movements.reduce(
      (total, movement) => total.plus(signedAmount(movement.direction, movement.amount)),
      ZERO,
    );

    return {
      tenantId: normalized.tenantId,
      statementType: 'CLIENT_CASE_STATEMENT',
      surface: 'FINANCIAL_STATEMENT',
      sourceBasis: 'JOURNAL_DERIVED_PROJECTION',
      period: normalized.period,
      currency: normalized.currency,
      scope: normalized.scope,
      opening: { amount: toMoney(ZERO), currency: normalized.currency },
      movements,
      closing: { amount: toMoney(closingAmount), currency: normalized.currency },
      reconciliation: reconciliationFor(movements.length),
    };
  }

  /// <remarks>
  /// Cagrildigi yerler:
  /// - AccountingJournalFinancialStatementProjectionService.getClientCaseStatement() -> müvekkilin bu dosyadaki CaseClient kimlikleri (salt okuma).
  ///
  /// Kiracı + dosya + müvekkil üçlüsüyle süzülür; istek `caseClientId` verdiyse yalnız o kayıt, o da bu müvekkile
  /// aitse döner. Başka müvekkilin ya da başka kiracının CaseClient kaydı hiçbir zaman dönmez → `clientId`'siz
  /// satırlar başka müvekkilin ekstresine sızamaz.
  /// </remarks>
  private async resolveCaseClientIds(request: FinancialStatementReadRequest): Promise<string[]> {
    const rows = await this.prisma.caseClient.findMany({
      where: {
        caseId: request.scope.caseId,
        clientId: request.scope.clientId,
        ...(request.scope.caseClientId ? { id: request.scope.caseClientId } : {}),
        client: { tenantId: request.tenantId },
      },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }
}

/// Müvekkil kapsamı süzgeci. İlk dal bugüne dek uygulanan süzgecin aynısıdır; ikinci dal yalnız `clientId`
/// taşımayan ve müvekkilin CaseClient kaydına bağlı satırları ekler. CaseClient çözülemediyse ikinci dal kurulmaz.
function clientScopeFilter(
  scope: FinancialStatementReadRequest['scope'],
  caseClientIds: string[],
): Prisma.AccountingJournalLineWhereInput {
  const byClientId: Prisma.AccountingJournalLineWhereInput = {
    clientId: scope.clientId,
    ...(scope.caseClientId ? { caseClientId: scope.caseClientId } : {}),
  };
  if (caseClientIds.length === 0) return byClientId;

  return {
    OR: [byClientId, { clientId: null, caseClientId: { in: caseClientIds } }],
  };
}

function normalizeRequest(request: FinancialStatementReadRequest): FinancialStatementReadRequest {
  if (request.statementType !== 'CLIENT_CASE_STATEMENT') {
    throw new BadRequestException('Financial statement type is not supported.');
  }
  if (request.period.dateBasis !== 'postedAt') {
    throw new BadRequestException('Financial statement period must use postedAt date basis.');
  }

  const from = parseDate(request.period.from, 'period.from');
  const to = parseDate(request.period.to, 'period.to');
  if (from.getTime() > to.getTime()) {
    throw new BadRequestException('Financial statement period.from must be before period.to.');
  }

  return request;
}

function parseDate(value: string, field: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`Invalid financial statement ${field}.`);
  }
  return date;
}

function dateRange(from: string, to: string): Prisma.DateTimeFilter {
  return {
    gte: new Date(from),
    lte: new Date(to),
  };
}

function movementFromLine(
  line: StatementJournalLine,
  lineNo: number,
  scopeClientId: string,
): FinancialStatementMovement {
  return {
    lineNo,
    statementDate: line.journalEntry.postedAt.toISOString(),
    accountCode: line.accountCode,
    direction: line.direction,
    amount: toMoney(line.amount),
    currency: line.currency,
    caseId: line.caseId ?? '',
    // `clientId`'siz satır kapsama yalnız müvekkilin CaseClient kaydı üzerinden girer → müvekkil istekteki müvekkildir.
    clientId: line.clientId ?? scopeClientId,
    caseClientId: line.caseClientId,
    source: {
      sourceType: line.journalEntry.sourceType,
      sourceAction: line.journalEntry.sourceAction,
      displayRef: `${line.journalEntry.sourceType}:${line.journalEntry.sourceAction}`,
    },
    note: 'Journal-derived client payable movement',
  };
}

function signedAmount(direction: AccountingJournalDirection, amount: string): Prisma.Decimal {
  const value = new Prisma.Decimal(amount);
  return direction === 'CREDIT' ? value : value.negated();
}

function toMoney(amount: Prisma.Decimal): string {
  return amount.toFixed(2);
}

function reconciliationFor(movementCount: number): FinancialStatementReconciliation {
  const warningCodes: FinancialStatementWarningCode[] = [
    'DIMENSION_SCOPED_EVIDENCE',
    'NO_FX_CONVERSION',
    'LEGAL_LEDGER_COMPARISON_NOT_AUTHORITATIVE',
  ];
  if (movementCount === 0) warningCodes.unshift('TRIAL_BALANCE_REQUIRED');

  return {
    status: movementCount === 0 ? 'TRIAL_BALANCE_REQUIRED' : 'READY',
    trialBalanceEvidenceStatus: movementCount === 0 ? 'NO_LINES' : 'BALANCED',
    legalLedgerComparisonStatus: 'PENDING',
    warnings: warningCodes.map(reconciliationWarning),
  };
}

function reconciliationWarning(code: FinancialStatementWarningCode): FinancialStatementReconciliationWarning {
  return {
    code,
    message: warningMessage(code),
  };
}

function warningMessage(code: FinancialStatementWarningCode): string {
  if (code === 'TRIAL_BALANCE_REQUIRED') {
    return 'Trial Balance evidence is required before relying on the statement projection.';
  }
  if (code === 'DIMENSION_SCOPED_EVIDENCE') {
    return 'Statement projection is limited to tenant, case, client, period, and currency scope.';
  }
  if (code === 'NO_FX_CONVERSION') {
    return 'Statement projection does not perform FX conversion or reporting-currency translation.';
  }
  return 'Legal ledger comparison is reconciliation evidence, not a legal authority switch.';
}
