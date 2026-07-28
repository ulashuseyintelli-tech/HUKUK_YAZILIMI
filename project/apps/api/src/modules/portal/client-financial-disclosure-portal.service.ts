import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  ClientDisclosureCurrentSurface,
  ClientDisclosureHistorySurface,
  ClientDisclosureProjection,
} from '../client-financial-disclosure/client-financial-disclosure-projection.contract';
import { ClientFinancialDisclosureProjectionService } from '../client-financial-disclosure/client-financial-disclosure-projection.service';

/**
 * CLIENT-P2-U03-TRACK-B-I06 — PORTAL FINANCIAL DISCLOSURE PRESENTATION
 *
 * Canonical sözleşme: charter §35.7 / §35.14 (+ §44'te kapanan I05 projeksiyonu).
 *
 * Bu sınıf I05'in dormant projeksiyon servisinin **tek yetkili adaptörüdür**. Kendi
 * sorgusunu YAZMAZ, kendi alan seçimini YAPMAZ ve kendi yetki kararını VERMEZ — yalnız
 * `portalUserId` + `tenantId`'yi projeksiyona geçirir. Böylece §35.14 alan sınırı ve
 * yetki zinciri TEK kaynakta kalır; portal katmanında paralel bir projeksiyon doğamaz.
 *   CLIENT-VISIBLE DATA = ONLY SERVER-AUTHORIZED PROJECTION
 *
 * `clientId` BİLEREK parametre DEĞİLDİR: müvekkil kimliği token'dan değil, `portalUserId`
 * üzerinden server tarafında yeniden çözülür (I05 yetki zinciri). Böylece token'daki
 * `clientId` alanı manipüle edilse bile kapsam genişlemez.
 */
@Injectable()
export class ClientFinancialDisclosurePortalService {
  private readonly projection: ClientFinancialDisclosureProjectionService;

  constructor(prisma: PrismaService) {
    this.projection = new ClientFinancialDisclosureProjectionService(prisma);
  }

  /** §35.14 varsayılan yüzey — yalnız current-effective disclosure'lar. */
  async getCurrent(
    portalUserId: string,
    tenantId: string,
    caseId?: string,
  ): Promise<ClientDisclosureCurrentSurface> {
    return this.projection.getCurrentSurface({ portalUserId, tenantId, ...(caseId ? { caseId } : {}) });
  }

  /** §35.14 AYRI "Bildirim Geçmişi" yüzeyi — düzeltme/reversal geçmişi. */
  async getHistory(
    portalUserId: string,
    tenantId: string,
    caseId?: string,
  ): Promise<ClientDisclosureHistorySurface> {
    return this.projection.getHistorySurface({ portalUserId, tenantId, ...(caseId ? { caseId } : {}) });
  }

  /** Tek kayıt — kapsam dışı/yayınlanmamış/var olmayan AYNI 404'ü üretir. */
  async getOne(
    portalUserId: string,
    tenantId: string,
    disclosureVersionId: string,
  ): Promise<ClientDisclosureProjection> {
    return this.projection.getById({ portalUserId, tenantId }, disclosureVersionId);
  }
}
