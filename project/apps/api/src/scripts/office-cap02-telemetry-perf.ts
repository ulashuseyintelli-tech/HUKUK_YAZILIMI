/**
 * OFFICE-P2-CAP02-NEUTRAL-TELEMETRY-PERFORMANCE-HARNESS-I01 — bounded yük sürücüsü.
 *
 * Nötr telemetry yolunun sentetik yük altındaki maliyetini ölçer. Karar/hüküm
 * mantığı BU DOSYADA DEĞİL: `office-cap02-telemetry-perf.core.ts`.
 *
 * ÖLÇÜM MODELİ
 *   - Mod (OFF / OBSERVE) BU RUNNER TARAFINDAN AÇILMAZ. Config dışarıda (env +
 *     kontrollü restart) ayarlanır; runner `--mode` ile hangi modda olduğunu BEYAN
 *     eder ve gözlemlenen olay deltasının beyanla TUTARLI olduğunu doğrular
 *     (OFF'ta delta>0 veya OBSERVE'ta delta≠request sayısı → FAIL_CLOSED).
 *   - `controllerTotalMs` istemci tarafında `process.hrtime.bigint()` ile ölçülür:
 *     üretim koduna enstrümantasyon EKLENMEZ (owner §7: kalıcı production logging
 *     yasak). Telemetri BİLEŞEN süreleri ayrı `--component-probe` modunda,
 *     SÜREÇ DIŞI ve ayrı bir audit action'ı ile ölçülür → telemetri olay
 *     bütünlüğü KİRLENMEZ.
 *
 * GÜVENLİK
 *   - Yalnız canary-safe slug'a sahip tenant; başka her şey FAIL_CLOSED.
 *   - Yalnız beyan edilen sentetik aktörler; gerçek tenant trafiği YOK.
 *   - Parola YALNIZ `CANARY_PASSWORD` env'inden; token yalnız bellekte tutulur.
 *     stdout/stderr/argv/dosya/log'a token/parola/header ASLA yazılmaz.
 *   - `--apply` verilmezse hiçbir istek atılmaz (plan yazdırılır).
 *
 * KULLANIM
 *   CANARY_PASSWORD=... DATABASE_URL=... node office-cap02-telemetry-perf.js \
 *     --tenantId=<id> --runId=<a-z0-9> --mode=OFF|OBSERVE \
 *     --actors=A:<userId>:<caseId>,B:... \
 *     [--warmup=5 --serial=25 --batches=25 --concurrency=4] [--apply]
 *     [--component-probe]
 */
import { PrismaClient } from '@prisma/client';

import { fetchWithTimeout } from '../common/fetch-with-timeout.util';
import { CANARY_SAFE_TENANT_SLUGS } from './office-cap02-canary-provision.core';
import {
  assessEventIntegrity,
  buildProbeTag,
  summarize,
  type ObservedEvent,
} from './office-cap02-telemetry-perf.core';
import {
  buildR02ProbeTag,
  segmentSamples,
  R02_SEGMENT_KEYS,
  STEADY_STATE_EXCLUDE_FIRST,
} from './office-cap02-telemetry-perf-r02.core';

const BASE = 'http://localhost:8080/api';
const TELEMETRY_ACTION = 'OFFICE_CAP02_AUTHORITY_HIERARCHY_TELEMETRY';
/** Bileşen probe'u AYRI action kullanır → telemetri olay sayımı kirlenmez. */
const PROBE_ACTION = 'OFFICE_CAP02_PERF_COMPONENT_PROBE';
const TENANT_SLUG = 'local-development-office';

const arg = (name: string): string | undefined => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};
const required = (name: string): string => {
  const v = arg(name);
  if (!v) throw new Error(`PERF_MISSING_ARG: --${name}`);
  return v;
};
const num = (name: string, dflt: number): number => {
  const v = arg(name);
  if (v === undefined) return dflt;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw new Error(`PERF_BAD_ARG: --${name}`);
  return n;
};

interface Actor {
  key: string;
  userId: string;
  caseId: string;
  email: string;
}

/** `A:<userId>:<caseId>,B:...` → Actor[]. Sentetik e-posta runId'den TÜRETİLİR. */
function parseActors(raw: string, runId: string): Actor[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((entry) => {
      const [key, userId, caseId] = entry.split(':');
      if (!key || !userId || !caseId) throw new Error(`PERF_BAD_ACTOR: ${entry}`);
      return {
        key,
        userId,
        caseId,
        email: `office-cap02-divergence-${key.toLowerCase()}-${runId}@invalid.example`,
      };
    });
}

/** Kanonik `fetchWithTimeout` (PF-004): bare fetch CI-1 guardrail'i ile yasak. */
const HTTP_TIMEOUT_MS = 15_000;

async function login(email: string, password: string): Promise<string> {
  const r = await fetchWithTimeout(
    `${BASE}/auth/login`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, tenantSlug: TENANT_SLUG }),
    },
    HTTP_TIMEOUT_MS,
  );
  const b = (await r.json().catch(() => null)) as { token?: string; data?: { token?: string } } | null;
  const token = b?.token ?? b?.data?.token ?? '';
  if (token.length < 50) throw new Error(`PERF_LOGIN_FAILED status=${r.status}`);
  return token;
}

interface RequestOutcome {
  ok: boolean;
  status: number;
  ms: number;
  tag: string;
  actorKey: string;
  /** Yanıt sözleşmesi izi: yalnız ANAHTAR listesi (değer taşımaz). */
  responseKeys: string[];
}

/** Tek CHANGE_STATUS isteği. Statü her çağrıda DERDEST↔ISLEMDE arasında toggle eder. */
async function changeStatus(
  token: string,
  actor: Actor,
  nextStatus: 'DERDEST' | 'ISLEMDE',
  tag: string,
): Promise<RequestOutcome> {
  const t0 = process.hrtime.bigint();
  let status = 0;
  let responseKeys: string[] = [];
  try {
    const r = await fetchWithTimeout(
      `${BASE}/case-status/${actor.caseId}/change`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: nextStatus, reason: `PERF ${tag}` }),
      },
      HTTP_TIMEOUT_MS,
    );
    status = r.status;
    const b = (await r.json().catch(() => null)) as Record<string, unknown> | null;
    if (b) responseKeys = Object.keys(b).sort();
  } finally {
    // ms her durumda olculur; basarisizsa istatistige GIRMEZ (cekirdek sozlesmesi).
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  return { ok: status >= 200 && status < 300, status, ms, tag, actorKey: actor.key, responseKeys };
}

async function main(): Promise<void> {
  const tenantId = required('tenantId');
  const runId = required('runId');
  const mode = required('mode') as 'OFF' | 'OBSERVE';
  if (mode !== 'OFF' && mode !== 'OBSERVE') throw new Error('PERF_BAD_MODE (OFF|OBSERVE)');
  // R02: blok farkindalikli etiketleme + segment raporu. Verilmezse R01 davranisi AYNEN korunur.
  const blockRaw = arg('block');
  const block = blockRaw === undefined ? undefined : (Number(blockRaw) as 1 | 2);
  if (block !== undefined && block !== 1 && block !== 2) throw new Error('PERF_BAD_BLOCK (1|2)');
  const tagFor = (phase: 'warmup' | 'measured', actorKey: string, index: number): string =>
    block === undefined
      ? buildProbeTag(phase, mode, actorKey, index)
      : buildR02ProbeTag(block, phase, mode, actorKey, index);
  const actors = parseActors(required('actors'), runId);
  const warmup = num('warmup', 5);
  const serial = num('serial', 25);
  const batches = num('batches', 25);
  const concurrency = num('concurrency', Math.min(4, actors.length));
  const apply = process.argv.includes('--apply');
  const componentProbe = process.argv.includes('--component-probe');

  const measuredTotal = actors.length * serial + batches * concurrency;
  console.log('PLAN', JSON.stringify({
    mode, block: block ?? null, runId, actors: actors.map((a) => a.key), warmup, serial, batches, concurrency,
    measuredTotal,
    // Owner §5 ust siniri: 400 olculen request (mod basina).
    withinOwnerCap: measuredTotal <= 400,
  }));
  if (measuredTotal > 400) throw new Error('PERF_LOAD_CAP_EXCEEDED (owner §5: <=400 measured)');

  const prisma = new PrismaClient();
  try {
    // --- FAIL-CLOSED tenant kapisi ------------------------------------------
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, slug: true } });
    if (!tenant) throw new Error('PERF_FAIL_CLOSED: TENANT_NOT_FOUND');
    if (!CANARY_SAFE_TENANT_SLUGS.includes(tenant.slug)) {
      throw new Error(`PERF_FAIL_CLOSED: TENANT_SLUG_NOT_CANARY_SAFE (${tenant.slug})`);
    }
    const actorRows = await prisma.user.findMany({
      where: { id: { in: actors.map((a) => a.userId) }, tenantId, isActive: true },
      select: { id: true, email: true },
    });
    if (actorRows.length !== actors.length) {
      throw new Error(`PERF_FAIL_CLOSED: ACTOR_NOT_ACTIVE_OR_MISSING (${actorRows.length}/${actors.length})`);
    }
    for (const a of actors) {
      const row = actorRows.find((r) => r.id === a.userId);
      if (!row || row.email !== a.email) {
        throw new Error(`PERF_FAIL_CLOSED: ACTOR_IDENTITY_NOT_SYNTHETIC (${a.key})`);
      }
    }
    const caseRows = await prisma.case.count({ where: { id: { in: actors.map((a) => a.caseId) }, tenantId } });
    if (caseRows !== actors.length) throw new Error('PERF_FAIL_CLOSED: CASE_NOT_IN_TENANT');

    if (!apply) {
      console.log('RESULT DRY_RUN_ONLY — --apply verilmedi, hicbir istek atilmadi');
      return;
    }

    const password = process.env.CANARY_PASSWORD;
    if (!password || password.length < 16) {
      throw new Error('CANARY_PASSWORD tanimsiz veya 16 karakterden kisa (deger loglanmaz)');
    }

    // --- Baseline sayaclar ---------------------------------------------------
    const caseIds = actors.map((a) => a.caseId);
    const [telBefore, histBefore, dlogBefore] = await Promise.all([
      prisma.auditLog.count({ where: { tenantId, action: TELEMETRY_ACTION } }),
      prisma.caseStatusHistory.count({ where: { caseId: { in: caseIds } } }),
      prisma.decisionLog.count({ where: { caseId: { in: caseIds } } }),
    ]);
    const eventIdsBefore = new Set(
      (
        await prisma.auditLog.findMany({
          where: { tenantId, action: TELEMETRY_ACTION },
          select: { id: true },
        })
      ).map((r) => r.id),
    );

    // Token yalniz bellekte; hicbir yere yazilmaz.
    const tokens = new Map<string, string>();
    for (const a of actors) tokens.set(a.key, await login(a.email, password));

    // Statu toggle durumu: her Case'in mevcut durumundan baslar.
    const currentStatus = new Map<string, 'DERDEST' | 'ISLEMDE'>();
    for (const a of actors) {
      const row = await prisma.case.findUnique({ where: { id: a.caseId }, select: { caseStatus: true } });
      currentStatus.set(a.key, row?.caseStatus === 'ISLEMDE' ? 'ISLEMDE' : 'DERDEST');
    }
    const nextFor = (key: string): 'DERDEST' | 'ISLEMDE' => {
      const cur = currentStatus.get(key) ?? 'DERDEST';
      const next = cur === 'DERDEST' ? 'ISLEMDE' : 'DERDEST';
      currentStatus.set(key, next);
      return next;
    };

    // --- WARM-UP (olculen sete GIRMEZ) --------------------------------------
    for (const a of actors) {
      for (let i = 1; i <= warmup; i++) {
        await changeStatus(tokens.get(a.key)!, a, nextFor(a.key), tagFor('warmup', a.key, i));
      }
    }

    // --- OLCULEN: SERIAL ----------------------------------------------------
    const outcomes: RequestOutcome[] = [];
    for (const a of actors) {
      for (let i = 1; i <= serial; i++) {
        outcomes.push(
          await changeStatus(tokens.get(a.key)!, a, nextFor(a.key), tagFor('measured', a.key, i)),
        );
      }
    }

    // --- OLCULEN: LOW CONCURRENCY ------------------------------------------
    // Ayni Case uzerinde es zamanli yazim BILINCLI olarak YAPILMAZ: satir kilidi
    // beklemesi telemetri maliyetini maskelerdi. Her batch'te her aktor EN FAZLA
    // bir istek atar (concurrency <= actor sayisi).
    const concurrentOutcomes: RequestOutcome[] = [];
    for (let b = 1; b <= batches; b++) {
      const slice = actors.slice(0, concurrency);
      const results = await Promise.all(
        slice.map((a) =>
          changeStatus(tokens.get(a.key)!, a, nextFor(a.key), tagFor('measured', a.key, 1000 + b)),
        ),
      );
      concurrentOutcomes.push(...results);
    }

    tokens.clear();

    // --- Sonuc toplama ------------------------------------------------------
    const all = [...outcomes, ...concurrentOutcomes];
    const successMs = all.filter((o) => o.ok).map((o) => o.ms);
    const failures = all.filter((o) => !o.ok);
    const statusDist: Record<string, number> = {};
    for (const o of all) statusDist[String(o.status)] = (statusDist[String(o.status)] ?? 0) + 1;
    const responseShapes = Array.from(new Set(all.map((o) => JSON.stringify(o.responseKeys))));

    const serialSummary = summarize(outcomes.filter((o) => o.ok).map((o) => o.ms));
    const concurrentSummary = summarize(concurrentOutcomes.filter((o) => o.ok).map((o) => o.ms));
    const allSummary = summarize(successMs);

    // --- Olay deltasi + beyan tutarliligi ----------------------------------
    const [telAfter, histAfter, dlogAfter] = await Promise.all([
      prisma.auditLog.count({ where: { tenantId, action: TELEMETRY_ACTION } }),
      prisma.caseStatusHistory.count({ where: { caseId: { in: caseIds } } }),
      prisma.decisionLog.count({ where: { caseId: { in: caseIds } } }),
    ]);
    const newEvents = (
      await prisma.auditLog.findMany({
        where: { tenantId, action: TELEMETRY_ACTION },
        orderBy: { createdAt: 'asc' },
        select: { id: true, entityId: true, userId: true, metadata: true },
      })
    ).filter((r) => !eventIdsBefore.has(r.id));

    const telemetryDelta = telAfter - telBefore;
    const totalRequests = warmup * actors.length + all.length;

    console.log('MODE', mode);
    console.log('REQUESTS', JSON.stringify({
      warmup: warmup * actors.length,
      measuredSerial: outcomes.length,
      measuredConcurrent: concurrentOutcomes.length,
      measuredTotal: all.length,
      totalIncludingWarmup: totalRequests,
      success: successMs.length,
      failure: failures.length,
      statusDistribution: statusDist,
      distinctResponseShapes: responseShapes.length,
      responseShape: responseShapes[0] ?? null,
    }));
    console.log('LATENCY_MEASURED_ALL', JSON.stringify(allSummary));
    console.log('LATENCY_MEASURED_SERIAL', JSON.stringify(serialSummary));
    console.log('LATENCY_MEASURED_CONCURRENT', JSON.stringify(concurrentSummary));

    // R02: YURUTME SIRASINA gore segment raporu (cold vs warmed steady-state).
    // `all` dizisi serial-sonra-concurrent sirasindadir; segment pencereleri o sirayi izler.
    if (block !== undefined) {
      const orderedSuccess = all.filter((o) => o.ok).map((o) => o.ms);
      const seg = segmentSamples(orderedSuccess);
      console.log('R02_BLOCK', block);
      console.log('R02_STEADY_EXCLUDE_FIRST', STEADY_STATE_EXCLUDE_FIRST);
      for (const k of R02_SEGMENT_KEYS) {
        console.log(`R02_SEGMENT ${k} ` + JSON.stringify(seg[k]));
      }
      console.log(
        'R02_ORDERED_SUCCESS_MS',
        JSON.stringify(orderedSuccess.map((m) => Math.round(m * 100) / 100)),
      );
    }
    console.log('DB_DELTA', JSON.stringify({
      telemetryEvents: telemetryDelta,
      caseStatusHistory: histAfter - histBefore,
      decisionLog: dlogAfter - dlogBefore,
    }));

    // Beyan tutarliligi — FAIL_CLOSED.
    if (mode === 'OFF' && telemetryDelta !== 0) {
      console.log('DECLARATION_MISMATCH OFF modunda telemetry delta 0 olmaliydi');
      process.exitCode = 4;
    }
    if (mode === 'OBSERVE' && telemetryDelta !== totalRequests) {
      console.log(`DECLARATION_MISMATCH OBSERVE modunda delta=${telemetryDelta}, beklenen=${totalRequests}`);
      process.exitCode = 4;
    }

    // Olay bütünlüğü: OBSERVE'ta her istek (warm-up dahil) tam bir olay üretmeli.
    // correlationId telemetri sözleşmesinde `actionCode|targetType|targetRef`ten
    // türer → aktör başına AYNI değer olur. Bu nedenle bütünlük Case bazlı SAYIM
    // ve kapsam alanları üzerinden denetlenir; `expectedCorrelationIds` bilinçli
    // olarak gözlemlenen kimliklerle beslenir, kapsam ihlalleri ayrı yakalanır.
    const observed: ObservedEvent[] = newEvents.map((r) => {
      const m = (r.metadata ?? {}) as Record<string, unknown>;
      return {
        correlationId: String(r.id),
        tenantId: String(m.tenantId ?? ''),
        actorUserId: String(m.actorUserId ?? ''),
        entityId: String(r.entityId ?? ''),
        observedActionCode: m.observedActionCode as string | undefined,
        accessAffected: m.accessAffected,
        decisionAffected: m.decisionAffected,
        metadataKeys: Object.keys(m),
        metadataJson: JSON.stringify(m),
      };
    });
    const integrity = assessEventIntegrity(
      {
        expectedCorrelationIds: observed.map((o) => o.correlationId),
        expectedTenantId: tenantId,
        expectedActorUserIds: actors.map((a) => a.userId),
        expectedEntityIds: caseIds,
      },
      observed,
    );
    const perCase: Record<string, number> = {};
    for (const o of observed) perCase[o.entityId] = (perCase[o.entityId] ?? 0) + 1;
    console.log('EVENT_INTEGRITY', JSON.stringify({
      ...integrity,
      expectedPerRequest: mode === 'OBSERVE' ? totalRequests : 0,
      perCaseEventCounts: Object.fromEntries(
        actors.map((a) => [a.key, perCase[a.caseId] ?? 0]),
      ),
      perActorRequests: warmup + serial + batches,
    }));

    // --- Bilesen probe'u (SUREC DISI; ayri action) --------------------------
    if (componentProbe) {
      const a = actors[0];
      const t1 = process.hrtime.bigint();
      const user = await prisma.user.findUnique({
        where: { id: a.userId },
        include: {
          lawyer: { select: { lawyerRank: true, canApproveOfficeActions: true } },
          staffMember: { select: { staffType: true } },
        },
      });
      const incumbentMs = Number(process.hrtime.bigint() - t1) / 1e6;

      const t2 = process.hrtime.bigint();
      await prisma.reportingLine.findFirst({
        where: { tenantId, actorUserId: a.userId, validUntil: null },
        select: { disposition: true, managerUserId: true },
      });
      const reportingLineMs = Number(process.hrtime.bigint() - t2) / 1e6;

      const t3 = process.hrtime.bigint();
      await prisma.auditLog.create({
        data: {
          tenantId,
          action: PROBE_ACTION,
          entityType: 'OFFICE_CAP02_PERF_PROBE',
          entityId: a.caseId,
          userId: a.userId,
          metadata: { synthetic: true, runId, note: 'out-of-process component latency probe' },
        },
      });
      const auditWriteMs = Number(process.hrtime.bigint() - t3) / 1e6;

      console.log('COMPONENT_PROBE', JSON.stringify({
        method: 'OUT_OF_PROCESS — ayni DB, ayni sorgular; in-request enstrumantasyon DEGIL',
        actorResolvable: user !== null,
        incumbentLookupMs: Math.round(incumbentMs * 100) / 100,
        reportingLineQueryMs: Math.round(reportingLineMs * 100) / 100,
        auditWriteMs: Math.round(auditWriteMs * 100) / 100,
        probeAuditAction: PROBE_ACTION,
      }));
    }

    console.log('RESULT', process.exitCode ? 'FAIL' : 'PASS');
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  // Hata mesaji parola/token TASIMAZ; exception dump YOK.
  console.error('PERF_HARNESS_ERROR', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
