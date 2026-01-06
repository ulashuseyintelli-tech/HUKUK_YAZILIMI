/**
 * Faiz Oranları Seed Script
 * 
 * Bu script tüm tenant'lar için tarihi faiz oranlarını veritabanına yükler.
 * 
 * Kullanım:
 *   npx ts-node scripts/seed-interest-rates.ts
 * 
 * Veya pnpm ile:
 *   pnpm --filter @hukuk/api seed:rates
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ═══════════════════════════════════════════════════════════════════════════
// TİCARİ TEMERRÜT / AVANS FAİZİ (3095 sayılı Kanun m.2/2)
// Kaynak: TCMB Reeskont ve Avans Faiz Oranları Tablosu
// ═══════════════════════════════════════════════════════════════════════════
const AVANS_FAIZ_ORANLARI = [
  // 2020 değişimleri
  { validFrom: '2020-01-01', annualRate: 0.1175 },
  { validFrom: '2020-05-22', annualRate: 0.0925 },
  { validFrom: '2020-06-13', annualRate: 0.0825 },
  { validFrom: '2020-09-25', annualRate: 0.0925 },
  { validFrom: '2020-11-20', annualRate: 0.1425 },
  { validFrom: '2020-12-25', annualRate: 0.1725 },
  
  // 2021 değişimleri
  { validFrom: '2021-03-19', annualRate: 0.1925 },
  { validFrom: '2021-09-24', annualRate: 0.1825 },
  { validFrom: '2021-10-22', annualRate: 0.1625 },
  { validFrom: '2021-11-19', annualRate: 0.1525 },
  { validFrom: '2021-12-17', annualRate: 0.1425 },
  
  // 2022 değişimleri
  { validFrom: '2022-08-19', annualRate: 0.1325 },
  { validFrom: '2022-09-23', annualRate: 0.1225 },
  { validFrom: '2022-10-21', annualRate: 0.1075 },
  { validFrom: '2022-11-25', annualRate: 0.095 },
  
  // 2023 değişimleri
  { validFrom: '2023-06-23', annualRate: 0.15 },
  { validFrom: '2023-07-21', annualRate: 0.175 },
  { validFrom: '2023-08-25', annualRate: 0.255 },
  { validFrom: '2023-09-22', annualRate: 0.305 },
  { validFrom: '2023-10-27', annualRate: 0.355 },
  { validFrom: '2023-11-24', annualRate: 0.405 },
  { validFrom: '2023-12-29', annualRate: 0.45 },
  
  // 2024 değişimleri
  { validFrom: '2024-01-26', annualRate: 0.46 },
  { validFrom: '2024-03-22', annualRate: 0.50 },
  { validFrom: '2024-12-28', annualRate: 0.4925 }, // VergiNet doğrulamalı
  
  // 2025 değişimleri (TCMB resmi tablosu - VergiNet/ASMMMO doğrulamalı)
  // Kritik tarihler: 08.03, 17.09, 20.12
  { validFrom: '2025-03-08', annualRate: 0.4425 }, // 08.03.2025'ten itibaren
  { validFrom: '2025-09-17', annualRate: 0.4225 }, // 17.09.2025'ten itibaren
  { validFrom: '2025-12-20', annualRate: 0.3975 }, // 20.12.2025'ten itibaren
];

// ═══════════════════════════════════════════════════════════════════════════
// YASAL FAİZ (3095 sayılı Kanun m.1)
// ═══════════════════════════════════════════════════════════════════════════
const YASAL_FAIZ_ORANLARI = [
  { validFrom: '2006-01-01', annualRate: 0.09 },
  { validFrom: '2024-06-01', annualRate: 0.24 },
];

// ═══════════════════════════════════════════════════════════════════════════
// TTK 1530 GEÇ ÖDEME FAİZİ
// ═══════════════════════════════════════════════════════════════════════════
const TTK_1530_ORANLARI = [
  { validFrom: '2020-01-01', annualRate: 0.1575 },
  { validFrom: '2021-01-01', annualRate: 0.1875 },
  { validFrom: '2022-01-01', annualRate: 0.1875 },
  { validFrom: '2023-01-01', annualRate: 0.1875 },
  { validFrom: '2024-01-01', annualRate: 0.4875 },
  { validFrom: '2025-01-01', annualRate: 0.5325 },
  { validFrom: '2026-01-01', annualRate: 0.43 },
];

import * as crypto from 'node:crypto';

function generateVersionHash(entry: { interestType: string; validFrom: string; annualRate: number }): string {
  const data = `${entry.interestType}|${entry.validFrom}|${entry.annualRate}|TCMB`;
  return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
}

async function seedRatesForTenant(tenantId: string): Promise<number> {
  let addedCount = 0;

  console.log(`\n📊 Tenant ${tenantId} için oranlar yükleniyor...`);

  // Avans Faizi
  for (const rate of AVANS_FAIZ_ORANLARI) {
    const existing = await prisma.rateSchedule.findFirst({
      where: {
        tenantId,
        interestType: 'COMMERCIAL_AVANS_3095_2_2',
        validFrom: new Date(rate.validFrom),
      },
    });

    if (!existing) {
      await prisma.rateSchedule.create({
        data: {
          tenantId,
          interestType: 'COMMERCIAL_AVANS_3095_2_2',
          validFrom: new Date(rate.validFrom),
          annualRate: rate.annualRate,
          source: 'TCMB',
          sourceRef: `TCMB ${rate.validFrom}`,
          versionHash: generateVersionHash({
            interestType: 'COMMERCIAL_AVANS_3095_2_2',
            validFrom: rate.validFrom,
            annualRate: rate.annualRate,
          }),
        },
      });
      addedCount++;
    }
  }
  console.log(`  ✅ Avans faizi: ${addedCount} oran eklendi`);

  // Yasal Faiz
  let yasalCount = 0;
  for (const rate of YASAL_FAIZ_ORANLARI) {
    const existing = await prisma.rateSchedule.findFirst({
      where: {
        tenantId,
        interestType: 'LEGAL_3095',
        validFrom: new Date(rate.validFrom),
      },
    });

    if (!existing) {
      await prisma.rateSchedule.create({
        data: {
          tenantId,
          interestType: 'LEGAL_3095',
          validFrom: new Date(rate.validFrom),
          annualRate: rate.annualRate,
          source: 'RESMI_GAZETE',
          sourceRef: 'Resmi Gazete',
          versionHash: generateVersionHash({
            interestType: 'LEGAL_3095',
            validFrom: rate.validFrom,
            annualRate: rate.annualRate,
          }),
        },
      });
      yasalCount++;
      addedCount++;
    }
  }
  console.log(`  ✅ Yasal faiz: ${yasalCount} oran eklendi`);

  // TTK 1530
  let ttkCount = 0;
  for (const rate of TTK_1530_ORANLARI) {
    const existing = await prisma.rateSchedule.findFirst({
      where: {
        tenantId,
        interestType: 'TTK_1530',
        validFrom: new Date(rate.validFrom),
      },
    });

    if (!existing) {
      await prisma.rateSchedule.create({
        data: {
          tenantId,
          interestType: 'TTK_1530',
          validFrom: new Date(rate.validFrom),
          annualRate: rate.annualRate,
          source: 'TCMB',
          sourceRef: `TCMB TTK 1530 ${rate.validFrom.substring(0, 4)}`,
          versionHash: generateVersionHash({
            interestType: 'TTK_1530',
            validFrom: rate.validFrom,
            annualRate: rate.annualRate,
          }),
        },
      });
      ttkCount++;
      addedCount++;
    }
  }
  console.log(`  ✅ TTK 1530: ${ttkCount} oran eklendi`);

  return addedCount;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  FAİZ ORANLARI SEED SCRIPT');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Tarih: ${new Date().toLocaleString('tr-TR')}`);
  console.log('');

  try {
    // Tüm tenant'ları al
    const tenants = await prisma.office.findMany({
      select: { id: true, name: true },
    });

    if (tenants.length === 0) {
      console.log('⚠️  Hiç tenant bulunamadı. Önce bir büro oluşturun.');
      return;
    }

    console.log(`📋 ${tenants.length} tenant bulundu:`);
    tenants.forEach(t => console.log(`   - ${t.name} (${t.id})`));

    let totalAdded = 0;

    for (const tenant of tenants) {
      const added = await seedRatesForTenant(tenant.id);
      totalAdded += added;
    }

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log(`✅ TAMAMLANDI: Toplam ${totalAdded} oran eklendi`);
    console.log('═══════════════════════════════════════════════════════════════');

  } catch (error) {
    console.error('❌ Hata:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
