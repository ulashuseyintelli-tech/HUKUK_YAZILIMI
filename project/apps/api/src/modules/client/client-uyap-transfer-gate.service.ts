import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { resolveClientProcessingBasis } from './client-processing-basis.registry';
import { findPoaInvalidReason, type PoaLike } from './client-poa-capability';

/**
 * C3-B06 — UYAP AKTARIM GATE'İ, CLIENT TARAFI (§13/10 K10.1-K10.4, md.8).
 *
 * Owner ratifikasyonu (decision-log 2026-08-03):
 * - K10.1 KAPSAM: müvekkil/temsil edilen kişi verisini UYAP'a GÖNDEREN tüm dış aktarım
 *   işlemleri kapıya tabidir; katalog/durum/teknik sorgular kapsam dışıdır.
 * - K10.2 KOŞUL: geçerli ve kapsam-uyumlu POA (§13/9 K9.1 tanımı) VE kayıtlı dayanak
 *   (§13/5 registry — UYAP_TRANSFER) — İKİSİ BİRDEN.
 * - K10.3: eksikse RED; bekleyen otomatik yürütme YOK; BREAK-GLASS YOK; ret nedeni
 *   audit'e güvenli reason-code ile yazılır (PII yok).
 * - K10.4: representedPartyId kapıya tabi işlemlerde SERVİS SEVİYESİNDE zorunludur;
 *   global şema kolonu bu aşamada zorunlu yapılmaz.
 *
 * SINIR: UYAP domain-law'ına DOKUNULMAZ. UYAP modülünün kendi ratifiye send-authority
 * resolver'ı (MODEL B acting-lawyer-matched POA; UYAP-CONST-002) AYNEN yürürlüktedir —
 * bu kapı onu İKAME ETMEZ, CLIENT tarafının hukuki şartlarını (kayıtlı dayanak + belge
 * kanıtlı geçerli POA + temsil kimliği) EKLER. İki kapı fail-closed KESİŞİMDİR.
 *
 * EXACT OPERASYON ENVANTERİ (K10.1, bu blokta çıkarıldı — repository-truth):
 * - Kanonik operasyonlar (uyap-send-authority.types.ts I15-D1): UYAP_SEND,
 *   TRIGGER_HACIZ → İKİSİ DE müvekkil verisi aktaran DIŞ AKTARIMDIR → KAPIYA TABİ.
 * - Kanonik envanterde katalog/durum/teknik sorgu tipi bir operasyon BUGÜN YOKTUR;
 *   eklenmesi hâlinde OUT_OF_SCOPE listesine owner kararıyla alınır.
 * - Bilinmeyen/serbest operationType FAIL-CLOSED olarak KAPIYA TABİ sayılır
 *   (isimden kapsam-dışılık türetilmez).
 */

/** K10.1 — kapıya tabi olduğu kanıtlanmış kanonik dış aktarım operasyonları. */
export const CLIENT_UYAP_TRANSFER_OPERATIONS = ['UYAP_SEND', 'TRIGGER_HACIZ'] as const;

/** K10.1 — kapsam dışı (katalog/durum/teknik sorgu) operasyonlar: BUGÜN BOŞ (envanter kanıtı). */
export const CLIENT_UYAP_OUT_OF_SCOPE_OPERATIONS: readonly string[] = [];

export type ClientUyapGateClassification = 'TRANSFER_GATED' | 'OUT_OF_SCOPE';

/** Bilinmeyen operasyon fail-closed KAPIYA TABİ sayılır (K10.1 son fıkra). */
export function classifyUyapOperationForClientGate(
  operationType: string | null | undefined,
): ClientUyapGateClassification {
  if (operationType && CLIENT_UYAP_OUT_OF_SCOPE_OPERATIONS.includes(operationType)) {
    return 'OUT_OF_SCOPE';
  }
  return 'TRANSFER_GATED';
}

export type ClientUyapTransferDenyReason =
  | 'REPRESENTED_PARTY_REQUIRED'
  | 'NO_LEGAL_BASIS_REGISTERED'
  | 'NO_VALID_POA'
  | 'POA_SCOPE_UNDETERMINED_FOR_UYAP';

export interface ClientUyapTransferDecision {
  allowed: boolean;
  reasonCode: 'ALLOWED' | ClientUyapTransferDenyReason;
  basisPoaIds: string[];
}

/**
 * SAF karar (K10.2/K10.4): temsil kimliği + kayıtlı dayanak + geçerli POA + UYAP kapsam.
 * UYAP kapsam-uyumu: GENEL vekâlet temsili kapsar; OZEL vekâlette işlem-kapsam eşlemesi
 * yapılandırılmış olarak MEVCUT DEĞİLDİR → belirsizlik fail-closed RED (K9.3 kuralı;
 * eşik ratifiye ifadeden DAR olabilir, GENİŞ olamaz — serbest metin yetki üretmez).
 */
export function decideClientUyapTransfer(input: {
  representedPartyId: string | null | undefined;
  basisRegistered: boolean;
  poas: PoaLike[] | null | undefined;
  now: Date;
}): ClientUyapTransferDecision {
  if (!input.representedPartyId) {
    return { allowed: false, reasonCode: 'REPRESENTED_PARTY_REQUIRED', basisPoaIds: [] };
  }
  if (!input.basisRegistered) {
    return { allowed: false, reasonCode: 'NO_LEGAL_BASIS_REGISTERED', basisPoaIds: [] };
  }
  const validPoas = (input.poas ?? []).filter((p) => findPoaInvalidReason(p, input.now) === null);
  if (validPoas.length === 0) {
    return { allowed: false, reasonCode: 'NO_VALID_POA', basisPoaIds: [] };
  }
  const covering = validPoas.filter((p) => p.scopeType === 'GENEL');
  if (covering.length === 0) {
    return { allowed: false, reasonCode: 'POA_SCOPE_UNDETERMINED_FOR_UYAP', basisPoaIds: [] };
  }
  return {
    allowed: true,
    reasonCode: 'ALLOWED',
    basisPoaIds: covering.map((p) => p.id).filter((x): x is string => !!x),
  };
}

@Injectable()
export class ClientUyapTransferGateService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  /**
   * FAIL-CLOSED kapı: koşul eksikse ForbiddenException + reason-code'lu deny audit'i.
   * Bekletme/kuyruk YOK, break-glass YOK (K10.3). Kapsam dışı operasyonlar bu metoda
   * gelmeden classifyUyapOperationForClientGate ile ayrılır.
   */
  async assertClientUyapTransferAllowed(params: {
    tenantId: string;
    representedPartyId: string | null | undefined;
    operationType: string;
    actorUserId?: string;
    context?: string;
  }): Promise<{ basisPoaIds: string[] }> {
    const { tenantId, representedPartyId, operationType, actorUserId, context } = params;

    let poas: PoaLike[] = [];
    if (representedPartyId) {
      const client = await this.prisma.client.findFirst({
        where: { id: representedPartyId, tenantId },
        include: { powerOfAttorneys: true },
      });
      if (!client) throw new NotFoundException('Temsil edilen müvekkil bulunamadı');
      poas = (client as any).powerOfAttorneys ?? [];
    }

    const basisEntry = resolveClientProcessingBasis('UYAP_TRANSFER');
    const decision = decideClientUyapTransfer({
      representedPartyId,
      basisRegistered: !!basisEntry && !basisEntry.requiresExplicitConsent,
      poas,
      now: new Date(),
    });

    if (!decision.allowed) {
      // K10.3: ret nedeni GÜVENLİ reason-code ile audit'e — PII/belge içeriği taşınmaz.
      await this.audit.log({
        tenantId,
        action: 'CLIENT_UYAP_TRANSFER_DENIED',
        entityType: 'CLIENT',
        entityId: representedPartyId ?? 'UNSPECIFIED',
        userId: actorUserId,
        metadata: { operationType, reasonCode: decision.reasonCode, context: context ?? null },
      });
      throw new ForbiddenException({
        code: decision.reasonCode,
        message:
          'UYAP aktarımı reddedildi: geçerli vekâletname ve kayıtlı işleme dayanağı olmadan aktarım yapılamaz (§13/10, fail-closed)',
        operationType,
      });
    }
    return { basisPoaIds: decision.basisPoaIds };
  }
}
