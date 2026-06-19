/**
 * Lookup seed — WRAPPER (veri/prosedür burada DEĞİL).
 *
 * Kanonik veri: src/modules/lookup/lookup-catalog.ts
 * Seed prosedürü: src/modules/lookup/lookup-seed.ts (seedLookupCatalog)
 *
 * Bu script yalnız HEDEF tenant'ı çözer ve seedLookupCatalog'u çağırır. Liste TUTMAZ.
 *
 * GÜVENLİK: Seed script'leri tehlikelidir → yanlışlıkla tüm tenant'lara YAZMAZ.
 *   - Hedef ZORUNLU: argümansız çağrı REDDEDİLİR (hiçbir yere yazmaz).
 *   - Tek tenant:        npx tsx scripts/seed-lookups.ts --tenant=<tenantId>
 *   - Tüm gerçek tenant: npx tsx scripts/seed-lookups.ts --all-real   (test-tenant-* hariç, BİLİNÇLİ flag)
 */
import { PrismaClient } from '@prisma/client';
import { seedLookupCatalog } from '../src/modules/lookup/lookup-seed';

const USAGE = `Kullanım:
  npx tsx scripts/seed-lookups.ts --tenant=<tenantId>   # tek tenant'a kanonik lookup seed
  npx tsx scripts/seed-lookups.ts --all-real            # test-tenant-* HARİÇ tüm tenant (bilinçli)

HATA: Hedef tenant belirtilmedi. Güvenlik gereği argümansız çalışma REDDEDİLİR
(yanlışlıkla tüm tenant'lara yazmamak için).`;

function parseArgs(argv: string[]): { tenant: string | null; allReal: boolean } {
  let tenant: string | null = null;
  let allReal = false;
  for (const a of argv) {
    if (a.startsWith('--tenant=')) tenant = a.slice('--tenant='.length).trim() || null;
    else if (a === '--all-real') allReal = true;
  }
  return { tenant, allReal };
}

async function main(): Promise<void> {
  const { tenant, allReal } = parseArgs(process.argv.slice(2));

  // Hedef yoksa HİÇBİR client açmadan reddet.
  if (!tenant && !allReal) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient();
  try {
    let targets: { id: string; name: string }[];

    if (tenant) {
      const t = await prisma.tenant.findUnique({ where: { id: tenant }, select: { id: true, name: true } });
      if (!t) {
        throw new Error(`Tenant bulunamadı: ${tenant}`);
      }
      targets = [t];
    } else {
      // --all-real: test-tenant-* HARİÇ tüm gerçek tenant'lar
      targets = (await prisma.tenant.findMany({ select: { id: true, name: true } })).filter(
        (t) => !t.id.startsWith('test-tenant-'),
      );
      console.log(`--all-real: ${targets.length} gerçek tenant hedefleniyor (test-tenant-* hariç).`);
    }

    for (const t of targets) {
      const r = await seedLookupCatalog(prisma, t.id);
      console.log(
        `✓ ${t.name} (${t.id}): takipTuru=${r.takipTuru} mahiyet=${r.mahiyet} asama=${r.asama} ` +
          `risk=${r.risk} borcluTipi=${r.borcluTipi} durumEtiketi=${r.durumEtiketi}`,
      );
    }

    console.log('\n✅ Lookup catalog seed tamamlandı.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('Hata:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
