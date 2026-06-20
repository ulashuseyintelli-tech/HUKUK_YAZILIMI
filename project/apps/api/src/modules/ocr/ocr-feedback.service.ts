import { Injectable } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { OcrExtractionFeedbackDto } from "./dto/extraction-feedback.dto";

/** AuditLog ayrımı için sabitler (rapor sorgusu PR-3'te bunları filtreler). */
export const OCR_FEEDBACK_ENTITY_TYPE = "OCR_EXTRACTION_FEEDBACK";
export const OCR_FEEDBACK_ACTION = "OCR_EXTRACTION_FEEDBACK_RECORDED";

export interface OcrFeedbackActor {
  tenantId: string;
  userId?: string;
  userName?: string;
}

/**
 * A2-min / A3 — OCR instrument alan-bazlı extraction feedback'i PII'SİZ olarak AuditLog'a yazar.
 *
 * Amaç: "OCR neyi ölçüyor?" sorusunu teoriyle değil VERİYLE kapatmak için, kullanıcının
 * OCR ön-doldurmasını ne sıklıkta DÜZELTTİĞİNİ (alan-bazlı edit-rate) toplamak.
 * Çıktı yalnız ALT SINIR'dır (insan bazı hataları kaçırabilir; bkz. design-doc guard G2).
 *
 * PII INVARYANTI: ham OCR değeri, kullanıcı final değeri, iş değeri (tutar/no/tarih/ad/TCKN)
 * AuditLog'a ASLA yazılmaz. Yalnız metrik: documentType/instrumentType/field/edited/confidence/
 * groupConfidence/needsReview. oldValues/newValues/entityId gerçek değer TAŞIMAZ.
 */
@Injectable()
export class OcrFeedbackService {
  constructor(private readonly auditService: AuditService) {}

  /**
   * OCR extraction feedback kalemlerini alan başına bir AuditLog satırı olarak yazar
   * (alan-bazlı aggregation'ı kolaylaştırmak için).
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - OcrController.recordExtractionFeedback() → POST /ocr/extraction-feedback
   *   (frontend ACCEPT diff'i; bu PR'da yalnız backend altyapısı — frontend bağlama PR-2)
   * </remarks>
   */
  async recordExtractionFeedback(
    actor: OcrFeedbackActor,
    dto: OcrExtractionFeedbackDto,
  ): Promise<{ recorded: number }> {
    for (const item of dto.items) {
      await this.auditService.log({
        tenantId: actor.tenantId,
        userId: actor.userId,
        userName: actor.userName,
        action: OCR_FEEDBACK_ACTION,
        entityType: OCR_FEEDBACK_ENTITY_TYPE,
        // PII YOK: yalnız metrik. oldValues/newValues/entityId'ye gerçek değer KONMAZ.
        metadata: {
          documentType: dto.documentType,
          instrumentType: item.instrumentType,
          field: item.field,
          edited: item.edited,
          confidence: item.confidence,
          ...(item.groupConfidence !== undefined
            ? { groupConfidence: item.groupConfidence }
            : {}),
          ...(item.needsReview !== undefined ? { needsReview: item.needsReview } : {}),
        },
      });
    }

    return { recorded: dto.items.length };
  }
}
