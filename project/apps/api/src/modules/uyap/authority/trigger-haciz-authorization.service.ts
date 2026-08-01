import { ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { ActingLawyerResolverService } from "../../lawyer/acting-lawyer-resolver.service";
import { UyapSendAuthorityResolverService } from "./uyap-send-authority-resolver.service";
import { UyapSendAuthorityOperation } from "./uyap-send-authority.types";
import { TriggerHacizCapabilityAuthorizationService } from "./trigger-haciz-capability-authorization.service";
import { CaseDebtorLifecycleGuardService } from "../../case-debtor-lifecycle-guard/case-debtor-lifecycle-guard.service";

export interface TriggerHacizAuthorizationInput {
  readonly tenantId: string;
  /** Authenticated principal — controller'dan (req.user.id), body/DTO'dan DEĞİL. */
  readonly authenticatedUserId: string;
  readonly caseId: string;
  /**
   * I15-D1-R1: hangi TAM CaseDebtor'un hedeflendiği — client-supplied ama burada
   * tenant+case+lifecycle ile CANONICAL olarak doğrulanır (owner-ratified
   * TRIGGER_HACIZ_CASE_DEBTOR_TARGET_UNBOUND düzeltmesi).
   */
  readonly caseDebtorId: string;
}

export interface TriggerHacizAuthorizationResult {
  /** Canonical CaseDebtor kaydından türetilmiş — client-supplied body.debtorId DEĞİL. */
  readonly debtorId: string;
}

/**
 * I15-D1 / I15-D1-R1: `UyapService.pushHacizRequest()`'e özel, dar orchestration.
 *
 * Owner'ın bağlayıcı authority predicate'ini compose eder — hiçbir bileşen
 * diğerinin yerine geçmez, ikinci bir POA/capability/lifecycle motoru KURULMAZ:
 *
 *   authenticated principal → tenant → required caseDebtorId → exact CaseDebtor
 *   tenant+case relation → lifecycle active (CaseDebtorLifecycleGuardService,
 *   8 diğer modülde zaten reuse edilen kanonik guard) → acting lawyer resolution
 *   (I01) → actor-specific case assignment → actor'ın kendi POA'sının bu
 *   operasyonu (TRIGGER_HACIZ) kapsaması (owner-ratified HMK m.73/m.74, İİK m.78
 *   mapping) → explicit actor×TRIGGER_HACIZ PermissionGrant.
 *
 * `UyapSendAuthorityResolverService.resolve()` yalnız "acting lawyer bu case'in
 * client'larından biri için geçerli POA'ya sahip mi" sorusuna cevap verir —
 * `CaseLawyer` roster üyeliğini KONTROL ETMEZ. Bu yüzden case-assignment burada
 * AYRI, bağımsız bir predicate olarak doğrulanır (POA ilişkisinden varsayılmaz).
 *
 * `CaseDebtorLifecycleGuardService.assertActiveByCaseDebtorId` nonexistent/
 * cross-tenant/wrong-case hedefleri AYNI safe-deny (NotFoundException) ile,
 * PASSIVE hedefleri BadRequestException ile reddeder — bu servis KENDİ
 * lifecycle mantığını icat ETMEZ, yalnız 8 başka modülün (Collection/Tebligat/
 * AddressDiscovery/AssetQuery/UyapQuery/InstitutionLetter/ThirdParty/Debtor/
 * Address) kullandığı AYNI kanonik guard'ı reuse eder.
 */
@Injectable()
export class TriggerHacizAuthorizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actingLawyerResolver: ActingLawyerResolverService,
    private readonly sendAuthorityResolver: UyapSendAuthorityResolverService,
    private readonly capabilityAuthorization: TriggerHacizCapabilityAuthorizationService,
    private readonly caseDebtorLifecycleGuard: CaseDebtorLifecycleGuardService,
  ) {}

  async assertAuthorized(
    input: TriggerHacizAuthorizationInput,
  ): Promise<TriggerHacizAuthorizationResult> {
    const tenantId = input.tenantId?.trim();
    const authenticatedUserId = input.authenticatedUserId?.trim();
    const caseId = input.caseId?.trim();
    const caseDebtorId = input.caseDebtorId?.trim();
    if (!tenantId || !authenticatedUserId || !caseId || !caseDebtorId) {
      throw new ForbiddenException({ code: "TRIGGER_HACIZ_AUTHORIZATION_CONTEXT_REQUIRED" });
    }

    // 1) Exact CaseDebtor target-binding — tenant+case+lifecycle canonical doğrulama.
    // Nonexistent/cross-tenant/wrong-case → NotFoundException (safe deny, aynı biçim).
    // PASSIVE → BadRequestException. Client-supplied `caseDebtorId` HİÇBİR ZAMAN
    // doğrudan `debtorId` yerine kullanılmaz — dönen kayıttan türetilir (aşağıda).
    const caseDebtor = await this.caseDebtorLifecycleGuard.assertActiveByCaseDebtorId(
      tenantId,
      caseDebtorId,
      { expectedCaseId: caseId },
    );

    // 2-3) Authenticated principal + tenant match → canonical acting lawyer (I01, fail-closed).
    const actingLawyer = await this.actingLawyerResolver.resolveOrThrow({
      userId: authenticatedUserId,
      tenantId,
    });

    // 4) Actor-specific case assignment — POA ilişkisinden VARSAYILMAZ, ayrı doğrulanır.
    await this.assertActingLawyerAssignedToCase(tenantId, caseId, actingLawyer.lawyerId);

    // 5) Actor'ın kendi POA'sının TRIGGER_HACIZ'ı kapsaması (owner-ratified scope mapping).
    const authorityDecision = await this.sendAuthorityResolver.resolve({
      tenantId,
      authenticatedUserId,
      actingLawyerId: actingLawyer.lawyerId,
      caseId,
      operationType: UyapSendAuthorityOperation.TRIGGER_HACIZ,
      evaluatedAt: new Date(),
    });
    if (!authorityDecision.allowed) {
      throw new ForbiddenException({
        code: authorityDecision.failureCode ?? "TRIGGER_HACIZ_AUTHORITY_DENIED",
        message: "Haciz talebi yapılamaz: yetki doğrulanamadı",
        details: "Bu işlem için geçerli avukat yetkisi çözümlenemedi",
      });
    }

    // 6) Açık, aktöre-özel, organizasyon-içi capability (PermissionGrant — DENY öncelikli).
    await this.capabilityAuthorization.assertAuthorized({
      tenantId,
      actorUserId: authenticatedUserId,
    });

    return { debtorId: caseDebtor.debtorId };
  }

  /**
   * I15-D1-R1: immediately-pre-effect freshness-safe revalidation. `assertAuthorized`'ın
   * yaptığı CaseDebtor kontrolü ile burada (yerel stub dispatch'ten hemen önce) çağrıldığı
   * an arasında borçlu pasifleştirilmiş olabilir (TOCTOU). Aynı kanonik guard BAĞIMSIZ bir
   * ikinci okuma ile tekrar çağrılır — yeni transaction mimarisi icat edilmez.
   */
  async revalidateCaseDebtorFreshness(
    tenantId: string,
    caseId: string,
    caseDebtorId: string,
  ): Promise<void> {
    await this.caseDebtorLifecycleGuard.assertActiveByCaseDebtorId(tenantId, caseDebtorId, {
      expectedCaseId: caseId,
    });
  }

  /** CaseLawyer roster üyeliği — POA-eşleşmesinden bağımsız, ayrı bir kanıt. */
  private async assertActingLawyerAssignedToCase(
    tenantId: string,
    caseId: string,
    actingLawyerId: string,
  ): Promise<void> {
    const caseRow = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
      select: { lawyers: { select: { lawyerId: true } } },
    });
    const assigned = (caseRow?.lawyers ?? []).some((l) => l.lawyerId === actingLawyerId);
    if (!assigned) {
      throw new ForbiddenException({ code: "TRIGGER_HACIZ_CASE_ASSIGNMENT_REQUIRED" });
    }
  }
}
