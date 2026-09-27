'use strict';
/*
 * EXTACC KONSOL ÖLÇÜM YARDIMCISI — YALNIZ extacc-console-selftest.ps1 için. Canlı veri YOK.
 * EXA_PROBE_TEXT'i (sahte, rastgele adres) extacc-display.js ile konsola çizer; EXA_PROBE_CLEAR=1 ise ardından temizler.
 * `--detached`: kendisini KONSOLSUZ (DETACHED_PROCESS) başlatır ve alt sürecin çıkış kodunu döndürür.
 * ÇIKIŞ: 0 gösterildi · 4 konsol yok (beklenen fail-closed) · 2 hata.
 */
const { spawn } = require('child_process');
const DISPLAY = require('./extacc-display');

if (process.argv.includes('--detached')) {
  const ch = spawn(process.execPath, [__filename], { detached: true, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
  let out = ''; ch.stdout.on('data', (d) => { out += d; }); ch.stderr.on('data', (d) => { out += d; });
  ch.on('close', (code) => { process.stdout.write(out); process.exit(code === null ? 2 : code); });
} else {
  (async () => {
    let con;
    try { con = DISPLAY.openConsole(); } catch (e) { console.log(`probe: konsol yok (${e.message})`); process.exit(4); }
    const text = String(process.env.EXA_PROBE_TEXT || '');
    const qr = DISPLAY.renderQr(text);
    await DISPLAY.show(con, ['PROBE', ...qr.lines, text, '']);
    if (process.env.EXA_PROBE_CLEAR === '1') await DISPLAY.clear(con);
    DISPLAY.close(con);
    console.log(`probe ok · modül=${qr.modules} · temizlendi=${process.env.EXA_PROBE_CLEAR === '1'}`);
  })().catch((e) => { console.log(`probe hata: ${e.message}`); process.exit(2); });
}
