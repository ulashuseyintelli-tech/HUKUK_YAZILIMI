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

/**
 * YAPILANDIRMA TEK KAYNAK: `i3-start-api.js` API'yi başlatırken ETKİN ayarları bu dosyaya
 * yazar. Çalıştırıcı ayrı `I3_API_*` beyanı KABUL ETMEZ — iki kaynak sessizce ayrışabilir ve
 * "etkin ayar" iddiası dayanaksız kalırdı. Dosya yoksa gönderim ölçütleri ÖLÇÜLEMEDİ olur.
 */
const CONFIG_FILE = process.env.I3_API_CONFIG || path.join(process.cwd(), 'i3-api-config.json');
function loadApiConfig() {
  try {
    const c = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    // Eksik alan VARSAYILANLA TAMAMLANMAZ — eksikse yapilandirma GECERSIZDIR.
    const need = ['emailProvider', 'smtpHost', 'smtpPort', 'apiPort', 'pid',
      'instanceToken', 'sinkCaptureDir', 'spyCounterFile'];
    const missing = need.filter((k) => c[k] === undefined || c[k] === null || c[k] === '');
    return { config: c, missing, error: null };
  } catch (e) {
    return { config: null, missing: null, error: e && e.message ? e.message : String(e) };
  }
}
const API_CFG = loadApiConfig();
const SINK_PORT = API_CFG.config ? Number(API_CFG.config.smtpPort) : NaN;
const CAPTURE = API_CFG.config ? API_CFG.config.sinkCaptureDir
  : path.join(process.cwd(), 'i3-smtp-capture');

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
     *   (e) yapılandırma dosyasının değerleri, **çalışan API örneğinin kendi bildirdiği**
     *       etkin değerlerle AYNI (`instanceToken`, `pid`, sağlayıcı, host, port).
     * (e) olmadan dosya "dolu ama uyuşmaz" olabilir: `emailProvider:'smtp'` yazılıyken süreç
     * gerçekte `mock` koşuyorsa (c)/(d) DOSYAYI okuduğu için geçer, `pidOk` de gerçek pid'de
     * geçer ve sonda ATILIRDI. Tanık, API sürecinin içinden yazan `i3-spy.js`'tir.
     * Biri sağlanmazsa **sonda dahil** hiçbir gönderim yapılmaz.
     */
    async verifyIsolationPreconditions() {
      const loopbackReachable = await probeTcp('127.0.0.1', SINK_PORT);
      const lan = [];
      for (const list of Object.values(os.networkInterfaces())) {
        for (const ni of (list || [])) if (ni.family === 'IPv4' && !ni.internal) lan.push(ni.address);
      }
      let anyLanReachable = false;
      for (const ip of lan) if (await probeTcp(ip, SINK_PORT, 900)) anyLanReachable = true;

      // Ayarlar YALNIZ tek kaynaktan; env beyani kabul edilmez, eksik alan tamamlanmaz.
      if (API_CFG.error || !API_CFG.config) {
        return { ok: false, configError: API_CFG.error || 'yapilandirma yok',
          loopbackReachable, anyLanReachable, lanChecked: lan.length };
      }
      if (API_CFG.missing.length > 0) {
        return { ok: false, configMissing: API_CFG.missing,
          loopbackReachable, anyLanReachable, lanChecked: lan.length };
      }
      const c = API_CFG.config;
      const provider = String(c.emailProvider).toLowerCase();
      const host = String(c.smtpHost);
      const port = String(c.smtpPort);
      const providerOk = provider === 'smtp';
      const targetOk = ['127.0.0.1', 'localhost', '::1'].includes(host)
        && port === String(SINK_PORT);
      // Isteklerin BU yapilandirmayla baslatilan ornege gittigi: kayitli pid, API portunun
      // GERCEK dinleyicisi olmali.
      let pidOk = false;
      try {
        const out = require('child_process')
          .execSync(`netstat -ano -p tcp | findstr LISTENING | findstr :${c.apiPort}`,
            { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        pidOk = out.split(/\r?\n/).some((l) => l.trim().endsWith(String(c.pid)));
      } catch (e) { pidOk = false; }

      // ── (e) CALISMA ZAMANI BAGI: dosya ↔ surecin KENDI bildirdigi etkin ayar ──
      // Tanigi API surecinin icinden `i3-spy.js` yazar. Okunamazsa "eslesti" SAYILMAZ.
      // (e) CALISMA ZAMANI BAGI — karar mantigi TEK KAYNAKTA (`i3-lib`), kopya YOK.
      const runtime = L.readRuntimeWitness(c);
      const runtimeBindingOk = runtime.ok;
      const runtimeMismatch = runtime.mismatch;

      const ok = loopbackReachable && !anyLanReachable && lan.length > 0
        && providerOk && targetOk && pidOk && runtimeBindingOk;
      return {
        ok, loopbackReachable, anyLanReachable, lanChecked: lan.length,
        provider, host, port, providerOk, targetOk, pidOk,
        runtimeBindingOk, runtimeReadable: runtime.readable,
        runtimeReason: runtime.reason, runtimeMismatch, runtimeObserved: runtime.observed,
        pid: c.pid, instanceToken: c.instanceToken,
      };
    },
    /**
     * SMTP BAĞLANTI SAYACI — açılan TCP oturumlarını sayar. Bu, "dispatcher çağrıldı mı"
     * DEĞİLDİR: bir dispatcher (ör. mock) çağrılıp hiç bağlantı açmayabilir.
     */
    smtpConnections() { return files('conn-').length; },
    /**
     * GERÇEK `dispatcher.send` ÇAĞRI SAYACI — ürünün publication servisinin kullandığı
     * çağrı noktasından (`publication.service.ts:213`) `i3-spy.js` ile okunur.
     * OKUNAMAZSA `null` döner; çağıran bunu **sıfır kabul etmez**, ÖLÇÜLEMEDİ raporlar.
     */
    dispatcherSendCalls() {
      try {
        const f = API_CFG.config && API_CFG.config.spyCounterFile;
        if (!f) return null;
        const j = JSON.parse(fs.readFileSync(f, 'utf8'));
        return typeof j.dispatcherSend === 'number' ? j.dispatcherSend : null;
      } catch (e) { return null; }
    },
    /** Spy'ın allowlist bypass modunda olup olmadığı (negatif prova bayrağı). */
    allowlistBypassed() {
      try {
        const f = API_CFG.config && API_CFG.config.spyCounterFile;
        if (!f) return null;
        return JSON.parse(fs.readFileSync(f, 'utf8')).allowlistBypassed === true;
      } catch (e) { return null; }
    },
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
  console.log(`  yapilandirma: ${CONFIG_FILE}`
    + (API_CFG.error ? ` (OKUNAMADI: ${API_CFG.error})`
      : ` · saglayici=${API_CFG.config.emailProvider} · hedef=${API_CFG.config.smtpHost}:`
        + `${API_CFG.config.smtpPort} · api pid=${API_CFG.config.pid}`
        + (API_CFG.config.allowlistBypassed ? ' · ALLOWLIST BYPASS (negatif prova)' : '')));

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
    const cfgProvider = API_CFG.config ? String(API_CFG.config.emailProvider).toLowerCase() : null;
    const providerSmtp = cfgProvider === 'smtp';
    if (API_CFG.error) {
      console.log(`  UYARI: yapilandirma okunamadi (${API_CFG.error}) → gonderim olcutleri OLCULEMEDI`);
    } else if (!providerSmtp) {
      console.log(`  UYARI: etkin saglayici '${cfgProvider}' (smtp degil) → H5-01 OLCULEMEDI`);
    }
    const sink = makeSinkHandle(sinkOk && providerSmtp && !API_CFG.error
      && API_CFG.missing.length === 0);

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

    // Saglayiciya gore dal secen olcutler BILDIRILEN degeri degil, DOGRULANMIS
    // calisma zamani bagini tuketir; bag yoksa o olcutler OLCULEMEDI olur.
    const runtimeBinding = L.readRuntimeWitness(API_CFG.config);
    const ctx = { base, prisma, tokens, st, R, sink, apiConfig: API_CFG.config,
      runtimeBinding };
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
