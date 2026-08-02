import { ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { ActingLawyerResolverService } from "../lawyer/acting-lawyer-resolver.service";

export type ResolvedExternalCaseActor =
  | { readonly actorKind: "LAWYER"; readonly lawyerId: string }
  | { readonly actorKind: "STAFF"; readonly staffMemberId: string };

export type ResolvedExternalCaseLawyerActor = {
  readonly actorKind: "LAWYER";
  readonly lawyerId: string;
};

/**
 * DEBTOR-EXTERNAL-CASE-STATUS-INTEGRITY-P1-I15-D2-I02 (OWNER D2 POLICY DECISION —
 * RATIFIED, Bölüm 3 — Writer Authority).
 *
 * ExternalCase.attachmentStatus manuel geçişleri için tek yetki kapısı. İkinci bir
 * authority motoru İCAT EDİLMEZ — I01'in `ActingLawyerResolverService` (Lawyer.userId
 * @unique + tenant + isActive fail-closed çözümleme) ve I15-D1-R1'in
 * `TriggerHacizAuthorizationService.assertActingLawyerAssignedToCase`'in AYNI
 * "case.findFirst + roster .some()" deseni burada CaseStaff için de tekrarlanır
 * (ayrı bir capability/permission-grant sistemi kurulmaz).
 *
 * Owner-ratified kural (Bölüm 3):
 * - MANUEL FACT/PROCESS geçişleri (HACIZ_TALEP->CEVAP_BEKLENIYOR,
 *   HACIZ_TALEP->HACIZ_KONDU, CEVAP_BEKLENIYOR->HACIZ_KONDU): tam CaseLawyer
 *   ataması OLAN avukat VEYA tam CaseStaff ataması + canEdit=true OLAN personel.
 *   Salt tenant membership YETERLİ DEĞİLDİR.
 * - MANUEL KAPANDI: yalnız tam CaseLawyer ataması olan avukat. Staff, canEdit=true
 *   olsa bile bu işlemi YAPAMAZ (dosyayı manuel kapatma yalnız avukata bırakılır).
 * - Actor kimliği HER ZAMAN authenticated principal'dan (controller `req.user`)
 *   gelir — body/DTO'dan asla.
 */
@Injectable()
export class ExternalCaseStatusAuthorityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actingLawyerResolver: ActingLawyerResolverService,
  ) {}

  /** Manuel FACT/PROCESS geçişi: CaseLawyer ataması VEYA CaseStaff+canEdit ataması. */
  async assertFactOrProcessTransitionAuthority(
    tenantId: string,
    caseId: string,
    authenticatedUserId: string,
  ): Promise<ResolvedExternalCaseActor> {
    const lawyerActor = await this.tryResolveAssignedLawyer(tenantId, caseId, authenticatedUserId);
    if (lawyerActor) return lawyerActor;

    const staffActor = await this.tryResolveEditableAssignedStaff(
      tenantId,
      caseId,
      authenticatedUserId,
    );
    if (staffActor) return staffActor;

    throw new ForbiddenException({
      code: "EXTERNAL_CASE_TRANSITION_ASSIGNMENT_REQUIRED",
      message: "Bu işlem yapılamaz: yetki doğrulanamadı",
      details: "Bu dosya için CaseLawyer ataması veya düzenleme yetkili CaseStaff ataması bulunamadı",
    });
  }

  /** Manuel KAPANDI: yalnız CaseLawyer ataması — staff canEdit=true olsa bile REDDEDİLİR. */
  async assertManualClosureAuthority(
    tenantId: string,
    caseId: string,
    authenticatedUserId: string,
  ): Promise<ResolvedExternalCaseLawyerActor> {
    const lawyerActor = await this.tryResolveAssignedLawyer(tenantId, caseId, authenticatedUserId);
    if (lawyerActor) return lawyerActor;

    throw new ForbiddenException({
      code: "EXTERNAL_CASE_CLOSURE_LAWYER_ASSIGNMENT_REQUIRED",
      message: "Dosya manuel kapatılamaz: yetki doğrulanamadı",
      details: "Manuel kapatma yalnız bu dosyaya atanmış avukat tarafından yapılabilir",
    });
  }

  /**
   * DEBTOR-EXTERNAL-CASE-STATUS-INTEGRITY-P1-I15-D2-I03: salt-okuma capability
   * projeksiyonu için — `assertFactOrProcessTransitionAuthority`'nin THROW ETMEYEN
   * eşdeğeri. Frontend'in "bu aktör için hangi manuel geçişler mevcut" sorusunu
   * kendi başına tahmin etmesi yerine `ThirdPartyService.getExternalCases()`
   * bu metodu (liste başına TEK kez) çağırır. AYNI private çözümleme mantığını
   * reuse eder — ikinci bir yetki motoru YOKTUR.
   */
  async canAttemptFactOrProcessTransition(
    tenantId: string,
    caseId: string,
    authenticatedUserId: string,
  ): Promise<boolean> {
    const lawyerActor = await this.tryResolveAssignedLawyer(tenantId, caseId, authenticatedUserId);
    if (lawyerActor) return true;
    const staffActor = await this.tryResolveEditableAssignedStaff(tenantId, caseId, authenticatedUserId);
    return staffActor !== null;
  }

  /** `assertManualClosureAuthority`'nin THROW ETMEYEN eşdeğeri — bkz. yukarıdaki yorum. */
  async canAttemptManualClosure(
    tenantId: string,
    caseId: string,
    authenticatedUserId: string,
  ): Promise<boolean> {
    const lawyerActor = await this.tryResolveAssignedLawyer(tenantId, caseId, authenticatedUserId);
    return lawyerActor !== null;
  }

  private async tryResolveAssignedLawyer(
    tenantId: string,
    caseId: string,
    authenticatedUserId: string,
  ): Promise<ResolvedExternalCaseLawyerActor | null> {
    const resolution = await this.actingLawyerResolver.tryResolve({
      userId: authenticatedUserId,
      tenantId,
    });
    if (!resolution.resolved) return null;

    const caseRow = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
      select: { lawyers: { select: { lawyerId: true } } },
    });
    const assigned = (caseRow?.lawyers ?? []).some(
      (l) => l.lawyerId === resolution.actingLawyer.lawyerId,
    );
    return assigned ? { actorKind: "LAWYER", lawyerId: resolution.actingLawyer.lawyerId } : null;
  }

  /**
   * `ActingLawyerResolverService.tryResolve`'un CaseStaff eşdeğeri — StaffMember.userId
   * @unique + tenant eşleşmesi + isActive fail-closed. Ayrı bir public modül YAPILMADI
   * (yalnız bu servisin ihtiyacı; başka hiçbir tüketici yok — YAGNI).
   */
  private async tryResolveEditableAssignedStaff(
    tenantId: string,
    caseId: string,
    authenticatedUserId: string,
  ): Promise<{ actorKind: "STAFF"; staffMemberId: string } | null> {
    if (!authenticatedUserId?.trim()) return null;

    // userId ile sorgula (StaffMember.userId @unique); tenant eşitliği AYRICA
    // kendi kolonundan doğrulanır (cross-tenant bağ sessizce yutulmaz).
    const matches = await this.prisma.staffMember.findMany({
      where: { userId: authenticatedUserId },
      select: { id: true, tenantId: true, isActive: true },
      take: 2,
    });
    if (matches.length !== 1) return null; // yok veya @unique ihlali/ambiguity → fail-closed

    const candidate = matches[0];
    if (candidate.tenantId !== tenantId) return null;
    if (candidate.isActive !== true) return null;

    const caseRow = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
      select: { staff: { select: { staffMemberId: true, canEdit: true } } },
    });
    const assigned = (caseRow?.staff ?? []).some(
      (s) => s.staffMemberId === candidate.id && s.canEdit === true,
    );
    return assigned ? { actorKind: "STAFF", staffMemberId: candidate.id } : null;
  }
}
