/*
 * CLIENT KABUL ALTYAPISI (İ1a) — ADIM 3: GÖNDERİM İZOLASYONU
 *
 * OWNER İTİRAZI: ".invalid adres kullandım" tek başına dış gönderim engeli SAYILMAZ.
 * Bu betik engeli adresten DEĞİL, **taşıma hedefinden** kanıtlar:
 *
 *   1) Ürünün SMTP taşıması tenant'ın kendi `Office` satırından beslenir
 *      (office.service.ts:455-465 → client-notification.service.ts:705-710). Sentetik tenant'ın
 *      hedefi 127.0.0.1'deki yakalama sunucusudur; ortak/canlı konfigürasyona DOKUNULMAZ.
 *   2) Yakalama sunucusu YALNIZ loopback'e bağlanır — LAN adresinden erişilemediği ÖLÇÜLÜR.
 *   3) Sunucu kapatıldığında gönderim ÖLÜR (bağlantı reddi). Gerçek sağlayıcıya düşen bir yol
 *      OLSAYDI mesaj yine giderdi; ölçüm bunun olmadığını gösterir.
 *   4) Sağlayıcı hatası (550) dış gönderime veya otomatik gerçek-sağlayıcı geçişine DÖNÜŞMEZ.
 *   5) SMTP yapılandırılmamışsa ürün fail-closed durur — varsayılan sağlayıcı YOKTUR.
 *
 * YAZMA KAPSAMI: yalnız sentetik tenant'ın `Office` satırı (upsert) + ürünün kendi ürettiği
 * `ClientNotification` kayıtları. Başka tenant'ın Office satırı OKUNUR ve DEĞİŞMEDİĞİ ölçülür.
 */
'use strict';
const net = require('net');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const L = require('./ah-lib');

const SMTP_PORT = Number(process.env.AH_SMTP_PORT || 2525);
const CAPTURE_DIR = process.env.AH_SMTP_CAPTURE || path.join(process.cwd(), 'smtp-capture');

const results = [];
function chk(id, desc, ok, observed) {
  results.push({ id, desc, ok, observed });
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${id.padEnd(5)} ${desc}\n        ${observed}`);
}

/** Sink'i alt süreç olarak başlat; hazır olduğunu bildirene kadar bekle. */
function startSink(failMode) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, 'ah-smtp-sink.js')], {
      env: {
        ...process.env,
        AH_SMTP_PORT: String(SMTP_PORT),
        AH_SMTP_CAPTURE: CAPTURE_DIR,
        AH_SMTP_FAIL: failMode || '',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    const t = setTimeout(() => reject(new Error('sink 5 sn icinde hazir olmadi')), 5000);
    child.stdout.on('data', (d) => {
      out += d.toString();
      if (out.includes('AH-SMTP-SINK-READY')) { clearTimeout(t); resolve(child); }
    });
    child.on('error', (e) => { clearTimeout(t); reject(e); });
  });
}

function stopSink(child) {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null) return resolve();
    child.once('exit', () => resolve());
    child.kill();
    setTimeout(resolve, 2000);
  });
}

/** Belirtilen adrese TCP bağlanmayı dener; {reachable, reason} döner. */
function probeTcp(host, port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const s = new net.Socket();
    let done = false;
    const fin = (reachable, reason) => {
      if (!done) { done = true; s.destroy(); resolve({ reachable, reason }); }
    };
    s.setTimeout(timeoutMs);
    s.once('connect', () => fin(true, 'baglanti kuruldu'));
    s.once('timeout', () => fin(false, `timeout (${timeoutMs} ms)`));
    s.once('error', (e) => fin(false, e.code || e.message));
    s.connect(port, host);
  });
}

function countCaptured() {
  try { return fs.readdirSync(CAPTURE_DIR).filter((f) => f.endsWith('.eml')).length; }
  catch (e) { return 0; }
}
function readCaptured() {
  try {
    return fs.readdirSync(CAPTURE_DIR).filter((f) => f.endsWith('.eml'))
      .map((f) => fs.readFileSync(path.join(CAPTURE_DIR, f), 'utf8'));
  } catch (e) { return []; }
}

(async () => {
  L.assertDisposableEnvironment(); // G-0
  const base = L.requireEnv('AH_API_BASE_URL').replace(/\/+$/, '');
  const password = L.requireLoginPassword();
  const st = L.loadState();
  L.assertOwnSlug(st.slug); // G-1

  const prisma = L.loadPrisma();
  let sink = null;
  try {
    await L.assertOwnTenant(prisma, st.tenantId); // G-2
    L.step('M', `gonderim izolasyonu — tenant ${st.slug}`);

    const auth = await L.login(base, st.actors.elevated.email, password, st.slug);
    if (!auth.ok) throw new Error(`elevated oturum acamadi (HTTP ${auth.status})`);
    const token = auth.token;

    // Komşu tenant'ların Office/SMTP taban ölçümü — sonunda DEĞİŞMEDİĞİ kanıtlanır.
    const neighborsBefore = await prisma.office.findMany({
      where: { tenantId: { not: st.tenantId } },
      select: { tenantId: true, smtpHost: true, smtpPort: true, smtpUser: true, smtpFromEmail: true },
      orderBy: { tenantId: 'asc' },
    });

    // ── M-0: sink loopback'te; LAN adresinden ERİŞİLEMEZ ──
    sink = await startSink('');
    const loop = await probeTcp('127.0.0.1', SMTP_PORT);
    const lanIps = [];
    for (const list of Object.values(os.networkInterfaces())) {
      for (const ni of (list || [])) if (ni.family === 'IPv4' && !ni.internal) lanIps.push(ni.address);
    }
    const lanProbes = [];
    for (const ip of lanIps) lanProbes.push({ ip, ...(await probeTcp(ip, SMTP_PORT)) });
    const anyLanReachable = lanProbes.some((p) => p.reachable);
    chk('M-0', 'yakalama sunucusu YALNIZ loopback\'te dinliyor',
      loop.reachable && !anyLanReachable && lanIps.length > 0,
      `127.0.0.1:${SMTP_PORT}=${loop.reachable ? 'ERISILIR' : 'ERISILEMEZ'} · `
      + (lanIps.length
        ? lanProbes.map((p) => `${p.ip}=${p.reachable ? 'ERISILIR(!)' : 'ERISILEMEZ'}`).join(' · ')
        : 'LAN adresi YOK — kanit eksik'));

    // ── SMTP hedefi: YALNIZ sentetik tenant'ın Office satırı ──
    const smtpTarget = {
      smtpHost: '127.0.0.1',
      smtpPort: SMTP_PORT,
      smtpSecure: false,
      smtpUser: `sink-${st.runId}@ah-harness.invalid`,
      smtpPass: 'ah-sink-no-auth',
      smtpFromEmail: `noreply-${st.runId}@ah-harness.invalid`,
      smtpFromName: 'AH Sink',
    };
    await prisma.office.upsert({
      where: { tenantId: st.tenantId },
      update: smtpTarget,
      create: { tenantId: st.tenantId, name: `AH Office ${st.runId}`, ...smtpTarget },
    });

    const sendEmail = (subject) => L.httpJson('POST', `${base}/client-notifications/send-email`, {
      token,
      body: {
        clientId: st.clientId,
        type: 'GENEL_BILGILENDIRME',
        subject,
        body: 'AH izolasyon olcumu — sentetik icerik.',
      },
      timeoutMs: 20000,
    });

    // ── M-1: yerel sağlayıcı gönderimi YAKALIYOR ──
    const before = countCaptured();
    const r1 = await sendEmail(`AH-CAPTURE-${st.runId}`);
    await new Promise((r) => setTimeout(r, 400));
    const after = countCaptured();
    const bodies = readCaptured();
    const capturedOurs = bodies.some((b) => b.includes(`AH-CAPTURE-${st.runId}`)
      || b.includes(`client-${st.runId}@ah-harness.invalid`));
    chk('M-1', 'yerel saglayici gonderimi YAKALADI',
      !r1.indeterminate && r1.status < 400 && after > before && capturedOurs,
      `HTTP ${r1.status} · yakalanan ${before}→${after} · icerik eslesti=${capturedOurs}`);

    // ── M-2: yakalanan alıcılar dışarı gönderilebilir adres DEĞİL ──
    const allRecipients = bodies.flatMap((b) => {
      const m = b.match(/^X-AH-To: (.*)$/m);
      return m ? m[1].split(',').map((x) => x.trim()).filter(Boolean) : [];
    });
    const nonInvalid = allRecipients.filter((a) => !/\.invalid>?$/.test(a.replace(/[<>]/g, '')));
    chk('M-2', 'yakalanan mesajlarin ALICILARI disa gonderilebilir adres DEGIL',
      allRecipients.length > 0 && nonInvalid.length === 0,
      `${allRecipients.length} alici · disa gonderilebilir ${nonInvalid.length}`
      + (nonInvalid.length ? ` (${nonInvalid.join(', ')})` : ''));

    // ── M-3: SAĞLAYICI HATASI → dış gönderim YOK, otomatik gerçek-sağlayıcı geçişi YOK ──
    await stopSink(sink);
    sink = await startSink('reject');
    const cBefore3 = countCaptured();
    const r3 = await sendEmail(`AH-REJECT-${st.runId}`);
    await new Promise((r) => setTimeout(r, 400));
    const cAfter3 = countCaptured();
    const notif3 = await prisma.clientNotification.findFirst({
      where: { tenantId: st.tenantId, subject: `AH-REJECT-${st.runId}` },
      select: { status: true }, orderBy: { createdAt: 'desc' },
    });
    chk('M-3', 'saglayici REDDI dis gonderime / otomatik gercek-saglayici gecisine DONUSMEDI',
      !r3.indeterminate && r3.status >= 400 && cAfter3 === cBefore3,
      `HTTP ${r3.status} · yakalama sayisi DEGISMEDI=${cAfter3 === cBefore3}`
      + ` · kayit durumu=${notif3 ? notif3.status : 'YOK'}`);

    // ── M-4: SUNUCU KAPALI → gönderim ÖLÜR; gerçek sağlayıcıya DÜŞMEZ ──
    await stopSink(sink); sink = null;
    const stillUp = await probeTcp('127.0.0.1', SMTP_PORT, 800);
    const cBefore4 = countCaptured();
    const r4 = await sendEmail(`AH-NOSINK-${st.runId}`);
    const cAfter4 = countCaptured();
    chk('M-4', 'sunucu KAPALIYKEN gonderim OLUR (adres degil, TASIMA HEDEFI engeller)',
      !stillUp.reachable && !r4.indeterminate && r4.status >= 400 && cAfter4 === cBefore4,
      `sink kapali=${!stillUp.reachable} · HTTP ${r4.status} · yakalama DEGISMEDI=${cAfter4 === cBefore4}`);

    // ── M-5: SMTP YAPILANDIRILMAMIŞ → fail-closed; varsayılan sağlayıcı YOK ──
    await prisma.office.update({
      where: { tenantId: st.tenantId }, data: { smtpHost: null, smtpUser: null },
    });
    const r5 = await sendEmail(`AH-UNCONFIGURED-${st.runId}`);
    const msg5 = r5.body && (r5.body.message || (r5.body.error && r5.body.error.message));
    chk('M-5', 'SMTP yapilandirilmamisken VARSAYILAN saglayiciya DUSMEZ (fail-closed)',
      !r5.indeterminate && r5.status >= 400,
      `HTTP ${r5.status} · mesaj="${String(msg5 || '').slice(0, 70)}"`);
    // Hedefi geri koy (sonraki adımlar tutarlı durumla devralsın).
    await prisma.office.update({
      where: { tenantId: st.tenantId },
      data: { smtpHost: '127.0.0.1', smtpUser: `sink-${st.runId}@ah-harness.invalid` },
    });

    // ── M-6: KAYNAK KANITI — taşıma YALNIZ tenant ayarından beslenir, fallback YOK ──
    const svc = path.resolve(__dirname,
      '../../../../apps/api/src/modules/client-notification/client-notification.service.ts');
    let srcOk = false; let srcNote = `kaynak dosya bulunamadi: ${svc}`;
    if (fs.existsSync(svc)) {
      const src = fs.readFileSync(svc, 'utf8');
      const transports = src.split('nodemailer.createTransport').slice(1);
      const fromSettings = transports.filter((t) => /host:\s*smtpSettings\.smtpHost/.test(t.slice(0, 260)));
      const envFallback = /smtpHost\s*\|\|\s*(process\.env|["'])/.test(src);
      srcOk = transports.length > 0 && fromSettings.length === transports.length && !envFallback;
      srcNote = `createTransport ${transports.length} adet · hepsi tenant ayarindan=`
        + `${fromSettings.length === transports.length} · env/sabit fallback=${envFallback ? 'VAR(!)' : 'YOK'}`;
    }
    chk('M-6', 'kaynak: SMTP hedefi YALNIZ tenant ayarindan gelir, fallback yolu YOK', srcOk, srcNote);

    // ── M-7: KOMŞU TENANT'LARIN SMTP AYARI DEĞİŞMEDİ ──
    const neighborsAfter = await prisma.office.findMany({
      where: { tenantId: { not: st.tenantId } },
      select: { tenantId: true, smtpHost: true, smtpPort: true, smtpUser: true, smtpFromEmail: true },
      orderBy: { tenantId: 'asc' },
    });
    const same = JSON.stringify(neighborsBefore) === JSON.stringify(neighborsAfter);
    chk('M-7', 'ORTAK / CANLI saglayici konfigurasyonu DEGISMEDI', same,
      `${neighborsBefore.length} komsu Office satiri izlendi · degisiklik=${same ? 'YOK' : 'VAR(!)'}`);

    const okN = results.filter((r) => r.ok).length;
    console.log(`\nGONDERIM IZOLASYONU: ${okN}/${results.length} ${okN === results.length ? 'PASS' : 'FAIL'}`);
    console.log(JSON.stringify({
      record: 'AH-SEND-ISOLATION', tenant: st.slug, runId: st.runId,
      result: `${okN}/${results.length}`, captureDir: CAPTURE_DIR, secretsPrinted: false,
    }, null, 1));
    process.exitCode = okN === results.length ? 0 : 2;
  } finally {
    await stopSink(sink);
    await prisma.$disconnect().catch(() => {});
  }
})().catch((e) => {
  console.error('\nGONDERIM OLCUM HATASI:', e && e.message ? e.message : e);
  process.exitCode = 1;
});
