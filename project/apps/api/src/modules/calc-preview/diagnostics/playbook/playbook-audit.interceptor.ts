import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditService } from '../../../audit/audit.service';
import { TenantContext } from '../../tenant-context/tenant-context.types';
import { PLAYBOOK_ACTION_METADATA } from './playbook-authorization.guard';

/** Records the canonical actor/tenant and endpoint outcome after authorization. */
@Injectable()
export class PlaybookAuditInterceptor implements NestInterceptor {
  constructor(
    private readonly audit: AuditService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Record<string, any>>();
    const tenantContext = request.tenantContext as TenantContext | undefined;
    const action =
      request.playbookAction ??
      this.reflector.getAllAndOverride<string>(PLAYBOOK_ACTION_METADATA, [
        context.getHandler(),
        context.getClass(),
      ]);

    return next.handle().pipe(
      tap({
        next: (response: unknown) => {
          void this.record(tenantContext, request, action, 'SUCCESS', response);
        },
        error: (error: unknown) => {
          void this.record(tenantContext, request, action, 'FAILURE', undefined, error);
        },
      }),
    );
  }

  private async record(
    tenantContext: TenantContext | undefined,
    request: Record<string, any>,
    action: string | undefined,
    outcome: 'SUCCESS' | 'FAILURE',
    response?: unknown,
    error?: unknown,
  ): Promise<void> {
    if (!tenantContext?.tenantId || !tenantContext.actor?.id || !action) return;

    const resourceId = request.params?.id ?? action;
    await this.audit.log({
      tenantId: tenantContext.tenantId,
      action: 'PLAYBOOK_ACTION',
      entityType: 'PLAYBOOK_ENDPOINT',
      entityId: resourceId,
      userId: tenantContext.actor.id,
      actorType: tenantContext.actor.type === 'USER' ? 'USER' : 'SYSTEM',
      decisionResult: outcome,
      correlationId: tenantContext.correlationId,
      metadata: {
        event: 'PLAYBOOK_AUTHORIZATION',
        action,
        actorId: tenantContext.actor.id,
        tenantId: tenantContext.tenantId,
        resourceId,
        requestMethod: request.method,
        requestPath: request.originalUrl ?? request.url,
        outcome,
        statusCode: error && typeof error === 'object' && 'status' in error
          ? (error as { status?: number }).status
          : 200,
        responsePresent: response !== undefined,
        requestedMode: request.body?.mode,
        requestedScope: request.body?.scope,
        previousState: this.stateSummary(response, 'previousState'),
        resultingState: this.stateSummary(response, 'newState'),
      },
    });
  }

  private stateSummary(
    response: unknown,
    key: 'previousState' | 'newState',
  ): Record<string, unknown> | undefined {
    if (!response || typeof response !== 'object') return undefined;
    const state = (response as Record<string, unknown>)[key];
    if (!state || typeof state !== 'object') return undefined;
    const value = state as Record<string, unknown>;
    return {
      enabled: value.enabled,
      mode: value.mode,
      state: value.state,
    };
  }
}
