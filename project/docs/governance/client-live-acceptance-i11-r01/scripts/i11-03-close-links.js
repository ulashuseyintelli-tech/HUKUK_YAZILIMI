/*
 * CLIENT İ11 — INTAKE BAĞLANTILARININ KAPANIŞI (YALNIZ `runId` İLE)
 *
 * NEDEN AYRI BİR ADIM: `cl-09-close-access.js` kullanıcı erişimini ve Case cron maruziyetini
 * kapatır; intake bağlantısına DOKUNMAZ. Ürün kaynağında anonim yol
 * (`client-intake-public.service.ts` → `validateActiveLink`) YALNIZ üç koşula bakar:
 *     link.status === ACTIVE  ·  expiresAt gelecekte  ·  useCount < maxUses
 * Case'in CLOSED olması, tenant'ın durumu ve linki üreten kullanıcının pasifleştirilmiş
 * olması BU YOLU ETKİLEMEZ. Yani cl-09 sonrası bile ham token'ı elinde tutan biri
 * `GET/POST /api/public/intake/:token` ile formu açabilir ve YENİ bir başvuru + alan
 * satırı YAZABİLİR. Bu adım o yolu kapatır.
 *
 * NE YAPAR: koşumun kendi tenant'ındaki (`cl-acc-<runId>`) ACTIVE intake bağlantılarını
 * REVOKED yapar. Satır SİLMEZ, tokenHash'e ve başvuru/alan/audit satırlarına DOKUNMAZ.
 * TEKRARI GÜVENLİDİR (ikinci çağrı `revoked:0`, `alreadyClosed:true`, exit 0).
 * Durum dosyasına ve ham token'a BAĞLI DEĞİLDİR — süreç zorla sonlansa bile aynı alanı bulur.
 *
 *   CL_ENVIRONMENT=live|disposable CL_DATABASE_URL=... CL_RUN_ID=<8hex> node i11-03-close-links.js
 *   (live: CL_OWNER_GO_REF de gerekir — iptal de bir YAZMADIR)
 */
'use strict';
const L = require('../../client-live-acceptance-i1b-r01/scripts/cl-lib');

/** Anonim yolun kabul ettiği TEK durum. Kaynak: validateActiveLink. */
const ANON_USABLE_STATUS = 'ACTIVE';

(async () => {
  const env = L.assertEnvironment(); // G-0 — iptal de bir YAZMADIR
  const runId = L.requireEnv('CL_RUN_ID').toLowerCase();
  const prisma = L.loadPrisma();
  try {
    const field = await L.findAcceptanceField(prisma, runId); // G-1 içeride (yalnız kendi alanı)
    if (!field.exists) {
      console.log(JSON.stringify({
        record: 'CL-I11-LINKS', runId, slug: field.slug, environment: env.environment,
        fieldExists: false, writeOperations: 0,
        verdict: 'ALAN YOK - kurulum commit edilmemis (olculdu, varsayilmadi)',
      }, null, 1));
      return;
    }

    const select = { id: true, status: true, useCount: true, maxUses: true, expiresAt: true, tokenHash: true };
    const before = await prisma.clientIntakeLink.findMany({ where: { tenantId: field.tenantId }, select });
    const openBefore = before.filter((l) => l.status === ANON_USABLE_STATUS);

    let revoked = 0;
    if (openBefore.length > 0) {
      const r = await prisma.clientIntakeLink.updateMany({
        where: { tenantId: field.tenantId, status: ANON_USABLE_STATUS },
        data: { status: 'REVOKED' },
      });
      revoked = r.count;
    }

    const after = await prisma.clientIntakeLink.findMany({ where: { tenantId: field.tenantId }, select });
    const openAfter = after.filter((l) => l.status === ANON_USABLE_STATUS);

    // KANIT KORUNDU: satir sayisi ayni ve tokenHash'ler DEGISMEDI (silme/yeniden yazma yok).
    const rowsPreserved = before.length === after.length;
    const hashesPreserved = before.every((b) => {
      const a = after.find((x) => x.id === b.id);
      return !!a && a.tokenHash === b.tokenHash && a.useCount === b.useCount && a.maxUses === b.maxUses;
    });
    const evidencePreserved = rowsPreserved && hashesPreserved;
    const linksClosed = openAfter.length === 0;
    const ok = linksClosed && evidencePreserved;

    console.log(JSON.stringify({
      record: 'CL-I11-LINKS', runId, slug: field.slug, environment: env.environment, fieldExists: true,
      linksTotal: before.length,
      anonUsableBefore: openBefore.length,
      revoked,
      anonUsableAfter: openAfter.length,
      alreadyClosed: openBefore.length === 0,
      statusesBefore: before.map((l) => l.status).sort(),
      statusesAfter: after.map((l) => l.status).sort(),
      linksClosed, evidencePreserved,
      verdict: ok
        ? (openBefore.length === 0
          ? 'ZATEN KAPALI - anonim kullanilabilir baglanti YOK (olculdu)'
          : 'INTAKE BAGLANTILARI IPTAL EDILDI - anonim yol KAPANDI, kanit KORUNDU')
        : (!linksClosed
          ? `EKSIK - hala ACTIVE baglanti var (${openAfter.length})`
          : 'EKSIK - kanit KORUNMADI (satir sayisi veya tokenHash degisti)'),
    }, null, 1));
    if (!ok) process.exitCode = 2;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
})().catch((e) => {
  console.error('\nINTAKE BAGLANTI KAPANIS HATASI:', e && e.message ? e.message : e);
  process.exitCode = 1;
});
