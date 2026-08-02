import 'reflect-metadata';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GUARDS_METADATA, INTERCEPTORS_METADATA } from '@nestjs/common/constants';
import { lastValueFrom, of } from 'rxjs';
import { PlaybookController } from '../playbook.controller';
import {
  PLAYBOOK_ACTION_METADATA,
  PlaybookAuthorizationGuard,
} from '../playbook-authorization.guard';
import { PlaybookAuditInterceptor } from '../playbook-audit.interceptor';
import { PlaybookService } from '../playbook.service';
import { JwtAuthGuard } from '../../../../auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '../../../tenant-context/tenant-context.guard';

const ROUTES: ReadonlyArray<[string, string]> = [
  ['listPlaybooks', 'playbook.list'],
  ['getPlaybook', 'playbook.read'],
  ['enablePlaybook', 'playbook.enable'],
  ['disablePlaybook', 'playbook.disable'],
  ['pausePlaybook', 'playbook.pause'],
  ['resumePlaybook', 'playbook.resume'],
  ['changeMode', 'playbook.changeMode'],
  ['runPlaybook', 'playbook.run'],
  ['evaluatePlaybook', 'playbook.evaluate'],
  ['getAudit', 'playbook.audit.read'],
  ['exportAudit', 'playbook.audit.export'],
  ['getHealth', 'playbook.health'],
];

const tenantContext = {
  tenantId: 'tenant-a',
  actor: { id: 'actor-a', type: 'USER' as const },
  authType: 'JWT' as const,
  scopes: Object.freeze([] as string[]),
  resolvedAt: '2026-08-02T00:00:00.000Z',
  correlationId: 'corr-a',
};

function makePlaybookService(playbooks: any[]): PlaybookService {
  const registry = {
    getAllPlaybooks: () => playbooks,
    getPlaybook: (id: string) => playbooks.find((playbook) => playbook.id === id),
  };
  return new PlaybookService(
    registry as any,
    { findMatch: jest.fn() } as any,
    { execute: jest.fn() } as any,
    { checkPolicy: jest.fn() } as any,
    { getActiveLeases: jest.fn().mockReturnValue([]) } as any,
    {
      createExecutionEntry: jest.fn().mockReturnValue({ id: 'audit-1' }),
      getExecutionHistory: jest.fn().mockReturnValue([]),
      exportExecutionLogs: jest.fn().mockReturnValue([]),
    } as any,
    { getMetrics: jest.fn().mockReturnValue({ summary: { totalExecutions: 0 }, executions: [] }) } as any,
    { getStats: jest.fn().mockReturnValue({ deadLetter: 0 }) } as any,
    { getStats: jest.fn().mockReturnValue({ pending: 0, executedLast24h: 0 }) } as any,
    { getIncident: jest.fn() } as any,
  );
}

function executionContext(request: Record<string, unknown>): ExecutionContext {
  const handler = jest.fn();
  const controller = jest.fn();
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => controller,
  } as unknown as ExecutionContext;
}

describe('RBR-R01-T07 Playbook authorization boundary', () => {
  it('materializes all twelve T06 actions and class-level guard/interceptor wiring', () => {
    for (const [method, action] of ROUTES) {
      expect(
        (Reflect as any).getMetadata(
          PLAYBOOK_ACTION_METADATA,
          (PlaybookController.prototype as any)[method],
        ),
      ).toBe(action);
    }

    const guards = Reflect.getMetadata(GUARDS_METADATA, PlaybookController);
    const interceptors = Reflect.getMetadata(INTERCEPTORS_METADATA, PlaybookController);
    expect(guards).toEqual([JwtAuthGuard, TenantContextGuard, PlaybookAuthorizationGuard]);
    expect(interceptors).toEqual([PlaybookAuditInterceptor]);
  });

  it('uses canonical tenant/actor context and ignores spoofed headers', async () => {
    const assertBridgeAdmin = jest.fn().mockResolvedValue(undefined);
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue('playbook.enable'),
    } as unknown as Reflector;
    const guard = new PlaybookAuthorizationGuard(
      reflector,
      { assertBridgeAdmin } as any,
    );
    const request = {
      tenantContext,
      user: { role: 'ADMIN' },
      headers: { 'x-tenant-id': 'attacker-tenant', 'x-user-id': 'attacker-user' },
      params: { id: 'pb-1' },
      originalUrl: '/calc/diagnostics/playbooks/pb-1/enable',
    };

    await expect(guard.canActivate(executionContext(request))).resolves.toBe(true);
    expect(assertBridgeAdmin).toHaveBeenCalledWith('playbook.enable', {
      tenantId: 'tenant-a',
      actorUserId: 'actor-a',
      role: 'ADMIN',
      entityId: 'pb-1',
      requestPath: '/calc/diagnostics/playbooks/pb-1/enable',
    });
  });

  it('fails closed without canonical tenant/actor context', async () => {
    const guard = new PlaybookAuthorizationGuard(
      { getAllAndOverride: jest.fn().mockReturnValue('playbook.read') } as any,
      { assertBridgeAdmin: jest.fn() } as any,
    );

    await expect(
      guard.canActivate(executionContext({ headers: {}, user: { role: 'ADMIN' } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      guard.canActivate(executionContext({
        headers: {},
        tenantContext: { ...tenantContext, actor: undefined },
        user: { role: 'ADMIN' },
      })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('delegates unauthorized actions to the existing action-level gate', async () => {
    const assertBridgeAdmin = jest
      .fn()
      .mockRejectedValue(new Error('PERMISSION_DENIED'));
    const guard = new PlaybookAuthorizationGuard(
      { getAllAndOverride: jest.fn().mockReturnValue('playbook.run') } as any,
      { assertBridgeAdmin } as any,
    );
    const request = { tenantContext, user: { role: 'USER' }, headers: {} };

    await expect(guard.canActivate(executionContext(request))).rejects.toThrow(
      'PERMISSION_DENIED',
    );
    expect(assertBridgeAdmin).toHaveBeenCalledWith(
      'playbook.run',
      expect.objectContaining({ tenantId: 'tenant-a', actorUserId: 'actor-a', role: 'USER' }),
    );
  });

  it('attributes successful endpoint outcomes to the verified actor and tenant', async () => {
    const log = jest.fn().mockResolvedValue(undefined);
    const interceptor = new PlaybookAuditInterceptor(
      { log } as any,
      { getAllAndOverride: jest.fn() } as any,
    );
    const request = {
      tenantContext,
      playbookAction: 'playbook.audit.export',
      method: 'GET',
      originalUrl: '/calc/diagnostics/playbooks/pb-1/audit/export',
      params: { id: 'pb-1' },
    };

    await lastValueFrom(
      interceptor.intercept(executionContext(request), {
        handle: () => of({ ok: true }),
      }),
    );
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        userId: 'actor-a',
        actorType: 'USER',
        decisionResult: 'SUCCESS',
        entityId: 'pb-1',
        correlationId: 'corr-a',
        metadata: expect.objectContaining({
          action: 'playbook.audit.export',
          tenantId: 'tenant-a',
          actorId: 'actor-a',
          outcome: 'SUCCESS',
        }),
      }),
    );
  });

  it('enforces tenant ownership in service lookups and mutations', async () => {
    const scoped = {
      id: 'pb-scoped',
      version: '1',
      name: 'Scoped',
      description: '',
      match: { incidentType: 'HIGH_ERROR_RATE', severity: [], tenantScope: 'tenant-a' },
      priority: 1,
      dryRun: true,
      actions: [],
    };
    const service = makePlaybookService([scoped]);

    const visible = await service.listPlaybooks({ tenantId: 'tenant-a' });
    const hidden = await service.listPlaybooks({ tenantId: 'tenant-b' });
    expect(visible.total).toBe(1);
    expect(hidden.total).toBe(0);
    await expect(service.getPlaybook('pb-scoped', 'tenant-b')).resolves.toBeNull();
    await expect(
      service.enablePlaybook('pb-scoped', { tenantId: 'tenant-b', userId: 'actor-b' }),
    ).rejects.toThrow('outside the authenticated tenant');
  });
});
