/*
 * CLIENT KABUL DÜZENEKLERİ (İ3) — TEK YÜRÜTÜCÜ
 *
 * İ2 ölçüt setinin H2/H4/H5 kollarını YEREL/DISPOSABLE ortamda koşar. H7'nin altı ölçütü
 * İ4 kapsam kararını bekler ve burada KOŞULMAZ (bekleme diğerlerini durdurmaz).
 *
 * İ1a'DAN DEVRALINANLAR (yeniden kurulmaz): G-0 ortam kapısı · G-1/G-2 tenant kapıları ·
 * G-4 sır yasağı · belirsiz HTTP ayrımı · `finally` ile erişim sonlandırma.
 *
 * F04 KUSURU B(i) BURADA DA TEKRARLANMAZ: erişim sonlandırma çıkış kodundan BAĞIMSIZ çalışır;
 * `runId` adımlardan ÖNCE üretilir. Bu yürütücü TEK SÜREÇTİR — bu, ölçüm token'larını bellekte
 * tutarak login sayısını hız sınırı bütçesi (IP başına 10/dk) altında bırakır.
 *
 * KULLANIM
 *   AH_DATABASE_URL=... AH_API_BASE_URL=http://127.0.0.1:<port>/api node i3-run.js
 * Yol B (H5-01) için API `EMAIL_PROVIDER=smtp` + `SMTP_HOST=127.0.0.1` + `SMTP_PORT=<sink>`
 * ile başlatılmış olmalıdır; aksi hâlde H5-01 UNMEASURED raporlanır (mock KANIT DEĞİLDİR).
 */
'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const net = require('net');
const os = require('os');
const { spawn } = require('child_process');
const L = require('./i3-lib');

const SINK_PORT = Number(process.env.I3_SMTP_PORT || 2526);
const CAPTURE = process.env.I3_SMTP_CAPTURE || path.join(process.cwd(), 'i3-smtp-capture');

function generatePassword() { return `I3!${crypto.randomBytes(18).toString('base64url')}7q`; }

function probeTcp(host, port, timeoutMs = 1200) {
  return new Promise((resolve) => {
    const s = new net.Socket(); let done = false;
    const fin = (ok) => { if (!done) { done = true; s.destroy(); resolve(ok); } };
    s.setTimeout(timeoutMs);
    s.once('connect', () => fin(true));
    s.once('timeout', () => fin(false));
    s.once('error', () => fin(false));
    s.connect(port, host);
  });
}

function startSink() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, 'i3-sink.js')], {
      env: { ...process.env, I3_SMTP_PORT: String(SINK_PORT), I3_SMTP_CAPTURE: CAPTURE },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    const t = setTimeout(() => reject(new Error('i3-sink 5 sn icinde hazir olmadi')), 5000);
    child.stdout.on('data', (d) => {
      out += d.toString();
      if (out.includes('I3-SMTP-SINK-READY')) { clearTimeout(t); resolve(child); }
    });
    child.on('error', (e) => { clearTimeout(t); reject(e); });
  });
}

/** Sağlayıcı kontrol yüzeyi: mod değişimi · sayaç · taşıma gövdesi · ön doğrulama. */
function makeSinkHandle(available) {
  const files = (pre) => {
    try { return fs.readdirSync(CAPTURE).filter((f) => f.startsWith(pre)); }
    catch (e) { return []; }
  };
  return {
    available,
    async setMode(m) {
      fs.writeFileSync(path.join(CAPTURE, 'mode'), m || '', 'utf8');
      await new Promise((r) => setTimeout(r, 60));
    },
    count() { return files('msg-').length; },
    conversations() { return files('conn-').length; },
    /** Yakalanan mesajların TAŞIMA gövdeleri (A-5/A-6 ölçümü bunu okur). */
    readCaptured() {
      return files('msg-').map((f) => {
        try { return fs.readFileSync(path.join(CAPTURE, f), 'utf8'); }
        catch (e) { return ''; }
      });
    },
    /**
     * İZOLASYON ÖN KOŞULU — **hiçbir gönderim çağrısı yapmaz**.
     *
     * Sonda bir gönderimdir; izolasyonu VARSAYARAK atılan ilk gönderim olmamalıdır. Bu yüzden
     * sondadan ÖNCE, yalnız ağ ve bildirim düzeyinde doğrulanır:
     *   (a) yakalayıcı loopback'te dinliyor,
     *   (b) makinenin LAN adreslerinden ERİŞİLEMİYOR,
     *   (c) prova API'sinin bildirilen etkin sağlayıcısı `smtp`,
     *   (d) bildirilen taşıma hedefi (host:port) YAKALAYICININ adresi.
     * (c)/(d) `I3_API_*` bildirimlerinden okunur; bunlar prova API'sini başlatan komutla
     * AYNI değerlerdir. Biri sağlanmazsa **sonda dahil** hiçbir gönderim yapılmaz.
     */
    async verifyIsolationPreconditions() {
      const loopbackReachable = await probeTcp('127.0.0.1', SINK_PORT);
      const lan = [];
      for (const list of Object.values(os.networkInterfaces())) {
        for (const ni of (list || [])) if (ni.family === 'IPv4' && !ni.internal) lan.push(ni.address);
      }
      let anyLanReachable = false;
      for (const ip of lan) if (await probeTcp(ip, SINK_PORT, 900)) anyLanReachable = true;

      const provider = (process.env.I3_API_EMAIL_PROVIDER || '').toLowerCase();
      const host = process.env.I3_API_SMTP_HOST || '127.0.0.1';
      const port = String(process.env.I3_API_SMTP_PORT || SINK_PORT);
      const providerOk = provider === 'smtp';
      const targetOk = ['127.0.0.1', 'localhost', '::1'].includes(host)
        && port === String(SINK_PORT);

      const ok = loopbackReachable && !anyLanReachable && lan.length > 0 && providerOk && targetOk;
      return {
        ok, loopbackReachable, anyLanReachable, lanChecked: lan.length,
        provider, host, port, providerOk, targetOk,
      };
    },
    /**
     * DISPATCHER ÇAĞRI SAYACI — "yakalayıcıda mesaj yok" ile AYNI ŞEY DEĞİLDİR.
     * Mesaj sayısı teslim edilmiş gövdeleri sayar; bu ise **TCP oturumu açıldı mı**yı sayar.
     * `EmailProviderService.sendViaSmtp` çağrılırsa nodemailer bağlanır ve `conn-*` yazılır;
     * çağrı hiç yapılmadıysa bağlantı da açılmaz. Gerçek çağrı noktasının yerel ölçümüdür.
     */
    dispatcherCalls() { return files('conn-').length; },
  };
}

(async () => {
  const envInfo = L.AH.assertDisposableEnvironment(); // G-0 — yazmadan ÖNCE
  const base = L.AH.requireEnv('AH_API_BASE_URL').replace(/\/+$/, '');
  const runId = (process.env.AH_RUN_ID || L.AH.newRunId()).toLowerCase();
  const password = generatePassword(); // BELLEKTE — basilmaz, yazilmaz
  process.env.AH_LOGIN_PASSWORD = password; // yalnız bu sürecin belleği

  console.log('CLIENT KABUL DUZENEKLERI (I3) — KOSUM');
  console.log(`  runId      : ${runId}   (sir ICERMEZ)`);
  console.log(`  veritabani : ${envInfo.dbHost}:${envInfo.dbPort}/${envInfo.dbName}`);
  console.log(`  API        : ${envInfo.apiHost}:${envInfo.apiPort}`);
  console.log('  parola     : bellekte uretildi — BASILMAZ, DOSYAYA YAZILMAZ');

  const prisma = L.AH.loadPrisma();
  const bcrypt = require(process.env.AH_BCRYPT_PATH
    || path.join(process.env.AH_PRISMA_ROOT
      || 'C:/Development/HUKUK_YAZILIMI/HY_W4_RELEASE20/project/apps/api/node_modules/@prisma/client',
    '../../bcrypt'));

  const R = new L.Results();
  let st = null;
  let sinkProc = null;
  let setupAttempted = false;

  try {
    // ── Yol B yakalama sunucusu ──
    fs.mkdirSync(CAPTURE, { recursive: true });
    let sinkOk = false;
    try {
      sinkProc = await startSink();
      sinkOk = await probeTcp('127.0.0.1', SINK_PORT);
    } catch (e) {
      console.error(`  (i3-sink baslatilamadi: ${e.message})`);
    }
    // Yol B yalnız API GERÇEKTEN bu sink'e yönlendirildiyse ölçülebilir.
    const providerDeclared = (process.env.I3_API_EMAIL_PROVIDER || '').toLowerCase();
    const providerSmtp = providerDeclared === 'smtp';
    if (!providerSmtp) {
      console.log('  UYARI: I3_API_EMAIL_PROVIDER=smtp bildirilmedi → H5-01 OLCULEMEDI olarak raporlanir');
    }
    const sink = makeSinkHandle(sinkOk && providerSmtp);

    // ── Kurulum (bu satırdan sonra yazma COMMIT edilmiş OLABİLİR) ──
    setupAttempted = true;
    const passwordHash = await bcrypt.hash(password, 10);
    L.AH.step('S', `kurulum — tenant ah-${runId} (+ yabanci tenant)`);
    st = await L.setupI3(prisma, bcrypt, runId, passwordHash);
    st.runId = runId;
    console.log(`      tenant=${st.slug} · muvekkil=${st.clientId.slice(-8)} · dosya=${st.caseId.slice(-8)}`);
    console.log(`      yabanci tenant=${st.foreignSlug}`);

    // ── API bağlantı doğrulaması (G-0 ikinci katman) ──
    const bound = await L.AH.verifyApiBoundToSameDatabase(
      prisma, base, st.actors.elev1.email, password, st.slug);
    if (!bound.bound) {
      console.error(`      ORTAM DOGRULANAMADI — ${bound.reason}; yazilanlar GERI ALINIYOR`);
      await prisma.tenant.delete({ where: { id: st.foreignTenantId } }).catch(() => {});
      await prisma.tenant.delete({ where: { id: st.tenantId } }).catch(() => {});
      st = null;
      throw new Error(`API disposable veritabanina bagli DEGIL/dogrulanamadi: ${bound.reason}`);
    }

    // ── Aktör oturumları: token'lar BELLEKTE, tüm ölçütlerde yeniden kullanılır ──
    const tokens = {};
    for (const a of L.ACTORS) {
      const r = await L.AH.login(base, st.actors[a.tag].email, password, st.slug);
      if (!r.ok) throw new Error(`${a.tag} oturum acamadi (HTTP ${r.status ?? 'belirsiz'})`);
      tokens[a.tag] = r.token;
    }
    console.log(`      ${Object.keys(tokens).length} aktor oturumu acildi (login butcesi korunur)`);

    // ── Ölçüm geçerliliği: `user` ile `elev*` AYNI rolde olmalı (İ1a R-0x deseni) ──
    const roles = L.ACTORS.map((a) => `${a.tag}:${st.actors[a.tag].role}`).join(' ');
    const sameRole = st.actors.user.role === st.actors.elev1.role && st.actors.user.role !== 'ADMIN';
    R.check('I3-00', 'OLCUM GECERLI: user ile elev* AYNI rolde, fark YALNIZ PARTNER bagi',
      sameRole, `${roles} · ADMIN yolu KAPALI=${st.actors.elev1.role !== 'ADMIN'}`);

    const ctx = { base, prisma, tokens, st, R, sink };
    await require('./i3-h2-address')(ctx);
    await require('./i3-h4-declarations')(ctx);
    await require('./i3-h5-intake')(ctx);
    // ── H4-06/07/08 ön koşulu: ürünün KENDİ yolundan finansal beyan zinciri ──
    // Aktivasyon bayrağı prova API'sinin KENDİ ortamındadır; canlı flag DEĞİŞTİRİLMEZ.
    try {
      ctx.chain = await L.setupDisclosureChain(prisma, st, runId);
      console.log(`      finansal zincir kuruldu: disposition=${ctx.chain.dispositionId.slice(-8)}`);
    } catch (e) {
      ctx.chain = null;
      console.log(`      finansal zincir KURULAMADI: ${e && e.message ? e.message.slice(0, 120) : e}`);
      ctx.chainError = e && e.message ? e.message : String(e);
    }
    await require('./i3-h4-disclosure')(ctx);

    // ── H7: İ4 kapsam kararını bekler ──
    L.AH.step('H7', 'portal — I4 kapsam karari BEKLIYOR');
    for (const id of ['H7-00', 'H7-01', 'H7-02', 'H7-03', 'H7-04', 'H7-05']) {
      R.unmeasured(id, 'portal olcutu',
        'KB-01 (I4 kapsam karari) verilmedi — bu tur KOSULMAZ (kapsam karari verilmis SAYILMAZ)');
    }
  } catch (e) {
    console.error(`\nKOSUM DURDU: ${e && e.message ? e.message : e}`);
    if (e && e.gate === 'G-0') console.error('  → ORTAM KAPISI: hicbir yazma YAPILMADI.');
    process.exitCode = 1;
  } finally {
    if (sinkProc && sinkProc.exitCode === null) sinkProc.kill();

    // ── ERİŞİM SONLANDIRMA — çıkış kodundan BAĞIMSIZ (F04 kusuru B(i) tekrarlanmaz) ──
    if (setupAttempted && st) {
      try {
        L.AH.step('V', 'erisim sonlandirma (cikis kodundan BAGIMSIZ)');
        const before = await prisma.user.findMany({
          where: { tenantId: st.tenantId }, select: { id: true, isActive: true, tokenVersion: true },
        });
        await prisma.user.updateMany({
          where: { tenantId: st.tenantId },
          data: { isActive: false, tokenVersion: { increment: 1 } },
        });
        const after = await prisma.user.findMany({
          where: { tenantId: st.tenantId }, select: { id: true, isActive: true, tokenVersion: true } });
        const active = after.filter((u) => u.isActive).length;
        const bumped = after.every((u) => {
          const b = before.find((x) => x.id === u.id);
          return b && u.tokenVersion > b.tokenVersion;
        });
        R.check('I3-V', 'test hesaplarinin erisimi SONLANDIRILDI',
          active === 0 && bumped && after.length > 0,
          `${after.length} hesap · aktif kalan=${active} · tokenVersion artti=${bumped}`);
        if (active !== 0 || !bumped) {
          console.error(`  !!! Sonlandirma DOGRULANAMADI — elle kontrol: tenant ${st.slug}`);
        }
      } catch (e) {
        R.add('I3-V', 'test hesaplarinin erisimi SONLANDIRILDI', L.VERDICT.FAIL,
          `sonlandirma HATASI: ${e && e.message}`);
        console.error('  !!! SONLANDIRMA BASARISIZ — hesaplar acik KALMIS OLABILIR.');
      }
    } else if (setupAttempted) {
      console.log('\n[V] kurulum geri alindi — sonlandirilacak hesap YOK');
    }

    const s = R.summary('I3 KABUL DUZENEKLERI');
    console.log(JSON.stringify({
      record: 'I3-RUN', runId, tenant: st ? st.slug : null,
      database: `${envInfo.dbHost}:${envInfo.dbPort}/${envInfo.dbName}`,
      pass: s.pass, fail: s.fail, unmeasured: s.unmeasured, total: s.total,
      h7Pending: 6, secretsPrinted: false,
      results: R.rows.map((r) => ({ id: r.id, verdict: r.verdict })),
    }, null, 1));
    await prisma.$disconnect().catch(() => {});
    // Ölçülemeyen bir ölçüt PASS SAYILMAZ: FAIL varsa 2, yalnız UNMEASURED varsa 3.
    if (process.exitCode !== 1) process.exitCode = s.fail > 0 ? 2 : (s.unmeasured > 0 ? 3 : 0);
  }
})();
