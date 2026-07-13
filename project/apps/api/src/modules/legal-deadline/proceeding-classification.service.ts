import { Injectable, NotFoundException } from "@nestjs/common";
import { ProceedingType } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * MPB-028(a) PR-3C — Canonical Proceeding-Type and Legal-Period Rule Matrix.
 *
 * Bu servis:
 * - Case.proceedingType (+ varsa rentalType/bankruptcyType/judgmentExecutionType) alanlarını
 *   OKUR; CaseType/subType/subCategory/executionPath üzerinden GİZLİ FALLBACK KURMAZ
 *   (owner Decision — "mevcut alanlardan tahmin yapma").
 * - proceedingType boşsa (backfill YOK — mevcut kayıtlarda hep boş olabilir) UNRESOLVED
 *   (null) döner; tahmin ETMEZ.
 * - Enstrüman (çek/bono/poliçe) ayrımını hiç OKUMAZ/ÜRETMEZ — owner Decision: kanonik
 *   enstrüman kaynağı mevcut CaseInstrument[] modelidir, bu servisin kapsamı dışındadır.
 * - Tamamen read-only; hiçbir Case alanını yazmaz, hiçbir consumer/workflow/scheduler'ı
 *   tetiklemez.
 */

export interface ProceedingClassification {
  readonly proceedingType: ProceedingType;
  readonly subTypeCode: string | null;
}

interface ClassificationSourceFields {
  proceedingType: ProceedingType | null;
  rentalType: string | null;
  bankruptcyType: string | null;
  judgmentExecutionType: string | null;
}

@Injectable()
export class ProceedingClassificationService {
  constructor(private prisma: PrismaService) {}

  /**
   * Tenant-scoped. Case bulunamazsa NotFoundException (repo standardı — cross-tenant
   * enumeration önlenir). Case bulunur ama proceedingType boşsa null (UNRESOLVED) döner —
   * bu bir hata değil, henüz sınıflandırılmamış bir dosyanın beklenen durumudur.
   */
  async resolveProceedingClassification(
    tenantId: string,
    caseId: string,
  ): Promise<ProceedingClassification | null> {
    const caseRecord = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
      select: {
        proceedingType: true,
        rentalType: true,
        bankruptcyType: true,
        judgmentExecutionType: true,
      },
    });

    if (!caseRecord) {
      throw new NotFoundException("Dosya bulunamadı");
    }

    if (!caseRecord.proceedingType) {
      return null;
    }

    return {
      proceedingType: caseRecord.proceedingType,
      subTypeCode: this.resolveSubTypeCode(caseRecord as ClassificationSourceFields),
    };
  }

  /**
   * ProceedingType'a göre hangi alt-tür alanının anlamlı olduğunu seçer (RENT→rentalType,
   * BANKRUPTCY→bankruptcyType, JUDGMENT_ENFORCEMENT→judgmentExecutionType). Diğer
   * ProceedingType'larda (GENERAL_EXECUTION/CAMBIO/EVICTION/PLEDGE/MORTGAGE/
   * PUBLIC_RECEIVABLE) alt-tür kavramı yoktur, null döner.
   */
  private resolveSubTypeCode(caseRecord: ClassificationSourceFields): string | null {
    switch (caseRecord.proceedingType) {
      case ProceedingType.RENT:
        return caseRecord.rentalType;
      case ProceedingType.BANKRUPTCY:
        return caseRecord.bankruptcyType;
      case ProceedingType.JUDGMENT_ENFORCEMENT:
        return caseRecord.judgmentExecutionType;
      default:
        return null;
    }
  }
}
