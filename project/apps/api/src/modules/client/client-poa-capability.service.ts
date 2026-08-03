import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  deriveEffectiveClientCapabilities,
  decideEffectiveClientCapability,
  type ClientPoaCapability,
  type EffectiveClientCapabilities,
} from './client-poa-capability';

/**
 * C3-B05 — efektif capability servisi (§13/9, model C servis-katmanı kapısı).
 *
 * TEK KAPI: yetki kararı isteyen her tüketici (ör. §13/10 UYAP gate'i — C3-B06) flat
 * bayrağı DEĞİL bu servisi kullanır. Tenant + müvekkil eşleşmesi (K9.1) composite
 * sorgu ile DB seviyesinde sağlanır.
 */
@Injectable()
export class ClientPoaCapabilityService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  private async loadClientWithPoas(tenantId: string, clientId: string) {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, tenantId },
      include: { powerOfAttorneys: true },
    });
    if (!client) throw new NotFoundException('Müvekkil bulunamadı');
    return client;
  }

  /** Dört yetkinin efektif durumu + kanıt (POA id'leri). */
  async getEffectiveCapabilities(
    tenantId: string,
    clientId: string,
  ): Promise<EffectiveClientCapabilities> {
    const client = await this.loadClientWithPoas(tenantId, clientId);
    return deriveEffectiveClientCapabilities(
      client as any,
      (client as any).powerOfAttorneys ?? [],
      new Date(),
    );
  }

  /**
   * FAIL-CLOSED iddia kapısı: yetki yoksa ForbiddenException + audit'e RED kaydı.
   * Hata gövdesi yalnız reasonCode taşır (PII yok).
   */
  async assertEffectiveCapability(params: {
    tenantId: string;
    clientId: string;
    capability: ClientPoaCapability;
    actorUserId?: string;
    context?: string;
  }): Promise<{ basisPoaIds: string[] }> {
    const { tenantId, clientId, capability, actorUserId, context } = params;
    const client = await this.loadClientWithPoas(tenantId, clientId);
    const decision = decideEffectiveClientCapability(
      client as any,
      (client as any).powerOfAttorneys ?? [],
      capability,
      new Date(),
    );
    if (!decision.allowed) {
      await this.audit.log({
        tenantId,
        action: 'CLIENT_EFFECTIVE_CAPABILITY_DENIED',
        entityType: 'CLIENT',
        entityId: clientId,
        userId: actorUserId,
        metadata: { capability, reasonCode: decision.reasonCode, context: context ?? null },
      });
      throw new ForbiddenException({
        code: decision.reasonCode,
        message:
          'Geçerli ve kapsam-uyumlu vekâletname olmadan bu işlem yetkisi kullanılamaz (§13/9 K9.4)',
        capability,
      });
    }
    return { basisPoaIds: decision.basisPoaIds };
  }
}
