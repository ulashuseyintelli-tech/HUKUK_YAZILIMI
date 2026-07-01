import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminGuard } from '../auth/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountingJournalFinancialStatementProjectionService } from './accounting-journal-financial-statement.projection.service';
import type {
  FinancialStatementDateBasis,
  FinancialStatementReadReport,
  FinancialStatementReadRequest,
  FinancialStatementType,
} from './accounting-journal-financial-statement.types';

type QueryValue = string | string[] | undefined;

interface FinancialStatementQuery {
  tenantId?: QueryValue;
  statementType?: QueryValue;
  from?: QueryValue;
  to?: QueryValue;
  dateBasis?: QueryValue;
  currency?: QueryValue;
  caseId?: QueryValue;
  clientId?: QueryValue;
  caseClientId?: QueryValue;
}

const STATEMENT_TYPES: readonly FinancialStatementType[] = ['CLIENT_CASE_STATEMENT'];
const DATE_BASIS: readonly FinancialStatementDateBasis[] = ['postedAt'];

@Controller('accounting-journal')
@UseGuards(JwtAuthGuard)
export class AccountingJournalFinancialStatementController {
  constructor(private readonly projection: AccountingJournalFinancialStatementProjectionService) {}

  /// <remarks>
  /// Cagrildigi yerler:
  /// - AccountingJournalFinancialStatementController.getFinancialStatement() -> GET /accounting-journal/financial-statements (read-only Financial Statement HTTP boundary).
  /// - AccountingJournalFinancialStatementProjectionService.getClientCaseStatement() -> journal-derived projection reader, no posting/writer/legal-ledger/TBK100 behavior.
  /// </remarks>
  @Get('financial-statements')
  @UseGuards(AdminGuard)
  async getFinancialStatement(
    @CurrentUser('tenantId') tenantId: string,
    @Query() query: FinancialStatementQuery = {},
  ): Promise<FinancialStatementReadReport> {
    return this.projection.getClientCaseStatement(buildFinancialStatementRequest(tenantId, query));
  }
}

function buildFinancialStatementRequest(
  tenantId: string,
  query: FinancialStatementQuery,
): FinancialStatementReadRequest {
  return {
    tenantId,
    statementType: enumQuery('statementType', query.statementType, STATEMENT_TYPES),
    period: {
      from: dateQuery('from', query.from),
      to: dateQuery('to', query.to),
      dateBasis: enumQuery('dateBasis', query.dateBasis, DATE_BASIS),
    },
    currency: requiredQueryString('currency', query.currency),
    scope: {
      caseId: requiredQueryString('caseId', query.caseId),
      clientId: requiredQueryString('clientId', query.clientId),
      caseClientId: optionalQueryString('caseClientId', query.caseClientId) ?? null,
    },
  };
}

function optionalQueryString(field: string, value: QueryValue): string | undefined {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) {
    throw new BadRequestException(`${field} must be a single query value.`);
  }
  if (value.trim().length === 0) {
    throw new BadRequestException(`${field} must not be empty.`);
  }
  return value;
}

function requiredQueryString(field: string, value: QueryValue): string {
  const candidate = optionalQueryString(field, value);
  if (candidate === undefined) {
    throw new BadRequestException(`${field} is required.`);
  }
  return candidate;
}

function enumQuery<T extends string>(
  field: string,
  value: QueryValue,
  allowedValues: readonly T[],
): T {
  const candidate = requiredQueryString(field, value);
  if (!allowedValues.includes(candidate as T)) {
    throw new BadRequestException(`${field} must be one of: ${allowedValues.join(', ')}.`);
  }
  return candidate as T;
}

function dateQuery(field: 'from' | 'to', value: QueryValue): string {
  const candidate = requiredQueryString(field, value);
  const date = new Date(candidate);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`${field} must be a valid ISO date or Date.`);
  }
  return date.toISOString();
}
