/**
 * UYAP-LEGACY-POA-FLAG-DEPRECATION-I01 — legacy manuel flag'lerin karar zincirinden çıkışı
 *
 * ## Kapatılan durum
 *
 * `icrabotCaseFact` / `icrabotCaseFlag` serbest anahtarlı bir key-value deposudur ve İKİ
 * üretim yolu istemci gövdesinden gelen anahtarlarla oraya yazabiliyordu:
 *
 * ```text
 * POST /policy-engine/cases/:caseId/action-executed   body.result.newFacts
 * POST /v28-engine/:caseId/{fact,flag}/:key           body.value
 * ```
 *
 * Böylece `case.has_power_of_attorney = true` gibi bir **manuel yetki kaydı** üretilebiliyordu.
 * Bu satır CPE kararını değiştirmiyordu (computed provider `computeAll` sırasında üzerine
 * yazar) — ama fact deposunda ve `icrabotFactAudit`'te sahte bir yetki delili bırakıyordu ve
 * provider bir gün kayıtsız kalırsa canlı bir fail-open olurdu.
 *
 * ## Doğrulanan invariant'lar (owner §11)
 *
 * ```text
 * LG-01  case.has_power_of_attorney yalnız computed compatibility alias'tır
 * LG-02  Alias canonical authority resolver sonucuna eşittir
 * LG-03  Legacy DB field alias'ı DEĞİŞTİREMEZ
 * LG-04  case.has_unpaid_blocking_expense yalnız ExpenseBlockReason'dan gelir
 * LG-05  case.expense_gate_blocked policy girdisi DEĞİLDİR
 * LG-06  Manual fixture fact provider sonucunu override EDEMEZ
 * LG-07  Missing computed provider UYAP_SEND'i fail-closed BLOKLAR
 * LG-08  Client request bypass ÜRETEMEZ
 * ```
 *
 * Test seviyesi: saf birim (mock Prisma; DB/Nest container yok).
 */
import * as fs from 'fs';
import * as path from 'path';
import { ComputedFactRegistry } from '../../policy-engine/fact-store/computed-fact-registry';
import { FactStoreService } from '../../policy-engine/fact-store/fact-store.service';
import { FactStoreService as V28FactStoreService } from '../../icrabot/v28-engine/factstore.service';
import {
  COMPUTED_OWNED_FACT_KEYS,
  DEPRECATED_LEGACY_FACT_KEYS,
  ManualComputedFactWriteError,
  isManuallyWritableFactKey,
} from '../../policy-engine/fact-store/computed-fact-ownership';
import { UyapAuthorityFactProvider } from '../authority/uyap-authority-fact.provider';
import { UyapExpenseBlockingFactProvider } from '../authority/uyap-expense-blocking-fact.provider';
import { UyapAvailabilityService } from '../../policy-engine/fact-store/uyap-availability.service';
import { GateCheckerService } from '../../policy-engine/gate-checker/gate-checker.service';
import { ActionCode } from '../../policy-engine/types/action-code.enum';
import type { FactMap, FactValue } from '../../policy-engine/fact-store';

const TENANT = 'tenant-a';
const USER = 'user-1';
const LAWYER = 'lawyer-1';
const CASE = 'case-1';
const CLIENT = 'client-1';
const NOW = new Date('2026-06-01T00:00:00.000Z');

// ============================================================================
// Canonical authority zinciri — GERÇEK resolver'lar, mock Prisma
// ============================================================================

const buildAuthorityPrisma = (opts: { validPoa: boolean }) => ({
  lawyer: {
    findMany: jest.fn(async () => [
      { id: LAWYER, tenantId: TENANT, userId: USER, isActive: true },
    ]),
  },
  case: {
    findFirst: jest.fn(async () => ({
      id: CASE,
      tenantId: TENANT,
      caseClients: [{ clientId: CLIENT, client: { id: CLIENT, tenantId: TENANT } }],
    })),
    count: jest.fn(async () => 1),
  },
  clientPowerOfAttorney: {
    findMany: jest.fn(async () =>
      opts.validPoa
        ? [
            {
              id: 'poa-1',
              clientId: CLIENT,
              tenantId: TENANT,
              status: 'ACTIVE',
              isActive: true,
              dateIssued: new Date('2026-01-01T00:00:00.000Z'),
              isLimited: false,
              validUntil: null,
              scopeType: 'GENEL',
              updatedAt: NOW,
              lawyers: [{ id: 'pl-1', lawyerId: LAWYER, tenantId: TENANT }],
            },
          ]
        : [],
    ),
  },
});

const buildAuthorityProvider = (validPoa: boolean) => {
  const prisma = buildAuthorityPrisma({ validPoa }) as any;
  const {
    ActingLawyerResolverService,
  } = require('../../lawyer/acting-lawyer-resolver.service');
  const {
    UyapSendAuthorityResolverService,
  } = require('../authority/uyap-send-authority-resolver.service');
  return new UyapAuthorityFactProvider(
    new ActingLawyerResolverService(prisma),
    new UyapSendAuthorityResolverService(prisma),
  );
};

const buildExpenseProvider = (openBlocks: any[]) => {
  const expenseService = {
    findOpenBlocksForAction: jest.fn(async () => openBlocks),
  };
  return new UyapExpenseBlockingFactProvider(expenseService as any);
};

const CONTEXT = {
  tenantId: TENANT,
  authenticatedUserId: USER,
  evaluatedAt: NOW,
} as any;

/** Gate'in UYAP_SEND için blokladığı gate kodunu döndürür (yoksa null). */
const gateBlock = async (facts: FactMap): Promise<string | null> => {
  const result = await new GateCheckerService().checkGates(CASE, ActionCode.UYAP_SEND, facts);
  return result.blocked ? (result.gateCode ?? 'BLOCKED') : null;
};

/** UYAP_SEND'in geçmesi için gereken diğer (bu testin konusu olmayan) önkoşullar. */
const baseGreenFacts = (): Record<string, FactValue> => ({
  'case.is_closed': false,
  'case.is_archived': false,
  'case.allow_uyap_actions': true,
  'system.uyap_available': true,
  'system.uyap_availability_explicit': true,
});

// ============================================================================
// LG-01 / LG-02 / LG-03 / LG-06 — POA matrisi (owner §10)
// ============================================================================

describe('I06 — LG-01/02/03/06: legacy POA flag authority ÜRETEMEZ', () => {
  const run = async (legacy: boolean | undefined, validPoa: boolean) => {
    const facts: FactMap = new Map<string, FactValue>(
      Object.entries({
        ...baseGreenFacts(),
        'case.has_unpaid_blocking_expense': false,
      }),
    );
    // Legacy DB satırı base fact olarak enjekte edilir (loadFactsFromDb emsali).
    if (legacy !== undefined) facts.set('case.has_power_of_attorney', legacy);

    const provider = buildAuthorityProvider(validPoa);
    const computed = await provider.compute(CASE, CONTEXT, facts);
    facts.set('case.has_power_of_attorney', computed);

    return { blockedBy: await gateBlock(facts), aliasAfter: facts.get('case.has_power_of_attorney') };
  };

  it.each([
    ['legacy true  + geçerli authority', true, true, null],
    ['legacy true  + geçersiz authority', true, false, 'POWER_OF_ATTORNEY_MISSING'],
    ['legacy false + geçerli authority', false, true, null],
    ['legacy false + geçersiz authority', false, false, 'POWER_OF_ATTORNEY_MISSING'],
    ['legacy YOK   + geçerli authority', undefined, true, null],
    ['legacy YOK   + geçersiz authority', undefined, false, 'POWER_OF_ATTORNEY_MISSING'],
  ])('%s', async (_label, legacy, validPoa, expected) => {
    const { blockedBy } = await run(legacy as boolean | undefined, validPoa as boolean);
    expect(blockedBy).toBe(expected);
  });

  it('LG-02/LG-03: alias DAİMA computed değere eşitlenir — legacy satır EZİLİR', async () => {
    const a = await run(true, false);
    expect(a.aliasAfter).toBe(false); // legacy true olsa da computed false

    const b = await run(false, true);
    expect(b.aliasAfter).toBe(true); // legacy false olsa da computed true
  });

  it('LG-06: provider granular fact leri de EZER (manuel enjeksiyon etkisiz)', async () => {
    const facts: FactMap = new Map<string, FactValue>(
      Object.entries({
        ...baseGreenFacts(),
        'case.has_unpaid_blocking_expense': false,
        // Manuel "yetki var" enjeksiyonu — hepsi ezilmelidir.
        'actor.is_canonical_lawyer': true,
        'actor.has_matching_power_of_attorney': true,
        'poa.is_effective_at_evaluation_time': true,
        'poa.covers_requested_operation': true,
        'authority.is_unambiguous': true,
      }),
    );

    const provider = buildAuthorityProvider(false); // geçersiz authority
    facts.set('case.has_power_of_attorney', await provider.compute(CASE, CONTEXT, facts));

    expect(facts.get('actor.has_matching_power_of_attorney')).toBe(false);
    expect(await gateBlock(facts)).toBe('POWER_OF_ATTORNEY_MISSING');
  });
});

// ============================================================================
// LG-04 / LG-05 — Expense matrisi (owner §10)
// ============================================================================

describe('I06 — LG-04/LG-05: legacy expense flag policy girdisi DEĞİLDİR', () => {
  const OPEN_BLOCK = {
    id: 'blk-1',
    tenantId: TENANT,
    caseId: CASE,
    blockedActionCode: 'UYAP_SEND',
    status: 'OPEN',
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
    expenseRequestId: null,
    expenseRequest: null,
  };

  const run = async (legacy: boolean | undefined, blocks: any[]) => {
    const facts: FactMap = new Map<string, FactValue>(Object.entries(baseGreenFacts()));
    if (legacy !== undefined) facts.set('case.expense_gate_blocked', legacy);

    const provider = buildExpenseProvider(blocks);
    const computed = await provider.compute(CASE, { ...CONTEXT, caseId: CASE } as any, facts);
    facts.set('case.has_unpaid_blocking_expense', computed);

    // Authority tarafını yeşile çek (bu blok expense'i ölçüyor).
    for (const k of [
      'actor.is_canonical_lawyer',
      'actor.has_matching_power_of_attorney',
      'poa.is_effective_at_evaluation_time',
      'poa.covers_requested_operation',
      'authority.is_unambiguous',
    ]) {
      facts.set(k, true);
    }

    return gateBlock(facts);
  };

  it('legacy expense true + blocking kayıt YOK → BLOKLAMAZ', async () => {
    expect(await run(true, [])).toBeNull();
  });

  it('legacy expense false + OPEN UYAP_SEND bloğu → BLOKLAR', async () => {
    expect(await run(false, [OPEN_BLOCK])).toBe('EXPENSE_BLOCKING');
  });

  it('legacy expense YOK + OPEN blok → BLOKLAR', async () => {
    expect(await run(undefined, [OPEN_BLOCK])).toBe('EXPENSE_BLOCKING');
  });

  it('legacy expense true + RESOLVED blok (servis OPEN döndürmez) → BLOKLAMAZ', async () => {
    // `findOpenBlocksForAction` tanım gereği yalnız OPEN döndürür → RESOLVED = boş liste.
    expect(await run(true, [])).toBeNull();
  });

  it('LG-05: `case.expense_gate_blocked` HİÇBİR gate koşulunda geçmez', () => {
    const gatesSrc = fs.readFileSync(
      path.resolve(__dirname, '../../policy-engine/gate-checker/compiled/gates.compiled.ts'),
      'utf8',
    );
    const conditions = gatesSrc
      .split('\n')
      .filter((l) => l.includes('facts.get('))
      .join('\n');
    expect(conditions).not.toContain('expense_gate_blocked');
  });
});

// ============================================================================
// LG-07 — provider yoksa fail-closed
// ============================================================================

describe('I06 — LG-07: computed provider YOKSA UYAP_SEND fail-closed bloklanır', () => {
  it('authority provider kayıtlı değilse (fact hiç üretilmez) → BLOK', async () => {
    const facts: FactMap = new Map<string, FactValue>(
      Object.entries({ ...baseGreenFacts(), 'case.has_unpaid_blocking_expense': false }),
    );
    // Provider hiç çalışmadı → granular fact YOK.
    expect(await gateBlock(facts)).toBe('POWER_OF_ATTORNEY_MISSING');
  });

  it('expense provider kayıtlı değilse (fact hiç üretilmez) → BLOK', async () => {
    const facts: FactMap = new Map<string, FactValue>(Object.entries(baseGreenFacts()));
    for (const k of [
      'actor.is_canonical_lawyer',
      'actor.has_matching_power_of_attorney',
      'poa.is_effective_at_evaluation_time',
      'poa.covers_requested_operation',
      'authority.is_unambiguous',
    ]) {
      facts.set(k, true);
    }
    // `case.has_unpaid_blocking_expense` YOK → PREFLIGHT-R02 pozitif-ispat gate'i bloklar.
    expect(await gateBlock(facts)).toBe('UYAP_SEND_PRECONDITIONS_UNPROVEN');
  });

  it('registry built-in provider olarak legacy authority/expense fact ÜRETMEZ', () => {
    const registry = new ComputedFactRegistry(new UyapAvailabilityService());
    registry.onModuleInit();

    // Bu iki fact'in sahibi UyapModule tarafından register edilen provider'lardır.
    expect(registry.hasProvider('case.has_power_of_attorney')).toBe(false);
    expect(registry.hasProvider('case.has_unpaid_blocking_expense')).toBe(false);
    // Terk edilmiş legacy anahtarın hiçbir sahibi YOKTUR.
    expect(registry.hasProvider('case.expense_gate_blocked')).toBe(false);
  });
});

// ============================================================================
// LG-08 + owner §5 — MANUEL YAZICI YOK (iki fact-store da fail-closed)
// ============================================================================

describe('I06 — LG-08: manuel computed-fact yazımı REDDEDİLİR', () => {
  it('sahiplik kaydı beklenen anahtarları içerir', () => {
    expect(COMPUTED_OWNED_FACT_KEYS).toEqual(
      expect.arrayContaining([
        'case.has_power_of_attorney',
        'actor.is_canonical_lawyer',
        'actor.has_matching_power_of_attorney',
        'poa.is_effective_at_evaluation_time',
        'poa.covers_requested_operation',
        'authority.is_unambiguous',
        'authority.failure_code',
        'case.has_unpaid_blocking_expense',
        'system.uyap_available',
        'system.uyap_availability_explicit',
      ]),
    );
    expect(DEPRECATED_LEGACY_FACT_KEYS).toContain('case.expense_gate_blocked');
    expect(isManuallyWritableFactKey('case.status')).toBe(true);
    expect(isManuallyWritableFactKey('case.has_power_of_attorney')).toBe(false);
  });

  describe('policy-engine FactStoreService', () => {
    const build = () => {
      const prisma: any = {
        $transaction: jest.fn(async (fn: any) => fn(prisma)),
        icrabotCaseFlag: { upsert: jest.fn() },
        icrabotCaseFact: { upsert: jest.fn() },
        icrabotFactAudit: { create: jest.fn() },
      };
      return { prisma, svc: new FactStoreService(prisma) };
    };

    it.each([...COMPUTED_OWNED_FACT_KEYS, ...DEPRECATED_LEGACY_FACT_KEYS])(
      'writeFact("%s") REDDEDİLİR, Prisma ya ULAŞILMAZ',
      async (key) => {
        const { prisma, svc } = build();
        await expect(svc.writeFact(CASE, key, true)).rejects.toBeInstanceOf(
          ManualComputedFactWriteError,
        );
        expect(prisma.icrabotCaseFlag.upsert).not.toHaveBeenCalled();
        expect(prisma.icrabotCaseFact.upsert).not.toHaveBeenCalled();
      },
    );

    it('writeFacts: TEK yasak anahtar bile TÜM batch i durdurur (kısmi yazım YOK)', async () => {
      const { prisma, svc } = build();
      await expect(
        svc.writeFacts(CASE, {
          'case.status': 'DERDEST',
          'case.has_power_of_attorney': true,
        } as any),
      ).rejects.toBeInstanceOf(ManualComputedFactWriteError);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('yasak olmayan anahtar normal yazılır (regresyon yok)', async () => {
      const { prisma, svc } = build();
      await svc.writeFacts(CASE, { 'case.status': 'DERDEST' } as any);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('v28-engine FactStoreService', () => {
    const build = () => {
      const prisma: any = { $transaction: jest.fn(async (fn: any) => fn(prisma)) };
      return { prisma, svc: new V28FactStoreService(prisma) };
    };
    const scope: any = { tenantId: TENANT };

    it.each([...COMPUTED_OWNED_FACT_KEYS, ...DEPRECATED_LEGACY_FACT_KEYS])(
      'setFlags("%s") REDDEDİLİR, transaction AÇILMAZ',
      async (key) => {
        const { prisma, svc } = build();
        await expect(svc.setFlags(CASE, { [key]: true }, {} as any, scope)).rejects.toBeInstanceOf(
          ManualComputedFactWriteError,
        );
        expect(prisma.$transaction).not.toHaveBeenCalled();
      },
    );

    it('setFacts ve write de aynı kapıdan geçer', async () => {
      const a = build();
      await expect(
        a.svc.setFacts(CASE, { 'case.has_power_of_attorney': true }, {} as any, scope),
      ).rejects.toBeInstanceOf(ManualComputedFactWriteError);
      expect(a.prisma.$transaction).not.toHaveBeenCalled();

      const b = build();
      await expect(
        b.svc.write(CASE, {}, { 'case.has_unpaid_blocking_expense': true }, {} as any, scope),
      ).rejects.toBeInstanceOf(ManualComputedFactWriteError);
      expect(b.prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});

// ============================================================================
// ARCHITECTURE GUARD — bypass ve legacy writer YOK (owner §10 "Writers")
// ============================================================================

describe('I06 — architecture guard: bypass ve legacy writer YOK', () => {
  const API_ROOT = path.resolve(__dirname, '../../../..');
  const SRC = path.join(API_ROOT, 'src');

  const walk = (dir: string, acc: string[] = []): string[] => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
        walk(p, acc);
      } else if (entry.name.endsWith('.ts') && !entry.name.includes('.spec.')) {
        acc.push(p);
      }
    }
    return acc;
  };

  const stripComments = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  const productionFiles = walk(SRC);

  it('production kodunda POA/authority bypass sözleşmesi YOKTUR', () => {
    const offenders: string[] = [];
    for (const file of productionFiles) {
      const code = stripComments(fs.readFileSync(file, 'utf8'));
      if (/skipPoaCheck|skip_poa_check|skipAuthorityCheck|bypassPoa|ignorePoa|allowWithoutPoa|forceUyap/.test(code)) {
        offenders.push(path.relative(API_ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('legacy expense flag production kodunda HİÇ geçmez', () => {
    const offenders: string[] = [];
    for (const file of productionFiles) {
      const code = stripComments(fs.readFileSync(file, 'utf8'));
      if (code.includes('expense_gate_blocked') || code.includes('expenseGateBlocked')) {
        offenders.push(path.relative(API_ROOT, file));
      }
    }
    // Yalnız sahiplik kaydı bu anahtarı ADIYLA tanır (yazımı YASAKLAMAK için).
    expect(offenders).toEqual([
      path.relative(API_ROOT, path.join(SRC, 'modules/policy-engine/fact-store/computed-fact-ownership.ts')),
    ]);
  });

  it('legacy POA alias ını production kodunda YALNIZ sahibi ve sahiplik kaydı adlandırır', () => {
    const offenders: string[] = [];
    for (const file of productionFiles) {
      const code = stripComments(fs.readFileSync(file, 'utf8'));
      if (code.includes('case.has_power_of_attorney')) {
        offenders.push(path.relative(API_ROOT, file).replace(/\\/g, '/'));
      }
    }
    expect(offenders.sort()).toEqual(
      [
        'src/modules/policy-engine/fact-store/computed-fact-ownership.ts',
        'src/modules/policy-engine/gate-checker/gate-checker.service.ts', // yalnız factsUsed telemetri listesi
        'src/modules/uyap/authority/uyap-authority-fact.provider.ts', // canonical SAHİP
      ].sort(),
    );
  });
});
