import { Prisma } from "@prisma/client";

/**
 * F02-B dilim 3 (owner kararı 29–30.10.2026, geçiş G3 "önce masraf, ardından görev"): görev LİSTE görünüm kapsamı
 * (GET /tasks data + total + meta.summary birlikte daralır).
 *
 * Etkinleştirme bayrağı — depodaki env-bayrak konvansiyonu; varsayılan KAPALI: liste bugünkü gibi büro genelidir.
 * Owner: "kapsam etkinleştirmesi ayrı yayın yetkisine bağlıdır" — canlıda açılması ayrı yayın kararıdır (önce büro
 * geneli erişimi gerekenlere `office.tasks.view_all` izni kişi kartından tanımlanır; ADMIN/PARTNER'a otomatik grant YOK).
 * Masraf kapsamından (OFFICE_EXPENSE_VIEW_SCOPE_ENABLED) AYRI bayrak → kademeli etkinleştirme.
 */
export const TASK_VIEW_SCOPE_FLAG = "OFFICE_TASK_VIEW_SCOPE_ENABLED";

/** F02-B-1 (#3047) anahtarı — WorkScopePermissionService.resolve() ile çözülür (DENY > ALLOW > NONE). */
export const TASK_VIEW_ALL_KEY = "office.tasks.view_all" as const;

export type TaskViewResolution = "ALLOW" | "DENY" | "NONE";

export function isTaskViewScopeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[TASK_VIEW_SCOPE_FLAG]?.toLowerCase() === "true";
}

/**
 * Varsayılan kapsam (view_all ALLOW yokken): aktöre ATANAN ∪ aktörün OLUŞTURDUĞU görevler ∪ aktörün CaseLawyer ya da
 * CaseStaff(canView) olduğu dosyaların görevleri (K16 "dosya bağı" türetimi: aktif kart + aktif hesap, aynı büro).
 * Dosyasız görev (caseId null) yalnız atanan / oluşturan üzerinden görünür (owner kararı). Rol (ADMIN/PARTNER), rütbe,
 * ReportingLine ve müvekkil ilişkisi kapsam ÜRETMEZ. Kapsam yalnız DARALTIR; büro sınırı çağıranın scopeWhere'inde
 * ayrıca korunur.
 */
export function taskViewScopeWhere(tenantId: string, actorUserId: string): Prisma.TaskWhereInput {
  const activeAccount = { id: actorUserId, tenantId, isActive: true };
  return {
    OR: [
      { assigneeId: actorUserId },
      { createdById: actorUserId },
      {
        case: {
          tenantId,
          OR: [
            { lawyers: { some: { lawyer: { tenantId, isActive: true, user: activeAccount } } } },
            { staff: { some: { canView: true, staffMember: { tenantId, isActive: true, user: activeAccount } } } },
          ],
        },
      },
    ],
  };
}

/** ALLOW (DENY yoksa) → büro geneli (kapsam YOK → null). DENY ya da NONE → varsayılan kapsam. */
export function taskViewWhereFor(resolution: TaskViewResolution, tenantId: string, actorUserId: string): Prisma.TaskWhereInput | null {
  return resolution === "ALLOW" ? null : taskViewScopeWhere(tenantId, actorUserId);
}
