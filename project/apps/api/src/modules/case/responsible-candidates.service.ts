import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";

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

@Injectable()
export class ResponsibleCandidatesService {
  constructor(private prisma: PrismaService) {}

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

    const lawyerCandidates: ResponsibleCandidate[] = lawyers.map((l) => {
      const prefix = (l.title && l.title.trim()) || (l.lawyerRank === "INTERN" ? "Stj. Av." : "Av.");
      return {
        type: "LAWYER",
        id: l.id,
        displayName: squish(`${prefix} ${l.name} ${l.surname}`),
        subtitle: LAWYER_RANK_LABEL[l.lawyerRank] ?? "Avukat",
      };
    });

    const staffCandidates: ResponsibleCandidate[] = staff.map((s) => ({
      type: "STAFF",
      id: s.id,
      displayName: squish(`${s.firstName} ${s.lastName}`),
      subtitle: STAFF_TYPE_LABEL[s.staffType] ?? "Personel",
    }));

    return [...lawyerCandidates, ...staffCandidates];
  }

  /**
   * M2-G3a: Dosya Sorumlusu (gerçek kişi) atar. responsibleLawyerId XOR responsibleStaffId.
   * Kurallar: exactly-one (her ikisi/hiçbiri → 400); aday aktif + aynı tenant olmalı; diğer alan null'lanır.
   * `sorumluPersonelId`'e DOKUNULMAZ (geçiş alanı). DB CHECK backstop.
   */
  async assignResponsiblePerson(
    tenantId: string,
    caseId: string,
    dto: { responsibleLawyerId?: string; responsibleStaffId?: string }
  ): Promise<{ responsibleLawyerId: string | null; responsibleStaffId: string | null }> {
    const lawyerId = dto.responsibleLawyerId?.trim() || undefined;
    const staffId = dto.responsibleStaffId?.trim() || undefined;

    // exactly-one (girdi)
    if (lawyerId && staffId) {
      throw new BadRequestException(
        "Yalnız bir Dosya Sorumlusu tipi seçilebilir (avukat VEYA personel)."
      );
    }
    if (!lawyerId && !staffId) {
      throw new BadRequestException(
        "Bir Dosya Sorumlusu (avukat veya personel) seçilmelidir."
      );
    }

    // dosya bu tenant'a ait olmalı (cross-tenant dosya → 404)
    const kase = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
      select: { id: true },
    });
    if (!kase) throw new NotFoundException("Dosya bulunamadı.");

    if (lawyerId) {
      // aktif + canBeResponsible + aynı tenant (cross-tenant/pasif → aday değil)
      const lawyer = await this.prisma.lawyer.findFirst({
        where: { id: lawyerId, tenantId, isActive: true, canBeResponsible: true },
        select: { id: true },
      });
      if (!lawyer) {
        throw new BadRequestException(
          "Geçersiz avukat: aktif ve Dosya Sorumlusu olabilecek bir aday değil."
        );
      }
      await this.prisma.case.update({
        where: { id: caseId },
        data: { responsibleLawyerId: lawyerId, responsibleStaffId: null },
      });
      return { responsibleLawyerId: lawyerId, responsibleStaffId: null };
    }

    // Buraya yalnızca staffId tanımlıyken gelinir (exactly-one guard'ları + lawyer return).
    // Açık daraltma: tip güvenliği + "id: undefined → herhangi kayıt eşleşir" footgun'unu kapatır.
    if (!staffId) {
      throw new BadRequestException(
        "Bir Dosya Sorumlusu (avukat veya personel) seçilmelidir."
      );
    }

    // staff: aktif + aynı tenant
    const staff = await this.prisma.staffMember.findFirst({
      where: { id: staffId, tenantId, isActive: true },
      select: { id: true },
    });
    if (!staff) {
      throw new BadRequestException(
        "Geçersiz personel: aktif bir aday değil."
      );
    }
    await this.prisma.case.update({
      where: { id: caseId },
      data: { responsibleStaffId: staffId, responsibleLawyerId: null },
    });
    return { responsibleLawyerId: null, responsibleStaffId: staffId };
  }
}
