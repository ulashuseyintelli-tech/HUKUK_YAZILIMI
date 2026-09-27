'use strict';
/*
 * EXTACC — YEREL KONSOL GÖSTERİMİ. Ham token içeren intake adresini YALNIZ owner'ın konsol penceresine yazar.
 *
 * NEDEN CONOUT$: owner bloğu node çıktısını (stdout/stderr) kanıt loguna yönlendirir. Adres o loga, kanıt JSON'una
 * ya da PowerShell transcript'ine GİRMEMELİ. `\\.\CONOUT$` sürecin bağlı olduğu konsol ekran arabelleğidir; stdout
 * yönlendirmesinden bağımsızdır. Yazım libuv TTY akışıyla yapılır (WriteConsoleW → Unicode doğru; SGR/ekran temizleme
 * dizileri libuv tarafından işlenir).
 *
 * SINIR (dürüst): CONOUT$ tek başına "kaydedilmedi" kanıtı DEĞİLDİR. Konsolu barındıran uygulama (ör. bir terminal
 * paneli ya da kayıt tutan terminal) ekranı kendisi saklayabilir. Bu yüzden: (1) owner bloğu bağımsız bir PowerShell
 * penceresinde koşulur, (2) gösterim bitince ekran + kaydırma arabelleği temizlenir, (3) koşum sonunda pencere kapatılır.
 * İzole ölçüm: extacc-console-selftest.ps1 (log, transcript, konsol arabelleği, konsolsuz süreç).
 *
 * QR: vendor/qrcode-generator-1.4.4/qrcode.js (MIT, Kazuhiko Arase; npm sha512 doğrulandı, sha256 pinli). Ağ YOK.
 */
const fs = require('fs'); const tty = require('tty'); const path = require('path');
const qrcode = require(path.join(__dirname, 'vendor', 'qrcode-generator-1.4.4', 'qrcode.js'));

/** Konsolu açar; konsol yoksa ya da TTY değilse FIRLATIR (çağıran, hiçbir yazma yapmadan durmalıdır). */
function openConsole() {
  if (process.platform !== 'win32') throw new Error('CONOUT$ yalnız Windows konsolunda vardır');
  let fd;
  // 'r+': GetConsoleMode okuma erişimi ister; yalnız yazma ile açılan tanıtıcı TTY sayılmaz (izole ölçümde görüldü).
  try { fd = fs.openSync('\\\\.\\CONOUT$', 'r+'); } catch (e) { throw new Error(`konsol açılamadı (${(e && e.code) || 'hata'})`); }
  if (!tty.isatty(fd)) { try { fs.closeSync(fd); } catch (e) { /* yok */ } throw new Error('CONOUT$ bir TTY değil'); }
  const stream = new tty.WriteStream(fd);
  return { fd, stream };
}

function writeAsync(con, s) { return new Promise((resolve, reject) => con.stream.write(s, (e) => (e ? reject(e) : resolve()))); }

/** QR modüllerini yarım blok karakterlerle, beyaz zemin + siyah modül (koyu temada da okunur) olarak çizer. */
function renderQr(text) {
  const qr = qrcode(0, 'M');
  qr.addData(String(text), 'Byte');
  qr.make();
  const n = qr.getModuleCount(); const q = 4; // sessiz bölge (standart: 4 modül)
  const dark = (r, c) => r >= 0 && c >= 0 && r < n && c < n && qr.isDark(r, c);
  const lines = [];
  for (let r = -q; r < n + q; r += 2) {
    let row = '';
    for (let c = -q; c < n + q; c++) {
      const t = dark(r, c); const b = dark(r + 1, c);
      row += t && b ? '█' : t ? '▀' : b ? '▄' : ' ';
    }
    lines.push(`\x1b[30;47m${row}\x1b[0m`);
  }
  return { lines, modules: n };
}

async function show(con, lines) { await writeAsync(con, `\r\n${lines.join('\r\n')}\r\n`); }

/** Görünür ekranı ve kaydırma arabelleğini temizler (ESC[2J + ESC[3J + imleç başa). */
async function clear(con) { await writeAsync(con, '\x1b[2J\x1b[3J\x1b[H'); }

function close(con) { try { con.stream.destroy(); } catch (e) { /* yok */ } }

module.exports = { openConsole, renderQr, show, clear, close };
