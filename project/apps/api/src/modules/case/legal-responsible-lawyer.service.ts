import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { PermissionHardGuardService } from "../permission-diagnostics/permission-hard-guard.service";

// WP-1d-5-4 — Hukuki Sorumlu Avukat (CaseLawyer.isResponsible) KONTROLLÜ DEĞİŞİKLİĞİ (backend, ilk impl).
// Sözleşmeler: #470 contract · #471 matrix · #472 product/legal decisions · #473 endpoint/audit contract.
// Kanonik ilke: "Hukuki sorumlu avukat DEVREDİLMEZ; hukuki sorumlu avukat kaydı KURALLI şekilde DEĞİŞTİRİLİR."
//
// İZOLE servis: operation owner (Case.responsibleLawyer/StaffId), sorumluPersonelId, CaseStaff.roleOnCase,
// Task alanlarına DOKUNMAZ. Yapısal olarak yalnız Lawyer (CaseLawyer bir Lawyer'a bağlanır; staff hedef olamaz).
//
// State: eski responsible → {isResponsible:false, role:'ASSIGNED'} · yeni → {isResponsible:true, role:'RESPONSIBLE'}
// (isResponsible ⇔ role==='RESPONSIBLE' coupling korunur). clear-before-set sırası: partial unique index
// `case_lawyer_one_responsible_per_case (caseId) WHERE isResponsible=true` mid-tx >1 true'yu engeller (#229).
//
// Audit: AuditLog TEK otorite. Tek CASE_LAWYER event'i (promote) `metadata.changeType=LEGAL_RESPONSIBLE_LAWYER_CHANGED`
// + caseId taşır → responsibility-history mevcut legalResponsibleEvents tanıyıcısı bunu EVENT_CONFIRMED okur
// (reconstruction refactor YOK). Not: LEGAL_RESPONSIBLE_MISSING ayrı bir READ-side warn/report sinyalidir (karışmaz).
// State-transition + audit AYNI $transaction içinde (atomik).

export interface ChangeLegalResponsibleResult {
  caseId: string;
  previousLawyerId: string;
  newLawyerId: string;
  changedAt: string;
  auditLogId: string;
}

@Injectable()
export class LegalResponsibleLawyerService {
  constructor(
    private prisma: PrismaService,
    private hardGuard: PermissionHardGuardService,
  ) {}

  async changeLegalResponsibleLawyer(
    tenantId: string,
    caseId: string,
    dto: { lawyerId?: string; reason?: string; note?: string },
    userId: string,
    role: string,
  ): Promise<ChangeLegalResponsibleResult> {
    // 1) ADMIN-only hard guard (non-ADMIN → 403 + best-effort PERMISSION_DENIED audit). Tenant scoping AYRI sınır.
    await this.hardGuard.assertBridgeAdmin("cases.legalResponsibleLawyer", {
      tenantId,
      actorUserId: userId,
      role,
      entityId: caseId,
      requestPath: `PATCH /cases/${caseId}/legal-responsible-lawyer`,
    });

    // 2) Payload (reason ZORUNLU; trim sonrası boş olamaz).
    const lawyerId = dto.lawyerId?.trim();
    const reason = dto.reason?.trim();
    if (!lawyerId) {
      throw new BadRequestException("Hedef avukat (lawyerId) zorunludur. [INVALID_LEGAL_RESPONSIBLE_PAYLOAD]");
    }
    if (!reason) {
      throw new BadRequestException("Değişiklik gerekçesi (reason) zorunludur. [LEGAL_RESPONSIBLE_REASON_REQUIRED]");
    }
    const note = dto.note?.trim() || undefined;

    // 3) Dosya bu tenant'ta mı (cross-tenant → 404).
    const kase = await this.prisma.case.findFirst({ where: { id: caseId, tenantId }, select: { id: true } });
    if (!kase) throw new NotFoundException("Dosya bulunamadı. [CASE_NOT_FOUND]");

    // 4) Hedef avukat bu dosyaya bağlı bir CaseLawyer olmalı (ilk sürümde otomatik ekleme YOK; staff yapısal olarak
    //    CaseLawyer olamaz → staff hedef otomatik elenir).
    const target = await this.prisma.caseLawyer.findFirst({
      where: { caseId, lawyerId },
      select: { id: true, lawyerId: true, isResponsible: true },
    });
    if (!target) {
      throw new NotFoundException("Hedef avukat bu dosyaya bağlı değil. [TARGET_CASE_LAWYER_NOT_FOUND]");
    }

    // 5) Mevcut hukuki sorumlu(lar): tam-1 invariant. 0 veya (DB index'iyle imkânsız olsa da) >1 → 409; uç ONARMAZ.
    const responsibles = await this.prisma.caseLawyer.findMany({
      where: { caseId, isResponsible: true },
      select: { id: true, lawyerId: true },
    });
    if (responsibles.length !== 1) {
      throw new ConflictException(
        "Dosyanın hukuki sorumlu avukat kaydı tam-1 değil; bu işlem onarım yapmaz. [LEGAL_RESPONSIBLE_INVARIANT_VIOLATION]",
      );
    }
    const current = responsibles[0];

    // 6) Hedef zaten current responsible ise no-op değil → 409 (state değişmez, audit yazılmaz).
    if (current.id === target.id || current.lawyerId === lawyerId) {
      throw new ConflictException(
        "Hedef avukat zaten hukuki sorumlu. [LEGAL_RESPONSIBLE_LAWYER_ALREADY_CURRENT]",
      );
    }

    const previousLawyerId = current.lawyerId;

    // 7) Atomik: clear-before-set (önce demote → sonra promote) + tek audit (aynı tx). Kısmi başarı olmaz.
    const audit = await this.prisma.$transaction(async (tx: any) => {
      await tx.caseLawyer.update({
        where: { id: current.id },
        data: { isResponsible: false, role: "ASSIGNED" },
      });
      await tx.caseLawyer.update({
        where: { id: target.id },
        data: { isResponsible: true, role: "RESPONSIBLE" },
      });
      return tx.auditLog.create({
        data: {
          tenantId,
          action: "UPDATE",
          entityType: "CASE_LAWYER",
          entityId: target.id,
          userId,
          oldValues: { isResponsible: false, lawyerId },
          newValues: { isResponsible: true, role: "RESPONSIBLE", lawyerId },
          metadata: {
            caseId,
            changeType: "LEGAL_RESPONSIBLE_LAWYER_CHANGED",
            previousLawyerId,
            newLawyerId: lawyerId,
            reason,
            ...(note ? { note } : {}),
            source: "LEGAL_RESPONSIBLE_LAWYER_CHANGE_ENDPOINT",
          },
        },
        select: { id: true, createdAt: true },
      });
    });

    return {
      caseId,
      previousLawyerId,
      newLawyerId: lawyerId,
      changedAt: audit.createdAt.toISOString(),
      auditLogId: audit.id,
    };
  }
}
