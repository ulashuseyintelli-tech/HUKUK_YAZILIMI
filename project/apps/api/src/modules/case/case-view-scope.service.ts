import { ForbiddenException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { WorkScopePermissionService } from "../work-scope-permission/work-scope-permission.service";
import { CASE_VIEW_ALL_KEY, caseViewWhereFor, isCaseViewScopeEnabled } from "./case-view-scope";

type Db = Prisma.TransactionClient | PrismaService;

/**
 * F02 P3-D1 / P3-D2 (owner kararları 07–08.11.2026) — dosya görünüm kapsamının TEK uygulama noktası.
 * Yeni kural, anahtar ya da bayrak YOK: D1'in `OFFICE_CASE_VIEW_SCOPE_ENABLED` bayrağı, `office.cases.view_all` anahtarı ve
 * `caseViewScopeWhere` yüklemi (aktif Dosya Sorumlusu ∪ oluşturan ∪ CaseLawyer ∪ CaseStaff canView; DENY ilişkileri
 * kaldırmaz) aynen kullanılır.
 *
 * Sözleşme:
 *  - bayrak KAPALI → hiçbir ek sorgu yapılmaz, hiçbir şey reddedilmez (bugünkü davranış birebir);
 *  - bayrak AÇIK + aktör / kiracı / izin servisi yok → 403 CASE_VIEW_SCOPE_UNRESOLVED (fail-closed);
 *  - bayrak AÇIK → dosya ya da belge SUNUCUDAKİ ilişkiden çözülür; kapsam dışı ve var olmayan nesne AYNI 404'ü alır.
 *
 * @remarks Çağıranlar:
 *  - CaseService.findAll / findOneVisible (D1: GET /cases, GET /cases/:id) → scopeWhere();
 *  - CaseViewScopeGuard (D2: dosya kimliği yolda olan belge okuma uçları) → assertCaseVisible();
 *  - TemplateEngineController.downloadArtifact (D2) → isArtifactVisible().
 */
@Injectable()
export class CaseViewScopeService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly workScope?: WorkScopePermissionService,
  ) {}

  /** Bayrak kapalı → null; açık → ALLOW için null (büro geneli), DENY / NONE için varsayılan kapsam. */
  async scopeWhere(tenantId: string, actorUserId?: string | null, db: Db = this.prisma): Promise<Prisma.CaseWhereInput | null> {
    if (!isCaseViewScopeEnabled()) return null;
    if (typeof tenantId !== "string" || !tenantId || typeof actorUserId !== "string" || !actorUserId || !this.workScope) {
      throw new ForbiddenException({ code: "CASE_VIEW_SCOPE_UNRESOLVED", message: "Dosya görünüm kapsamı çözümlenemedi" });
    }
    const resolution = await this.workScope.resolve(db, tenantId, actorUserId, CASE_VIEW_ALL_KEY);
    return caseViewWhereFor(resolution, tenantId, actorUserId);
  }

  /**
   * Dosya kimliği yoldan gelir ama GÜVENİLMEZ: bayrak açıkken dosya kiracı + kapsam ile DB'den doğrulanır; bulunamazsa
   * (kapsam dışı ya da yok) 404 — dosya içeriği, önizleme ya da indirme üretilmeden ÖNCE.
   */
  async assertCaseVisible(tenantId: string, actorUserId: string | null | undefined, caseId: unknown): Promise<void> {
    if (!isCaseViewScopeEnabled()) return;
    const scope = await this.scopeWhere(tenantId, actorUserId);
    if (typeof caseId !== "string" || !caseId) throw new NotFoundException("Dosya bulunamadı");
    const found = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId, ...(scope ? { AND: [scope] } : {}) },
      select: { id: true },
    });
    if (!found) throw new NotFoundException("Dosya bulunamadı");
  }

  /**
   * Belge (DocumentArtifact) → dosya → kiracı eşleşmesi sunucudan çözülür: artefakt aynı kiracıda, bağlı olduğu dosya da
   * aynı kiracıda ve aktörün kapsamında olmalı. Bayrak kapalı → true (bugünkü davranış; servis kendi kiracı kontrolünü yapar).
   * false → çağıran, var olmayan belgeyle AYNI 404 gövdesini döner (varlık sızmaz).
   */
  async isArtifactVisible(tenantId: string, actorUserId: string | null | undefined, artifactId: unknown): Promise<boolean> {
    if (!isCaseViewScopeEnabled()) return true;
    const scope = await this.scopeWhere(tenantId, actorUserId);
    if (typeof artifactId !== "string" || !artifactId) return false;
    const found = await this.prisma.documentArtifact.findFirst({
      where: { id: artifactId, tenantId, case: { tenantId, ...(scope ? { AND: [scope] } : {}) } },
      select: { id: true },
    });
    return !!found;
  }
}
