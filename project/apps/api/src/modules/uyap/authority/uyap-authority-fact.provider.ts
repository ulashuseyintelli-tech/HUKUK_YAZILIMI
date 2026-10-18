import { Injectable, Logger } from "@nestjs/common";
import { ComputedFactProvider } from "@/modules/policy-engine/fact-store/computed-fact-provider.interface";
import { ActionContext } from "@/modules/policy-engine/types";
import { FactMap, FactValue } from "@/modules/policy-engine/fact-store/fact-store.types";
import { ActingLawyerResolverService } from "@/modules/lawyer/acting-lawyer-resolver.service";
import { UyapSendAuthorityResolverService } from "./uyap-send-authority-resolver.service";

/** Bu provider'ın ürettiği canonical fact anahtarları. */
export const UYAP_AUTHORITY_FACT_KEYS = {
  /** Gate'in okuduğu bileşik alias (LEGACY AD, COMPUTED DEĞER). */
  hasPoa: "case.has_power_of_attorney",
  actorIsCanonicalLawyer: "actor.is_canonical_lawyer",
  actorHasMatchingPoa: "actor.has_matching_power_of_attorney",
  poaEffective: "poa.is_effective_at_evaluation_time",
  poaCoversOperation: "poa.covers_requested_operation",
  authorityUnambiguous: "authority.is_unambiguous",
  /**
   * P5 (owner Ek 94 a2 / Ek 95 K3): aktörün dosyada GEÇERLİ avukat ataması var mı (CaseLawyer; aynı kiracı; avukat kaydı
   * etkin; rol RESPONSIBLE / ASSIGNED; stajyer kaydı değil). Kapı: `ACTING_LAWYER_NOT_ASSIGNED_TO_CASE` (gates.compiled.ts;
   * owner Ek 95 K1 ile onaylanan gönderim ailesine daraltılmış). Vekalet olgularından AYRIDIR.
   */
  actorAssignedToCase: "actor.is_assigned_to_case",
  /** Ret nedeni — yalnız decision-log/evidence içindir, gate koşulu DEĞİLDİR. */
  failureCode: "authority.failure_code",
} as const;

/**
 * UYAP-CPE-AUTHORITY-FACT-BRIDGE-I01 — gerçek yetki zincirini CPE fact'lerine bağlar.
 *
 * ```
 * JWT → ActingLawyerResolver → UyapSendAuthorityResolver → BU PROVIDER → CPE gate
 * ```
 *
 * **`case.has_power_of_attorney` artık manuel/persisted flag DEĞİLDİR:** değeri her
 * değerlendirmede canonical resolver'dan hesaplanır. Legacy `icrabotCaseFlag` satırı
 * bulunsa bile bu provider onu EZER (computeAll, base fact'lerin üzerine yazar) →
 * "legacy true + geçersiz POA" allow üretemez, "legacy false + geçerli POA" deny üretemez.
 *
 * **FAIL-CLOSED:** aktör/tenant bağlamı eksikse, resolver hata verirse veya yetki
 * reddedilirse tüm fact'ler `false` olur. Provider **asla throw etmez** — registry
 * `computeAll` hataları yutar; sessiz "fact yok" durumu yerine açık `false` yazılır.
 *
 * Tek DB turu: bileşik fact hesaplanırken granular fact'ler de AYNI çağrıda
 * `facts` map'ine yazılır (registry `compute()`'a canlı map'i geçirir).
 *
 * **P5 (owner Ek 94, karar a2) — dosya ataması EK koşulu:** vekalet zinciri geçerse, aynı çağrıda
 * `ActingLawyerResolverService.isAssignedToCase` ile `actor.is_assigned_to_case` hesaplanır. Vekalet
 * olguları ve alias (`case.has_power_of_attorney`) vekaletin kendisini anlatmaya devam eder; atama
 * yoksa yalnız atama olgusu `false` olur; `authority.failure_code` vekalet zincirini anlatmaya devam eder (null).
 * Vekalet reddedildiyse atama sorgulanmaz ve olgu `false` yazılır (fail-closed; ret nedeni vekaletinkidir).
 */
@Injectable()
export class UyapAuthorityFactProvider implements ComputedFactProvider {
  private readonly logger = new Logger(UyapAuthorityFactProvider.name);

  readonly factKey = UYAP_AUTHORITY_FACT_KEYS.hasPoa;
  readonly dependsOn: string[] = [];

  constructor(
    private readonly actingLawyerResolver: ActingLawyerResolverService,
    private readonly authorityResolver: UyapSendAuthorityResolverService,
  ) {}

  async compute(caseId: string, context?: ActionContext, facts?: FactMap): Promise<FactValue> {
    const write = (key: string, value: FactValue) => facts?.set(key, value);
    const denyAll = (failureCode: string): FactValue => {
      write(UYAP_AUTHORITY_FACT_KEYS.actorIsCanonicalLawyer, false);
      write(UYAP_AUTHORITY_FACT_KEYS.actorHasMatchingPoa, false);
      write(UYAP_AUTHORITY_FACT_KEYS.poaEffective, false);
      write(UYAP_AUTHORITY_FACT_KEYS.poaCoversOperation, false);
      write(UYAP_AUTHORITY_FACT_KEYS.authorityUnambiguous, false);
      write(UYAP_AUTHORITY_FACT_KEYS.actorAssignedToCase, false);
      write(UYAP_AUTHORITY_FACT_KEYS.failureCode, failureCode);
      return false;
    };

    try {
      const tenantId = context?.tenantId;
      const userId = context?.authenticatedUserId;
      if (!caseId || !tenantId || !userId) {
        // Aktör/tenant bağlamı olmadan hukuki yetki üretilemez.
        return denyAll("AUTHORITY_CONTEXT_INVALID");
      }

      // 1) Canonical acting lawyer — client-controlled `lawyerId` ASLA kullanılmaz.
      //    context.actingLawyerId verilmişse bile server-side yeniden çözülür ve
      //    uyuşmazlık fail-closed'dır (spoofing etkisiz).
      const resolution = await this.actingLawyerResolver.tryResolve({ userId, tenantId });
      if (!resolution.resolved) {
        return denyAll(resolution.failureCode);
      }
      const actingLawyerId = resolution.actingLawyer.lawyerId;
      if (context?.actingLawyerId && context.actingLawyerId !== actingLawyerId) {
        return denyAll("ACTING_LAWYER_NOT_RESOLVED");
      }
      write(UYAP_AUTHORITY_FACT_KEYS.actorIsCanonicalLawyer, true);

      // 2) UYAP_SEND yetki zinciri (POA eşleşmesi + lifecycle + scope + tenant).
      const decision = await this.authorityResolver.resolve({
        tenantId,
        authenticatedUserId: userId,
        actingLawyerId,
        caseId,
        operationType: "UYAP_SEND",
        evaluatedAt: context?.evaluatedAt instanceof Date ? context.evaluatedAt : new Date(),
      });

      if (!decision.allowed) {
        const code = decision.failureCode ?? "POWER_OF_ATTORNEY_MISSING";
        denyAll(code);
        // actor doğrulandı; yalnız POA/temsil tarafı reddedildi.
        write(UYAP_AUTHORITY_FACT_KEYS.actorIsCanonicalLawyer, true);
        return false;
      }

      write(UYAP_AUTHORITY_FACT_KEYS.actorHasMatchingPoa, true);
      write(UYAP_AUTHORITY_FACT_KEYS.poaEffective, true);
      write(UYAP_AUTHORITY_FACT_KEYS.poaCoversOperation, true);
      write(UYAP_AUTHORITY_FACT_KEYS.authorityUnambiguous, true);

      // 3) P5 (owner Ek 94): dosya ataması EK koşulu — atama tek başına yetki vermez, burada
      //    yalnız GEÇERLİ vekaletin ÜSTÜNE aranır. Sorgu hatası catch'e düşer (fail-closed).
      //    Ek 95 K1: `authority.failure_code` YALNIZ vekalet zincirini anlatır (main ile aynı) — atama kapısı her eylemde
      //    tetiklenmediği için (hazırlık / ödeme emri) atama yokluğu buraya ret nedeni olarak yazılmaz; kanıtı kendi olgusudur.
      const assigned = await this.actingLawyerResolver.isAssignedToCase({ actingLawyerId, caseId, tenantId });
      write(UYAP_AUTHORITY_FACT_KEYS.actorAssignedToCase, assigned === true);
      write(UYAP_AUTHORITY_FACT_KEYS.failureCode, null);
      return true;
    } catch (error: any) {
      // Provider hatası authority üretemez (fail-closed). Ham hata/PII loglanmaz.
      this.logger.error(`UYAP authority fact hesaplanamadi: ${error?.name ?? "error"}`);
      return denyAll("AUTHORITY_CONTEXT_INVALID");
    }
  }
}
