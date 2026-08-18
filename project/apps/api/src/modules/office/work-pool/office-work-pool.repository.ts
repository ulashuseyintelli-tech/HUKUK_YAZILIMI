import { Injectable } from '@nestjs/common';
import { OfficeWorkPoolKind, StaffType } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { OfficeWorkPoolSnapshot } from './office-work-pool.evaluator';

/**
 * OFFICE-WR01-B02 AŞAMA 3 — REPOSITORY ADAPTER (§7 "tek repository sorgusu" katmanı).
 *
 * KAPSAM SINIRI: bu dosya YALNIZ okur. INSERT/UPDATE/DELETE, dual-write, anchor catch-up ve
 * `applyTargetState()` primitive'i AŞAMA 4'ün konusudur ve burada YOKTUR.
 *
 * NEST WIRING YOKTUR: bu sınıflar hiçbir `@Module` providers listesine EKLENMEMİŞTİR; AŞAMA 3'te
 * hiçbir runtime tüketici resolver'ı inject etmez (CONSUMER WIRING = 0/6). `@Injectable()`
 * dekoratörü yalnız AŞAMA 4'ün wiring'ini hazır tutar ve tek başına hiçbir örnek üretmez.
 *
 * @see office-work-pool.evaluator.ts (predikat; bu dosyada predikat KOPYASI yoktur)
 */

/** Resolver'ın DI token'ı — AŞAMA 4 wiring'i bu token'ı bağlar. */
export const OFFICE_WORK_POOL_READ_PORT = Symbol('OFFICE_WORK_POOL_READ_PORT');

/**
 * Resolver'ın tek okuma yüzeyi.
 *
 * Metot TEK çağrıda hem anchor'ı hem üyelik satırlarını getirir: aynı karar için tekrar tekrar
 * DB'ye gidilmesi (N+1 / havuz başına çoklu round-trip) yapısal olarak imkânsızdır.
 */
export interface OfficeWorkPoolReadPort {
  readPoolSnapshot(tenantId: string, poolKind: OfficeWorkPoolKind): Promise<OfficeWorkPoolSnapshot>;
}

/** Parite ölçümünün legacy tarafı — üç düz dizi (§2.1). SOT AŞAMA 3'te BUNLARDIR. */
export interface OfficeLegacyPoolRow {
  readonly tenantId: string;
  readonly opStaffTypes: readonly StaffType[];
  readonly escalationManagerLawyerIds: readonly string[];
  readonly escalationFounderLawyerIds: readonly string[];
}

/** Parite harness'inin legacy okuma yüzeyi. */
export interface OfficeLegacyPoolReadPort {
  listLegacyPools(tenantIds?: readonly string[]): Promise<readonly OfficeLegacyPoolRow[]>;
}

/**
 * Prisma implementasyonu.
 *
 * SNAPSHOT TUTARLILIĞI (dürüstlük şerhi): iki SELECT tek bir REPEATABLE READ transaction'ında
 * DEĞİL, `Promise.all` ile paralel koşar. Gerekçe: anchor satırı havuz başına bir kez doğar ve
 * §9.5 gereği ASLA retire edilmez; yani statement'lar arasında değişebilecek tek taraf üyelik
 * satırlarıdır ve onların TAMAMI TEK statement'ta okunur. Dolayısıyla kararı etkileyebilecek
 * kısım için okuma zaten atomiktir. `$transaction` READ COMMITTED altında ek garanti vermez
 * (statement düzeyi snapshot), bu yüzden gerçek fayda üretmeyen bir sarmalayıcı eklenmedi.
 */
@Injectable()
export class OfficeWorkPoolPrismaRepository
  implements OfficeWorkPoolReadPort, OfficeLegacyPoolReadPort
{
  constructor(private readonly prisma: PrismaService) {}

  /**
   * TAM OLARAK İKİ SELECT üretir (ölçüldü; `office-work-pool-parity.db-gated.integration.spec.ts`
   * bu sayıyı gerçek Postgres query event'leriyle sabitler):
   *   1) OfficeWorkPoolEpoch      — @@unique([tenantId, poolKind]) üzerinden tekil anchor
   *   2) OfficeWorkPoolMembership — (tenantId, poolKind) dilimi
   *
   * ZAMAN PREDİKATI BİLEREK PUSHDOWN EDİLMEDİ. İki gerekçe:
   *  (a) §7.1 predikatı TEK yerde (saf evaluator) yaşamalı; SQL'e kopyalanması iki tanımın
   *      zamanla ayrışması riskini doğurur ve testin kanıtladığı davranış üretimdekinden
   *      farklılaşır.
   *  (b) §7.4 anomalisi (aynı üye için birden fazla aktif satır) yalnız satırlar evaluator'a
   *      ULAŞIRSA görülebilir; erken süzme/DISTINCT anomaliyi görünmez kılardı.
   * Kardinalite bunu güvenli kılar: bir (tenant, poolKind) dilimi büro personeli/avukat sayısı
   * mertebesindedir ve @@index([tenantId, poolKind, validFrom]) tam bu erişimi karşılar.
   */
  async readPoolSnapshot(
    tenantId: string,
    poolKind: OfficeWorkPoolKind,
  ): Promise<OfficeWorkPoolSnapshot> {
    const [anchor, memberships] = await Promise.all([
      this.prisma.officeWorkPoolEpoch.findUnique({
        where: { tenantId_poolKind: { tenantId, poolKind } },
        select: { knownFrom: true },
      }),
      this.prisma.officeWorkPoolMembership.findMany({
        where: { tenantId, poolKind },
        select: {
          id: true,
          tenantId: true,
          poolKind: true,
          memberLawyerId: true,
          memberStaffType: true,
          validFrom: true,
          validUntil: true,
          revokedAt: true,
        },
        // Sıralama sonucu belirlemez (evaluator küme semantiği uygular ve kendi deterministik
        // sıralamasını yapar); yalnız tanı/rowIds çıktısını okunur kılar.
        orderBy: [{ validFrom: 'asc' }, { id: 'asc' }],
      }),
    ]);

    return { anchor, memberships };
  }

  /** Parite ölçümünün legacy tarafı. Salt-okunur; hiçbir düz diziye dokunmaz. */
  async listLegacyPools(tenantIds?: readonly string[]): Promise<readonly OfficeLegacyPoolRow[]> {
    return this.prisma.office.findMany({
      where: tenantIds === undefined ? {} : { tenantId: { in: [...tenantIds] } },
      select: {
        tenantId: true,
        opStaffTypes: true,
        escalationManagerLawyerIds: true,
        escalationFounderLawyerIds: true,
      },
      orderBy: { tenantId: 'asc' },
    });
  }
}
