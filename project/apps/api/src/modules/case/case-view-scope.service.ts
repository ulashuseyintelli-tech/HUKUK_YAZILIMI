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
 *  - TemplateEngineController.downloadArtifact (D2) → isArtifactVisible();
 *  - CaseObjectViewScopeGuard (D3b-2: kendi kimlikli kayıt / ücret sözleşmesi okuma uçları) → isCaseObjectVisible();
 *  - TebligatController (P3 Tebligat, 09.11.2026: `summary`) → assertCaseVisible() / scopeWhere(); `:id` ve
 *    `case-debtor/:caseDebtorId` → CaseObjectViewScopeGuard ("tebligat" / "caseDebtor").
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
   * P3 tarama dilimleri (owner kararları 09.11.2026) — tek dosyanın görünürlüğü, hata FIRLATMADAN. Yeni kural değildir:
   * `assertCaseVisible` ile aynı yüklem. Bayrak kapalı → true (ek sorgu yok). Yanıtına dosya verisi GÖMEN okumalar (ör. tek
   * görev) "bu dosya aktöre görünür mü" sorusunu bununla yanıtlar; başka bir kaydı görebilmek dosya erişimi ÜRETMEZ.
   */
  async isCaseVisible(tenantId: string, actorUserId: string | null | undefined, caseId: unknown): Promise<boolean> {
    if (!isCaseViewScopeEnabled()) return true;
    const scope = await this.scopeWhere(tenantId, actorUserId);
    if (typeof caseId !== "string" || !caseId) return false;
    const found = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId, ...(scope ? { AND: [scope] } : {}) },
      select: { id: true },
    });
    return !!found;
  }

  /**
   * P3 tarama dilimleri — verilen dosya kimliklerinden aktörün GÖREBİLDİKLERİ (tek sorgu). `null` → süzme YOK: bayrak kapalı
   * ya da büro geneli izin (ALLOW); çağıran kendi kiracı süzgeciyle bugünkü gibi davranır. Liste ve gömülü dosya süzgeçleri
   * bunu kullanır. Boş / geçersiz kimlikler yok sayılır; başka kiracının dosyası kümede yer almaz.
   */
  async visibleCaseIds(
    tenantId: string,
    actorUserId: string | null | undefined,
    caseIds: Iterable<string | null | undefined>,
  ): Promise<Set<string> | null> {
    if (!isCaseViewScopeEnabled()) return null;
    const scope = await this.scopeWhere(tenantId, actorUserId);
    if (!scope) return null;
    const ids = [...new Set([...caseIds].filter((id): id is string => typeof id === "string" && id.length > 0))];
    if (ids.length === 0) return new Set();
    const rows = await this.prisma.case.findMany({ where: { id: { in: ids }, tenantId, AND: [scope] }, select: { id: true } });
    return new Set(rows.map((row) => row.id));
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

  /**
   * P3-D3b-2 (D2 artefakt emsali) — KENDİ kimliğiyle okunan dosya nesnesi (teminat / çek-senet / ilam / kira kaydı, ücret
   * sözleşmesi, dosya–müvekkil bağı) → dosya sunucudaki satırdan çözülür; nesne aktörün kiracısında, çözülen dosya da aynı
   * kiracıda ve aktörün kapsamında olmalı. Teminat / ilam / kira `caseId`'si ve sözleşmenin `caseClientId`'si için FK YOK:
   * başka kiracıya ya da var olmayan dosyaya işaret eden satır false alır. Bayrak kapalı → true (ek sorgu yok).
   * false → çağıran, var olmayan nesneyle AYNI 404 gövdesini döner (varlık sızmaz).
   */
  async isCaseObjectVisible(
    tenantId: string,
    actorUserId: string | null | undefined,
    kind: CaseScopedObjectKind,
    objectId: unknown,
  ): Promise<boolean> {
    if (!isCaseViewScopeEnabled()) return true;
    const scope = await this.scopeWhere(tenantId, actorUserId);
    if (typeof objectId !== "string" || !objectId) return false;
    const caseId = await this.caseIdOf(tenantId, kind, objectId);
    if (!caseId) return false;
    const found = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId, ...(scope ? { AND: [scope] } : {}) },
      select: { id: true },
    });
    return !!found;
  }

  /** Nesnenin dosya kimliği — yalnız aktör kiracısındaki satırdan (bulunamazsa null). */
  private async caseIdOf(tenantId: string, kind: CaseScopedObjectKind, id: string): Promise<string | null> {
    const where = { id, tenantId };
    const select = { caseId: true } as const;
    switch (kind) {
      case "caseCollateral":
        return (await this.prisma.caseCollateral.findFirst({ where, select }))?.caseId ?? null;
      case "caseInstrument":
        return (await this.prisma.caseInstrument.findFirst({ where, select }))?.caseId ?? null;
      case "caseJudgment":
        return (await this.prisma.caseJudgment.findFirst({ where, select }))?.caseId ?? null;
      case "caseLease":
        return (await this.prisma.caseLease.findFirst({ where, select }))?.caseId ?? null;
      case "caseFeeAgreement": {
        const agreement = await this.prisma.caseFeeAgreement.findFirst({ where, select: { caseClientId: true } });
        return agreement ? this.caseIdOf(tenantId, "caseClient", agreement.caseClientId) : null;
      }
      case "caseClient": // CaseClient'ta tenantId yok: kiracı bağlı dosyadan
        return (await this.prisma.caseClient.findFirst({ where: { id, case: { tenantId } }, select }))?.caseId ?? null;
      case "tebligat": // P3 Tebligat: satır aktör kiracısında; dosya aşağıda ayrıca kiracı + kapsamla doğrulanır
        return (await this.prisma.tebligat.findFirst({ where, select }))?.caseId ?? null;
      case "caseDebtor": // P3 Tebligat: CaseDebtor'da tenantId yok → kiracı bağlı dosyadan (caseClient emsali)
        return (await this.prisma.caseDebtor.findFirst({ where: { id, case: { tenantId } }, select }))?.caseId ?? null;
      case "precautionaryOrder": // P3 tarama S9: satır aktör kiracısında; dosya FK'li
        return (await this.prisma.precautionaryOrder.findFirst({ where, select }))?.caseId ?? null;
      default:
        return null;
    }
  }
}

/** P3-D3b-2: kendi kimliğiyle okunan, dosyaya bağlı nesne türleri (yeni kural değildir; dosya bu satırlardan çözülür). */
export type CaseScopedObjectKind =
  | "caseCollateral"
  | "caseInstrument"
  | "caseJudgment"
  | "caseLease"
  | "caseFeeAgreement"
  | "caseClient"
  | "tebligat" // P3 Tebligat (09.11.2026): GET /tebligat/:id
  | "caseDebtor" // P3 Tebligat (09.11.2026): GET /tebligat/case-debtor/:caseDebtorId
  | "precautionaryOrder"; // P3 tarama S9 (10.11.2026): GET /precautionary-orders/:id, /:id/costs/total
