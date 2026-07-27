/**
 * V28 production containment regression tests.
 *
 * These tests lock down the fail-closed feature gates and ADMIN-only global
 * mutation endpoints at both metadata and real HTTP execution layers.
 *
 * @jest-environment node
 */

import { ExecutionContext, INestApplication } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AdminGuard } from '../../../auth/guards/admin.guard';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { ActionFeedbackService } from '../action-feedback.service';
import { ActionHandlerService } from '../action-handler.service';
import {
  IcrabotV28DevSurfaceGuard,
  IcrabotV28ExternalIngestGuard,
  IcrabotV28UnsafeMutationGuard,
} from '../guards/v28-surface.guard';
import {
  ICRABOT_V28_DEV_SURFACE_ENABLED,
  ICRABOT_V28_EXTERNAL_INGEST_ENABLED,
  ICRABOT_V28_UNSAFE_MUTATION_ENABLED,
  IcrabotV28SurfaceFlag,
  isIcrabotV28SurfaceEnabled,
} from '../outbox.constants';
import { OutboxService } from '../outbox.service';
import { RuleLoaderService } from '../rule-loader.service';
import { ScenarioHarnessService } from '../scenario-harness.service';
import { SeedService } from '../seed.service';
import { UyapEventIngestService } from '../uyap-event-ingest.service';
import {
  ActionFeedbackController,
  OutboxController,
  RulesController,
  ScenarioHarnessController,
  SeedController,
  UyapEventController,
} from '../v28-engine.controller';

const SURFACE_FLAGS: IcrabotV28SurfaceFlag[] = [
  ICRABOT_V28_DEV_SURFACE_ENABLED,
  ICRABOT_V28_UNSAFE_MUTATION_ENABLED,
  ICRABOT_V28_EXTERNAL_INGEST_ENABLED,
];

const originalFlags = new Map(
  SURFACE_FLAGS.map((flag) => [flag, process.env[flag]]),
);

const ingestService = {
  ingestEvent: jest.fn().mockResolvedValue({ accepted: true }),
  ingestBatch: jest.fn().mockResolvedValue({ accepted: 1 }),
};
const outboxService = {
  retryDeadAction: jest.fn().mockResolvedValue(undefined),
};
const actionHandler = {
  processPendingActions: jest.fn().mockResolvedValue(1),
  processRetryableActions: jest.fn().mockResolvedValue([]),
  executeDirectly: jest.fn().mockResolvedValue(undefined),
  dispatchBatch: jest.fn().mockResolvedValue([]),
};
const ruleLoader = {
  invalidateCache: jest.fn(),
  getActiveRules: jest.fn().mockResolvedValue([]),
  loadActivePack: jest.fn().mockResolvedValue([]),
  addRule: jest.fn().mockResolvedValue('revision-1'),
  disableRevision: jest.fn().mockResolvedValue({ disabled: true }),
  disableRule: jest.fn().mockResolvedValue(undefined),
  enableRule: jest.fn().mockResolvedValue(undefined),
  pinVersion: jest.fn().mockResolvedValue(undefined),
};
const seedService = {
  seedCase: jest.fn().mockResolvedValue({ seeded: true }),
  seedUyapEvents: jest.fn().mockResolvedValue(1),
};
const scenarioHarness = {
  listBuiltInScenarios: jest.fn().mockReturnValue([]),
  runBuiltInScenario: jest.fn().mockResolvedValue({ ok: true }),
  runAllBuiltInScenarios: jest.fn().mockResolvedValue([]),
  runScenario: jest.fn().mockResolvedValue({ ok: true }),
};
const feedbackService = {
  processCallback: jest.fn().mockResolvedValue({ processed: true }),
};

function methodGuards(
  controller: object,
  method: string,
): Array<new (...args: never[]) => unknown> {
  const prototype = (controller as { prototype: Record<string, unknown> }).prototype;
  return Reflect.getMetadata(GUARDS_METADATA, prototype[method] as object) ?? [];
}

function classGuards(
  controller: object,
): Array<new (...args: never[]) => unknown> {
  return Reflect.getMetadata(GUARDS_METADATA, controller) ?? [];
}

describe('V28 production containment feature flags', () => {
  afterEach(() => {
    for (const flag of SURFACE_FLAGS) delete process.env[flag];
  });

  it.each(SURFACE_FLAGS)('%s rejects unset and every non-exact true value', (flag) => {
    for (const value of [undefined, '', 'false', '1', 'yes', 'true-ish', ' true ']) {
      if (value === undefined) delete process.env[flag];
      else process.env[flag] = value;
      expect(isIcrabotV28SurfaceEnabled(flag)).toBe(false);
    }
  });

  it.each(SURFACE_FLAGS)('%s accepts exact true case-insensitively', (flag) => {
    for (const value of ['true', 'TRUE', 'TrUe']) {
      process.env[flag] = value;
      expect(isIcrabotV28SurfaceEnabled(flag)).toBe(true);
    }
  });
});

describe('V28 production containment guards', () => {
  const cases = [
    {
      flag: ICRABOT_V28_DEV_SURFACE_ENABLED,
      guard: new IcrabotV28DevSurfaceGuard(),
    },
    {
      flag: ICRABOT_V28_UNSAFE_MUTATION_ENABLED,
      guard: new IcrabotV28UnsafeMutationGuard(),
    },
    {
      flag: ICRABOT_V28_EXTERNAL_INGEST_ENABLED,
      guard: new IcrabotV28ExternalIngestGuard(),
    },
  ];

  afterEach(() => {
    for (const flag of SURFACE_FLAGS) delete process.env[flag];
  });

  it.each(cases)('$flag throws while disabled', ({ flag, guard }) => {
    delete process.env[flag];

    expect(() => guard.canActivate({} as ExecutionContext)).toThrow(
      'Forbidden',
    );
  });

  it.each(cases)('$flag allows only while explicitly enabled', ({ flag, guard }) => {
    process.env[flag] = 'true';

    expect(guard.canActivate({} as ExecutionContext)).toBe(true);
  });
});

describe('V28 production containment guard wiring', () => {
  it('guards every dev/test surface in the declared scope', () => {
    expect(classGuards(SeedController)).toContain(IcrabotV28DevSurfaceGuard);
    for (const method of [
      'runBuiltInScenario',
      'runAllScenarios',
      'runCustomScenario',
    ]) {
      expect(methodGuards(ScenarioHarnessController, method)).toContain(
        IcrabotV28DevSurfaceGuard,
      );
    }
  });

  it('guards every unsafe mutation surface in the declared scope', () => {
    for (const method of ['executeDirect', 'retryAction', 'dispatchBatch']) {
      expect(methodGuards(OutboxController, method)).toContain(
        IcrabotV28UnsafeMutationGuard,
      );
    }
  });

  it('guards every external ingest surface in the declared scope', () => {
    expect(classGuards(UyapEventController)).toContain(
      IcrabotV28ExternalIngestGuard,
    );
    expect(methodGuards(ActionFeedbackController, 'processCallback')).toContain(
      IcrabotV28ExternalIngestGuard,
    );
  });

  it('requires ADMIN for every global mutation surface in the declared scope', () => {
    for (const method of [
      'reloadRules',
      'addRule',
      'disableRevision',
      'disableRule',
      'enableRule',
      'pinVersion',
    ]) {
      expect(methodGuards(RulesController, method)).toContain(AdminGuard);
    }
    for (const method of ['processPending', 'processRetryable']) {
      expect(methodGuards(OutboxController, method)).toContain(AdminGuard);
    }
  });
});

describe('V28 production containment runtime HTTP behavior', () => {
  let app: INestApplication;
  let role = 'ADMIN';

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [
        UyapEventController,
        OutboxController,
        RulesController,
        SeedController,
        ScenarioHarnessController,
        ActionFeedbackController,
      ],
      providers: [
        { provide: UyapEventIngestService, useValue: ingestService },
        { provide: OutboxService, useValue: outboxService },
        { provide: ActionHandlerService, useValue: actionHandler },
        { provide: RuleLoaderService, useValue: ruleLoader },
        { provide: SeedService, useValue: seedService },
        { provide: ScenarioHarnessService, useValue: scenarioHarness },
        { provide: ActionFeedbackService, useValue: feedbackService },
        AdminGuard,
        IcrabotV28DevSurfaceGuard,
        IcrabotV28UnsafeMutationGuard,
        IcrabotV28ExternalIngestGuard,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          context.switchToHttp().getRequest().user = {
            id: 'user-1',
            tenantId: 'tenant-1',
            role,
          };
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    role = 'ADMIN';
    for (const flag of SURFACE_FLAGS) delete process.env[flag];
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
    for (const flag of SURFACE_FLAGS) {
      const original = originalFlags.get(flag);
      if (original === undefined) delete process.env[flag];
      else process.env[flag] = original;
    }
  });

  it.each([
    ['POST', '/icrabot/v28/seed/case-1', seedService.seedCase],
    ['POST', '/icrabot/v28/scenarios/run-custom', scenarioHarness.runScenario],
    ['POST', '/icrabot/v28/outbox/action-1/retry', outboxService.retryDeadAction],
    ['POST', '/icrabot/v28/outbox/execute-direct', actionHandler.executeDirectly],
    ['POST', '/icrabot/v28/outbox/dispatch-batch', actionHandler.dispatchBatch],
    ['POST', '/icrabot/v28/events', ingestService.ingestEvent],
    ['POST', '/icrabot/v28/events/batch', ingestService.ingestBatch],
    ['POST', '/icrabot/v28/feedback/callback', feedbackService.processCallback],
  ])('%s %s fails closed before its service call', async (_method, path, serviceCall) => {
    const response = await request(app.getHttpServer()).post(path).send({});

    expect(response.status).toBe(403);
    expect(response.body.message).toBe('Forbidden');
    expect(JSON.stringify(response.body)).not.toContain('ICRABOT_V28_');
    expect(serviceCall).not.toHaveBeenCalled();
  });

  it('allows the dev/test surface only when its exact flag is true', async () => {
    process.env[ICRABOT_V28_DEV_SURFACE_ENABLED] = 'TRUE';

    const response = await request(app.getHttpServer())
      .post('/icrabot/v28/scenarios/run-custom')
      .send({ name: 'bounded', events: [] });

    expect(response.status).toBe(200);
    expect(scenarioHarness.runScenario).toHaveBeenCalledTimes(1);
  });

  it('allows unsafe mutation only when its exact flag is true', async () => {
    process.env[ICRABOT_V28_UNSAFE_MUTATION_ENABLED] = 'true';

    const response = await request(app.getHttpServer())
      .post('/icrabot/v28/outbox/execute-direct')
      .send({ actionType: 'TEST', payload: {}, caseId: 'case-1' });

    expect(response.status).toBe(200);
    expect(actionHandler.executeDirectly).toHaveBeenCalledWith(
      'TEST',
      {},
      'case-1',
      { kind: 'tenant', tenantId: expect.any(String) },
    );
  });

  it('allows external ingest only when its exact flag is true', async () => {
    process.env[ICRABOT_V28_EXTERNAL_INGEST_ENABLED] = 'TrUe';

    const response = await request(app.getHttpServer())
      .post('/icrabot/v28/feedback/callback')
      .send({ case_id: 'case-1', kind: 'completed' });

    expect(response.status).toBe(200);
    expect(feedbackService.processCallback).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['/icrabot/v28/rules/reload', ruleLoader.invalidateCache],
    ['/icrabot/v28/outbox/process', actionHandler.processPendingActions],
    [
      '/icrabot/v28/outbox/process-retryable',
      actionHandler.processRetryableActions,
    ],
  ])('rejects non-admin callers at %s before service calls', async (path, serviceCall) => {
    role = 'USER';

    const response = await request(app.getHttpServer()).post(path).send({});

    expect(response.status).toBe(403);
    expect(serviceCall).not.toHaveBeenCalled();
  });

  it.each([
    ['/icrabot/v28/rules/reload', ruleLoader.invalidateCache],
    ['/icrabot/v28/outbox/process', actionHandler.processPendingActions],
    [
      '/icrabot/v28/outbox/process-retryable',
      actionHandler.processRetryableActions,
    ],
  ])('preserves ADMIN access at %s', async (path, serviceCall) => {
    const response = await request(app.getHttpServer()).post(path).send({});

    expect(response.status).toBe(200);
    expect(serviceCall).toHaveBeenCalledTimes(1);
  });
});
