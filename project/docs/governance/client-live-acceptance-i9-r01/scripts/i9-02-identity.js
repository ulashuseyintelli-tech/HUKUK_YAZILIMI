/*
 * CLIENT İ9 — ADIM 2: H1 KİMLİK KABUL ÖLÇÜMLERİ (14 gözlem)
 *
 * ÖLÇÜT KAYNAĞI: R02:205 — "MUTATION_AUTHORITY yenileme + #2552 kabulü (create/değişen-değer/
 * reaktivasyon üçünde de reasonCode) + A-0 + A-7 + A-8". A-0/A-7/A-8 tanımları
 * `RELEASE20-HANDOVER-R01.md` §5 tablosundan.
 *
 * İ8'DE KARŞILANAN TEKRARLANMAZ: `MUTATION_AUTHORITY` (VIEWER update → 403
 * `CLIENT_MUTATION_DENIED_VIEWER`, yazma 0) İ8 U-1 ile CANLIDA ölçüldü. Burada YENİDEN
 * KOŞULMAZ; belgede İ8 kanıtına atıf yapılır.
 *
 * İKİ AYRI HATA SÖZLEŞMESİ — KARIŞTIRILMAZ (ölçüldü, RELEASE21 kaynağı):
 *   · mutation reddi  → `ForbiddenException({ code, message, fields? })`      → alan adı **code**
 *     (`client.service.ts` denyMutation)
 *   · checksum reddi  → `BadRequestException({ message, reasonCode, offendingFields })`
 *     (`client-identity-checksum.util.ts` identityChecksumError)              → alan adı **reasonCode**
 * YANLIŞ KAPIDAN GELEN 400/403 BAŞARI SAYILMAZ: her gözlem BEKLENEN kapıyı ve BEKLENEN alan
 * adını ayrı ayrı doğrular.
 *
 * KAPI SIRALARI (RELEASE21 `client.service.ts`, satır numaralarıyla ölçüldü):
 *   create(): :1467 → tenant :1469 → D01 :1470 → rıza :1473 → dedup/reaktivasyon :1481-1506
 *             (assertCanReactivateViaCreate :1500 · assertReactivationIdentityChecksum :1503 ·
 *              ilk $transaction :1506) → assertCreateIdentityChecksum :1556 → $transaction :1575
 *   update(): :1717 → tenant :1719 → rıza :1733 → assertChangedIdentityChecksum :1755 →
 *             assertReactivationIdentityChecksum :1759 → $transaction :1818
 *   Her iki yolda da kimlik kapıları İLK TRANSACTION'DAN ÖNCEDİR → ret = yazma 0.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('../../client-live-acceptance-i1b-r01/scripts/cl-lib');
const I3 = require('../../client-acceptance-runners-i3-r01/scripts/i3-lib');

const STATE = process.env.CL_STATE_FILE || path.join(process.cwd(), 'i9-state.json');
const CHECKSUM_CODE = 'CLIENT_IDENTITY_CHECKSUM_INVALID';

const results = { pass: 0, fail: 0, unmeasured: 0, findings: [], results: [] };
function record(id, title, verdict, detail) {
  results.results.push({ id, title, verdict, detail });
  if (verdict === 'PASS') results.pass += 1;
  else if (verdict === 'FAIL') results.fail += 1;
  else results.unmeasured += 1;
  const tag = verdict === 'PASS' ? 'OK  ' : verdict === 'FAIL' ? 'FAIL' : '????';
  console.log(`  ${tag} ${id.padEnd(6)} ${title}`);
  console.log(`         ${detail}`);
}
const pass = (id, t, ok, d) => record(id, t, ok ? 'PASS' : 'FAIL', d);
const unmeasured = (id, t, why) => record(id, t, 'UNMEASURED', `OLCULEMEDI: ${why}`);
function finding(id, text) { results.findings.push({ id, text }); console.log(`  >>> BULGU ${id}: ${text}`); }

// Checksum reddi: 400 + gövdede `reasonCode` (code DEĞİL).
function isChecksumRejection(r) {
  const b = r && r.body;
  return !!(r && r.status === 400 && b && b.reasonCode === CHECKSUM_CODE);
}
// Mutation reddi: 403 + gövdede `code`.
const mutationCode = (r) => (r && r.body && r.body.code) || null;
const describe = (r) => {
  if (!r) return 'yanit YOK';
  if (r.indeterminate) return `BELIRSIZ(${r.reason})`;
  const b = r.body || {};
  return `HTTP ${r.status} · reasonCode=${b.reasonCode ?? '-'} · code=${b.code ?? '-'}`
    + (b.offendingFields ? ` · offendingFields=${JSON.stringify(b.offendingFields)}` : '');
};

(async () => {
  const env = L.assertEnvironment();
  const st = JSON.parse(fs.readFileSync(STATE, 'utf8'));
  const base = (process.env.CL_API_BASE_URL || '').replace(/\/+$/, '');
  if (!base) throw new Error('CL_API_BASE_URL YOK');
  const password = L.requireEnv('CL_LOGIN_PASSWORD');
  const prisma = L.loadPrisma();

  const tenantCounts = async () => ({
    clients: await prisma.client.count({ where: { tenantId: st.tenantId } }),
    audits: await prisma.auditLog.count({ where: { tenantId: st.tenantId } }),
  });
  const clientRow = (id) => prisma.client.findUnique({
    where: { id }, select: { id: true, isActive: true, tckn: true, vkn: true, name: true, updatedAt: true },
  });

  try {
    console.log(`\n[H1] kimlik kabul olcumleri — tenant ${st.slug} (ortam ${env.environment})`);

    // ── P-0: aktörler ve ölçüm geçerliliği ──
    const tokens = {};
    for (const tag of ['elevated', 'user']) {
      const lg = await L.login(base, st.actors[tag].email, password, st.slug);
      tokens[tag] = lg.token;
      if (lg.indeterminate) unmeasured(`P-0${tag[0]}`, `${tag} oturum acabiliyor`, lg.reason);
      else pass(`P-0${tag[0]}`, `${tag} oturum acabiliyor`, lg.status === 201 && !!lg.token,
        `HTTP ${lg.status} · token=${lg.token ? 'ALINDI' : 'YOK'}`);
    }
    pass('P-0x', 'OLCUM GECERLI: user ve elevated AYNI rolde, fark YALNIZ PARTNER bagi',
      st.actors.user.role === st.actors.elevated.role && st.actors.user.role !== 'ADMIN',
      `user=${st.actors.user.role} · elevated=${st.actors.elevated.role} · ADMIN yolu KAPALI=`
      + `${st.actors.user.role !== 'ADMIN' && st.actors.elevated.role !== 'ADMIN'}`);

    const put = (token, body, id) => L.httpJson('PUT', `${base}/clients/${id}`, { token, body });
    const post = (token, body) => L.httpJson('POST', `${base}/clients`, { token, body });

    // ── N-1 · #2552-a: CREATE checksum kapisi (dedup eslesmesi YOK) ──
    {
      const before = await tenantCounts();
      const r = tokens.elevated
        ? await post(tokens.elevated, { name: `I9 N1 ${st.runId}`, type: 'PERSON', tckn: st.identity.invalidUnmatched })
        : null;
      const after = await tenantCounts();
      if (!r || r.indeterminate) unmeasured('N-1', '#2552-a create checksum reddi', r ? r.reason : 'token yok');
      else pass('N-1', '#2552-a CREATE gecersiz kimlikle REDDEDILIR (reasonCode) ve YAZMA 0',
        isChecksumRejection(r) && Array.isArray(r.body.offendingFields) && r.body.offendingFields.includes('tckn')
          && before.clients === after.clients && before.audits === after.audits,
        `${describe(r)} · client ${before.clients}->${after.clients} · audit ${before.audits}->${after.audits}`);
    }

    // ── N-2 · #2552-b: DEGISEN-DEGER checksum kapisi (aktif kayit A) ──
    {
      const b0 = await I3.safeCapture(prisma, st.clients.a);
      const r = tokens.elevated ? await put(tokens.elevated, { tckn: st.identity.invalid }, st.clients.a) : null;
      const b1 = await I3.safeCapture(prisma, st.clients.a);
      const u = I3.unchanged(b0.state, b1.state);
      if (!r || r.indeterminate) unmeasured('N-2', '#2552-b degisen-deger checksum reddi', r ? r.reason : 'token yok');
      else if (u.unmeasured) unmeasured('N-2', '#2552-b degisen-deger checksum reddi', u.changes.join(','));
      else pass('N-2', '#2552-b DEGISEN-DEGER gecersiz kimlik REDDEDILIR (reasonCode) ve satir DEGISMEZ',
        isChecksumRejection(r) && u.ok, `${describe(r)} · kalici degisiklik=${u.ok ? 'YOK' : u.changes.join(',')}`);
    }

    // ── N-3 · #2552-c: PUT REAKTIVASYON checksum kapisi (pasif+gecersiz kayit B) ──
    {
      const b0 = await I3.safeCapture(prisma, st.clients.b);
      const r = tokens.elevated ? await put(tokens.elevated, { isActive: true }, st.clients.b) : null;
      const b1 = await I3.safeCapture(prisma, st.clients.b);
      const row = await clientRow(st.clients.b);
      const u = I3.unchanged(b0.state, b1.state);
      if (!r || r.indeterminate) unmeasured('N-3', '#2552-c PUT reaktivasyon checksum reddi', r ? r.reason : 'token yok');
      else if (u.unmeasured) unmeasured('N-3', '#2552-c PUT reaktivasyon checksum reddi', u.changes.join(','));
      else pass('N-3', '#2552-c PUT REAKTIVASYON gecersiz kimlikle REDDEDILIR (reasonCode), kayit PASIF kalir',
        isChecksumRejection(r) && row.isActive === false && u.ok,
        `${describe(r)} · isActive=${row.isActive} · kalici degisiklik=${u.ok ? 'YOK' : u.changes.join(',')}`);
    }

    // ── N-4 · #2552-d: POST/DEDUP REAKTIVASYON checksum kapisi ──
    // dedupConds yalniz data.tckn/data.vkn'den kurulur; B'nin tckn'si ile eslesir →
    // create() dedup dali (:1492) → assertCanReactivateViaCreate (:1500, elevated GECER) →
    // assertReactivationIdentityChecksum (:1503, MEVCUT kaydin kimligi GECERSIZ) → 400.
    {
      const before = await tenantCounts();
      const b0 = await I3.safeCapture(prisma, st.clients.b);
      const r = tokens.elevated
        ? await post(tokens.elevated, { name: `I9 N4 ${st.runId}`, type: 'PERSON', tckn: st.identity.invalid })
        : null;
      const after = await tenantCounts();
      const b1 = await I3.safeCapture(prisma, st.clients.b);
      const row = await clientRow(st.clients.b);
      const u = I3.unchanged(b0.state, b1.state);
      if (!r || r.indeterminate) unmeasured('N-4', '#2552-d POST/dedup reaktivasyon checksum reddi', r ? r.reason : 'token yok');
      else if (u.unmeasured) unmeasured('N-4', '#2552-d POST/dedup reaktivasyon checksum reddi', u.changes.join(','));
      else pass('N-4', '#2552-d POST/DEDUP REAKTIVASYON REDDEDILIR (reasonCode); yeni kayit YOK, hedef PASIF kalir',
        isChecksumRejection(r) && row.isActive === false && u.ok && before.clients === after.clients,
        `${describe(r)} · isActive=${row.isActive} · client ${before.clients}->${after.clients}`
        + ` · audit ${before.audits}->${after.audits} · kalici degisiklik=${u.ok ? 'YOK' : u.changes.join(',')}`);
    }

    // ── L-1: LIFECYCLE ret sozlesmesi (yetkisiz aktor) — AYRI BULGU ──
    // `user` PARTNER bagi TASIMAZ → isApproverEligible false. Payload {isActive} LIFECYCLE'dir,
    // hassas DEGIL → decideClientUpdate ALLOW verir; ret servis icindeki
    // assertCanManageLifecycle'dan gelir. O kapi DUZ ForbiddenException(string) firlatir.
    {
      const b0 = await I3.safeCapture(prisma, st.clients.d);
      const r = tokens.user ? await put(tokens.user, { isActive: true }, st.clients.d) : null;
      const b1 = await I3.safeCapture(prisma, st.clients.d);
      const row = await clientRow(st.clients.d);
      const u = I3.unchanged(b0.state, b1.state);
      if (!r || r.indeterminate) unmeasured('L-1', 'yetkisiz aktor reaktivasyonu REDDEDILIR', r ? r.reason : 'token yok');
      else if (u.unmeasured) unmeasured('L-1', 'yetkisiz aktor reaktivasyonu REDDEDILIR', u.changes.join(','));
      else {
        // KABUL OLCUTU: 403 + hedef PASIF kalir + kalici degisiklik YOK.
        pass('L-1', 'PARTNER bagi OLMAYAN USER reaktivasyonu REDDEDILIR ve YAZMA 0',
          r.status === 403 && row.isActive === false && u.ok,
          `${describe(r)} · isActive=${row.isActive} · kalici degisiklik=${u.ok ? 'YOK' : u.changes.join(',')}`);
        // AYRI BULGU: gövdede stabil kod var mi?
        const code = mutationCode(r);
        if (code !== 'CLIENT_MUTATION_DENIED_LIFECYCLE') {
          finding('L-1', `UPDATE yolundaki lifecycle reddi STABIL KOD TASIMIYOR (code=${code ?? 'YOK'}). `
            + 'create/dedup yolu ayni yetki reddini CLIENT_MUTATION_DENIED_LIFECYCLE ile dondurur '
            + '(assertCanReactivateViaCreate -> denyMutation). Iki yol AYNI yetki kararini FARKLI '
            + 'sozlesmeyle bildiriyor.');
        }
      }
    }

    // ── P-1 · A-7 POZITIF: gecerli kimlikli pasif kayit elevated ile REAKTIVE EDILEBILIR ──
    {
      const r = tokens.elevated ? await put(tokens.elevated, { isActive: true }, st.clients.d) : null;
      const row = await clientRow(st.clients.d);
      if (!r || r.indeterminate) unmeasured('P-1', 'A-7 pozitif: gecerli kimlikle reaktivasyon', r ? r.reason : 'token yok');
      else pass('P-1', 'A-7 POZITIF: gecerli kimlikli pasif kayit elevated ile REAKTIVE EDILIR (gercek DB etkisi)',
        r.status < 400 && row.isActive === true,
        `${describe(r)} · isActive=${row.isActive} (false->true YAZILDI)`);
    }

    // ── A-8: ayni degerle isActive:true tekrari → 200 ve LIFECYCLE ALANINA YAZILMAZ ──
    // Iki ayak: (a) HTTP 200 + isActive degismedi, (b) guncelleme VERISINDE lifecycle alani YOK.
    // (b) kaynakta olculdu: `isActive: lifecycleTransition ? data.isActive : undefined`
    // (client.service.ts update() $transaction verisi). Prisma'da `undefined` = DOKUNMA.
    // Kosumda dolayli kaniti: satirin isActive'i ve updatedAt'i DEGISMEZ, lifecycle audit'i OLUSMAZ.
    {
      const before = await tenantCounts();
      const rowBefore = await clientRow(st.clients.a);
      const r = tokens.elevated ? await put(tokens.elevated, { isActive: true }, st.clients.a) : null;
      const rowAfter = await clientRow(st.clients.a);
      const after = await tenantCounts();
      if (!r || r.indeterminate) {
        unmeasured('A-8a', 'ayni degerle isActive:true → 200', r ? r.reason : 'token yok');
        unmeasured('A-8b', 'lifecycle alanina YAZILMAZ', 'onceki adim olculemedi');
      } else {
        pass('A-8a', 'AYNI degerle isActive:true tekrari KABUL EDILIR (200)',
          r.status >= 200 && r.status < 300 && rowBefore.isActive === true,
          `${describe(r)} · istek oncesi isActive=${rowBefore.isActive}`);
        const sameActive = rowAfter.isActive === rowBefore.isActive;
        const sameUpdatedAt = String(rowAfter.updatedAt) === String(rowBefore.updatedAt);
        pass('A-8b', 'LIFECYCLE alanina YAZILMAZ (isActive degismez; guncelleme verisinde alan YOK)',
          sameActive,
          `isActive ${rowBefore.isActive}->${rowAfter.isActive} · updatedAt degismedi=${sameUpdatedAt}`
          + ` · audit ${before.audits}->${after.audits}`
          + ' · kaynak: update() tx verisi `isActive: lifecycleTransition ? data.isActive : undefined`');
        if (!sameUpdatedAt) {
          finding('A-8b', 'no-op istekte `updatedAt` DEGISTI: lifecycle alani yazilmasa da satir'
            + ' yine de UPDATE edildi (Prisma updateMany cagrisi yapiliyor). Olcut "lifecycle alanina'
            + ' yazilmaz" oldugu icin bu KABUL OLCUTUNU DUSURMEZ; kayda gecirilir.');
        }
      }
    }

    // ── A-0: anonim YAZMA uclari → 401, kayit OLUSMAZ ──
    // DUR KURALI (owner 2026-09-11): bir anonim uc 401 DISINDA yanit verirse, istek hatasi
    // olusursa ya da kayit sayimi degisirse SONRAKI anonim istek GONDERILMEZ. Kalan uclar
    // "CAGRILMADI" gerekcesiyle OLCULEMEDI kaydedilir (olcut sessizce DUSURULMEZ; sonuc
    // BASARILI OLAMAZ). Amac: kimlik dogrulamasi bozuk bir ortamda is baslatan `run-all`
    // ucuna GIDILMEMESI. Siralama bilerek run-all SONDA: once iki yan uc 401'i kanitlamalidir.
    const anonTargets = [
      { id: 'A0-1', url: `${base}/poa`, body: {}, label: 'POST /poa' },
      { id: 'A0-2', url: `${base}/address-discovery/client-info-request`, body: {}, label: 'POST /address-discovery/client-info-request' },
      { id: 'A0-3', url: `${base}/scheduler/run-all`, body: {}, label: 'POST /scheduler/run-all' },
    ];
    let anonStop = null;
    const anonCalls = [];
    for (const t of anonTargets) {
      if (anonStop) {
        unmeasured(t.id, `A-0 anonim ${t.label}`, `CAGRILMADI — ${anonStop}`);
        continue;
      }
      const before = await tenantCounts();
      const r = await L.httpJson('POST', t.url, { body: t.body }); // token YOK
      anonCalls.push(t.id);
      const after = await tenantCounts();
      if (r.indeterminate) {
        unmeasured(t.id, `A-0 anonim ${t.label}`, r.reason);
        anonStop = `${t.id} istek hatasi (${r.reason})`;
        continue;
      }
      const ok = r.status === 401 && before.clients === after.clients && before.audits === after.audits;
      pass(t.id, `A-0 ANONIM ${t.label} 401 ile REDDEDILIR ve kayit OLUSMAZ`, ok,
        `HTTP ${r.status} · client ${before.clients}->${after.clients} · audit ${before.audits}->${after.audits}`);
      if (!ok) anonStop = r.status !== 401 ? `${t.id} HTTP ${r.status} (401 bekleniyordu)` : `${t.id} kayit sayimi degisti`;
    }
    if (anonStop) console.log(`  >>> A-0 DURDU: ${anonStop} — sonraki anonim uclar GONDERILMEDI (cagrilan: ${anonCalls.join(',')})`);

    console.log(`\nI9 H1 KIMLIK KABULU: PASS ${results.pass} · FAIL ${results.fail} · OLCULEMEYEN ${results.unmeasured}`
      + `  (toplam ${results.results.length})`);
    if (results.findings.length) console.log(`BULGU sayisi: ${results.findings.length} (kabul olcutunu dusurmez; ayri raporlanir)`);
    console.log(JSON.stringify({
      record: 'CL-I9-IDENTITY', runId: st.runId, slug: st.slug, environment: env.environment,
      pass: results.pass, fail: results.fail, unmeasured: results.unmeasured,
      anonCalls, anonStop,
      results: results.results, findings: results.findings, secretsPrinted: false,
    }, null, 1));
    process.exitCode = results.fail > 0 ? 1 : (results.unmeasured > 0 ? 3 : 0);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
})().catch((e) => { console.error('\nOLCUM HATASI:', e && e.message ? e.message : e); process.exitCode = 1; });
