/**
 * CpeRequired Guard
 * 
 * @CpeRequired decorator ile işaretlenmiş endpoint'lerde
 * CPE.canPerformAction kontrolü yapar.
 * 
 * Aksiyon izin verilmezse ForbiddenException fırlatır.
 * 
 * @see design.md - @CpeRequired Decorator and Interceptor
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../../prisma/prisma.service';
import { CasePolicyEngine } from '../case-policy-engine.service';
import { ActionCode } from '../types/action-code.enum';
import { ActionContext } from '../types/policy-decision.interface';
import { getResolverFailureMode } from '../types/action-matrix.interface';
import {
  CPE_ACTION_CODE_KEY,
  CPE_SCOPE_RESOLVER_KEY,
  CPE_CASE_ID_RESOLVER_KEY,
  CPE_CASE_ID_FROM_EXPENSE_PARAM_KEY,
  ScopeResolverFn,
  CaseIdResolverFn,
  defaultCaseIdResolver,
} from './cpe-required.decorator';

@Injectable()
export class CpeRequiredGuard implements CanActivate {
  private readonly logger = new Logger(CpeRequiredGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly cpe: CasePolicyEngine,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Get metadata from decorator
    const actionCode = this.reflector.get<ActionCode>(
      CPE_ACTION_CODE_KEY,
      context.getHandler(),
    );

    // If no @CpeRequired decorator, allow
    if (!actionCode) {
      return true;
    }

    const scopeResolver = this.reflector.get<ScopeResolverFn>(
      CPE_SCOPE_RESOLVER_KEY,
      context.getHandler(),
    );

    const caseIdResolver = this.reflector.get<CaseIdResolverFn>(
      CPE_CASE_ID_RESOLVER_KEY,
      context.getHandler(),
    ) || defaultCaseIdResolver;

    const caseIdFromExpenseParam = this.reflector.get<boolean>(
      CPE_CASE_ID_FROM_EXPENSE_PARAM_KEY,
      context.getHandler(),
    );

    const request = context.switchToHttp().getRequest();

    let caseId: string;
    let actionContext: ActionContext | undefined;

    if (caseIdFromExpenseParam) {
      // P1b: caseId'yi expense ':id' param'ından TENANT-SCOPED çöz.
      // Cross-tenant sızıntıyı önlemek için lookup mutlaka req.user.tenantId ile sınırlıdır;
      // expense yoksa / tenant uyuşmuyorsa fail-closed (CPE çağrılmaz).
      const expenseId: string | undefined = request.params?.id;
      const tenantId: string | undefined = request.user?.tenantId;

      if (!expenseId || !tenantId) {
        this.logger.warn(
          `CpeRequired: expense/tenant resolve edilemedi for ${actionCode} (expenseId=${expenseId}, tenant=${!!tenantId})`,
        );
        throw new ForbiddenException({
          code: 'RESOLVER_ERROR_BLOCKED',
          reason: 'Masraf veya tenant bilgisi çözümlenemedi - güvenlik nedeniyle işlem engellendi',
          actionCode,
        });
      }

      const expense = await this.prisma.expenseRequest.findFirst({
        where: { id: expenseId, tenantId },
        select: { caseId: true },
      });

      if (!expense) {
        this.logger.warn(
          `CpeRequired: expense ${expenseId} not found in tenant ${tenantId} for ${actionCode}`,
        );
        throw new ForbiddenException({
          code: 'RESOLVER_ERROR_BLOCKED',
          reason: 'Masraf talebi bulunamadı veya bu işlem için yetkiniz yok',
          actionCode,
        });
      }

      caseId = expense.caseId;
      actionContext = { expenseId };
    } else {
      // Mevcut davranış (DEĞİŞMEDİ): senkron caseId + scope resolver
      caseId = caseIdResolver(request);
      if (!caseId) {
        this.logger.warn(`CpeRequired: No caseId found for ${actionCode}`);
        throw new ForbiddenException({
          code: 'MISSING_CASE_ID',
          reason: 'Dosya ID bulunamadı',
          actionCode,
        });
      }

      // Resolve context with error handling
      try {
        actionContext = scopeResolver ? scopeResolver(request) : undefined;
      } catch (resolverError) {
        // Check resolverFailureMode from matrix
        const failureMode = getResolverFailureMode(actionCode);
        this.logger.error(
          `ScopeResolver error for ${actionCode}: ${resolverError}`,
        );

        if (failureMode === 'FAIL_CLOSED') {
          throw new ForbiddenException({
            code: 'RESOLVER_ERROR_BLOCKED',
            reason: 'Context çözümlenemedi - güvenlik nedeniyle işlem engellendi',
            actionCode,
          });
        }

        // FAIL_OPEN: continue with undefined context + warning
        this.logger.warn(
          `ScopeResolver failed for ${actionCode}, continuing with undefined context (FAIL_OPEN)`,
        );
        actionContext = undefined;
      }
    }

    // Call CPE
    const decision = await this.cpe.canPerformAction(
      caseId,
      actionCode,
      actionContext,
    );

    if (!decision.allowed) {
      this.logger.log(
        `CpeRequired: Action ${actionCode} denied for case ${caseId}: ${decision.reason}`,
      );

      throw new ForbiddenException({
        code: decision.code,
        reason: decision.reason,
        blockedBy: decision.blockedBy,
        decisionId: decision.decisionId,
        traceId: decision.traceId,
      });
    }

    // Attach decision to request for logging/tracing
    request.policyDecision = decision;

    // Log warnings if any
    if (decision.warnings && decision.warnings.length > 0) {
      this.logger.warn(
        `CpeRequired: Action ${actionCode} allowed with warnings for case ${caseId}`,
        decision.warnings,
      );
    }

    return true;
  }
}
