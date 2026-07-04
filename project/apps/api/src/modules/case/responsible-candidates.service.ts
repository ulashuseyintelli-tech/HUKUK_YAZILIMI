import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

// M2-G2: "Dosya Sorumlusu" picker kaynağı. Gerçek kişi adayları = aktif Lawyer + aktif StaffMember.
// İZOLE servis (case.service.ts'e DOKUNULMAZ — paralel LEGACY-READER WIP'i orada). Salt-okuma.
// M2-G3a: + Dosya Sorumlusu atama (assignResponsiblePerson) eklendi — yine İZOLE, case.service.ts'e dokunmadan.

export type ResponsibleCandidateType = "LAWYER" | "STAFF";

export interface ResponsibleCandidate {
  type: ResponsibleCandidateType;
  id: string;
  displayName: string; // "Av. Ulaş Hüseyin Telli" / "Büşra Atmaca"
  subtitle: string; // "Avukat" / "Sekreter"
}

// M2-G3b: dosyanın mevcut Dosya Sorumlusu. isLegacy=true → eski sorumluPersonel (User) fallback'i.
export interface CurrentResponsiblePerson {
  type: "LAWYER" | "STAFF" | "LEGACY_USER";
  id: string;
  displayName: string;
  subtitle: string;
  isLegacy: boolean;
}

// LawyerRank → Türkçe etiket (subtitle)
const LAWYER_RANK_LABEL: Record<string, string> = {
  PARTNER: "Ortak Avukat",
  MANAGER: "Yönetici Avukat",
  AUTHORIZED: "Yetkili Avukat",
  LAWYER: "Avukat",
  INTERN: "Stajyer Avukat",
};

// StaffType → Türkçe etiket (subtitle)
const STAFF_TYPE_LABEL: Record<string, string> = {
  STAJYER_AVUKAT: "Stajyer Avukat",
  OFIS_KATIBI: "Ofis Katibi",
  ADLI_KATIP: "Adli Katip",
  SEKRETER: "Sekreter",
  MUHASEBE: "Muhasebe",
  ARSIV: "Arşiv Sorumlusu",
  DIGER: "Diğer",
};

const squish = (s: string) => s.replace(/\s+/g, " ").trim();

// Ortak biçimlendirme — hem aday listesi (G2) hem mevcut-sorumlu okuması (G3b) hem
// personel raporu (G5b: report.service) kullanır → tek-kaynak display, drift yok.
export const formatLawyer = (l: {
  id: string;
  name: string;
  surname: string;
  title: string | null;
  lawyerRank: string;
}): ResponsibleCandidate => {
  const prefix =
    (l.title && l.title.trim()) || (l.lawyerRank === "INTERN" ? "Stj. Av." : "Av.");
  return {
    type: "LAWYER",
    id: l.id,
    displayName: squish(`${prefix} ${l.name} ${l.surname}`),
    subtitle: LAWYER_RANK_LABEL[l.lawyerRank] ?? "Avukat",
  };
};

export const formatStaff = (s: {
  id: string;
  firstName: string;
  lastName: string;
  staffType: string;
}): ResponsibleCandidate => ({
  type: "STAFF",
  id: s.id,
  displayName: squish(`${s.firstName} ${s.lastName}`),
  subtitle: STAFF_TYPE_LABEL[s.staffType] ?? "Personel",
});

/**
 * M2-A3a: Dosya Sorumlusu (gerçek kişi) seçimini doğrular + çözer (DB YAZMAZ).
 * assign (allowNone=false → tam bir) ve create (allowNone=true → en fazla bir) ORTAK kullanır.
 * - both-set → 400 · none + !allowNone → 400 · none + allowNone → {null, null} (sahipsiz, meşru)
 * - lawyer: aktif + canBeResponsible + aynı tenant · staff: aktif + aynı tenant · değilse → 400
 * Cross-tenant/pasif aday: tenant-scoped sorgu eşleşmez → otomatik reddedilir.
 */
export async function validateResponsibleSelection(
  prisma: PrismaService,
  tenantId: string,
  dto: { responsibleLawyerId?: string; responsibleStaffId?: string },
  opts: { allowNone: boolean }
): Promise<{ responsibleLawyerId: string | null; responsibleStaffId: string | null }> {
  const lawyerId = dto.responsibleLawyerId?.trim() || undefined;
  const staffId = dto.responsibleStaffId?.trim() || undefined;

  if (lawyerId && staffId) {
    throw new BadRequestException(
      "Yalnız bir Dosya Sorumlusu tipi seçilebilir (avukat VEYA personel)."
    );
  }
  if (!lawyerId && !staffId) {
    if (opts.allowNone) return { responsibleLawyerId: null, responsibleStaffId: null };
    throw new BadRequestException(
      "Bir Dosya Sorumlusu (avukat veya personel) seçilmelidir."
    );
  }

  if (lawyerId) {
    const lawyer = await prisma.lawyer.findFirst({
      where: { id: lawyerId, tenantId, isActive: true, canBeResponsible: true },
      select: { id: true },
    });
    if (!lawyer) {
      throw new BadRequestException(
        "Geçersiz avukat: aktif ve Dosya Sorumlusu olabilecek bir aday değil."
      );
    }
    return { responsibleLawyerId: lawyerId, responsibleStaffId: null };
  }

  // Buraya yalnızca staffId tanımlıyken gelinir (exactly-one guard'ları + lawyer return).
  // Açık daraltma: tip güvenliği + "id: undefined → herhangi kayıt eşleşir" footgun'unu kapatır.
  if (!staffId) {
    throw new BadRequestException(
      "Bir Dosya Sorumlusu (avukat veya personel) seçilmelidir."
    );
  }
  const staff = await prisma.staffMember.findFirst({
    where: { id: staffId, tenantId, isActive: true },
    select: { id: true },
  });
  if (!staff) {
    throw new BadRequestException("Geçersiz personel: aktif bir aday değil.");
  }
  return { responsibleLawyerId: null, responsibleStaffId: staffId };
}

@Injectable()
export class ResponsibleCandidatesService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService
  ) {}

  /**
   * Bir tenant'taki Dosya Sorumlusu adayları: aktif avukatlar (canBeResponsible) + aktif personel.
   * Soft-delete edilenler (isActive=false) otomatik dışarıda kalır.
   */
  async getResponsibleCandidates(tenantId: string): Promise<ResponsibleCandidate[]> {
    const [lawyers, staff] = await Promise.all([
      this.prisma.lawyer.findMany({
        where: { tenantId, isActive: true, canBeResponsible: true },
        select: { id: true, name: true, surname: true, title: true, lawyerRank: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      this.prisma.staffMember.findMany({
        where: { tenantId, isActive: true },
        select: { id: true, firstName: true, lastName: true, staffType: true },
        orderBy: [{ sortOrder: "asc" }, { firstName: "asc" }],
      }),
    ]);

    return [...lawyers.map(formatLawyer), ...staff.map(formatStaff)];
  }

  /**
   * M2-G3b: Dosyanın MEVCUT Dosya Sorumlusu (gerçek kişi). responsibleLawyer/Staff öncelikli;
   * yoksa legacy `sorumluPersonel` (User) fallback (isLegacy=true). Hiçbiri yoksa null.
   * case.service.ts'e DOKUNULMADAN prisma.case'ten doğrudan okunur (yine İZOLE).
   */
  async getCaseResponsiblePerson(
    tenantId: string,
    caseId: string
  ): Promise<CurrentResponsiblePerson | null> {
    const kase = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
      select: {
        responsibleLawyer: {
          select: { id: true, name: true, surname: true, title: true, lawyerRank: true },
        },
        responsibleStaff: {
          select: { id: true, firstName: true, lastName: true, staffType: true },
        },
        sorumluPersonel: { select: { id: true, name: true, surname: true } },
      },
    });
    if (!kase) throw new NotFoundException("Dosya bulunamadı.");
    if (kase.responsibleLawyer) {
      return { ...formatLawyer(kase.responsibleLawyer), isLegacy: false };
    }
    if (kase.responsibleStaff) {
      return { ...formatStaff(kase.responsibleStaff), isLegacy: false };
    }
    if (kase.sorumluPersonel) {
      return {
        type: "LEGACY_USER",
        id: kase.sorumluPersonel.id,
        displayName: squish(
          `${kase.sorumluPersonel.name} ${kase.sorumluPersonel.surname}`
        ),
        subtitle: "Eski sorumlu (kullanıcı hesabı)",
        isLegacy: true,
      };
    }
    return null;
  }

  /**
   * M2-G3a: Dosya Sorumlusu (gerçek kişi) atar. responsibleLawyerId XOR responsibleStaffId.
   * Kurallar: exactly-one (her ikisi/hiçbiri → 400); aday aktif + aynı tenant olmalı; diğer alan null'lanır.
   * `sorumluPersonelId`'e DOKUNULMAZ (geçiş alanı). DB CHECK backstop.
   *
   * WP-1a (Responsibility Audit Hardening): gerçek-kişi Dosya Operasyon Sorumlusu (K2) değişimi
   * `AuditLog`'a yazılır (old→new + actor `userId` + tenant). AuditLog TEK otorite — ayrı
   * OwnerChangeHistory tablosu YOK. `userId` actor ZORUNLU (kim değiştirdi).
   */
  async assignResponsiblePerson(
    tenantId: string,
    caseId: string,
    dto: { responsibleLawyerId?: string; responsibleStaffId?: string },
    userId: string
  ): Promise<{ responsibleLawyerId: string | null; responsibleStaffId: string | null }> {
    // M2-A3a: ortak validator (exactly-one) — geçersiz seçimde DB'ye dokunulmadan 400.
    const resolved = await validateResponsibleSelection(this.prisma, tenantId, dto, {
      allowNone: false,
    });

    // dosya bu tenant'a ait olmalı (cross-tenant dosya → 404). WP-1a: eski owner'ı da oku (audit old→new).
    const kase = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
      select: { id: true, responsibleLawyerId: true, responsibleStaffId: true },
    });
    if (!kase) throw new NotFoundException("Dosya bulunamadı.");

    await this.prisma.case.update({
      where: { id: caseId },
      data: {
        responsibleLawyerId: resolved.responsibleLawyerId,
        responsibleStaffId: resolved.responsibleStaffId,
      },
    });

    // WP-1a: K2 owner-change audit (old→new + actor + tenant). best-effort (AuditService.log try/catch'li).
    await this.auditService.log({
      tenantId,
      action: "UPDATE",
      entityType: "CASE",
      entityId: caseId,
      userId,
      oldValues: {
        responsibleLawyerId: kase.responsibleLawyerId,
        responsibleStaffId: kase.responsibleStaffId,
      },
      newValues: {
        responsibleLawyerId: resolved.responsibleLawyerId,
        responsibleStaffId: resolved.responsibleStaffId,
      },
      metadata: { changeType: "OPERATION_OWNER", source: "PATCH /cases/:id/responsible-person" },
    });

    return resolved;
  }
}
