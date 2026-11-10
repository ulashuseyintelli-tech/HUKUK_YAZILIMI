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
   * P3 tarama dilimleri (owner kararları 09.11.2026; tebligat emsali) — liste / gömülü satırların DOSYASI için Prisma süzgeci:
   * dosya kiracısı belirleyici + D1 kapsamı (büro geneli izin → yalnız kiracı). Bayrak kapalı → undefined (ek sorgu yok; çağıran
   * bugünkü sorgusunu aynen yapar). Dosyaya ilişkiyle bağlı modellerde `case: filter` olarak kullanılır; yeni kural değildir.
   */
  async caseRowFilter(tenantId: string, actorUserId: string | null | undefined): Promise<Prisma.CaseWhereInput | undefined> {
    if (!isCaseViewScopeEnabled()) return undefined;
    const scope = await this.scopeWhere(tenantId, actorUserId);
    return { tenantId, ...(scope ? { AND: [scope] } : {}) };
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
   * P3 tarama S3 (owner kararı 09.11.2026) — müvekkilin TÜM hesabını temsil eden mali belgeler eksik dosyalarla ÜRETİLMEZ:
   * aktör müvekkilin (kiracıdaki) dosyalarından birini bile göremiyorsa 403. Kısmi toplam dönmez; hangi dosyanın gizli olduğu
   * ya da kaç dosya olduğu söylenmez. Bayrak kapalı / büro geneli izin → geçer. Müvekkil yoksa ya da başka kiracıdaysa dosyası
   * da yoktur → geçer; handler kendi "bulunamadı" yanıtını verir. Bu kapı mevcut mali işlem yetkilerinin YERİNE GEÇMEZ.
   */
  async assertAllClientCasesVisible(tenantId: string, actorUserId: string | null | undefined, clientId: unknown): Promise<void> {
    if (!isCaseViewScopeEnabled()) return;
    const scope = await this.scopeWhere(tenantId, actorUserId);
    if (!scope) return;
    if (typeof clientId !== "string" || !clientId) throw new ForbiddenException(CLIENT_TOTAL_SCOPE_DENIED);
    const hidden = await this.prisma.case.findFirst({
      where: { tenantId, caseClients: { some: { clientId } }, NOT: scope },
      select: { id: true },
    });
    if (hidden) throw new ForbiddenException(CLIENT_TOTAL_SCOPE_DENIED);
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
    // Mahsup kaydı İKİ dosyaya bağlıdır (ödenecek + masraf): ikisi de görünür olmalı.
    const caseIds = kind === "clientOffset" ? await this.offsetCaseIds(tenantId, objectId) : [await this.caseIdOf(tenantId, kind, objectId)];
    if (caseIds.length === 0 || caseIds.some((id) => !id)) return false;
    const distinct = [...new Set(caseIds as string[])];
    const visible = await this.prisma.case.count({ where: { id: { in: distinct }, tenantId, ...(scope ? { AND: [scope] } : {}) } });
    return visible === distinct.length;
  }

  private async offsetCaseIds(tenantId: string, id: string): Promise<Array<string | null>> {
    const row = await this.prisma.clientOffset.findFirst({ where: { id, tenantId }, select: { payableCaseId: true, expenseCaseId: true } });
    return row ? [row.payableCaseId, row.expenseCaseId] : [];
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
      case "clientInfoRequest": // P3 tarama S4: satır aktör kiracısında; dosya FK'li
        return (await this.prisma.clientInfoRequest.findFirst({ where, select }))?.caseId ?? null;
      case "uyapQuery": { // P3 tarama S4: sorgu → dosya borçlusu → dosya (satır aktör kiracısında)
        const row = await this.prisma.uyapQuery.findFirst({ where, select: { caseDebtorId: true } });
        return row ? this.caseIdOf(tenantId, "caseDebtor", row.caseDebtorId) : null;
      }
      case "institutionLetter": { // P3 tarama S4: kurum yazısı → dosya borçlusu → dosya
        const row = await this.prisma.institutionLetter.findFirst({ where, select: { caseDebtorId: true } });
        return row ? this.caseIdOf(tenantId, "caseDebtor", row.caseDebtorId) : null;
      }
      case "assetQuery": { // P3 tarama S4: mal varlığı sorgusu → dosya borçlusu → dosya
        const row = await this.prisma.assetQuery.findFirst({ where, select: { caseDebtorId: true } });
        return row ? this.caseIdOf(tenantId, "caseDebtor", row.caseDebtorId) : null;
      }
      case "claimItem": // P3 tarama S1: satır aktör kiracısında; dosya FK'li
        return (await this.prisma.claimItem.findFirst({ where, select }))?.caseId ?? null;
      case "collection": // P3 tarama S1: satır aktör kiracısında; dosya FK'li
        return (await this.prisma.collection.findFirst({ where, select }))?.caseId ?? null;
      case "clientIntelStatement": // P3 tarama S5: satır aktör kiracısında; dosya FK'li
        return (await this.prisma.clientIntelStatement.findFirst({ where, select }))?.caseId ?? null;
      case "clientIntakeSubmission": // P3 tarama S5: satır aktör kiracısında; dosya FK'li
        return (await this.prisma.clientIntakeSubmission.findFirst({ where, select }))?.caseId ?? null;
      case "collectionDisposition": // P3 tarama S3: satır aktör kiracısında; dosya FK'li
        return (await this.prisma.collectionDisposition.findFirst({ where, select }))?.caseId ?? null;
      case "clientPayoutManualReversal": // P3 tarama S3: satır aktör kiracısında; dosya FK'li
        return (await this.prisma.clientPayoutManualReversal.findFirst({ where, select }))?.caseId ?? null;
      default:
        return null;
    }
  }
}

/**
 * P3 tarama S7 — dosyaya FK'siz `caseId` alanıyla bağlanan satırlar (takvim, müvekkil bildirimi) için süzgeç: dosyasız satırlar
 * kalır (mevcut yetkileri korunur), dosyalı satırlar yalnız görünen dosyalarla. `visible === null` → süzme yok.
 */
export function looseCaseIdWhere(visible: Set<string> | null): { OR: Array<{ caseId: null } | { caseId: { in: string[] } }> } | undefined {
  return visible ? { OR: [{ caseId: null }, { caseId: { in: [...visible] } }] } : undefined;
}

/** S3: müvekkil düzeyi mali belge reddi — tek gövde (hangi dosyanın gizli olduğu / dosya sayısı verilmez). */
export const CLIENT_TOTAL_SCOPE_DENIED = {
  code: "CASE_VIEW_SCOPE_CLIENT_TOTAL",
  message: "Bu müvekkilin tüm dosyalarını görme yetkiniz olmadığı için müvekkil düzeyi mali belge gösterilemiyor",
} as const;

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
  | "precautionaryOrder" // P3 tarama S9 (10.11.2026): GET /precautionary-orders/:id, /:id/costs/total
  | "clientInfoRequest" // P3 tarama S4 (10.11.2026): GET /address-discovery/client-info-request/:id
  | "uyapQuery" // P3 tarama S4: GET /address-discovery/uyap-query/:id
  | "institutionLetter" // P3 tarama S4: GET /address-discovery/institution-letter/:id
  | "assetQuery" // P3 tarama S4: GET /asset-queries/:queryId
  | "claimItem" // P3 tarama S1 (10.11.2026): GET /claim-items/:id
  | "collection" // P3 tarama S1: GET /collections/:id
  | "collectionDisposition" // P3 tarama S3 (10.11.2026): POST /collection-dispositions/:id/distribution-recommendation
  | "clientPayoutManualReversal" // P3 tarama S3: GET /client-payout-manual-reversals/:id
  | "clientOffset" // P3 tarama S3: GET /client-offsets/:offsetId/detail (iki dosya: ödenecek + masraf)
  | "clientIntelStatement" // P3 tarama S5 (10.11.2026): GET /client-intel-statements/:id
  | "clientIntakeSubmission"; // P3 tarama S5: GET /client-intake-submissions/:id

/**
 * Handler / servis içi kapı yardımcısı: bayrak kapalı → undefined (bugünkü davranış, sorgu yok); bayrak açık + kapsam servisi
 * enjekte edilmemiş → 403 (fail-closed; CaseViewScopeGuard ile aynı gövde). Kullanım:
 * `await requireCaseViewScope(this.caseViewScope)?.caseRowFilter(tenantId, actorUserId)`.
 */
export function requireCaseViewScope(service: CaseViewScopeService | undefined): CaseViewScopeService | undefined {
  if (!isCaseViewScopeEnabled()) return undefined;
  if (!service) throw new ForbiddenException({ code: "CASE_VIEW_SCOPE_UNRESOLVED", message: "Dosya görünüm kapsamı çözümlenemedi" });
  return service;
}
