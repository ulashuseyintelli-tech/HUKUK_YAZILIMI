import { ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { ActingLawyerResolverService } from "../../lawyer/acting-lawyer-resolver.service";
import { UyapSendAuthorityResolverService } from "./uyap-send-authority-resolver.service";
import { UyapSendAuthorityOperation } from "./uyap-send-authority.types";
import { TriggerHacizCapabilityAuthorizationService } from "./trigger-haciz-capability-authorization.service";

export interface TriggerHacizAuthorizationInput {
  readonly tenantId: string;
  /** Authenticated principal — controller'dan (req.user.id), body/DTO'dan DEĞİL. */
  readonly authenticatedUserId: string;
  readonly caseId: string;
}

/**
 * I15-D1: `UyapService.pushHacizRequest()`'e özel, dar orchestration.
 *
 * Owner'ın bağlayıcı authority predicate'ini compose eder — hiçbir bileşen
 * diğerinin yerine geçmez, ikinci bir POA/capability motoru KURULMAZ:
 *
 *   principal → tenant match → acting lawyer resolution (I01) →
 *   actor-specific case assignment → actor'ın kendi POA'sının bu operasyonu
 *   (TRIGGER_HACIZ) kapsaması (owner-ratified HMK m.73/m.74, İİK m.78 mapping) →
 *   explicit actor×TRIGGER_HACIZ PermissionGrant.
 *
 * `UyapSendAuthorityResolverService.resolve()` yalnız "acting lawyer bu case'in
 * client'larından biri için geçerli POA'ya sahip mi" sorusuna cevap verir —
 * `CaseLawyer` roster üyeliğini KONTROL ETMEZ. Bu yüzden case-assignment burada
 * AYRI, bağımsız bir predicate olarak doğrulanır (POA ilişkisinden varsayılmaz).
 *
 * NOT (disclosed scope): `HacizRequest`'in bugünkü şekli belirli bir
 * `caseDebtorId` taşımıyor (yalnız `caseId` + serbest `targetDetails`). Bu
 * yüzden "CaseDebtor lifecycle eligibility" bu servis içinde KONTROL EDİLMEZ —
 * hangi debtor'un hedeflendiği bilinmeden bu kontrol ya yanlış debtor'u
 * kontrol eder ya da icat edilmiş bir "tümü/herhangi biri aktif" kuralına
 * dayanır. Bu, `HacizRequest`'in kendi şeklini genişletmeyi gerektiren, D1'in
 * dar sınırının DIŞINDA ayrı bir kapsam kararıdır.
 */
@Injectable()
export class TriggerHacizAuthorizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actingLawyerResolver: ActingLawyerResolverService,
    private readonly sendAuthorityResolver: UyapSendAuthorityResolverService,
    private readonly capabilityAuthorization: TriggerHacizCapabilityAuthorizationService,
  ) {}

  async assertAuthorized(input: TriggerHacizAuthorizationInput): Promise<void> {
    const tenantId = input.tenantId?.trim();
    const authenticatedUserId = input.authenticatedUserId?.trim();
    const caseId = input.caseId?.trim();
    if (!tenantId || !authenticatedUserId || !caseId) {
      throw new ForbiddenException({ code: "TRIGGER_HACIZ_AUTHORIZATION_CONTEXT_REQUIRED" });
    }

    // 1-2) Authenticated principal + tenant match → canonical acting lawyer (I01, fail-closed).
    const actingLawyer = await this.actingLawyerResolver.resolveOrThrow({
      userId: authenticatedUserId,
      tenantId,
    });

    // 3) Actor-specific case assignment — POA ilişkisinden VARSAYILMAZ, ayrı doğrulanır.
    await this.assertActingLawyerAssignedToCase(tenantId, caseId, actingLawyer.lawyerId);

    // 4) Actor'ın kendi POA'sının TRIGGER_HACIZ'ı kapsaması (owner-ratified scope mapping).
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

    // 5) Açık, aktöre-özel, organizasyon-içi capability (PermissionGrant — DENY öncelikli).
    await this.capabilityAuthorization.assertAuthorized({
      tenantId,
      actorUserId: authenticatedUserId,
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
