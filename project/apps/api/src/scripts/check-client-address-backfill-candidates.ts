/**
 * ClientAddress-1 backfill-aday raporu — SALT-OKUMA. Hiçbir yazma yolu YOKTUR.
 *
 * Ne yapar: mevcut Client.address/city/district/postalCode/region flat kolonlarının
 * doluluk durumunu tarar (tam / parçalı / boş), spot-check örnekleri gösterir. ClientAddress
 * tablosuna DOKUNMAZ (henüz backfill APPLY edilmedi). DB'ye yalnız SELECT atar.
 *
 * Gerçek backfill APPLY (bu script'in raporuna göre ClientAddress satırları oluşturmak) =
 * AYRI, owner-GO'lu bir sonraki task. Bu script yalnız "kaç kayıt etkilenecek" sorusuna cevap verir.
 *
 * Kullanım (project/apps/api altından):
 *   npx tsx src/scripts/check-client-address-backfill-candidates.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function classify(c: { address: string | null; city: string | null; district: string | null; postalCode: string | null; region: string | null }) {
  const fields = [c.address, c.city, c.district, c.postalCode, c.region];
  const filled = fields.filter((v) => v !== null && v.trim() !== '').length;
  if (filled === 0) return 'EMPTY' as const;
  // "TAM" tanımı: adres+il+ilçe üçü de dolu (postalCode/region opsiyonel kabul edilir — Türkiye
  // adres pratiğinde posta kodu/bölge her zaman girilmiyor, ama sokak+il+ilçe olmadan adres
  // kullanılabilir sayılmaz).
  const core = [c.address, c.city, c.district];
  const coreFilled = core.filter((v) => v !== null && v.trim() !== '').length;
  if (coreFilled === 3) return 'FULL' as const;
  return 'PARTIAL' as const;
}

function mask(value: string | null, keep = 3): string {
  if (!value) return '(boş)';
  const trimmed = value.trim();
  if (trimmed.length <= keep) return trimmed;
  return `${trimmed.slice(0, keep)}…(${trimmed.length} kr)`;
}

async function main() {
  console.log('=== ClientAddress-1 BACKFILL-ADAY RAPORU (SALT-OKUMA) ===\n');

  const clients = await prisma.client.findMany({
    select: {
      id: true,
      tenantId: true,
      displayName: true,
      isActive: true,
      address: true,
      city: true,
      district: true,
      postalCode: true,
      region: true,
    },
  });

  let full = 0;
  let partial = 0;
  let empty = 0;
  const partialSamples: typeof clients = [];
  const fullSamples: typeof clients = [];

  for (const c of clients) {
    const status = classify(c);
    if (status === 'FULL') {
      full++;
      if (fullSamples.length < 3) fullSamples.push(c);
    } else if (status === 'PARTIAL') {
      partial++;
      if (partialSamples.length < 5) partialSamples.push(c);
    } else {
      empty++;
    }
  }

  const total = clients.length;
  const pct = (n: number) => (total ? ((n / total) * 100).toFixed(1) : '0.0');

  console.log(`Toplam Client: ${total}`);
  console.log(`  TAM adres (address+city+district hepsi dolu)  : ${full} (%${pct(full)})`);
  console.log(`  PARÇALI adres (bazı alan dolu, bazısı boş)     : ${partial} (%${pct(partial)})`);
  console.log(`  BOŞ (hiçbir adres alanı dolu değil)            : ${empty} (%${pct(empty)})`);
  console.log(`  → Backfill adayı (FULL+PARTIAL) = ${full + partial} (%${pct(full + partial)})`);

  console.log('\n--- Spot-check: TAM adresli örnekler (PII maskeli) ---');
  for (const c of fullSamples) {
    console.log(
      `  id=${c.id} tenant=${c.tenantId} name=${mask(c.displayName, 4)} isActive=${c.isActive} ` +
        `address=${mask(c.address)} city=${mask(c.city)} district=${mask(c.district)} postalCode=${c.postalCode ?? '(boş)'} region=${mask(c.region)}`,
    );
  }

  console.log('\n--- Spot-check: PARÇALI adresli örnekler (PII maskeli, hangi alan eksik gösterilir) ---');
  for (const c of partialSamples) {
    const missing = [
      !c.address?.trim() ? 'address' : null,
      !c.city?.trim() ? 'city' : null,
      !c.district?.trim() ? 'district' : null,
    ].filter(Boolean);
    console.log(
      `  id=${c.id} tenant=${c.tenantId} name=${mask(c.displayName, 4)} isActive=${c.isActive} ` +
        `eksik-alan=[${missing.join(',')}] address=${mask(c.address)} city=${mask(c.city)} district=${mask(c.district)}`,
    );
  }

  console.log('\nNOT: bu bir SALT-OKUMA raporudur; hiçbir Client/ClientAddress satırı oluşturulmadı/değiştirilmedi.');
  console.log('Gerçek backfill APPLY = ayrı, owner-GO gerektiren sonraki task.');

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('Backfill-aday raporu HATA:', e);
  process.exit(1);
});
