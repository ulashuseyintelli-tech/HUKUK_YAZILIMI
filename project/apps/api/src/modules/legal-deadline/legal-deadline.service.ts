import { Injectable, Logger, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { Tk21Type, TebligatChannel, LegalDeadlineType, ServiceOccurrenceRegimeCode } from "@prisma/client";
import {
  resolveLegalServiceDate,
  IncompatibleCompletionModeError,
  UnsupportedServiceRegimeCodeError,
  LegalServiceDateFacts,
} from "./legal-service-date-rule-core";

/**
 * MPB-028(a) PR-2 — kanonik hukuki süre hesabı foundation'ı.
 *
 * Bu servis:
 * - NotificationQueue okumaz (owner Decision 4 — hukuki süre otoritesi değildir),
 * - hiçbir workflow stage/scheduler tetiklemez,
 * - hiçbir UI consumer'ı değiştirmez,
 * - geçmiş kayıtları backfill etmez (owner Decision 2 — yalnız forward-only).
 *
 * Kapsam dışı (bu PR'da bilinçli olarak YOK — bkz. final rapor "NEW FINDING"):
 * - Tatil/iş günü hesaplaması (owner Decision 3 — ayrı workstream).
 * - Kesinleşme (finalizationDate) hesaplaması — bu servis yalnız legalServiceDate/dueDate
 *   üretir; finalizationDate her zaman null bırakılır (owner Decision 6).
 * - İtiraz gün sayısının (objectionPeriodDays) Case.type/subType'tan OTOMATİK türetilmesi —
 *   CaseType (Prisma enum) ile tasarım belgesinin 6 kırılımlı takip-türü taksonomisi
 *   arasında canonical bir eşleştirme repo'da bulunamadı (bkz. final rapor
 *   "OBJECTION PERIOD TABLE NOT CANONICALLY RESOLVED"). Bu yüzden objectionPeriodDays
 *   çağıran tarafından PARAMETRE olarak sağlanır; bu servis "kaç gün olması gerektiğini"
 *   tahmin ETMEZ.
 */

const CALCULATION_VERSION = "legal-deadline-v1";

/**
 * MPB-028(a) PR-2 blocker resolution (Decision A): CaseType/subType → 6-kırılım takip türü
 * eşleştirmesi canonical olarak çözümlenmedikçe bu servis itiraz gün sayısını TAHMİN ETMEZ.
 * objectionPeriodDays çağıran tarafından sağlanan, doğrulanmış bir girdidir. Üst sınır
 * spesifik bir kanun maddesine dayanmaz — bilinen hiçbir itiraz/süre rejiminin bu değeri
 * aşmadığı bir "sanity guard"dır (aşırı büyük/hatalı girdiyi fail-closed reddetmek için).
 */
const MAX_OBJECTION_PERIOD_DAYS = 365;

export interface CalculateDeadlineInput {
  tenantId: string;
  tebligatId: string;
  /**
   * İtiraz süresi (gün). Bu servis bu sayıyı ÜRETMEZ — CaseType/subType → takip türü
   * eşleştirmesi canonical olarak netleşmeden bu servisin kendi içinde tahmin edilmesi
   * "yeni hukuki yorum" sayılır ve MPB-028(a) PR-2 GO-IMPLEMENT talimatının hard-stop
   * kriterine girer. Çağıran, bu sayıyı ayrı bir owner-onaylı kaynaktan sağlamalıdır.
   * Doğrulama: pozitif tam sayı olmalı, MAX_OBJECTION_PERIOD_DAYS'i aşamaz; aksi halde
   * fail-closed (BadRequestException) — hiçbir varsayılan gün sayısı (5/7/10 vb.) üretilmez.
   */
  objectionPeriodDays: number;
}

export interface LegalServiceDateResult {
  legalServiceDate: Date;
  deadlineReasonCode: string;
  calculationRule: string;
}

@Injectable()
export class LegalDeadlineService {
  private readonly logger = new Logger(LegalDeadlineService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Tebligat verisinden kanonik LegalDeadlineSnapshot üretir/günceller.
   *
   * Idempotent: aynı Tebligat için hesaplama sonucu (legalServiceDate/dueDate/
   * deadlineReasonCode/calculationVersion) mevcut ACTIVE snapshot ile birebir aynıysa
   * yeni satır YAZILMAZ, mevcut snapshot döner. Sonuç farklıysa (veya hiç snapshot
   * yoksa) yeni bir ACTIVE snapshot oluşturulur; varsa önceki ACTIVE snapshot
   * SUPERSEDED olarak işaretlenir ve supersedesSnapshotId ile yeni kayda bağlanır
   * (owner Decision 5 — mevcut satırın hesaplanan alanları asla update edilmez;
   * yalnız yaşam-döngüsü meta verisi olan `status` alanı supersede işleminin
   * bir parçası olarak güncellenir, bu "silent update" değildir).
   *
   * @deprecated LEGACY SNAPSHOT WRITER — YENİ ÜRETİM ÇAĞIRANI EKLENMEZ.
   *
   * DEBTOR-LEGAL-DEADLINE-LEGACY-PATH-DISPOSITION-P1-I07 (eski roadmap TASK 06):
   * Bu yol Tebligat'ın DEĞİŞEBİLİR alanlarını (tk21Type/muhtarlikDate/ilanDate/
   * deliveredAt) okur ve advisory lock ALMAZ. Kanonik yazıcı, DEBTOR-OF01-HISTORY-P04-B
   * ile gelen occurrence tabanlı yoldur:
   *
   *   CANONICAL SUCCESSOR:
   *     ServiceOccurrenceDeadlineCalculationService.calculateForOccurrence()
   *     (değişmez ServiceOccurrence fact'lerini okur, pg_advisory_xact_lock altında
   *      yürür, idempotency çakışmasını fail-closed reddeder)
   *   ÜRETİM BAĞLANTISI:
   *     ServiceOccurrenceRecordedConsumerService.handle() (P04-C-I01, event-driven)
   *
   * Bu metodun ÜRETİM çağıranı YOKTUR (yalnız kendi davranış spec'leri çağırır) ve
   * bu durum `__tests__/legal-deadline-legacy-path-containment.static-guard.spec.ts`
   * ile caller envanteri üzerinden kilitlenmiştir: üretim kaynağına yeni bir
   * `calculateDeadline(` çağrısı eklenirse required CI KIRMIZI olur.
   *
   * Davranış/formül bu görevde DEĞİŞTİRİLMEDİ; her iki yol da hukuki tarih kararını
   * aynı çekirdeğe (`legal-service-date-rule-core.resolveLegalServiceDate`) delege eder.
   * Yeni bir tüketici gerekiyorsa canonical successor kullanılır; bu metot geri
   * aktive EDİLMEZ.
   */
  async calculateDeadline(input: CalculateDeadlineInput) {
    this.assertValidObjectionPeriodDays(input.objectionPeriodDays);

    const tebligat = await this.prisma.tebligat.findFirst({
      where: { id: input.tebligatId, tenantId: input.tenantId },
    });

    if (!tebligat) {
      throw new NotFoundException("Tebligat bulunamadı");
    }

    const regime = this.determineLegalServiceDate(tebligat);
    if (!regime) {
      throw new BadRequestException(
        "Hukuki tebliğ tarihi hesaplanamadı: eksik veya uyumsuz tebligat kanıtı",
      );
    }

    const dueDate = addDays(regime.legalServiceDate, input.objectionPeriodDays);

    return this.prisma.$transaction(async (tx) => {
      const existingActive = await tx.legalDeadlineSnapshot.findFirst({
        where: {
          tenantId: input.tenantId,
          sourceTebligatId: input.tebligatId,
          status: "ACTIVE",
        },
      });

      if (
        existingActive &&
        existingActive.legalServiceDate.getTime() === regime.legalServiceDate.getTime() &&
        existingActive.dueDate.getTime() === dueDate.getTime() &&
        existingActive.deadlineReasonCode === regime.deadlineReasonCode &&
        existingActive.calculationVersion === CALCULATION_VERSION
      ) {
        // Idempotent no-op — girdi değişmedi, gereksiz duplicate snapshot üretilmez.
        return existingActive;
      }

      if (existingActive) {
        await tx.legalDeadlineSnapshot.update({
          where: { id: existingActive.id },
          data: { status: "SUPERSEDED" },
        });
      }

      const created = await tx.legalDeadlineSnapshot.create({
        data: {
          tenantId: input.tenantId,
          caseId: tebligat.caseId,
          caseDebtorId: tebligat.caseDebtorId,
          sourceTebligatId: tebligat.id,
          deadlineType: LegalDeadlineType.OBJECTION_PERIOD,
          legalServiceDate: regime.legalServiceDate,
          dueDate,
          calculationRule: regime.calculationRule,
          calculationVersion: CALCULATION_VERSION,
          deadlineReasonCode: regime.deadlineReasonCode,
          supersedesSnapshotId: existingActive?.id ?? null,
          status: "ACTIVE",
        },
      });

      this.logger.log(
        `LegalDeadlineSnapshot oluşturuldu: tebligat=${tebligat.id}, reasonCode=${regime.deadlineReasonCode}`,
      );

      return created;
    });
  }

  /**
   * MPB-028(a) PR-3 (shadow-read + diff evidence): yalnız legalServiceDate hesabını döner —
   * dueDate/objectionPeriodDays/snapshot YOK. `calculateDeadline`'ın aksine hiçbir
   * LegalDeadlineSnapshot satırı YAZMAZ (tamamen read-only) ve hiçbir owner-onaylı
   * objectionPeriodDays girdisi gerektirmez. Shadow-diff karşılaştırmasının canonical
   * tarafı için eklenmiştir. Tebligat bulunamazsa veya hiçbir rejim eşleşmezse null döner
   * (fail-closed — çağıran tahmin ETMEZ, "CANONICAL_UNRESOLVED" olarak işaretler).
   */
  async resolveLegalServiceDateForTebligat(
    tenantId: string,
    tebligatId: string,
  ): Promise<LegalServiceDateResult | null> {
    const tebligat = await this.prisma.tebligat.findFirst({
      where: { id: tebligatId, tenantId },
    });
    if (!tebligat) {
      return null;
    }
    return this.determineLegalServiceDate(tebligat);
  }

  /**
   * MPB-028(a) PR-2 blocker resolution (Decision A): objectionPeriodDays çağıran tarafından
   * sağlanan doğrulanmış bir girdi olmalıdır — servis içinde CaseType/subType üzerinden gizli
   * bir fallback veya tahmin YOKTUR. Eksik/sıfır/negatif/tam-sayı-olmayan/aşırı büyük girdi
   * fail-closed reddedilir.
   */
  private assertValidObjectionPeriodDays(objectionPeriodDays: number): void {
    if (
      typeof objectionPeriodDays !== "number" ||
      !Number.isInteger(objectionPeriodDays) ||
      objectionPeriodDays <= 0
    ) {
      throw new BadRequestException(
        "objectionPeriodDays pozitif bir tam sayı olmalıdır (eksik/sıfır/negatif değer kabul edilmez)",
      );
    }
    if (objectionPeriodDays > MAX_OBJECTION_PERIOD_DAYS) {
      throw new BadRequestException(
        `objectionPeriodDays makul üst sınırı (${MAX_OBJECTION_PERIOD_DAYS} gün) aşıyor`,
      );
    }
  }

  /**
   * DEBTOR-OF01-HISTORY-P04-B-R2-I02: hesap artık `LegalServiceDateRuleCore`'a delege
   * edilir (bkz. `buildLegalServiceDateFacts`). Bu metodun dış sözleşmesi (girdi şekli,
   * `LegalServiceDateResult | null` dönüşü, `null` = "fail-closed, tahmin yok") AYNEN
   * korunur — `calculateDeadline`/`resolveLegalServiceDateForTebligat` bu metodu hiç
   * değişmemiş gibi çağırmaya devam eder.
   *
   * TK m.20 için ÖNEMLİ DAVRANIŞ DEĞİŞİKLİĞİ (owner brief P04-B-R2-I02): Tebligat
   * modelinde `serviceCompletionMode`'u (NOTICE_POSTED vs DELIVERED_TO_AUTHORIZED_PERSON)
   * karşılayan HİÇBİR güvenilir kolon yok — yalnız ServiceOccurrence'da var. Bağlı
   * ServiceOccurrence kayıtları arasından seçim yapmak veya `ilanDate ?? muhtarlikDate`
   * varlığından completion mode'u ÖRTÜLÜ ÇIKARSAMAK owner tarafından açıkça yasaklandı
   * (ikisi de "tahmin" sayılır). Bu yüzden legacy TK m.20 yolu ARTIK HER ZAMAN fail-closed
   * olur (eski, her zaman +15 gün ekleyen davranış YANLIŞTI ve kaldırıldı) — çekirdeğin
   * kendi `IncompatibleCompletionModeError`'ı bunu üretir, biz onu `null`'a çeviririz.
   */
  private determineLegalServiceDate(tebligat: {
    tk21Type: Tk21Type | null;
    channel: TebligatChannel;
    muhtarlikDate: Date | null;
    ilanDate: Date | null;
    deliveredAt: Date | null;
  }): LegalServiceDateResult | null {
    const facts = this.buildLegalServiceDateFacts(tebligat);
    if (!facts) {
      return null;
    }
    try {
      return resolveLegalServiceDate(facts);
    } catch (error) {
      if (
        error instanceof IncompatibleCompletionModeError ||
        error instanceof UnsupportedServiceRegimeCodeError
      ) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Tebligat'ın kendi rejim sinyallerini (tk21Type/channel/tarih alanları)
   * `LegalServiceDateRuleCore`'un ortak `LegalServiceDateFacts` girdisine eşler. Gün
   * hesabının kendisi burada YAPILMAZ — yalnız hangi rejimin geçerli olduğu ve hangi
   * ham tarihin `baseDate` olacağı belirlenir; +15/+7/+5/gecikmesiz kararı çekirdekte.
   */
  private buildLegalServiceDateFacts(tebligat: {
    tk21Type: Tk21Type | null;
    channel: TebligatChannel;
    muhtarlikDate: Date | null;
    ilanDate: Date | null;
    deliveredAt: Date | null;
  }): LegalServiceDateFacts | null {
    // TK m.20 — muvakkaten başka yere gitme. `ilanDate ?? muhtarlikDate` burada YALNIZ
    // "en az bir olay tarihi var mı" kontrolüdür (tarih kaynağı eksikse fail-closed) —
    // hangi tarihin dolu olduğu completion mode'u İMA ETMEZ; serviceCompletionMode Tebligat
    // modelinde yok, bu yüzden her zaman null geçilir ve çekirdek kendi fail-closed'ını üretir.
    if (tebligat.tk21Type === Tk21Type.TK_20) {
      const baseDate = tebligat.ilanDate ?? tebligat.muhtarlikDate;
      if (!baseDate) return null;
      return {
        serviceRegimeCode: ServiceOccurrenceRegimeCode.TK_20_TEMPORARY_ABSENCE,
        serviceCompletionMode: null,
        baseDate,
      };
    }

    // TK 21/2 — MERNİS adresi (gecikmesiz — MPB-028(a) düzeltmesi).
    if (tebligat.tk21Type === Tk21Type.TK_21_2) {
      if (!tebligat.ilanDate) return null;
      return {
        serviceRegimeCode: ServiceOccurrenceRegimeCode.TK_21_2,
        baseDate: tebligat.ilanDate,
      };
    }

    // TK 21/1 — bilinen adreste imtina (gecikmesiz).
    if (tebligat.tk21Type === Tk21Type.TK_21_1) {
      if (!tebligat.muhtarlikDate) return null;
      return {
        serviceRegimeCode: ServiceOccurrenceRegimeCode.TK_21_1,
        baseDate: tebligat.muhtarlikDate,
      };
    }

    // İlanen tebliğ (TK m.31) → PUBLICATION.
    if (tebligat.channel === TebligatChannel.ILANEN) {
      if (!tebligat.ilanDate) return null;
      return {
        serviceRegimeCode: ServiceOccurrenceRegimeCode.PUBLICATION,
        baseDate: tebligat.ilanDate,
      };
    }

    // E-tebligat/UETS/KEP (TK m.7/a + Elektronik Tebligat Yönetmeliği m.9/6) → ELECTRONIC.
    if (tebligat.channel === TebligatChannel.UETS || tebligat.channel === TebligatChannel.KEP) {
      if (!tebligat.deliveredAt) return null;
      return {
        serviceRegimeCode: ServiceOccurrenceRegimeCode.ELECTRONIC,
        baseDate: tebligat.deliveredAt,
      };
    }

    // Doğrudan/elden teslim → IMMEDIATE_SERVICE.
    if (tebligat.deliveredAt) {
      return {
        serviceRegimeCode: ServiceOccurrenceRegimeCode.IMMEDIATE_SERVICE,
        baseDate: tebligat.deliveredAt,
      };
    }

    return null;
  }
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
