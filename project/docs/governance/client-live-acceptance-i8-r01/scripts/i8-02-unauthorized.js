/*
 * CLIENT İ8 — ADIM 2: YETKİSİZ DENEMELERDE YAZMA 0
 *
 * R02 İ8 kapanış ölçütünün eksik ayağı budur ("Alan canlıda kurulu" ve "erişim kapatma
 * çalışıyor" İ1b koşumunda karşılandı). Burada ölçülen: **reddedilen istek hiçbir şey yazmaz.**
 *
 * ÜRÜN DAYANAĞI (RELEASE21, ölçüldü):
 *   `client.service.ts:1718-1720` — `update()` içinde ÖNCE `assertActorTenantMatches`, sonra
 *   `assertCanUpdateClient`; ilk `$transaction` `:1818`'dedir. Yani reddedilen istek
 *   **audit dahil** hiçbir satır yazmaz. Bu yüzden "yazma 0" iddiası iş satırı + `AuditLog`
 *   sayımıyla BİRLİKTE ölçülür.
 *   `client-mutation-policy.ts:43` — ret kodları dışarı çıkar (`ForbiddenException{code}`):
 *     VIEWER          → `CLIENT_MUTATION_DENIED_VIEWER`
 *     hassas alan     → `CLIENT_MUTATION_DENIED_SENSITIVE_FIELDS`
 *   `classifyClientField` FAIL-CLOSED: `CLIENT_STANDARD_FIELDS` (phone dahil) dışındaki HER alan
 *   hassastır → `tckn` hassas, `phone` standart.
 *
 * ÖLÇÜM GEÇERLİLİĞİ — GENEL 403 YETMEZ:
 *   (a) Ret KODU tam eşleşmeli (uç bozuk olduğu için gelen 403 ile yetki reddi ayrılmalı).
 *   (b) POZİTİF kontrol şart: aynı uç, YETKİLİ aktörle çalışmalı. Yoksa "her şey reddediliyor"
 *       durumu yanlışlıkla PASS üretir. P-1/P-2 bu yüzden GERÇEK YAZMA yapar (envanterde ayrı
 *       kalem: `Client.phone`, `Client.tckn`).
 *   (c) `user` ve `elevated` AYNI roldedir (USER) — fark yalnız PARTNER bağı (P-0x).
 *
 * BAŞKA ALANA YAZMA YOK: U-4 yabancı tenant hedefini yalnız OKUR ve reddedilen denemeden sonra
 * DEĞİŞMEDİĞİNİ ölçer. İ1b alanı dahil hiçbir yabancı tenant'a yazılmaz, hiçbir kayıt SİLİNMEZ.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('../../client-live-acceptance-i1b-r01/scripts/cl-lib');
const AH = require('../../client-acceptance-harness-r01/scripts/ah-lib');

const STATE = process.env.CL_STATE_FILE || path.join(process.cwd(), 'i8-state.json');
const VALID_TCKN = '10000000146'; // sentetik, checksum geçerli; gerçek kişi verisi DEĞİL

const R = [];
const add = (id, title, verdict, detail) => {
  R.push({ id, verdict, title, detail });
  const tag = verdict === 'PASS' ? 'OK  ' : verdict === 'FAIL' ? 'FAIL' : '????';
  console.log(`  ${tag} ${id.padEnd(5)} ${title}\n         ${detail}`);
};
const pass = (id, t, ok, d) => add(id, t, ok ? 'PASS' : 'FAIL', d);
const unmeasured = (id, t, d) => add(id, t, 'UNMEASURED', d);
const codeOf = (r) => (r && r.body && (r.body.code || (r.body.message && r.body.message.code))) || null;

(async () => {
  const env = L.assertEnvironment(); // G-0
  const base = L.requireEnv('CL_API_BASE_URL').replace(/\/+$/, '');
  const password = L.requireEnv('CL_LOGIN_PASSWORD'); // yalnız bellekte
  const st = JSON.parse(fs.readFileSync(STATE, 'utf8'));
  L.assertOwnSlug(st.slug); // G-1

  const prisma = L.loadPrisma();
  try {
    await L.assertOwnTenant(prisma, st.tenantId); // G-2
    console.log(`\n[U] yetkisiz deneme olcumleri — tenant ${st.slug} (ortam ${env.environment})`);

    const readClient = async () => prisma.client.findUniqueOrThrow({
      where: { id: st.clientId }, select: { phone: true, tckn: true },
    });
    const auditCount = async () => prisma.auditLog.count({ where: { tenantId: st.tenantId } });
    const put = (token, body, id) => L.httpJson('PUT', `${base}/clients/${id || st.clientId}`, { token, body });

    // ── P-0: üç aktör de oturum açabiliyor (ölçüm geçerli) ── (login bütçesi: 3)
    const tokens = {};
    for (const tag of ['viewer', 'user', 'elevated']) {
      const a = st.actors[tag];
      const r = await L.login(base, a.email, password, st.slug);
      tokens[tag] = r.token;
      if (r.status === 429) {
        unmeasured(`P-0${tag[0]}`, `${tag} oturum acabiliyor`, 'HTTP 429 hiz siniri — istek kimlik dogrulamaya ULASMADI');
      } else {
        pass(`P-0${tag[0]}`, `${tag} oturum acabiliyor`, r.status === 201 && !!r.token,
          `HTTP ${r.indeterminate ? 'BELIRSIZ' : r.status} · token=${r.token ? 'ALINDI' : 'YOK'}`);
      }
    }
    // ── P-0x: ölçüm kurgusu bozulmamış — user ve elevated AYNI rolde, fark yalnız PARTNER bağı ──
    const sameRole = st.actors.user.role === st.actors.elevated.role && st.actors.elevated.role !== 'ADMIN';
    pass('P-0x', 'OLCUM GECERLI: user ve elevated AYNI rolde, fark YALNIZ PARTNER bagi', sameRole,
      `user=${st.actors.user.role} · elevated=${st.actors.elevated.role} · ADMIN yolu KAPALI=${st.actors.elevated.role !== 'ADMIN'}`);

    // ── U-1: VIEWER mutation → RED (tam kod) + yazma 0 (iş satırı + audit) ──
    {
      const b = await readClient(); const ab = await auditCount();
      const r = tokens.viewer ? await put(tokens.viewer, { phone: '5550000001' }) : null;
      const a = await readClient(); const aa = await auditCount();
      if (!r || r.indeterminate) unmeasured('U-1', 'VIEWER mutation REDDEDILIR, yazma 0', r ? r.reason : 'token yok');
      else pass('U-1', 'VIEWER mutation REDDEDILIR (tam kod) ve YAZMA 0 (satir + audit)',
        r.status === 403 && codeOf(r) === 'CLIENT_MUTATION_DENIED_VIEWER' && a.phone === b.phone && aa === ab,
        `HTTP ${r.status} · code=${codeOf(r)} (beklenen CLIENT_MUTATION_DENIED_VIEWER; genel 403 YETMEZ)`
        + ` · phone degismedi=${a.phone === b.phone} · audit ${ab}→${aa}`);
    }

    // ── U-2: PARTNER bağı OLMAYAN USER, HASSAS alan → RED (tam kod) + yazma 0 ──
    {
      const b = await readClient(); const ab = await auditCount();
      const r = tokens.user ? await put(tokens.user, { tckn: VALID_TCKN }) : null;
      const a = await readClient(); const aa = await auditCount();
      if (!r || r.indeterminate) unmeasured('U-2', 'PARTNER bagi olmayan USER hassas alanda REDDEDILIR', r ? r.reason : 'token yok');
      else pass('U-2', 'PARTNER bagi OLMAYAN USER hassas alanda REDDEDILIR (tam kod), yazma 0',
        r.status === 403 && codeOf(r) === 'CLIENT_MUTATION_DENIED_SENSITIVE_FIELDS' && a.tckn === b.tckn && aa === ab,
        `HTTP ${r.status} · code=${codeOf(r)} (beklenen CLIENT_MUTATION_DENIED_SENSITIVE_FIELDS)`
        + ` · tckn degismedi=${a.tckn === b.tckn} · audit ${ab}→${aa}`);
    }

    // ── U-3: ANONİM istek → 401 + yazma 0 ──
    {
      const b = await readClient(); const ab = await auditCount();
      const r = await put(null, { phone: '5550000003' });
      const a = await readClient(); const aa = await auditCount();
      if (r.indeterminate) unmeasured('U-3', 'anonim istek REDDEDILIR', r.reason);
      else pass('U-3', 'ANONIM istek 401 ile REDDEDILIR ve YAZMA 0',
        r.status === 401 && a.phone === b.phone && aa === ab,
        `HTTP ${r.status} · phone degismedi=${a.phone === b.phone} · audit ${ab}→${aa}`);
    }

    // ── U-4: YABANCI tenant'ın kaydına yazma → RED + hedef DEĞİŞMEDİ (hedefe YAZILMAZ) ──
    {
      const foreignTenant = await prisma.tenant.findFirst({
        where: { slug: { startsWith: L.TENANT_PREFIX }, id: { not: st.tenantId } },
        select: { id: true, slug: true },
      });
      const foreignClient = foreignTenant
        ? await prisma.client.findFirst({ where: { tenantId: foreignTenant.id }, select: { id: true, phone: true } })
        : null;
      if (!foreignClient) {
        unmeasured('U-4', 'yabanci tenant kaydina yazma REDDEDILIR', 'baska cl-acc- tenant/client YOK — OLCULEMEDI');
      } else {
        const beforeF = foreignClient.phone;
        const auditForeignBefore = await prisma.auditLog.count({ where: { tenantId: foreignTenant.id } });
        const r = tokens.elevated ? await put(tokens.elevated, { phone: '5559999999' }, foreignClient.id) : null;
        const afterF = (await prisma.client.findUniqueOrThrow({ where: { id: foreignClient.id }, select: { phone: true } })).phone;
        const auditForeignAfter = await prisma.auditLog.count({ where: { tenantId: foreignTenant.id } });
        if (!r || r.indeterminate) unmeasured('U-4', 'yabanci tenant kaydina yazma REDDEDILIR', r ? r.reason : 'token yok');
        else pass('U-4', 'YABANCI tenant kaydina yazma REDDEDILIR ve HEDEFTE yazma 0',
          r.status >= 400 && afterF === beforeF && auditForeignAfter === auditForeignBefore,
          `HTTP ${r.status} · code=${codeOf(r)} · hedef tenant=${foreignTenant.slug}`
          + ` · hedef phone degismedi=${afterF === beforeF} · hedef audit ${auditForeignBefore}→${auditForeignAfter}`);
      }
    }

    // ── P-1 (POZİTİF): USER standart alanı yazabilir — uç çalışıyor, ölçüm geçerli ──
    {
      const r = tokens.user ? await put(tokens.user, { phone: '5550000002' }) : null;
      const a = await readClient();
      if (!r || r.indeterminate) unmeasured('P-1', 'USER standart alani guncelleyebilir', r ? r.reason : 'token yok');
      else pass('P-1', 'POZITIF: USER standart alani (phone) guncelleyebilir — uc calisiyor',
        r.status < 400 && a.phone === '5550000002',
        `HTTP ${r.status} · phone=${a.phone === '5550000002' ? 'YAZILDI' : 'YAZILMADI'}`);
    }

    // ── P-2 (POZİTİF): PARTNER bağlı elevated HASSAS alanı yazabilir ──
    {
      const r = tokens.elevated ? await put(tokens.elevated, { tckn: VALID_TCKN }) : null;
      const a = await readClient();
      if (!r || r.indeterminate) unmeasured('P-2', 'elevated hassas alani guncelleyebilir', r ? r.reason : 'token yok');
      else pass('P-2', 'POZITIF: PARTNER bagli elevated HASSAS alani (tckn) guncelleyebilir',
        r.status < 400 && a.tckn === VALID_TCKN,
        `HTTP ${r.status} · tckn=${a.tckn === VALID_TCKN ? 'YAZILDI' : 'YAZILMADI'} · AYNI rol, fark PARTNER bagi`);
    }

    // ── U-6: komşu tenant'lar DEĞİŞMEDİ (dağılım parmak izi; kendi tenant HARİÇ) ──
    {
      const now = await AH.isolationFingerprint(prisma, st.tenantId);
      const b = st.isolationBaseline || {};
      const same = !!b.digest && b.digest === now.digest;
      pass('U-6', 'komsu tenantlar DEGISMEDI (dagilim parmak izi)', same,
        `${now.tenantsObserved} komsu tenant · client ${b.clientTotal}→${now.clientTotal}`
        + ` · user ${b.userTotal}→${now.userTotal} · digest ${b.digest || 'YOK'}${same ? ' = ' : ' ≠ '}${now.digest}`);
    }

    const p = R.filter((x) => x.verdict === 'PASS').length;
    const f = R.filter((x) => x.verdict === 'FAIL').length;
    const u = R.filter((x) => x.verdict === 'UNMEASURED').length;
    console.log(`\nI8 YETKISIZ DENEME: PASS ${p} · FAIL ${f} · OLCULEMEYEN ${u}  (toplam ${R.length})`);
    console.log(JSON.stringify({
      record: 'CL-I8-UNAUTHORIZED', runId: st.runId, slug: st.slug, environment: env.environment,
      pass: p, fail: f, unmeasured: u, results: R, secretsPrinted: false,
    }, null, 1));
    process.exitCode = f > 0 ? 1 : (u > 0 ? 3 : 0);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
})().catch((e) => { console.error('\nYETKISIZ DENEME OLCUM HATASI:', e && e.message ? e.message : e); process.exitCode = 1; });
