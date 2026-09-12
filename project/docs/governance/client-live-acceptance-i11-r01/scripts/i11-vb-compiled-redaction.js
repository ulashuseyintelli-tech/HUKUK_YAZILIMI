/*
 * V-B — B-I11-3 onarımının DERLENMİŞ ikilide çalıştığının kanıtı (repo DIŞI doğrulama aracı).
 *
 * NEDEN AYRI: onarım birim testinde (11/11) doğrulandı; ama canlıya çıkacak olan DERLENMİŞ
 * `dist` ikilisidir. Bu araç GERÇEK süreçte GERÇEK hata kayıt yolunu sürer:
 *   public intake hız sınırı Redis'e ulaşamaz → fail-closed 503 → küresel filtre → ErrorLog.
 * Beklenen (onarımlı ikili): ErrorLog.endpoint = '/api/public/intake/:token' ve satırın HİÇBİR
 * alanında sentetik token YOK.
 *
 * YALNIZ oturuma özel DB'ye bağlanır (CL_SESSION_DB kapısı). Token ÜRETİLİR, BASILMAZ.
 *   VB_API=http://127.0.0.1:8101/api VB_DB=<oturum db url> VB_SESSION_DB=5442/<db> node i11-vb-compiled-redaction.js
 * Çıkış: 0 PASS · 1 FAIL (sızıntı) · 3 ÖLÇÜLEMEDİ
 */
'use strict';
const crypto = require('crypto');

const API = (process.env.VB_API || '').replace(/\/+$/, '');
const DB = process.env.VB_DB || '';
const SESSION = process.env.VB_SESSION_DB || '';
const R22NM = 'C:/Development/HUKUK_YAZILIMI/HY_W4_RELEASE22/project/apps/api/node_modules';

function out(o, code) { console.log(JSON.stringify({ record: 'I11-VB-COMPILED-REDACTION', ...o }, null, 1)); process.exitCode = code; }

(async () => {
  if (!API || !DB || !SESSION) return out({ verdict: 'OLCULEMEDI', why: 'VB_API / VB_DB / VB_SESSION_DB zorunlu' }, 3);
  // KAPI: yalniz oturuma ozel DB (canli 5432 / hukuk_db YASAK)
  const [port, dbName] = SESSION.split('/');
  if (port === '5432' || dbName === 'hukuk_db' || !DB.includes(`:${port}/${dbName}`)) {
    return out({ verdict: 'OLCULEMEDI', why: 'KAPI: VB_DB oturuma ozel DB degil' }, 3);
  }
  const { PrismaClient } = require(`${R22NM}/@prisma/client`);
  const prisma = new PrismaClient({ datasources: { db: { url: DB } }, log: [] });
  const token = `vbSyn_${crypto.randomBytes(18).toString('base64url')}`; // SENTETIK; basilmaz
  try {
    const before = new Date(Date.now() - 1000);
    let status = null; let why = null;
    try {
      const res = await fetch(`${API}/public/intake/${token}`, { method: 'GET' });
      status = res.status;
    } catch (e) { why = `istek yapilamadi: ${e && e.message}`; }
    if (status !== 503) {
      return out({
        verdict: 'OLCULEMEDI', status, why: why || `503 bekleniyordu (limiter Redis'i ulasilamaz olmali); ${status} geldi`,
      }, 3);
    }
    await new Promise((r) => setTimeout(r, 1500)); // filtre fire-and-forget yazar
    const rows = await prisma.errorLog.findMany({
      where: { createdAt: { gte: before }, endpoint: { startsWith: '/api/public/intake' } },
      orderBy: { createdAt: 'desc' }, take: 20,
    });
    // TUM alanlarda token ara (endpoint · message · stack · metadata · digerleri)
    const leaked = rows.filter((r) => JSON.stringify(r).includes(token)).length;
    const masked = rows.filter((r) => r.endpoint === '/api/public/intake/:token').length;
    const pass = rows.length > 0 && leaked === 0 && masked > 0;
    return out({
      verdict: pass ? 'PASS' : (rows.length === 0 ? 'OLCULEMEDI' : 'FAIL'),
      http503: true,
      errorLogRows: rows.length,
      rowsWithRawToken: leaked,
      rowsWithMaskedRoute: masked,
      endpointsSeen: [...new Set(rows.map((r) => (r.endpoint || '').replace(token, '<SENTETIK-TOKEN>')))],
      note: 'token uretildi, BASILMADI; endpointsSeen icinde gorunurse <SENTETIK-TOKEN> ile degistirildi',
    }, pass ? 0 : (rows.length === 0 ? 3 : 1));
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
})().catch((e) => out({ verdict: 'OLCULEMEDI', why: e && e.message }, 3));
