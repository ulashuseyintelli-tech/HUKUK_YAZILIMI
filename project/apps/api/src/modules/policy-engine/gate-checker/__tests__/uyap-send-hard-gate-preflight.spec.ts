/**
 * UYAP-SEND-HARD-GATE-PREFLIGHT-R02 — UYAP_SEND hard-gate onkosul kanit matrisi
 *
 * Owner kurali (GLOBAL FAIL-CLOSED): asagidakilerin HICBIRI izin uretemez —
 * undefined, null, provider exception, missing case, missing tenant, missing actor,
 * missing fact, default assumption, legacy/manual flag, client-provided authority data.
 *
 * Repository'de bulunan FAIL-OPEN sinifi (bu PR ile kapatilan):
 *  - CASE_CLOSED / CASE_ARCHIVED yalniz `=== true` ile bloklar → fact yoksa GECER.
 *  - UYAP_DISABLED yalniz `=== false` ile bloklar → fact yoksa GECER.
 *  - EXPENSE_BLOCKING yalniz `=== true` ile bloklar → provider yoksa GECER.
 *  - UYAP_TEMPORARILY_UNAVAILABLE_SEND yalniz `=== false` ile bloklar; ustelik
 *    `UyapAvailabilityService` env tanimsizken `true` (available) donuyordu.
 *
 * Cozum: mevcut gate'lerin semantigi DEGISTIRILMEDI (diger action'larda regresyon yok);
 * yalniz UYAP_SEND'e POZITIF ISPAT isteyen yeni bir HARD gate eklendi.
 *
 * Test seviyesi: gate-checker + saf servis birimleri (DB/Nest container yok).
 */
import { GateCheckerService } from '../gate-checker.service';
import { COMPILED_GATES, getGatesForAction } from '../compiled/gates.compiled';
import { ActionCode } from '../../types/action-code.enum';
import type { FactMap, FactValue } from '../../fact-store';
import {
  UYAP_AVAILABILITY_ENV,
  UyapAvailabilityService,
} from '../../fact-store/uyap-availability.service';
import { ComputedFactRegistry } from '../../fact-store/computed-fact-registry';

const PREFLIGHT_GATE = 'UYAP_SEND_PRECONDITIONS_UNPROVEN';

/** UYAP_SEND'in gecmesi icin POZITIF olarak kanitlanmasi gereken fact'ler. */
const REQUIRED_PROOF_FACTS: Record<string, FactValue> = {
  'case.is_closed': false,
  'case.is_archived': false,
  'case.allow_uyap_actions': true,
  'case.has_unpaid_blocking_expense': false,
  'system.uyap_available': true,
  'system.uyap_availability_explicit': true,
};

/** I04 authority zinciri — bu PR'in konusu degil, baseline'i yesil tutmak icin. */
const AUTHORITY_FACTS: Record<string, FactValue> = {
  'actor.is_canonical_lawyer': true,
  'actor.has_matching_power_of_attorney': true,
  'poa.is_effective_at_evaluation_time': true,
  'poa.covers_requested_operation': true,
  'authority.is_unambiguous': true,
};

const baselineFacts = (): FactMap =>
  new Map<string, FactValue>(
    Object.entries({ ...REQUIRED_PROOF_FACTS, ...AUTHORITY_FACTS }),
  );

describe('UYAP-SEND-HARD-GATE-PREFLIGHT-R02', () => {
  let gateChecker: GateCheckerService;

  beforeEach(() => {
    gateChecker = new GateCheckerService();
  });

  // ==========================================================================
  // 1) GATE INVENTORY — UYAP_SEND icin uygulanan gate'lerin behaviour-lock'u
  // ==========================================================================
  describe('Gate envanteri (UYAP_SEND)', () => {
    it('UYAP_SEND icin uygulanan gate kumesi tam olarak bilinen listedir', () => {
      const codes = getGatesForAction(ActionCode.UYAP_SEND)
        .map((g) => g.gateCode)
        .sort();

      // Yeni bir gate eklenirse bu envanter BILINCLI olarak guncellenmelidir.
      expect(codes).toEqual(
        [
          'CASE_ARCHIVED',
          'CASE_CLOSED',
          'EXPENSE_BLOCKING',
          'POWER_OF_ATTORNEY_MISSING',
          'UYAP_DISABLED',
          'UYAP_SEND_PRECONDITIONS_UNPROVEN',
          'UYAP_TEMPORARILY_UNAVAILABLE_SEND',
        ].sort(),
      );
    });

    it('UYAP_SEND icin uygulanan TUM gate\'ler HARD severity tasir', () => {
      const soft = getGatesForAction(ActionCode.UYAP_SEND).filter(
        (g) => g.severity !== 'HARD',
      );
      expect(soft.map((g) => g.gateCode)).toEqual([]);
    });

    it('preflight gate yalniz UYAP_SEND\'e uygulanir (scope siniri)', () => {
      const gate = COMPILED_GATES.find((g) => g.gateCode === PREFLIGHT_GATE);
      expect(gate).toBeDefined();
      expect(gate?.severity).toBe('HARD');
      expect(gate?.actionCodes).toEqual([ActionCode.UYAP_SEND]);
    });

    it('preflight gate, ondan ONCE calisan gate\'lerin mesajini bastirmaz (priority > 12)', () => {
      const gate = COMPILED_GATES.find((g) => g.gateCode === PREFLIGHT_GATE);
      const outage = COMPILED_GATES.find(
        (g) => g.gateCode === 'UYAP_TEMPORARILY_UNAVAILABLE_SEND',
      );
      expect(gate!.priority).toBeGreaterThan(outage!.priority);
    });
  });

  // ==========================================================================
  // 2) POZITIF ISPAT MATRISI
  // ==========================================================================
  describe('Pozitif ispat matrisi', () => {
    it('tum onkosullar POZITIF kanitlandiginda UYAP_SEND bloklanmaz', async () => {
      const result = await gateChecker.checkGates(
        'case-x',
        ActionCode.UYAP_SEND,
        baselineFacts(),
      );

      expect(result.blocked).toBe(false);
    });

    it('BOS fact map → UYAP_SEND bloklanir (missing fact izin uretemez)', async () => {
      const result = await gateChecker.checkGates(
        'case-x',
        ActionCode.UYAP_SEND,
        new Map<string, FactValue>(),
      );

      expect(result.blocked).toBe(true);
      expect(result.gateCode).toBe(PREFLIGHT_GATE);
      expect(result.severity).toBe('HARD');
    });

    it.each(Object.keys(REQUIRED_PROOF_FACTS))(
      'zorunlu fact EKSIK olunca UYAP_SEND bloklanir: %s',
      async (key) => {
        const facts = baselineFacts();
        facts.delete(key);

        const result = await gateChecker.checkGates(
          'case-x',
          ActionCode.UYAP_SEND,
          facts,
        );

        expect(result.blocked).toBe(true);
        expect(result.gateCode).toBe(PREFLIGHT_GATE);
      },
    );

    it.each(Object.keys(REQUIRED_PROOF_FACTS))(
      'zorunlu fact undefined olunca UYAP_SEND bloklanir: %s',
      async (key) => {
        const facts = baselineFacts();
        facts.set(key, undefined as unknown as FactValue);

        const result = await gateChecker.checkGates(
          'case-x',
          ActionCode.UYAP_SEND,
          facts,
        );

        expect(result.blocked).toBe(true);
        expect(result.gateCode).toBe(PREFLIGHT_GATE);
      },
    );

    it.each(Object.keys(REQUIRED_PROOF_FACTS))(
      'zorunlu fact null olunca UYAP_SEND bloklanir: %s',
      async (key) => {
        const facts = baselineFacts();
        facts.set(key, null as unknown as FactValue);

        const result = await gateChecker.checkGates(
          'case-x',
          ActionCode.UYAP_SEND,
          facts,
        );

        expect(result.blocked).toBe(true);
        expect(result.gateCode).toBe(PREFLIGHT_GATE);
      },
    );

    it.each(Object.keys(REQUIRED_PROOF_FACTS))(
      'zorunlu fact "true"/"false" STRING olunca (tip kaymasi) bloklanir: %s',
      async (key) => {
        const facts = baselineFacts();
        facts.set(key, String(REQUIRED_PROOF_FACTS[key]) as unknown as FactValue);

        const result = await gateChecker.checkGates(
          'case-x',
          ActionCode.UYAP_SEND,
          facts,
        );

        expect(result.blocked).toBe(true);
        expect(result.gateCode).toBe(PREFLIGHT_GATE);
      },
    );
  });

  // ==========================================================================
  // 3) POZITIF KOTU-DURUM SINYALI → ORIJINAL GATE MESAJI KORUNUR
  // ==========================================================================
  describe('Onceki gate\'lerin mesaj kalitesi korunur', () => {
    const cases: Array<[string, string, FactValue, string]> = [
      ['dosya kapali', 'case.is_closed', true, 'CASE_CLOSED'],
      ['dosya arsivde', 'case.is_archived', true, 'CASE_ARCHIVED'],
      ['UYAP kapali', 'case.allow_uyap_actions', false, 'UYAP_DISABLED'],
      [
        'odenmemis masraf',
        'case.has_unpaid_blocking_expense',
        true,
        'EXPENSE_BLOCKING',
      ],
      [
        'gecici ariza',
        'system.uyap_available',
        false,
        'UYAP_TEMPORARILY_UNAVAILABLE_SEND',
      ],
    ];

    it.each(cases)(
      '%s → spesifik gate kodu doner (preflight gate bastirmaz)',
      async (_label, key, value, expectedGate) => {
        const facts = baselineFacts();
        facts.set(key, value);

        const result = await gateChecker.checkGates(
          'case-x',
          ActionCode.UYAP_SEND,
          facts,
        );

        expect(result.blocked).toBe(true);
        expect(result.gateCode).toBe(expectedGate);
      },
    );
  });

  // ==========================================================================
  // 4) REGRESYON SINIRI — diger action'lar ETKILENMEZ
  // ==========================================================================
  describe('Kapsam izolasyonu (diger action\'larda regresyon yok)', () => {
    it.each([
      ActionCode.UYAP_QUERY,
      ActionCode.SEND_NOTIFICATION,
      ActionCode.SEND_PAYMENT_ORDER,
      ActionCode.TRIGGER_HACIZ,
      ActionCode.REQUEST_SALE,
    ])('%s preflight gate ile bloklanmaz', async (actionCode) => {
      const result = await gateChecker.checkGates(
        'case-x',
        actionCode,
        new Map<string, FactValue>(),
      );

      expect(result.gateCode).not.toBe(PREFLIGHT_GATE);
    });

    it('preflight gate disindaki gate tanimlari DEGISMEDI (fail-open semantigi korunur)', () => {
      const facts = new Map<string, FactValue>();
      const byCode = (code: string) =>
        COMPILED_GATES.find((g) => g.gateCode === code)!;

      // Bos fact map ile eski gate'ler hala tetiklenmez (davranis kilidi).
      expect(byCode('CASE_CLOSED').condition(facts)).toBe(false);
      expect(byCode('CASE_ARCHIVED').condition(facts)).toBe(false);
      expect(byCode('UYAP_DISABLED').condition(facts)).toBe(false);
      expect(byCode('EXPENSE_BLOCKING').condition(facts)).toBe(false);
      expect(byCode('UYAP_TEMPORARILY_UNAVAILABLE_SEND').condition(facts)).toBe(
        false,
      );
      // ...ve yeni gate tam da bu bosluk yuzunden tetiklenir.
      expect(byCode(PREFLIGHT_GATE).condition(facts)).toBe(true);
    });
  });

  // ==========================================================================
  // 5) OPERASYONEL SINYAL — "yapilandirilmamis" != "available"
  // ==========================================================================
  describe('UyapAvailabilityService — acik yapilandirma ayrimi', () => {
    const ENV_KEY = UYAP_AVAILABILITY_ENV.UYAP_AVAILABLE;
    const original = process.env[ENV_KEY];
    let service: UyapAvailabilityService;

    beforeEach(() => {
      service = new UyapAvailabilityService();
      delete process.env[ENV_KEY];
    });

    afterAll(() => {
      if (original === undefined) delete process.env[ENV_KEY];
      else process.env[ENV_KEY] = original;
    });

    it('env tanimsiz → explicit=false (isUyapAvailable DEGISMEZ: true)', () => {
      expect(service.isAvailabilityExplicitlyConfigured()).toBe(false);
      expect(service.isUyapAvailable()).toBe(true); // geriye donuk davranis kilidi
    });

    it('env bos string → explicit=false', () => {
      process.env[ENV_KEY] = '   ';
      expect(service.isAvailabilityExplicitlyConfigured()).toBe(false);
    });

    it('env "true" → explicit=true, available=true', () => {
      process.env[ENV_KEY] = 'true';
      expect(service.isAvailabilityExplicitlyConfigured()).toBe(true);
      expect(service.isUyapAvailable()).toBe(true);
    });

    it('env "false" → explicit=true, available=false (ariza acikca bildirilmis)', () => {
      process.env[ENV_KEY] = 'false';
      expect(service.isAvailabilityExplicitlyConfigured()).toBe(true);
      expect(service.isUyapAvailable()).toBe(false);
    });
  });

  // ==========================================================================
  // 6) FACT URETIMI — provider yeni fact'i gercekten yaziyor mu?
  // ==========================================================================
  describe('ComputedFactRegistry — system.uyap_availability_explicit uretimi', () => {
    const ENV_KEY = UYAP_AVAILABILITY_ENV.UYAP_AVAILABLE;
    const original = process.env[ENV_KEY];

    afterAll(() => {
      if (original === undefined) delete process.env[ENV_KEY];
      else process.env[ENV_KEY] = original;
    });

    const buildRegistry = (): ComputedFactRegistry => {
      const registry = new ComputedFactRegistry(new UyapAvailabilityService());
      registry.onModuleInit();
      return registry;
    };

    it('env tanimsiz → explicit fact false yazilir', async () => {
      delete process.env[ENV_KEY];

      const facts = await buildRegistry().computeAll('case-x', undefined, new Map());

      expect(facts.get('system.uyap_availability_explicit')).toBe(false);
      expect(facts.get('system.uyap_available')).toBe(true);
    });

    it('env "true" → explicit fact true yazilir', async () => {
      process.env[ENV_KEY] = 'true';

      const facts = await buildRegistry().computeAll('case-x', undefined, new Map());

      expect(facts.get('system.uyap_availability_explicit')).toBe(true);
      expect(facts.get('system.uyap_available')).toBe(true);
    });

    it('provider exception → her iki fact de fail-closed', async () => {
      const broken = new UyapAvailabilityService();
      jest
        .spyOn(broken, 'isAvailabilityExplicitlyConfigured')
        .mockImplementation(() => {
          throw new Error('ops signal unavailable');
        });
      const registry = new ComputedFactRegistry(broken);
      registry.onModuleInit();

      const facts = await registry.computeAll('case-x', undefined, new Map());

      expect(facts.get('system.uyap_availability_explicit')).toBe(false);
      expect(facts.get('system.uyap_available')).toBe(false);
    });

    it('manuel/legacy DB flag\'i computed provider tarafindan EZILIR', async () => {
      delete process.env[ENV_KEY];
      // Persist edilmis sahte bir "explicit" flag'i base fact olarak enjekte et.
      const base = new Map<string, FactValue>([
        ['system.uyap_availability_explicit', true],
        ['system.uyap_available', true],
      ]);

      const facts = await buildRegistry().computeAll('case-x', undefined, base);

      expect(facts.get('system.uyap_availability_explicit')).toBe(false);
    });
  });
});
