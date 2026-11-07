import { Prisma } from "@prisma/client";

/**
 * F02 P3-D1 (owner kararı 07.11.2026; OFP-09 ikinci dilimi / E-2): dosya LİSTE + DETAY görünüm kapsamı
 * (GET /cases data + meta.total + sayfalama birlikte daralır; GET /cases/:id kapsam dışında 404).
 *
 * Etkinleştirme bayrağı — depodaki env-bayrak konvansiyonu; varsayılan KAPALI: liste ve detay bugünkü gibi büro genelidir.
 * Canlıda açılması ayrı yayın kararıdır (önce büro geneli erişimi gerekenlere `office.cases.view_all` izni kişi kartından
 * tanımlanır; ADMIN/PARTNER'a otomatik grant YOK). Görev ve masraf bayraklarından AYRI bayrak → kademeli etkinleştirme.
 */
export const CASE_VIEW_SCOPE_FLAG = "OFFICE_CASE_VIEW_SCOPE_ENABLED";

/** Büro geneli dosya görünümü — görev / masraf anahtarlarından AYRI (owner: "ayrı office.cases.view_all"). */
export const CASE_VIEW_ALL_KEY = "office.cases.view_all" as const;

export type CaseViewResolution = "ALLOW" | "DENY" | "NONE";

export function isCaseViewScopeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[CASE_VIEW_SCOPE_FLAG]?.toLowerCase() === "true";
}

/**
 * Varsayılan kapsam (view_all ALLOW yokken; DENY de buraya düşer — DENY yalnız büro geneli genişlemeyi engeller):
 *  - aktör dosyanın AKTİF Dosya Sorumlusu (Case.responsibleLawyer / responsibleStaff; ilişki satırı aranmaz — owner kararı);
 *  - aktör dosyayı OLUŞTURAN (Case.createdBy; NULL createdById hiçbir aktörle eşleşmez);
 *  - aktör dosyada CaseLawyer ya da CaseStaff(canView) (K16 "dosya bağı"; görev kapsamıyla aynı dal).
 * Kimlik eşlemesi mevcut ortak kuraldır: aktif kart + kartın hesabı aktör + hesap aktif + aynı büro (task-view-scope).
 * Rol (ADMIN/PARTNER), rütbe, ReportingLine ve müvekkil ilişkisi kapsam ÜRETMEZ. Kapsam yalnız DARALTIR; büro sınırı
 * çağıranın `where.tenantId`'sinde ayrıca korunur.
 */
export function caseViewScopeWhere(tenantId: string, actorUserId: string): Prisma.CaseWhereInput {
  const activeAccount = { id: actorUserId, tenantId, isActive: true };
  return {
    OR: [
      { responsibleLawyer: { tenantId, isActive: true, user: activeAccount } },
      { responsibleStaff: { tenantId, isActive: true, user: activeAccount } },
      { createdBy: activeAccount },
      { lawyers: { some: { lawyer: { tenantId, isActive: true, user: activeAccount } } } },
      { staff: { some: { canView: true, staffMember: { tenantId, isActive: true, user: activeAccount } } } },
    ],
  };
}

/** ALLOW (DENY yoksa) → büro geneli (kapsam YOK → null). DENY ya da NONE → varsayılan kapsam. */
export function caseViewWhereFor(resolution: CaseViewResolution, tenantId: string, actorUserId: string): Prisma.CaseWhereInput | null {
  return resolution === "ALLOW" ? null : caseViewScopeWhere(tenantId, actorUserId);
}
