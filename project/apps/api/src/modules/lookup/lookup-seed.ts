/**
 * LOOKUP SEED — TEK seed/upsert prosedürü (veri = lookup-catalog.ts).
 *
 * "Ne seedlenecek?" → lookup-catalog.ts (saf veri)
 * "Nasıl seedlenecek?" → bu dosya (idempotent upsert + reactivation + defaults çözümü)
 *
 * SAFLIK: Sadece @prisma/client TİPİNİ import eder (Nest DI yok). Bu sayede:
 *   - SeedService (Nest)         → seedLookupCatalog(this.prisma, tenantId)
 *   - scripts/seed-lookups.ts    → seedLookupCatalog(new PrismaClient(), tenantId)   [explicit --tenant]
 *   - prisma/seed.ts (tsx)       → seedLookupCatalog(prisma, demoTenant.id)
 *   - (PR-B) auth.register tx    → seedLookupCatalog(tx, tenant.id)
 * hepsi aynı fonksiyonu kullanır → ikinci veri kopyası yok → drift yok.
 */
import type { Prisma } from '@prisma/client';
import {
  TAKIP_TURU_CATALOG,
  MAHIYET_TIPI_CATALOG,
  ASAMA_CATALOG,
  RISK_CATALOG,
  DURUM_ETIKETI_CATALOG,
  TAKIP_TURU_DEFAULTS,
} from './lookup-catalog';

/**
 * PrismaClient da Prisma.TransactionClient'a atanabilir (TransactionClient = Omit<PrismaClient, ...>),
 * bu yüzden hem normal client hem tx tek tipte kabul edilir.
 */
export type LookupSeedClient = Prisma.TransactionClient;

export interface LookupSeedResult {
  takipTuru: number;
  mahiyet: number;
  asama: number;
  risk: number;
  durumEtiketi: number;
}

/**
 * Verilen tenant'a kanonik lookup kataloğunu idempotent upsert eder.
 *
 * Semantik (tenantId + code unique):
 *   - kanonik kod + yok        → create
 *   - kanonik kod + aktif var  → update (name/sortOrder/desc/uyap/color/defaults; code/tenant/id sabit)
 *   - kanonik kod + soft-deleted → REACTIVATE (update + isActive:true)
 *   - kanonik OLMAYAN (RFA005_*, eski drift, manuel) → DOKUNULMAZ (upsert yalnız katalog kodlarını hedefler)
 *   - hard-delete ASLA (Case FK)
 *
 * Sıra: mahiyet + risk + aşama + durum ÖNCE (takipTuru defaults bunların id'lerini gerektirir),
 *       SONRA takipTuru, EN SON defaults geçişi (defaultMahiyetTipiId).
 *
 * <remarks>
 * Çağrıldığı yerler:
 * - SeedService.seedLookups() → POST /seed/lookups, POST /seed/all (in-app seed)
 * - scripts/seed-lookups.ts → manuel/runbook (explicit --tenant) — Demo Firma repair (PR-C)
 * - prisma/seed.ts → pnpm db:seed / db:bootstrap (Demo Firma tenant'ı)
 * - (PR-B) AuthService.register() → yeni tenant oluşturma transaction'ı
 * </remarks>
 */
export async function seedLookupCatalog(
  db: LookupSeedClient,
  tenantId: string,
): Promise<LookupSeedResult> {
  // 1) Mahiyet tipleri (takipTuru defaults bunların id'lerini gerektirir)
  for (const m of MAHIYET_TIPI_CATALOG) {
    await db.lookupMahiyetTipi.upsert({
      where: { tenantId_code: { tenantId, code: m.code } },
      update: { name: m.name, description: m.description, uyapCode: m.uyapCode, sortOrder: m.sortOrder, isActive: true },
      create: { tenantId, code: m.code, name: m.name, description: m.description, uyapCode: m.uyapCode, sortOrder: m.sortOrder },
    });
  }

  // 2) Risk sınıfları
  for (const r of RISK_CATALOG) {
    await db.lookupRisk.upsert({
      where: { tenantId_code: { tenantId, code: r.code } },
      update: { name: r.name, description: r.description, color: r.color, sortOrder: r.sortOrder, isActive: true },
      create: { tenantId, code: r.code, name: r.name, description: r.description, color: r.color, sortOrder: r.sortOrder },
    });
  }

  // 3) Aşamalar
  for (const a of ASAMA_CATALOG) {
    await db.lookupAsama.upsert({
      where: { tenantId_code: { tenantId, code: a.code } },
      update: { name: a.name, description: a.description, sortOrder: a.sortOrder, isActive: true },
      create: { tenantId, code: a.code, name: a.name, description: a.description, sortOrder: a.sortOrder },
    });
  }

  // 4) Durum etiketleri
  for (const d of DURUM_ETIKETI_CATALOG) {
    await db.lookupDurumEtiketi.upsert({
      where: { tenantId_code: { tenantId, code: d.code } },
      update: { name: d.name, description: d.description, color: d.color, sortOrder: d.sortOrder, isActive: true },
      create: { tenantId, code: d.code, name: d.name, description: d.description, color: d.color, sortOrder: d.sortOrder },
    });
  }

  // 5) Takip türleri (defaults henüz yok — id'ler bir sonraki adımda çözülür)
  for (const t of TAKIP_TURU_CATALOG) {
    await db.lookupTakipTuru.upsert({
      where: { tenantId_code: { tenantId, code: t.code } },
      update: { name: t.name, description: t.description, sortOrder: t.sortOrder, isActive: true },
      create: { tenantId, code: t.code, name: t.name, description: t.description, sortOrder: t.sortOrder },
    });
  }

  // 6) Defaults geçişi — mahiyet id'lerini çöz, takipTuru'yu güncelle
  const mahiyetler = await db.lookupMahiyetTipi.findMany({ where: { tenantId }, select: { id: true, code: true } });
  for (const [takipKodu, def] of Object.entries(TAKIP_TURU_DEFAULTS)) {
    const mahiyet = mahiyetler.find((x) => x.code === def.mahiyetKodu);
    if (mahiyet) {
      await db.lookupTakipTuru.update({
        where: { tenantId_code: { tenantId, code: takipKodu } },
        data: { defaultMahiyetTipiId: mahiyet.id },
      });
    }
  }

  return {
    takipTuru: TAKIP_TURU_CATALOG.length,
    mahiyet: MAHIYET_TIPI_CATALOG.length,
    asama: ASAMA_CATALOG.length,
    risk: RISK_CATALOG.length,
    durumEtiketi: DURUM_ETIKETI_CATALOG.length,
  };
}
