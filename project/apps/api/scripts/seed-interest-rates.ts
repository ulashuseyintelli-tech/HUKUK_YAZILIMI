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
 *
 * Seçenekler (verilmezse bugünkü davranış: bütün türler, bütün bürolar):
 *   --only=LEGAL_3095[,TTK_1530,...]   yalnız verilen oran türlerini yükler
 *   --tenant-slug=<slug>               yalnız o kiracının bürosuna yükler (bulunamazsa çıkış 1)
 *   --dry-run                          yazmaz; eklenecek satırları listeler
 * Bilinmeyen seçenek ya da tür → çıkış 1 (hiçbir şey yazılmaz).
 *
 * Kanuni faiz (LEGAL_3095) satırları kaynak ve kanıtıyla `src/modules/interest-engine/rates/legal-3095-rate-table.ts`
 * içindedir (kapalı dönemler: validTo yazılır).
 */

import { PrismaClient } from '@prisma/client';
import { LEGAL_3095_RATE_TABLE } from '../src/modules/interest-engine/rates/legal-3095-rate-table';

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
// YASAL FAİZ (3095 sayılı Kanun m.1) → LEGAL_3095_RATE_TABLE (kaynak + kanıt + kapalı dönemler)
// ═══════════════════════════════════════════════════════════════════════════

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

const RATE_TYPES = ['COMMERCIAL_AVANS_3095_2_2', 'LEGAL_3095', 'TTK_1530'] as const;
type RateType = (typeof RATE_TYPES)[number];

interface SeedOptions {
  only: ReadonlySet<RateType>;
  tenantSlug?: string;
  dryRun: boolean;
}

interface SeedRow {
  validFrom: string;
  validTo?: string | null;
  annualRate: number;
  source: string;
  sourceRef: string;
}

/** Komut satırı seçenekleri; bilinmeyen seçenek / tür → hata (hiçbir şey yazılmadan). */
function parseArgs(argv: readonly string[]): SeedOptions {
  let only: Set<RateType> = new Set(RATE_TYPES);
  let tenantSlug: string | undefined;
  let dryRun = false;
  for (const arg of argv) {
    if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg.startsWith('--only=')) {
      const requested = arg.slice('--only='.length).split(',').map((t) => t.trim()).filter(Boolean);
      const unknown = requested.filter((t) => !(RATE_TYPES as readonly string[]).includes(t));
      if (requested.length === 0 || unknown.length > 0) {
        throw new Error(`Bilinmeyen oran türü: ${unknown.join(', ') || '(boş)'} — geçerli: ${RATE_TYPES.join(', ')}`);
      }
      only = new Set(requested as RateType[]);
    } else if (arg.startsWith('--tenant-slug=')) {
      tenantSlug = arg.slice('--tenant-slug='.length).trim();
      if (!tenantSlug) throw new Error('--tenant-slug boş olamaz');
    } else {
      throw new Error(`Bilinmeyen seçenek: ${arg}`);
    }
  }
  return { only, tenantSlug, dryRun };
}

/** Aynı (büro, tür, validFrom) satırı varsa atlar; yoksa ekler (kuru koşuda yalnız listeler). */
async function seedRows(tenantId: string, interestType: RateType, rows: readonly SeedRow[], opts: SeedOptions): Promise<number> {
  let added = 0;
  for (const rate of rows) {
    const existing = await prisma.rateSchedule.findFirst({
      where: { tenantId, interestType, validFrom: new Date(rate.validFrom) },
    });
    if (existing) continue;
    if (opts.dryRun) {
      console.log(`  [kuru] ${interestType} ${rate.validFrom} → ${rate.validTo ?? 'açık'} ${rate.annualRate} (${rate.sourceRef})`);
      added++;
      continue;
    }
    await prisma.rateSchedule.create({
      data: {
        tenantId,
        interestType,
        validFrom: new Date(rate.validFrom),
        validTo: rate.validTo ? new Date(rate.validTo) : null,
        annualRate: rate.annualRate,
        source: rate.source,
        sourceRef: rate.sourceRef,
        versionHash: generateVersionHash({ interestType, validFrom: rate.validFrom, annualRate: rate.annualRate }),
      },
    });
    added++;
  }
  return added;
}

async function seedRatesForTenant(tenantId: string, opts: SeedOptions): Promise<number> {
  let addedCount = 0;

  console.log(`\n📊 Tenant ${tenantId} için oranlar yükleniyor...`);

  // Avans Faizi
  if (opts.only.has('COMMERCIAL_AVANS_3095_2_2')) {
    const rows = AVANS_FAIZ_ORANLARI.map((r) => ({ ...r, source: 'TCMB', sourceRef: `TCMB ${r.validFrom}` }));
    const n = await seedRows(tenantId, 'COMMERCIAL_AVANS_3095_2_2', rows, opts);
    console.log(`  ✅ Avans faizi: ${n} oran eklendi`);
    addedCount += n;
  }

  // Yasal Faiz (kaynak + kanıt + kapalı dönemler: LEGAL_3095_RATE_TABLE)
  if (opts.only.has('LEGAL_3095')) {
    const n = await seedRows(tenantId, 'LEGAL_3095', LEGAL_3095_RATE_TABLE, opts);
    console.log(`  ✅ Yasal faiz: ${n} oran eklendi`);
    addedCount += n;
  }

  // TTK 1530
  if (opts.only.has('TTK_1530')) {
    const rows = TTK_1530_ORANLARI.map((r) => ({ ...r, source: 'TCMB', sourceRef: `TCMB TTK 1530 ${r.validFrom.substring(0, 4)}` }));
    const n = await seedRows(tenantId, 'TTK_1530', rows, opts);
    console.log(`  ✅ TTK 1530: ${n} oran eklendi`);
    addedCount += n;
  }

  return addedCount;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  FAİZ ORANLARI SEED SCRIPT');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Tarih: ${new Date().toLocaleString('tr-TR')}`);
  console.log('');

  try {
    const opts = parseArgs(process.argv.slice(2));
    console.log(`  Türler: ${[...opts.only].join(', ')}${opts.tenantSlug ? ` · kiracı: ${opts.tenantSlug}` : ''}${opts.dryRun ? ' · KURU KOŞU (yazım yok)' : ''}`);

    // Bürolar (rate_schedule.tenantId → Office.id); --tenant-slug verilmişse yalnız o kiracının bürosu
    const tenants = await prisma.office.findMany({
      where: opts.tenantSlug ? { tenant: { slug: opts.tenantSlug } } : undefined,
      select: { id: true, name: true },
    });

    if (tenants.length === 0) {
      if (opts.tenantSlug) throw new Error(`Kiracı bulunamadı ya da bürosu yok: ${opts.tenantSlug}`);
      console.log('⚠️  Hiç tenant bulunamadı. Önce bir büro oluşturun.');
      return;
    }

    console.log(`📋 ${tenants.length} tenant bulundu:`);
    tenants.forEach(t => console.log(`   - ${t.name} (${t.id})`));

    let totalAdded = 0;
    for (const tenant of tenants) {
      const added = await seedRatesForTenant(tenant.id, opts);
      totalAdded += added;
    }

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log(`✅ TAMAMLANDI: Toplam ${totalAdded} oran ${opts.dryRun ? 'eklenecekti (kuru koşu)' : 'eklendi'}`);
    console.log('═══════════════════════════════════════════════════════════════');
  } catch (error) {
    console.error('❌ Hata:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
