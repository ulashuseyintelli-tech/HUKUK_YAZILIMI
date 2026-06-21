import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";

// M2-G2: "Dosya Sorumlusu" picker kaynağı. Gerçek kişi adayları = aktif Lawyer + aktif StaffMember.
// İZOLE servis (case.service.ts'e DOKUNULMAZ — paralel LEGACY-READER WIP'i orada). Salt-okuma.
// exactly-one / yazma M2-G3+; burada yalnız aday listesi (shape) üretilir.

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
}
