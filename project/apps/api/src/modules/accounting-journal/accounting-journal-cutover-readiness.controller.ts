import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminGuard } from '../auth/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountingJournalCutoverReadinessService } from './accounting-journal-cutover-readiness.service';
import type {
  AccountingJournalCutoverReadinessFilters,
  AccountingJournalCutoverReadinessReport,
} from './accounting-journal-cutover-readiness.types';

type QueryValue = string | string[] | undefined;

interface AccountingJournalCutoverReadinessQuery {
  tenantId?: QueryValue;
  currency?: QueryValue;
  caseId?: QueryValue;
  postedFrom?: QueryValue;
  postedTo?: QueryValue;
}

@Controller('accounting-journal')
@UseGuards(JwtAuthGuard)
export class AccountingJournalCutoverReadinessController {
  constructor(private readonly readiness: AccountingJournalCutoverReadinessService) {}

  /// <remarks>
  /// Cagrildigi yerler:
  /// - HTTP GET /accounting-journal/cutover-readiness (admin-only read-only Primary SoT cutover gate).
  /// - AccountingJournalCutoverReadinessService.getCutoverReadiness() -> Trial Balance + Legal Shadow Compare evidence aggregation.
  /// </remarks>
  @Get('cutover-readiness')
  @UseGuards(AdminGuard)
  async getCutoverReadiness(
    @CurrentUser('tenantId') tenantId: string,
    @Query() query: AccountingJournalCutoverReadinessQuery = {},
  ): Promise<AccountingJournalCutoverReadinessReport> {
    return this.readiness.getCutoverReadiness(buildCutoverReadinessFilters(tenantId, query));
  }
}

function buildCutoverReadinessFilters(
  tenantId: string,
  query: AccountingJournalCutoverReadinessQuery,
): AccountingJournalCutoverReadinessFilters {
  const currency = queryString('currency', query.currency);
  const caseId = queryString('caseId', query.caseId);
  const postedFrom = dateQuery('postedFrom', query.postedFrom);
  const postedTo = dateQuery('postedTo', query.postedTo);

  return {
    tenantId,
    ...(currency ? { currency } : {}),
    ...(caseId ? { caseId } : {}),
    ...(postedFrom ? { postedFrom } : {}),
    ...(postedTo ? { postedTo } : {}),
  };
}

function queryString(field: string, value: QueryValue): string | undefined {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) {
    throw new BadRequestException(`${field} must be a single query value.`);
  }
  if (value.trim().length === 0) {
    throw new BadRequestException(`${field} must not be empty.`);
  }
  return value;
}

function dateQuery(field: 'postedFrom' | 'postedTo', value: QueryValue): string | undefined {
  const candidate = queryString(field, value);
  if (candidate === undefined) return undefined;

  const date = new Date(candidate);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`${field} must be a valid ISO date or Date.`);
  }
  return date.toISOString();
}
