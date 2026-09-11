/*
 * CLIENT İ10 — ADIM 2: H3 VEKÂLET KABUL ÖLÇÜMLERİ
 *
 * ÖLÇÜT KAYNAĞI: R02:206 — "A-1 VIEWER 403 · A-2 elevated olmayan USER 403 · A-3 yetkili 201 ·
 * A-4 legacy upload 403 · K9 yenileme (POA'sız capability etkisiz)"; kapanış: "Beş gözlem PASS;
 * yetkisiz denemelerde dosya/DB yazımı 0". Adım tanımları `RELEASE20-HANDOVER-R01.md` §5.2.
 *
 * KAPILAR (RELEASE22 kaynağından ölçüldü):
 *   · POST /poa · PUT /poa/:id · POST /poa/:id/upload → `runAuthorizedClientWorkspaceCommand`
 *     (POA_CREATE / POA_UPDATE / POA_FILE_UPLOAD): eşik ADMIN VEYA canonical elevated; VIEWER ve
 *     tanımsız rol fail-closed; ret `ForbiddenException({ message, reasonCode })` ve execute/audit'ten
 *     ÖNCE → ret = yazma 0, audit 0. Başarıda TEK audit: action `CLIENT_WORKSPACE_COMMAND`.
 *   · Upload controller'ı yetkiden ÖNCE `validatePoaUploadFile` çalıştırır (mime + boyut) → A-4
 *     GEÇERLİ bir PDF ile yapılır; aksi hâlde 400 yanlış kapıdan gelir ve ölçüm GEÇERSİZ olur.
 *   · GET /clients/:id/effective-capabilities → salt-okuma K9 kararı (dört capability + reasonCode).
 * YANLIŞ KAPIDAN GELEN 400/403 BAŞARI SAYILMAZ: her ret gözlemi beklenen `reasonCode`'u doğrular.
 *
 * DUR KURALI: bir YETKİSİZ yazma denemesi (A-1 · A-2 · A-4) 403 dışında yanıt verir, istek hatası
 * üretir ya da yazma izi bırakırsa SONRAKİ yetkisiz yazma denemesi GÖNDERİLMEZ; kalanlar
 * "CAGRILMADI" gerekçesiyle OLCULEMEDI yazılır (ölçüt sessizce düşmez, sonuç BAŞARILI olamaz).
 *
 * DOSYA YAZIMI: `CL_POA_UPLOAD_ROOT` = API'nin POA kovası; ';' ile ayrılmış birden çok kök verilebilir
 * (çalışan kök <HUKUK_DATA_ROOT>/uploads/poa + HUKUK_DATA_ROOT'suz eski düzen adayı <cwd>/data/uploads/poa).
 * Yetki kapısı geçilseydi servis ÖNCE `bucketDir` ile <kök>/<tenantId> dizinini oluşturur, sonra dosyayı
 * yazar, EN SON satırı günceller → tenant dizini her kökte denemeden ÖNCE ve SONRA ölçülür.
 * BAKILDIĞI KANITLANIR: kök listelenir (`readdirSync`); kök yoksa en yakın VAR OLAN ata listelenir.
 * `existsSync` KULLANILMAZ — erişim hatasında da false döner ve "dosya yok" gibi görünür. Listelenemeyen
 * kök ya da değişkenin yokluğu dosya ayağını OLCULEMEDI yapar (varsayım YOK).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('../../client-live-acceptance-i1b-r01/scripts/cl-lib');

const STATE = process.env.CL_STATE_FILE || path.join(process.cwd(), 'i10-state.json');
const UPLOAD_ROOTS = (process.env.CL_POA_UPLOAD_ROOT || '').split(';').map((s) => s.trim()).filter(Boolean);
const R = {
  VIEWER: 'CLIENT_MUTATION_DENIED_VIEWER',
  WORKSPACE: 'CLIENT_MUTATION_DENIED_WORKSPACE_COMMAND',
};
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n', 'latin1');

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
const describe = (r) => {
  if (!r) return 'yanit YOK';
  if (r.indeterminate) return `BELIRSIZ(${r.reason})`;
  const b = r.body || {};
  return `HTTP ${r.status} · reasonCode=${b.reasonCode ?? '-'}`;
};

async function httpUpload(url, token, fileName) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 60000);
  try {
    const fd = new FormData();
    fd.append('file', new Blob([PDF], { type: 'application/pdf' }), fileName);
    const res = await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: fd, signal: ctl.signal });
    const text = await res.text();
    let parsed = null;
    try { parsed = text ? JSON.parse(text) : null; } catch (e) { parsed = null; }
    return { status: res.status, body: parsed, indeterminate: false };
  } catch (e) {
    return { status: null, body: null, indeterminate: true, reason: e && e.name === 'AbortError' ? 'timeout' : `tasima: ${e && e.message}` };
  } finally { clearTimeout(timer); }
}

function listDir(dir) {
  try { return { ok: true, entries: fs.readdirSync(dir) }; } catch (e) { return { ok: false, code: (e && e.code) || 'HATA' }; }
}

// Tek kök: kök listelenirse tenant dizini listede aranır; kök YOKSA (ENOENT) en yakın var olan ata
// listelenmelidir. ENOENT dışındaki her hata (EACCES/EPERM …) ÖLÇÜLEMEDİ'dir.
function rootState(root, tenantId) {
  const r = listDir(root);
  if (r.ok) {
    if (!r.entries.includes(tenantId)) return { root, measurable: true, rootExists: true, rootEntries: r.entries.length, tenantDirExists: false, files: 0 };
    const t = listDir(path.join(root, tenantId));
    if (!t.ok) return { root, measurable: false, why: `tenant dizini listelenemedi (${t.code})` };
    return { root, measurable: true, rootExists: true, rootEntries: r.entries.length, tenantDirExists: true, files: t.entries.length };
  }
  if (r.code !== 'ENOENT') return { root, measurable: false, why: `kok listelenemedi (${r.code})` };
  for (let anc = path.dirname(root); ; anc = path.dirname(anc)) {
    const a = listDir(anc);
    if (a.ok) return { root, measurable: true, rootExists: false, ancestor: anc, tenantDirExists: false, files: 0 };
    if (a.code !== 'ENOENT') return { root, measurable: false, why: `ata listelenemedi (${anc}: ${a.code})` };
    if (path.dirname(anc) === anc) return { root, measurable: false, why: 'var olan ata bulunamadi' };
  }
}

function uploadDirState(tenantId, roots = UPLOAD_ROOTS) {
  if (!roots.length) return { measurable: false, why: 'CL_POA_UPLOAD_ROOT verilmedi' };
  const per = roots.map((root) => rootState(root, tenantId));
  const bad = per.find((x) => !x.measurable);
  if (bad) return { measurable: false, why: `${bad.root}: ${bad.why}`, roots: per };
  return {
    measurable: true, roots: per,
    tenantDirExists: per.some((x) => x.tenantDirExists),
    files: per.reduce((n, x) => n + x.files, 0),
  };
}
// İ10'a ÖZGÜ GO kapısı — saf ortam denetimi, DB/HTTP'ye dokunmaz, G-0'dan ÖNCE çağrılır. `cl-lib`
// deseni paket ailesinin bütün ref'lerini (I1B|I8|I9|I10) kabul eder; canlıda bu betikler YALNIZ İ10
// ref'iyle açılır → başka işin (tüketilmiş İ9 GO'su dahil) ref'i İ10 yazmasını BAŞLATAMAZ.
function assertI10GoRef() {
  if ((process.env.CL_ENVIRONMENT || '').toLowerCase() !== 'live') return;
  if (!/^OWNER-GO-CLIENT-I10-[0-9]{8}-R[0-9]{2}$/.test(process.env.CL_OWNER_GO_REF || '')) {
    throw new Error('canli kosum YALNIZ OWNER-GO-CLIENT-I10-YYYYMMDD-Rnn ile acilir — baska isin GO ref i kabul edilmez; hicbir yazma yapilmadi');
  }
}
const rootsDesc = (d) => (d.roots || []).map((x, i) => `kok${i + 1}=${x.rootExists ? `listelendi(oge ${x.rootEntries})` : 'yok(ata listelendi)'}`).join(' ');

async function main() {
  assertI10GoRef();
  const env = L.assertEnvironment();
  const st = JSON.parse(fs.readFileSync(STATE, 'utf8'));
  const base = (process.env.CL_API_BASE_URL || '').replace(/\/+$/, '');
  if (!base) throw new Error('CL_API_BASE_URL YOK');
  const password = L.requireEnv('CL_LOGIN_PASSWORD');
  const prisma = L.loadPrisma();

  const counts = async () => ({
    poas: await prisma.clientPowerOfAttorney.count({ where: { tenantId: st.tenantId } }),
    audits: await prisma.auditLog.count({ where: { tenantId: st.tenantId } }),
    clients: await prisma.client.count({ where: { tenantId: st.tenantId } }),
  });
  const poaSnap = async (id) => {
    const p = await prisma.clientPowerOfAttorney.findFirst({
      where: { id, tenantId: st.tenantId },
      select: {
        notaryName: true, notaryCity: true, journalNo: true, poaNumber: true, dateIssued: true, isLimited: true,
        validUntil: true, scopeType: true, scopeDescription: true, canCollect: true, canWaive: true, canSettle: true,
        canRelease: true, filePath: true, fileSize: true, mimeType: true, status: true, isActive: true, updatedAt: true,
      },
    });
    return p ? JSON.stringify(p) : null;
  };

  let unauthorizedStop = null;
  const unauthorizedCalls = [];
  let poaId = null;

  try {
    console.log(`\n[H3] vekalet kabul olcumleri — tenant ${st.slug} (ortam ${env.environment})`);

    // ── P-0: aktörler ve ölçüm geçerliliği ──
    const tokens = {};
    for (const tag of ['viewer', 'user', 'elevated']) {
      const lg = await L.login(base, st.actors[tag].email, password, st.slug);
      tokens[tag] = lg.token;
      if (lg.indeterminate) unmeasured(`P-0${tag[0]}`, `${tag} oturum acabiliyor`, lg.reason);
      else pass(`P-0${tag[0]}`, `${tag} oturum acabiliyor`, lg.status === 201 && !!lg.token,
        `HTTP ${lg.status} · token=${lg.token ? 'ALINDI' : 'YOK'}`);
    }
    pass('P-0x', 'OLCUM GECERLI: viewer=VIEWER; user ve elevated AYNI rolde (USER), fark YALNIZ PARTNER bagi',
      st.actors.viewer.role === 'VIEWER' && st.actors.user.role === 'USER' && st.actors.elevated.role === 'USER',
      `viewer=${st.actors.viewer.role} · user=${st.actors.user.role} · elevated=${st.actors.elevated.role} · ADMIN yolu KAPALI`);

    const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const createBody = {
      clientId: st.clients.p, notaryName: `CL I10 Noter ${st.runId}`, notaryCity: 'I10',
      journalNo: `I10-${st.runId}`, dateIssued: dayAgo, isLimited: false, scopeType: 'GENEL',
    };

    // ── A-1: VIEWER POST /poa → 403 VIEWER; vekâlet OLUŞMAZ ──
    {
      const before = await counts();
      const r = tokens.viewer ? await L.httpJson('POST', `${base}/poa`, { token: tokens.viewer, body: createBody }) : null;
      unauthorizedCalls.push('A-1');
      const after = await counts();
      if (!r || r.indeterminate) {
        unmeasured('A-1', 'VIEWER vekalet OLUSTURAMAZ', r ? r.reason : 'token yok');
        unauthorizedStop = `A-1 ${r ? `istek hatasi (${r.reason})` : 'token yok'}`;
      } else {
        const ok = r.status === 403 && r.body && r.body.reasonCode === R.VIEWER
          && before.poas === after.poas && before.audits === after.audits;
        pass('A-1', 'VIEWER POST /poa 403 (CLIENT_MUTATION_DENIED_VIEWER) ve vekalet OLUSMAZ', ok,
          `${describe(r)} · poa ${before.poas}->${after.poas} · audit ${before.audits}->${after.audits}`);
        if (!ok) unauthorizedStop = r.status !== 403 ? `A-1 HTTP ${r.status} (403 bekleniyordu)` : 'A-1 kapı/yazma sapmasi';
      }
    }

    // ── A-3: yetkili (elevated) POST /poa → 201; kayıt OLUŞUR ──
    {
      const before = await counts();
      const r = tokens.elevated ? await L.httpJson('POST', `${base}/poa`, { token: tokens.elevated, body: createBody }) : null;
      const after = await counts();
      if (!r || r.indeterminate) unmeasured('A-3', 'yetkili aktor vekalet OLUSTURUR', r ? r.reason : 'token yok');
      else {
        poaId = r.body && r.body.id ? r.body.id : null;
        const row = poaId ? await prisma.clientPowerOfAttorney.findFirst({ where: { id: poaId, tenantId: st.tenantId }, select: { status: true, isActive: true, clientId: true } }) : null;
        const ok = r.status === 201 && !!row && row.status === 'ACTIVE' && row.isActive === true && row.clientId === st.clients.p
          && after.poas === before.poas + 1 && after.audits === before.audits + 1;
        pass('A-3', 'yetkili aktor POST /poa 201 ve kayit OLUSUR (tek basari audit)', ok,
          `HTTP ${r.status} · poa ${before.poas}->${after.poas} · audit ${before.audits}->${after.audits}`
          + ` · status=${row ? row.status : '-'} · musteri=P`);
      }
    }

    // ── A-2: elevated olmayan USER PUT /poa/:id → 403 WORKSPACE; satır DEĞİŞMEZ ──
    if (unauthorizedStop) unmeasured('A-2', 'elevated olmayan USER vekaleti GUNCELLEYEMEZ', `CAGRILMADI — ${unauthorizedStop}`);
    else if (!poaId) unmeasured('A-2', 'elevated olmayan USER vekaleti GUNCELLEYEMEZ', 'hedef vekalet YOK (A-3 olculemedi)');
    else {
      const before = await counts();
      const s0 = await poaSnap(poaId);
      const r = tokens.user ? await L.httpJson('PUT', `${base}/poa/${poaId}`, { token: tokens.user, body: { notaryCity: `I10-A2-${st.runId}` } }) : null;
      unauthorizedCalls.push('A-2');
      const s1 = await poaSnap(poaId);
      const after = await counts();
      if (!r || r.indeterminate) {
        unmeasured('A-2', 'elevated olmayan USER vekaleti GUNCELLEYEMEZ', r ? r.reason : 'token yok');
        unauthorizedStop = `A-2 ${r ? `istek hatasi (${r.reason})` : 'token yok'}`;
      } else {
        const ok = r.status === 403 && r.body && r.body.reasonCode === R.WORKSPACE && s0 !== null && s0 === s1
          && before.audits === after.audits;
        pass('A-2', 'elevated olmayan USER PUT /poa/:id 403 (WORKSPACE_COMMAND) ve satir DEGISMEZ', ok,
          `${describe(r)} · satir degisti=${s0 !== s1} · audit ${before.audits}->${after.audits}`);
        if (!ok) unauthorizedStop = r.status !== 403 ? `A-2 HTTP ${r.status} (403 bekleniyordu)` : 'A-2 kapı/yazma sapmasi';
      }
    }

    // ── A-4: legacy POST /poa/:id/upload yetkisiz aktörle → 403; dosya YAZILMAZ ──
    if (unauthorizedStop) unmeasured('A-4', 'legacy upload yetkisiz aktorle REDDEDILIR', `CAGRILMADI — ${unauthorizedStop}`);
    else if (!poaId) unmeasured('A-4', 'legacy upload yetkisiz aktorle REDDEDILIR', 'hedef vekalet YOK (A-3 olculemedi)');
    else {
      const before = await counts();
      const s0 = await poaSnap(poaId);
      const d0 = uploadDirState(st.tenantId);
      const r = tokens.user ? await httpUpload(`${base}/poa/${poaId}/upload`, tokens.user, `i10-${st.runId}.pdf`) : null;
      unauthorizedCalls.push('A-4');
      const d1 = uploadDirState(st.tenantId);
      const s1 = await poaSnap(poaId);
      const after = await counts();
      if (!r || r.indeterminate) {
        unmeasured('A-4', 'legacy upload yetkisiz aktorle REDDEDILIR', r ? r.reason : 'token yok');
        unauthorizedStop = `A-4 ${r ? `istek hatasi (${r.reason})` : 'token yok'}`;
      } else if (!d0.measurable || !d1.measurable) {
        unmeasured('A-4', 'legacy upload yetkisiz aktorle REDDEDILIR ve dosya YAZILMAZ',
          `${describe(r)} · dosya ayagi: ${d0.why || d1.why}`);
      } else {
        const noFile = d1.tenantDirExists === d0.tenantDirExists && d1.files === d0.files && d1.files === 0;
        const ok = r.status === 403 && r.body && r.body.reasonCode === R.WORKSPACE && s0 !== null && s0 === s1
          && noFile && before.audits === after.audits;
        pass('A-4', 'legacy POST /poa/:id/upload yetkisiz aktorle 403 (WORKSPACE_COMMAND); dosya ve satir DEGISMEZ', ok,
          `${describe(r)} · tenant dizini ${d0.tenantDirExists}->${d1.tenantDirExists} · dosya ${d0.files}->${d1.files}`
          + ` · ${rootsDesc(d1)} · satir degisti=${s0 !== s1} · audit ${before.audits}->${after.audits}`);
      }
    }

    // ── K9: POA'sız müvekkilde DÖRT capability etkisiz (düz bayraklar true olsa bile) ──
    {
      const n = await prisma.client.findFirst({ where: { id: st.clients.n, tenantId: st.tenantId },
        select: { canCollect: true, canWaive: true, canSettle: true, canRelease: true } });
      const nPoas = await prisma.clientPowerOfAttorney.count({ where: { tenantId: st.tenantId, clientId: st.clients.n } });
      const flatAllTrue = !!n && n.canCollect && n.canWaive && n.canSettle && n.canRelease;
      const r = tokens.elevated ? await L.httpJson('GET', `${base}/clients/${st.clients.n}/effective-capabilities`, { token: tokens.elevated }) : null;
      if (!r || r.indeterminate) unmeasured('K9', "POA'siz muvekkilde dort capability etkisiz", r ? r.reason : 'token yok');
      else if (!flatAllTrue || nPoas !== 0) unmeasured('K9', "POA'siz muvekkilde dort capability etkisiz", `olcum gecersiz: duz bayraklar hepsi true=${flatAllTrue} · N poa=${nPoas}`);
      else {
        const caps = (r.body && (r.body.capabilities || r.body)) || {};
        const four = ['canCollect', 'canWaive', 'canSettle', 'canRelease'].map((c) => caps[c] || null);
        const ok = r.status === 200 && four.every((d) => d && d.allowed === false && d.reasonCode === 'NO_VALID_POA');
        pass('K9', "POA'siz muvekkilde DORT capability ETKISIZ (NO_VALID_POA; duz bayraklar true olsa bile)", ok,
          `HTTP ${r.status} · ` + four.map((d, i) => `${['collect', 'waive', 'settle', 'release'][i]}=${d ? `${d.allowed}/${d.reasonCode}` : '-'}`).join(' · ')
          + ` · duz bayraklar=true×4 · N poa=0`);
      }
    }

    // ── P-K9 (ÖLÇÜM GEÇERLİLİĞİ, kabul ölçütü DEĞİL): geçerli POA'lı P'de canCollect AÇIK ──
    if (!poaId) unmeasured('P-K9', 'olcum gecerliligi: gecerli POA ile canCollect acilir', 'A-3 vekaleti YOK');
    else {
      const r = tokens.elevated ? await L.httpJson('GET', `${base}/clients/${st.clients.p}/effective-capabilities`, { token: tokens.elevated }) : null;
      if (!r || r.indeterminate) unmeasured('P-K9', 'olcum gecerliligi: gecerli POA ile canCollect acilir', r ? r.reason : 'token yok');
      else {
        const caps = (r.body && (r.body.capabilities || r.body)) || {};
        const c = caps.canCollect || null;
        const ok = r.status === 200 && c && c.allowed === true && c.reasonCode === 'ALLOWED' && (c.basisPoaIds || []).includes(poaId)
          && ['canWaive', 'canSettle', 'canRelease'].every((k) => caps[k] && caps[k].allowed === false);
        pass('P-K9', 'OLCUM GECERLI: gecerli GENEL POA ile canCollect ALLOWED; diger ucu acik yetki olmadan KAPALI', ok,
          `HTTP ${r.status} · collect=${c ? `${c.allowed}/${c.reasonCode}` : '-'} · dayanak POA=${c && (c.basisPoaIds || []).includes(poaId) ? 'A-3' : '-'}`);
      }
    }

    if (unauthorizedStop) console.log(`  >>> YETKISIZ YAZMA DURDU: ${unauthorizedStop} — sonraki yetkisiz denemeler GONDERILMEDI`);
    console.log(`\nI10 H3 VEKALET KABULU: PASS ${results.pass} · FAIL ${results.fail} · OLCULEMEYEN ${results.unmeasured}`
      + `  (toplam ${results.results.length})`);
    console.log(JSON.stringify({
      record: 'CL-I10-POA', runId: st.runId, slug: st.slug, environment: env.environment,
      pass: results.pass, fail: results.fail, unmeasured: results.unmeasured,
      poaId, unauthorizedCalls, unauthorizedStop,
      results: results.results, findings: results.findings, secretsPrinted: false,
    }, null, 1));
    process.exitCode = results.fail > 0 ? 1 : (results.unmeasured > 0 ? 3 : 0);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

if (require.main === module) {
  main().catch((e) => { console.error('\nOLCUM HATASI:', e && e.message ? e.message : e); process.exitCode = 1; });
}
// i10-run / i10-01 ön kontrolleri ve düzenek doğrulaması için; yan etkisi YOK, HTTP/DB çağırmaz.
module.exports = { uploadDirState, rootState, rootsDesc, assertI10GoRef };
