/*
 * CLIENT İ11 — ADIM 2: H5 INTAKE KABUL ÖLÇÜMLERİ
 *
 * ÖLÇÜT KAYNAĞI: R02:207 — "A-5 (kalıcı gövde ham token taşımaz) · A-6 (bağlantı yalnız sağlayıcı
 * metninde) · review→promote kapısı (inceleme yetkisi aktarım yetkisi vermez)"; kapanış: "Üç gözlem
 * PASS; gerçek alıcıya gönderim YOK". A-5/A-6 tanımı `RELEASE20-HANDOVER-R01.md` §5.2 satır 193-194.
 * A-9/A-10 (sağlayıcı reddi / timeout) İ12'nindir; BU PAKETTE ÜRETİLMEZ ve SAYILMAZ.
 *
 * KAPILAR (RELEASE22 kaynağından ölçüldü):
 *   · `POST /client-intake-submissions/:id/claim` → `runAuthorizedClientWorkspaceCommand` sınıf
 *     INTAKE_REVIEW: rol TEK BAŞINA yetmez, `client.intake.review` izni (PermissionGrant, GLOBAL,
 *     ALLOW) gerekir; yoksa 403 `CLIENT_MUTATION_DENIED_INTAKE_REVIEW`. Başarıda TEK audit:
 *     action `CLIENT_INTAKE_REVIEW_COMMAND`.
 *   · `POST /client-intake-fields/:fieldId/promote-address|promote-soft` → `assertCanManagePromotion`
 *     = `isApproverEligible` (PARTNER veya yetkilendirilmiş avukat). İnceleme izni BU KAPIYI AÇMAZ.
 *     Ret `ForbiddenException` ve kanonik yazmadan ÖNCE; ret audit ÜRETMEZ.
 *   · `POST /address-discovery/client-info-request` → sınıf WORKSPACE; gönderim BAŞARILIYSA kayıt
 *     oluşur (`ClientInfoRequest` + `ClientNotification` + `AddressAuditLog`), aksi hâlde 503 ve
 *     KAYIT OLUŞMAZ. Kalıcı gövde `persistedBody` (intakeUrl YOK), sağlayıcıya giden `transportBody`.
 *
 * GÖNDERİM KAPSAMI: A-5/A-6 gerçek bir sağlayıcı çağrısı ister. `CL_I11_SEND_APPROVED` verilmediyse
 * bu iki ölçüt ÇAĞRILMAZ ve `KAPSAM DISI (owner gonderim onayi yok)` olarak kaydedilir — sessizce
 * düşürülmez, PASS da sayılmaz; koşum kapsamı makbuzda `sendScopeApproved:false` ile görünür.
 *
 * DUR KURALI: bir YETKİSİZ deneme (R-3 · R-2 · R-2b · A-0') beklenen ret kodunu vermez, istek hatası
 * üretir ya da yazma izi bırakırsa SONRAKİ yetkisiz deneme GÖNDERİLMEZ; kalanlar "CAGRILMADI"
 * gerekçesiyle OLCULEMEDI yazılır.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('../../client-live-acceptance-i1b-r01/scripts/cl-lib');

const STATE = process.env.CL_STATE_FILE || path.join(process.cwd(), 'i11-state.json');
const R = {
  INTAKE_REVIEW: 'CLIENT_MUTATION_DENIED_INTAKE_REVIEW',
  WORKSPACE: 'CLIENT_MUTATION_DENIED_WORKSPACE_COMMAND',
};
const URL_RE = /(https?:\/\/|www\.)/i;

// İ11'e ÖZGÜ GO kapısı — saf ortam denetimi, DB/HTTP'ye dokunmaz, G-0'dan ÖNCE çağrılır.
function assertI11GoRef() {
  if ((process.env.CL_ENVIRONMENT || '').toLowerCase() !== 'live') return;
  if (!/^OWNER-GO-CLIENT-I11-[0-9]{8}-R[0-9]{2}$/.test(process.env.CL_OWNER_GO_REF || '')) {
    throw new Error('canli kosum YALNIZ OWNER-GO-CLIENT-I11-YYYYMMDD-Rnn ile acilir — baska isin GO ref i kabul edilmez; hicbir yazma yapilmadi');
  }
}

// Gönderim kapsamı: yalnız owner GO ref'i ile açılır (biçim aynı ref olmalı).
function sendApproved() {
  const v = (process.env.CL_I11_SEND_APPROVED || '').trim();
  if (!v) return false;
  // CANLIDA: gönderim kapsamı yalnız KOŞUMUN KENDİ owner GO ref'iyle açılır (başka ref ile açılamaz).
  // Disposable provada ref yoktur; kapsam yine açıkça verilmek zorundadır (varsayılan KAPALI).
  if ((process.env.CL_ENVIRONMENT || '').toLowerCase() === 'live'
    && v !== (process.env.CL_OWNER_GO_REF || '').trim()) {
    throw new Error('CL_I11_SEND_APPROVED, CL_OWNER_GO_REF ile AYNI olmali — gonderim kapsami baska bir ref ile acilamaz');
  }
  return true;
}

const results = { pass: 0, fail: 0, unmeasured: 0, outOfScope: 0, findings: [], results: [] };
function record(id, title, verdict, detail) {
  results.results.push({ id, title, verdict, detail });
  if (verdict === 'PASS') results.pass += 1;
  else if (verdict === 'FAIL') results.fail += 1;
  else if (verdict === 'KAPSAM-DISI') results.outOfScope += 1;
  else results.unmeasured += 1;
  const tag = verdict === 'PASS' ? 'OK  ' : verdict === 'FAIL' ? 'FAIL' : verdict === 'KAPSAM-DISI' ? 'KAPS' : '????';
  console.log(`  ${tag} ${id.padEnd(6)} ${title}`);
  console.log(`         ${detail}`);
}
const pass = (id, t, ok, d) => record(id, t, ok ? 'PASS' : 'FAIL', d);
const unmeasured = (id, t, why) => record(id, t, 'UNMEASURED', `OLCULEMEDI: ${why}`);
const outOfScope = (id, t, why) => record(id, t, 'KAPSAM-DISI', why);
const describe = (r) => {
  if (!r) return 'yanit YOK';
  if (r.indeterminate) return `BELIRSIZ(${r.reason})`;
  const b = r.body || {};
  const msg = Array.isArray(b.message) ? b.message.join('; ') : (b.message || '');
  return `HTTP ${r.status} · reasonCode=${b.reasonCode ?? b.code ?? '-'}`
    + (r.status >= 400 && msg ? ` · mesaj="${String(msg).slice(0, 120)}"` : '');
};

async function main() {
  assertI11GoRef();
  const env = L.assertEnvironment();
  const st = JSON.parse(fs.readFileSync(STATE, 'utf8'));
  const base = (process.env.CL_API_BASE_URL || '').replace(/\/+$/, '');
  if (!base) throw new Error('CL_API_BASE_URL YOK');
  const password = L.requireEnv('CL_LOGIN_PASSWORD');
  const withSend = sendApproved();
  const prisma = L.loadPrisma();

  const counts = async () => ({
    infoRequests: await prisma.clientInfoRequest.count({ where: { tenantId: st.tenantId } }),
    notifications: await prisma.clientNotification.count({ where: { tenantId: st.tenantId } }),
    addressAudits: await prisma.addressAuditLog.count({ where: { tenantId: st.tenantId } }),
    audits: await prisma.auditLog.count({ where: { tenantId: st.tenantId } }),
    links: await prisma.clientIntakeLink.count({ where: { tenantId: st.tenantId } }),
    debtorAddresses: await prisma.debtorAddress.count({ where: { debtorId: st.debtorId } }),
    intelStatements: await prisma.clientIntelStatement.count({ where: { tenantId: st.tenantId } }),
  });
  const subSnap = async () => {
    const s = await prisma.clientIntakeSubmission.findFirst({
      where: { id: st.submissionId, tenantId: st.tenantId },
      select: { status: true, claimedById: true, claimedAt: true, reviewedById: true, reviewedAt: true },
    });
    return s ? JSON.stringify(s) : null;
  };
  const fieldSnap = async (id) => {
    const f = await prisma.clientIntakeField.findFirst({
      where: { id },
      select: { reviewStatus: true, reviewNote: true, promotedRefType: true, promotedRefId: true, promotedAt: true, promotedById: true, value: true },
    });
    return f ? JSON.stringify(f) : null;
  };

  const clientRow = await prisma.client.findFirst({ where: { id: st.clientId, tenantId: st.tenantId }, select: { email: true } });
  const emailTo = clientRow && clientRow.email;

  let unauthorizedStop = null;
  const unauthorizedCalls = [];

  try {
    console.log(`\n[H5] intake kabul olcumleri — tenant ${st.slug} (ortam ${env.environment})`
      + ` · gonderim kapsami=${withSend ? 'ONAYLI' : 'YOK'}`);

    // ── P-0: aktörler ve ölçüm geçerliliği ──
    const tokens = {};
    for (const tag of ['reviewer', 'elevated', 'plain']) {
      const lg = await L.login(base, st.actors[tag].email, password, st.slug);
      tokens[tag] = lg.token;
      if (lg.indeterminate) unmeasured(`P-0${tag[0]}`, `${tag} oturum acabiliyor`, lg.reason);
      else pass(`P-0${tag[0]}`, `${tag} oturum acabiliyor`, lg.status === 201 && !!lg.token,
        `HTTP ${lg.status} · token=${lg.token ? 'ALINDI' : 'YOK'}`);
    }
    {
      const grants = await prisma.permissionGrant.count({
        where: { tenantId: st.tenantId, subjectUserId: st.actors.reviewer.id, permissionKey: 'client.intake.review', effect: 'ALLOW', scope: 'GLOBAL' },
      });
      const reviewerLawyer = await prisma.lawyer.count({ where: { tenantId: st.tenantId, userId: st.actors.reviewer.id } });
      const elevatedLawyer = await prisma.lawyer.count({ where: { tenantId: st.tenantId, userId: st.actors.elevated.id, lawyerRank: 'PARTNER' } });
      const plainGrants = await prisma.permissionGrant.count({ where: { tenantId: st.tenantId, subjectUserId: st.actors.plain.id } });
      pass('P-0x', 'OLCUM GECERLI: reviewer inceleme IZNI VAR + PARTNER bagi YOK; elevated PARTNER; plain ikisi de YOK',
        grants === 1 && reviewerLawyer === 0 && elevatedLawyer === 1 && plainGrants === 0,
        `reviewer grant=${grants} lawyer=${reviewerLawyer} · elevated PARTNER=${elevatedLawyer} · plain grant=${plainGrants}`
        + ` · roller ${st.actors.reviewer.role}/${st.actors.elevated.role}/${st.actors.plain.role} (ADMIN yolu KAPALI)`);
    }

    // ── R-3: izinsiz USER inceleme komutunu çalıştıramaz (izin kapısı gerçekten çalışıyor) ──
    {
      const before = await counts(); const s0 = await subSnap();
      const r = tokens.plain ? await L.httpJson('POST', `${base}/client-intake-submissions/${st.submissionId}/claim`, { token: tokens.plain, body: {} }) : null;
      unauthorizedCalls.push('R-3');
      const s1 = await subSnap(); const after = await counts();
      if (!r || r.indeterminate) {
        unmeasured('R-3', 'izinsiz USER inceleme komutunu CALISTIRAMAZ', r ? r.reason : 'token yok');
        unauthorizedStop = `R-3 ${r ? `istek hatasi (${r.reason})` : 'token yok'}`;
      } else {
        const ok = r.status === 403 && r.body && r.body.reasonCode === R.INTAKE_REVIEW && s0 === s1 && before.audits === after.audits;
        pass('R-3', 'izinsiz USER claim 403 (CLIENT_MUTATION_DENIED_INTAKE_REVIEW) ve basvuru DEGISMEZ', ok,
          `${describe(r)} · basvuru degisti=${s0 !== s1} · audit ${before.audits}->${after.audits}`);
        if (!ok) unauthorizedStop = r.status !== 403 ? `R-3 HTTP ${r.status} (403 bekleniyordu)` : 'R-3 kapi/yazma sapmasi';
      }
    }

    // ── R-1: inceleme izni OLAN aktör claim yapabilir (pozitif; kapının açık ucu) ──
    {
      const before = await counts(); const s0 = await subSnap();
      const r = tokens.reviewer ? await L.httpJson('POST', `${base}/client-intake-submissions/${st.submissionId}/claim`, { token: tokens.reviewer, body: {} }) : null;
      const after = await counts(); const s1 = await subSnap();
      if (!r || r.indeterminate) unmeasured('R-1', 'inceleme izinli aktor claim yapabilir', r ? r.reason : 'token yok');
      else {
        const sub = await prisma.clientIntakeSubmission.findFirst({ where: { id: st.submissionId }, select: { status: true, claimedById: true } });
        const ok = r.status >= 200 && r.status < 300 && sub && sub.status === 'IN_REVIEW' && sub.claimedById === st.actors.reviewer.id
          && after.audits === before.audits + 1 && s0 !== s1;
        pass('R-1', 'inceleme izinli aktor claim 2xx; basvuru IN_REVIEW + claimedBy=reviewer (tek inceleme audit)', ok,
          `HTTP ${r.status} · durum=${sub ? sub.status : '-'} · claimedBy=${sub && sub.claimedById === st.actors.reviewer.id ? 'reviewer' : '-'}`
          + ` · audit ${before.audits}->${after.audits}`);
      }
    }

    // ── R-2 / R-2b: KAPI — inceleme yetkisi AKTARIM (promote) yetkisi VERMEZ ──
    for (const [id, field, endpoint, canonical] of [
      ['R-2', st.fields.address, 'promote-address', 'debtorAddresses'],
      ['R-2b', st.fields.contact, 'promote-soft', 'intelStatements'],
    ]) {
      if (unauthorizedStop) { unmeasured(id, 'inceleme izni promote yetkisi VERMEZ', `CAGRILMADI — ${unauthorizedStop}`); continue; }
      const before = await counts(); const f0 = await fieldSnap(field); const s0 = await subSnap();
      // Gövde GEÇERLİ olmalı: aksi hâlde 400 doğrulama katmanından döner ve ölçüm yanlış kapıdan
      // gelmiş olur (promote-address: debtorId + street + city zorunlu).
      const body = endpoint === 'promote-address'
        ? { debtorId: st.debtorId, street: `CL I11 Cad. ${st.runId}`, city: 'Ankara' }
        : { debtorId: st.debtorId };
      const r = tokens.reviewer ? await L.httpJson('POST', `${base}/client-intake-fields/${field}/${endpoint}`, { token: tokens.reviewer, body }) : null;
      unauthorizedCalls.push(id);
      const f1 = await fieldSnap(field); const s1 = await subSnap(); const after = await counts();
      if (!r || r.indeterminate) {
        unmeasured(id, 'inceleme izni promote yetkisi VERMEZ', r ? r.reason : 'token yok');
        unauthorizedStop = `${id} ${r ? `istek hatasi (${r.reason})` : 'token yok'}`;
      } else {
        const ok = r.status === 403 && f0 !== null && f0 === f1 && s0 === s1
          && after[canonical] === 0 && before[canonical] === 0 && after.audits === before.audits;
        pass(id, `inceleme izinli aktor ${endpoint} 403; kanonik kayit OLUSMAZ, alan ve basvuru DEGISMEZ`, ok,
          `${describe(r)} · kanonik(${canonical}) ${before[canonical]}->${after[canonical]} · alan degisti=${f0 !== f1}`
          + ` · basvuru degisti=${s0 !== s1} · audit ${before.audits}->${after.audits}`);
        if (!ok) unauthorizedStop = r.status !== 403 ? `${id} HTTP ${r.status} (403 bekleniyordu)` : `${id} kapi/yazma sapmasi`;
        if (r.status === 403 && !(r.body && (r.body.reasonCode || r.body.code))) {
          results.findings.push({ id: `B-I11-${id}`, note: 'promote reddi STABIL KOD tasimiyor (yalniz mesaj); kabul olcutu degil, kayda gecti' });
        }
      }
    }

    // ── A-0': anonim bilgi talebi → 401, kayıt ve gönderim YOK ──
    if (unauthorizedStop) unmeasured('A-0i', 'anonim bilgi talebi REDDEDILIR', `CAGRILMADI — ${unauthorizedStop}`);
    else {
      const before = await counts();
      const r = await L.httpJson('POST', `${base}/address-discovery/client-info-request`, { body: { caseId: st.caseId, clientId: st.clientId } });
      unauthorizedCalls.push('A-0i');
      const after = await counts();
      if (!r || r.indeterminate) {
        unmeasured('A-0i', 'anonim bilgi talebi REDDEDILIR', r ? r.reason : 'yanit yok');
        unauthorizedStop = `A-0i istek hatasi (${r ? r.reason : 'yanit yok'})`;
      } else {
        const ok = r.status === 401 && before.infoRequests === after.infoRequests
          && before.notifications === after.notifications && before.addressAudits === after.addressAudits;
        pass('A-0i', 'anonim POST /address-discovery/client-info-request 401; talep/bildirim/adres-audit OLUSMAZ', ok,
          `HTTP ${r.status} · talep ${before.infoRequests}->${after.infoRequests} · bildirim ${before.notifications}->${after.notifications}`
          + ` · adresAudit ${before.addressAudits}->${after.addressAudits}`);
        if (!ok) unauthorizedStop = r.status !== 401 ? `A-0i HTTP ${r.status} (401 bekleniyordu)` : 'A-0i yazma sapmasi';
      }
    }

    // ── A-5 / A-6: YALNIZ owner gönderim onayıyla ──
    if (!withSend) {
      outOfScope('A-5', 'kalici govde ham token/URL TASIMAZ', 'KAPSAM DISI: owner gonderim onayi (CL_I11_SEND_APPROVED) YOK — cagri YAPILMADI');
      outOfScope('A-6', 'baglanti YALNIZ saglayici metninde', 'KAPSAM DISI: owner gonderim onayi YOK — cagri YAPILMADI');
    } else {
      // A-5: bağlantısız bilgi talebi
      {
        const before = await counts();
        const r = tokens.elevated ? await L.httpJson('POST', `${base}/address-discovery/client-info-request`, {
          token: tokens.elevated, body: { caseId: st.caseId, clientId: st.clientId, debtorId: st.debtorId, emailTo },
        }) : null;
        const after = await counts();
        if (!r || r.indeterminate) unmeasured('A-5', 'kalici govde ham token/URL TASIMAZ', r ? r.reason : 'token yok');
        else {
          const row = await prisma.clientInfoRequest.findFirst({
            where: { tenantId: st.tenantId }, orderBy: { createdAt: 'desc' },
            select: { id: true, emailTo: true, emailBody: true, status: true },
          });
          const bodyClean = !!row && !URL_RE.test(row.emailBody);
          const ok = r.status === 201 && after.infoRequests === before.infoRequests + 1 && bodyClean
            && after.notifications === before.notifications + 1 && after.addressAudits === before.addressAudits + 1
            && !!row && row.emailTo.endsWith('@cl-acceptance.invalid') && row.status === 'SENT';
          pass('A-5', 'yetkili bilgi talebi 201; KALICI govde ham token/URL TASIMAZ', ok,
            `${describe(r)} · talep ${before.infoRequests}->${after.infoRequests} · govdede URL=${row ? URL_RE.test(row.emailBody) : '-'}`
            + ` · alici .invalid=${row ? row.emailTo.endsWith('@cl-acceptance.invalid') : '-'}`
            + ` · bildirim ${before.notifications}->${after.notifications} · adresAudit ${before.addressAudits}->${after.addressAudits}`);
        }
      }
      // A-6: attachIntakeLink — kalıcı gövde yine bağlantısız; bağlantı yalnız taşıma metninde
      {
        const before = await counts();
        const r = tokens.elevated ? await L.httpJson('POST', `${base}/address-discovery/client-info-request`, {
          token: tokens.elevated, body: { caseId: st.caseId, clientId: st.clientId, debtorId: st.debtorId, emailTo, attachIntakeLink: true },
        }) : null;
        const after = await counts();
        if (!r || r.indeterminate) unmeasured('A-6', 'baglanti YALNIZ saglayici metninde', r ? r.reason : 'token yok');
        else {
          const row = await prisma.clientInfoRequest.findFirst({
            where: { tenantId: st.tenantId }, orderBy: { createdAt: 'desc' },
            select: { emailBody: true },
          });
          const link = await prisma.clientIntakeLink.findFirst({
            where: { tenantId: st.tenantId }, orderBy: { createdAt: 'desc' },
            select: { id: true, tokenHash: true, status: true },
          });
          const ok = r.status === 201 && after.links === before.links + 1 && !!row && !URL_RE.test(row.emailBody)
            && after.infoRequests === before.infoRequests + 1 && !!link && /^[0-9a-f]{64}$/.test(link.tokenHash);
          pass('A-6', 'attachIntakeLink: yeni intake baglantisi olusur; KALICI govde yine URL TASIMAZ (ham token DB de YOK)', ok,
            `${describe(r)} · link ${before.links}->${after.links} · govdede URL=${row ? URL_RE.test(row.emailBody) : '-'}`
            + ` · tokenHash 64-hex=${link ? /^[0-9a-f]{64}$/.test(link.tokenHash) : '-'}`
            + ` · NOT: "saglayici metni baglanti TASIR" ayagi yalniz gozlenebilir saglayicili provada olculur`);
        }
      }
    }

    if (unauthorizedStop) console.log(`  >>> YETKISIZ DENEME DURDU: ${unauthorizedStop} — sonraki yetkisiz denemeler GONDERILMEDI`);
    console.log(`\nI11 H5 INTAKE KABULU: PASS ${results.pass} · FAIL ${results.fail} · OLCULEMEYEN ${results.unmeasured}`
      + ` · KAPSAM DISI ${results.outOfScope}  (toplam ${results.results.length})`);
    console.log(JSON.stringify({
      record: 'CL-I11-INTAKE', runId: st.runId, slug: st.slug, environment: env.environment,
      sendScopeApproved: withSend,
      pass: results.pass, fail: results.fail, unmeasured: results.unmeasured, outOfScope: results.outOfScope,
      unauthorizedCalls, unauthorizedStop,
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
// i11-run / i11-01 ön kontrolleri için; yan etkisiz, HTTP/DB çağırmaz.
module.exports = { assertI11GoRef, sendApproved };
