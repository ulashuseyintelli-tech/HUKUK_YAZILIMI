/**
 * W3-F01-OUTBOX-WEBHOOK-HANDLER-MODEL-CONTRACT-R01.
 *
 * 'webhook' action tipi canonical bir yetenek olarak KABUL EDILMEDI (bkz. brief
 * karar gerekcesi: aktif/test rule-pack uretmiyor + handler gercek HTTP cagrisi
 * hic yapmadan kosulsuz status:'sent' yaziyordu — CAN-P0-001'deki send_email/
 * send_sms "fake-sent" deseninin ayni ornegi). Bu dosya iki bagimsiz kaniti
 * DB-free olarak dogrular:
 *
 *   [A] ActionHandlerService — 'webhook' handler'i ARTIK KAYITLI DEGIL.
 *   [B] EngineRunnerService  — 'action: webhook' iceren bir kural, outbox'a
 *       HICBIR satir yazdirmadan reddedilir; AYNI kuralin/decision'in diger
 *       action'lari (blast-radius) etkilenmeden calismaya devam eder.
 *
 * [B] kanitlanmadan sadece [A] yeterli DEGILDIR: handler'i kaldirmak tek basina
 * dispatch()'i "No handler for action type" ile SONSUZA KADAR pending birakirdi
 * (claim hic alinmadigi icin markFailed/dead-letter yoluna da girmez) — W3-D09
 * deseninin aynisi. Producer-side red bunu onler.
 */
import { ActionHandlerService } from '../action-handler.service';
import { EngineRunnerService, RuleDefinition } from '../engine-runner.service';

describe('W3-F01 — webhook action handler kaldirildi, producer reddeder', () => {
  describe('[A] ActionHandlerService', () => {
    it("'webhook' handler'i registry'de KAYITLI DEGIL", () => {
      const prisma: any = {};
      const outbox: any = { markFailed: jest.fn(), markDeadLetter: jest.fn() };
      const timeline: any = { addEntry: jest.fn() };
      const factStore: any = {};

      const svc = new ActionHandlerService(prisma, outbox, timeline, factStore);
      const handlers: Map<string, unknown> = (svc as any).handlers;

      expect(handlers.has('webhook')).toBe(false);
      // Regresyon negatifi: diger 12 bilinen action tipi ETKILENMEDI.
      for (const known of [
        'open_lock',
        'release_lock',
        'enqueue',
        'send_email',
        'send_sms',
        'send_notification',
        'uyap_submit',
        'update_case_status',
        'create_task',
        'set_fact',
        'set_flag',
        'batch_set_facts',
      ]) {
        expect(handlers.has(known)).toBe(true);
      }
    });
  });

  describe('[B] EngineRunnerService — producer-side red', () => {
    function buildRunner() {
      const prisma: any = {
        icrabotEngineRun: {
          create: jest.fn(async () => ({ id: 'run-1' })),
          update: jest.fn(async () => ({})),
        },
      };
      const factStore: any = {
        getSnapshot: jest.fn(async () => ({ facts: {}, flags: {} })),
        write: jest.fn(async () => undefined),
      };
      const timeline: any = { addEntry: jest.fn() };
      const outbox: any = { createAction: jest.fn(async () => 'action-1') };
      const evaluator: any = {
        checkWhen: jest.fn(() => true),
        evalExpr: jest.fn(() => true),
        explainDecision: jest.fn(() => 'because matched'),
        renderTemplate: jest.fn((v: unknown) => v),
      };
      const computeRegistry: any = { run: jest.fn() };

      const runner = new EngineRunnerService(
        prisma,
        factStore,
        timeline,
        outbox,
        evaluator,
        computeRegistry,
      );
      return { runner, prisma, timeline, outbox };
    }

    const rule: RuleDefinition = {
      rule_id: 'w3-f01-webhook-rejection-test',
      then: {
        decisions: [
          {
            if: 'true',
            then: [
              { action: 'webhook', payload: { url: 'https://example.invalid/hook' } },
              { action: 'enqueue', payload: { queue: 'settlement_offer' } },
            ],
          },
        ],
      },
    };

    it("'action: webhook' icin outbox'a HICBIR satir yazilmaz; kardes action ETKILENMEZ", async () => {
      const { runner, timeline, outbox } = buildRunner();

      const result = await runner.runForEvent('case-1', { event_id: 'evt-1' }, rule, 'tenant-1');

      // outbox.createAction TAM OLARAK 1 kez cagrildi — sadece 'enqueue' icin.
      expect(outbox.createAction).toHaveBeenCalledTimes(1);
      expect(outbox.createAction).toHaveBeenCalledWith(
        expect.objectContaining({ actionType: 'enqueue' }),
      );
      expect(outbox.createAction).not.toHaveBeenCalledWith(
        expect.objectContaining({ actionType: 'webhook' }),
      );

      // Kardes action hala calisti (blast-radius containment).
      expect(result.matched).toBe(true);
      expect(result.actionsCreated).toBe(1);

      // Red, gozlemlenebilir bir timeline kaydi birakti.
      const rejectionEntry = timeline.addEntry.mock.calls
        .map((c: any[]) => c[0])
        .find((e: any) => typeof e.title === 'string' && e.title.includes('rejected'));
      expect(rejectionEntry).toBeDefined();
      expect(rejectionEntry.severity).toBe('critical');
      expect(rejectionEntry.caseId).toBe('case-1');
      expect(rejectionEntry.tenantId).toBe('tenant-1');
    });

    it("TEK action 'webhook' olan bir kural, sifir outbox satiriyla basariyla TAMAMLANIR (crash yok)", async () => {
      const { runner, outbox } = buildRunner();
      const onlyWebhookRule: RuleDefinition = {
        rule_id: 'w3-f01-webhook-only-test',
        then: {
          decisions: [{ if: 'true', then: [{ action: 'webhook', payload: { url: 'https://x.invalid' } }] }],
        },
      };

      const result = await runner.runForEvent('case-2', { event_id: 'evt-2' }, onlyWebhookRule, 'tenant-1');

      expect(outbox.createAction).not.toHaveBeenCalled();
      expect(result.matched).toBe(true);
      expect(result.actionsCreated).toBe(0);
    });
  });
});
