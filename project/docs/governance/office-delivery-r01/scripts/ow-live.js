/*
 * OFFICE A-03..A-07 — CANLI KOSUM GIRIS NOKTASI (owner GO'su ile acildi)
 *
 * NEDEN AYRI GIRIS: canli `DATABASE_URL` bir SIRDIR (parola icerir). Komut satirinda
 * verilirse **surec tablosunda gorunur** (Win32_Process.CommandLine) ve kabuk gecmisine
 * duser. Bu giris onu API'nin KENDI EnvFile'indan SURE ICINDE okur; argv'ye, log'a,
 * durum dosyasina veya rapora GECMEZ (G-4).
 *
 * KASAYLA CALISMAZ: `OW_CONFIRM_LIVE` jetonu DISARIDAN verilmek ZORUNDADIR (ow-lib G-0).
 * Bu betik onu KENDISI SET ETMEZ — canliya yazma bilincli bir insan eylemi olarak kalir.
 *
 * KULLANIM:
 *   OW_CONFIRM_LIVE=<jeton> node ow-live.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const LAUNCHER = process.env.OW_API_LAUNCHER || 'C:\\Ops\\hukuk\\bin\\start-api.ps1';

function resolveEnvFile() {
  if (process.env.OW_API_ENV_FILE) return process.env.OW_API_ENV_FILE;
  const src = fs.readFileSync(LAUNCHER, 'utf8');
  const m = src.match(/EnvFile\s*=\s*'([^']+)'/) || src.match(/EnvFile\s*=\s*"([^"]+)"/);
  if (!m) throw new Error(`EnvFile yolu ${LAUNCHER} icinde bulunamadi`);
  return m[1];
}

function readKey(file, key) {
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (t.startsWith(`${key}=`)) return t.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

const envFile = resolveEnvFile();
const url = readKey(envFile, 'DATABASE_URL');
if (!url) throw new Error(`DATABASE_URL ${envFile} icinde bulunamadi`);

process.env.OW_DATABASE_URL = url;                 // yalniz BU surecin bellegi
process.env.OW_ENVIRONMENT = 'live';
process.env.OW_API_BASE_URL = process.env.OW_API_BASE_URL || 'http://127.0.0.1:8080/api';
process.env.OW_STATE_FILE = process.env.OW_STATE_FILE
  || path.join(process.cwd(), `ow-state-live-${process.env.OW_RUN_ID || 'auto'}.json`);

// Sir BASILMAZ — yalniz hedefin kimligi.
const u = new URL(url);
console.log(`[CANLI] hedef DB  : ${u.hostname}:${u.port}/${u.pathname.replace(/^\//, '')} (parola BASILMAZ)`);
console.log(`[CANLI] API koku  : ${process.env.OW_API_BASE_URL}`);
console.log(`[CANLI] EnvFile   : ${envFile}`);

require('./ow-run.js');
