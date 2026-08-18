import { Inject, Injectable, Logger } from '@nestjs/common';
import { OfficeWorkPoolKind } from '@prisma/client';
import {
  OfficeLawyerPoolKind,
  OfficeLawyerPoolResolution,
  OfficeStaffTypePoolKind,
  OfficeStaffTypePoolResolution,
  OfficeWorkPoolDiagnostic,
  OfficeWorkPoolEvaluation,
} from './office-work-pool.contract';
import {
  evaluateOfficeLawyerPool,
  evaluateOfficeStaffTypePool,
} from './office-work-pool.evaluator';
import { OfficeWorkPoolReadPort, OFFICE_WORK_POOL_READ_PORT } from './office-work-pool.repository';

/**
 * OFFICE-WR01-B02 AŞAMA 3 — RESOLVER ORCHESTRATION (§7).
 *
 * Katman sorumluluğu YALNIZ üç şeydir:
 *   1) repository'den TEK snapshot okumak,
 *   2) saf evaluator'ı çağırıp kararını DEĞİŞTİRMEDEN döndürmek,
 *   3) evaluator'ın ürettiği yapısal tanıları structured olarak loglamak.
 *
 * Karar mantığı burada YOKTUR (predikat kopyası yok); loglama evaluator'da YOKTUR (IO yok).
 *
 * RUNTIME DAVRANIŞ DEĞİŞİKLİĞİ = YOK. Bu servis AŞAMA 3'te hiçbir `@Module` providers listesinde
 * DEĞİLDİR ve altı mevcut okuyucudan hiçbiri onu çağırmaz (CONSUMER WIRING = 0/6):
 * `operational-escalation.service.ts`, `case-task-escalation.service.ts`,
 * `poa-expiry-delivery.service.ts`, `client-notification.service.ts`,
 * `office.service.ts` (admin GET), `scripts/g6-backfill-dry-run.ts`.
 * Legacy düz diziler source-of-truth olarak KALIR (OD-B02-03; okuma cutover'ı AŞAMA 6 / G8).
 *
 * PASİF KULLANICI SINIRI (§7.7, bağlayıcı): resolver YALNIZ effective-dated ÜYELİĞİ çözer ve
 * kişinin current-state aktiflik bayrağına HİÇ BAKMAZ. Üyelik (effective-dated) ile kişinin
 * aktifliği (current-state) iki AYRI eksendir; current-state süzmesi tüketici katmanının
 * sorumluluğudur ve bugünkü tüketici davranışı orada değişmeden durur. Bu sınır
 * `office-work-pool-resolver.spec.ts` içinde kaynak taramasıyla mekanik olarak kilitlenmiştir.
 *
 * @see office-work-pool.evaluator.ts
 * @see project/docs/governance/office-wr01-decomposition-r01/b02-effective-dated-pools-design-r01.md
 */
@Injectable()
export class OfficeWorkPoolResolverService {
  private readonly logger = new Logger(OfficeWorkPoolResolverService.name);

  constructor(
    @Inject(OFFICE_WORK_POOL_READ_PORT)
    private readonly reader: OfficeWorkPoolReadPort,
  ) {}

  /**
   * Lawyer-id taşıyıcılı havuzu verilen ANDA çözer.
   *
   * `asOf = now` özel bir hâl DEĞİLDİR; current-state bu sözleşmenin bir çağrısıdır (§7.1).
   * `tenantId` zorunlu parametredir; opsiyonel imza sunulmaz (§7.5).
   */
  async resolveLawyerPool(
    poolKind: OfficeLawyerPoolKind,
    asOf: Date,
    tenantId: string,
  ): Promise<OfficeLawyerPoolResolution> {
    const snapshot = await this.reader.readPoolSnapshot(tenantId, poolKind);
    const evaluation = evaluateOfficeLawyerPool(poolKind, asOf, tenantId, snapshot);
    this.report(evaluation, poolKind, asOf, tenantId);
    return evaluation.resolution;
  }

  /**
   * Staff-type taşıyıcılı havuzu verilen ANDA çözer.
   *
   * Dönüş üyeleri `StaffType` ENUM DEĞERLERİDİR, kimlik değildir (§7.8).
   */
  async resolveStaffTypePool(
    poolKind: OfficeStaffTypePoolKind,
    asOf: Date,
    tenantId: string,
  ): Promise<OfficeStaffTypePoolResolution> {
    const snapshot = await this.reader.readPoolSnapshot(tenantId, poolKind);
    const evaluation = evaluateOfficeStaffTypePool(poolKind, asOf, tenantId, snapshot);
    this.report(evaluation, poolKind, asOf, tenantId);
    return evaluation.resolution;
  }

  /**
   * Structured teşhis yazımı. Kararı DEĞİŞTİRMEZ ve exception FIRLATMAZ.
   *
   * Seviye ayrımı bilinçlidir:
   *  - `ANCHOR_MISSING` → **error**: bir tenant/havuz için bilgi sınırı kaydı hiç yoktur; bu bir
   *    veri bütünlüğü kusurudur ve AŞAMA 4'ün catch-up'ının kapatması gereken durumdur.
   *  - `BEFORE_KNOWN_FROM` → **log yok**: bu bir kusur değil, sözleşmenin DOĞRU cevabıdır
   *    (cutover öncesi hakkında sistem bilgi taşımaz). Gürültü üretmez.
   *  - yapısal tanılar → **warn**: §7.4'ün "degrade + gözlemle" kararı.
   */
  private report(
    evaluation: OfficeWorkPoolEvaluation<unknown>,
    poolKind: OfficeWorkPoolKind,
    asOf: Date,
    tenantId: string,
  ): void {
    const { resolution, diagnostics } = evaluation;

    if (resolution.status === 'UNKNOWN' && resolution.reason === 'ANCHOR_MISSING') {
      this.logger.error(
        JSON.stringify({
          event: 'office_work_pool_anchor_missing',
          poolKind,
          tenantId,
          asOf: asOf.toISOString(),
          outcome: 'UNKNOWN',
          reason: 'ANCHOR_MISSING',
        }),
      );
    }

    for (const diagnostic of diagnostics) {
      this.logger.warn(
        JSON.stringify({
          event: 'office_work_pool_structural_anomaly',
          tenantId,
          asOf: asOf.toISOString(),
          ...(diagnostic as OfficeWorkPoolDiagnostic),
        }),
      );
    }
  }
}
