import { INestApplication, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AutomationController } from '../automation.controller';
import { AutomationService } from '../automation.service';
import { WorkflowEngine } from '../workflow-engine.service';

describe('Manual automation HTTP completion must not swallow workflow exceptions', () => {
  let app: INestApplication;
  const engine = new WorkflowEngine({ case: { findFirst: jest.fn() } } as any, {} as any, {} as any);
  const service = new AutomationService({} as any, engine, {} as any, {} as any, {} as any);
  const build = jest.spyOn(engine, 'buildContext');
  const execute = jest.spyOn(engine as any, 'executeRule');
  const prisma = (engine as any).prisma;
  const rules = (engine as any).ruleEngine;
  const context = { tenantId: 'tenant', caseId: 'case' };
  const process = () => request(app.getHttpServer()).post('/automation/cases/case/process').send({});

  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [AutomationController], providers: [
      { provide: AutomationService, useValue: service }, { provide: WorkflowEngine, useValue: engine },
    ] }).overrideGuard(JwtAuthGuard).useValue({ canActivate: (ctx: any) => {
      ctx.switchToHttp().getRequest().user = { tenantId: 'tenant', id: 'actor' };
      return true;
    } }).compile();
    app = module.createNestApplication();
    app.useLogger(false);
    await app.init();
    jest.spyOn((engine as any).logger, 'error').mockImplementation(() => {});
  });
  afterAll(async () => { await app?.close(); jest.restoreAllMocks(); });
  beforeEach(() => {
    build.mockReset().mockResolvedValue(context as any);
    execute.mockReset().mockResolvedValue(undefined);
    prisma.case.findFirst.mockReset().mockResolvedValue({ isAutoMode: true, debtors: [], formType: null });
    rules.evaluateRules = jest.fn().mockResolvedValue([]);
    rules.checkNotificationExpiry = jest.fn().mockResolvedValue(null);
  });

  it('normal completion retains its response and actor tenant', async () => {
    const result = await process().expect(201);
    expect(result.body).toEqual({ success: true, message: 'Case processed' });
    expect(build).toHaveBeenCalledWith('case', 'tenant');
  });
  it('foreign/missing case fails as 404 without rule execution', async () => {
    build.mockRejectedValue(new NotFoundException('Dosya bulunamadı'));
    const result = await process().expect(404);
    expect(result.body.success).toBeUndefined();
    expect(execute).not.toHaveBeenCalled();
  });
  it('unexpected workflow failure is 500 without false success or internal detail', async () => {
    rules.evaluateRules.mockRejectedValue(new Error('private database detail'));
    const result = await process().expect(500);
    expect(result.body.success).toBeUndefined();
    expect(JSON.stringify(result.body)).not.toContain('private database detail');
    expect(execute).not.toHaveBeenCalled();
  });
  it('failure after an earlier rule does not claim completion or retry committed work', async () => {
    rules.evaluateRules.mockResolvedValue([{ action: 'A', shouldTrigger: true }, { action: 'B', shouldTrigger: true }]);
    execute.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('second rule failed'));
    const result = await process().expect(500);
    expect(result.body.success).toBeUndefined();
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls.map(call => (call[1] as any).action)).toEqual(['A', 'B']);
  });
  it('cron callers retain per-case error isolation by default', async () => {
    build.mockRejectedValue(new Error('isolated cron failure'));
    await expect(engine.processCase('case', 'tenant')).resolves.toBeUndefined();
    expect(execute).not.toHaveBeenCalled();
  });
});
