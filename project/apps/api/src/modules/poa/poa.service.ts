import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { PoaStatus, PoaScopeType } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import { AuditService } from "../audit/audit.service";
import { OfficeApprovalService } from "../office-approval/office-approval.service";
import { RuntimeStoragePaths, runtimeStoragePaths } from "../../common/storage/runtime-storage-paths";
import type { AuditActor } from "@/modules/client/client.service";
import {
  CLIENT_WORKSPACE_COMMAND,
  runAuthorizedClientWorkspaceCommand,
  type ClientWorkspaceCommandActor,
} from "../client/client-workspace-command-authority";

export const POA_UPLOAD_ALLOWED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/jpg"] as const;
export const POA_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

/** D-5: legacy `POST /poa/:id/upload` yaniti — sunucu dosya yolu YOK. */
export interface LegacyPoaUploadResult {
  success: true;
  hasFile: true;
  fileSize: number | null;
  mimeType: string | null;
}

export interface ClientWorkspacePoaUploadResult {
  clientId: string;
  poaId: string;
  hasFile: true;
  fileSize: number | null;
  mimeType: string | null;
}

export function validatePoaUploadFile(file: Express.Multer.File | undefined): asserts file is Express.Multer.File {
  if (!file) {
    throw new BadRequestException("Dosya yuklenmedi");
  }

  if (!POA_UPLOAD_ALLOWED_MIME_TYPES.includes(file.mimetype as any)) {
    throw new BadRequestException("Sadece PDF ve goruntu dosyalari (JPG, PNG) yuklenebilir");
  }

  if (file.size > POA_UPLOAD_MAX_BYTES) {
    throw new BadRequestException("Dosya boyutu 10MB'dan buyuk olamaz");
  }
}

// ── PR-2: POA semantik idempotency saf yardımcıları ──
// Dedupe anahtarı: clientId + normalizedNotaryName + dateIssued (aktif). poaNumber/yevmiyeNo
// OCR-gürültülü → anahtar DEĞİL. documentHash bu PR dışında.

/**
 * Noter adını EŞLEŞTİRME için normalize eder (PR-2b hardening). Yalnız karşılaştırma anahtarı;
 * saklanan değer DEĞİŞMEZ. OCR varyanslarını yutar: diakritik folding + noktalama temizliği +
 * tek boşluk + uppercase. "BÜLENT OVEN" = "BÜLENT ÖVEN" = "BÜLENT ÖVEN." = "bülent  öven" → "BULENT OVEN".
 */
export function normalizeNotaryName(name?: string | null): string {
  return (name || "")
    .replace(/ı/g, "i").replace(/İ/g, "i") // TR noktasız/noktalı i (NFD tam çözmez)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // birlesik aksanlari sok: s g u o c
    .replace(/[^a-zA-Z0-9\s]/g, " ") // noktalama → boşluk
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/** İki vekalet tarihinin AYNI GÜN olup olmadığı (saat/zaman dilimi yok say). */
export function sameIssueDay(a?: Date | string | null, b?: Date | string | null): boolean {
  if (!a || !b) return false;
  const da = new Date(a);
  const db = new Date(b);
  if (isNaN(da.getTime()) || isNaN(db.getTime())) return false;
  return da.toISOString().slice(0, 10) === db.toISOString().slice(0, 10);
}

/** Mevcut kayıttaki BOŞ alanları yeni taramadan gelen değerle doldurur; DOLU alanları EZMEZ. */
export function buildPoaEnrichment(existing: any, dto: any): Record<string, any> {
  const fields = ["notaryCity", "journalNo", "poaNumber", "validUntil", "scopeDescription", "filePath"];
  const out: Record<string, any> = {};
  for (const f of fields) {
    const cur = existing?.[f];
    const empty = cur === null || cur === undefined || (typeof cur === "string" && cur.trim() === "");
    const incoming = dto?.[f];
    const hasIncoming = incoming !== null && incoming !== undefined && incoming !== "";
    if (empty && hasIncoming) out[f] = incoming;
  }
  return out;
}

export interface CreatePoaDto {
  clientId: string;
  notaryName?: string;
  notaryCity?: string;
  journalNo?: string;
  poaNumber?: string;
  dateIssued?: Date;
  isLimited?: boolean;
  validUntil?: Date;
  scopeType?: PoaScopeType;
  scopeDescription?: string;
  canCollect?: boolean;
  canWaive?: boolean;
  canSettle?: boolean;
  canRelease?: boolean;
  filePath?: string;
  fileSize?: number;
  mimeType?: string;
  lawyerIds?: string[];
}

/**
 * D-4 (owner GO 2026-09-06): update ile YAZILABILIR alanlar acikca sinirlidir. `status`/`isActive`
 * (lifecycle — yalniz revoke yolu), `clientId` (sahiplik) ve dosya alanlari (yalniz upload/deleteFile)
 * bu tipte YOKTUR; runtime'da `projectPoaWritableInput` gonderilirse 400 ile REDDEDER.
 */
export type UpdatePoaDto = Partial<Omit<CreatePoaDto, 'clientId' | 'filePath' | 'fileSize' | 'mimeType'>>;

export interface PoaValidationResult {
  isValid: boolean;
  poa?: any;
  message?: string;
  daysRemaining?: number;
}

// ── D-4 (owner GO 2026-09-06): POA yazma yuzeyi — alan allowlist'leri (mass-assignment KAPALI) ──
/** CREATE ile yazilabilir alanlar = CreatePoaDto'nun bildirilen anahtarlari. */
export const POA_CREATE_WRITABLE_FIELDS: readonly string[] = [
  'clientId', 'notaryName', 'notaryCity', 'journalNo', 'poaNumber', 'dateIssued', 'isLimited', 'validUntil',
  'scopeType', 'scopeDescription', 'canCollect', 'canWaive', 'canSettle', 'canRelease',
  'filePath', 'fileSize', 'mimeType', 'lawyerIds',
];
/** UPDATE ile yazilabilir alanlar: lifecycle, sahiplik ve dosya alanlari HARIC. */
export const POA_UPDATE_WRITABLE_FIELDS: readonly string[] = [
  'notaryName', 'notaryCity', 'journalNo', 'poaNumber', 'dateIssued', 'isLimited', 'validUntil',
  'scopeType', 'scopeDescription', 'canCollect', 'canWaive', 'canSettle', 'canRelease', 'lawyerIds',
];
/** Her iki islemde de gonderilmesi REDDEDILEN alanlar (sessizce dusurulmez): lifecycle/sahiplik yan kapidan gecemez. */
export const POA_REJECTED_FIELDS: readonly string[] = ['status', 'isActive', 'tenantId', 'id', 'createdAt', 'updatedAt'];
/** UPDATE'te ayrica reddedilen alanlar: sahiplik degisimi ve dosya alanlari (yalniz upload/deleteFile yolu). */
export const POA_UPDATE_REJECTED_FIELDS: readonly string[] = ['clientId', 'filePath', 'fileSize', 'mimeType'];

/**
 * Ham govdeyi yazilabilir alanlara indirger. Reddedilen alanlar 400 + stabil `reasonCode` +
 * yalniz alan ADLARI (deger tasinmaz); allowlist disi diger anahtarlar dusurulur.
 */
export function projectPoaWritableInput(
  input: Record<string, unknown> | null | undefined,
  op: 'CREATE' | 'UPDATE',
): Record<string, unknown> {
  const src = (input ?? {}) as Record<string, unknown>;
  const rejectedSet = op === 'UPDATE' ? [...POA_REJECTED_FIELDS, ...POA_UPDATE_REJECTED_FIELDS] : POA_REJECTED_FIELDS;
  const offendingFields = Object.keys(src).filter((k) => src[k] !== undefined && rejectedSet.includes(k));
  if (offendingFields.length > 0) {
    throw new BadRequestException({
      message: 'Bu alanlar bu istekle yazilamaz (lifecycle/sahiplik/dosya alanlari ayri yollardan degisir)',
      reasonCode: 'POA_FIELD_NOT_WRITABLE',
      offendingFields,
    });
  }
  const allow = op === 'UPDATE' ? POA_UPDATE_WRITABLE_FIELDS : POA_CREATE_WRITABLE_FIELDS;
  const out: Record<string, unknown> = {};
  for (const k of allow) if (src[k] !== undefined) out[k] = src[k];
  return out;
}

@Injectable()
export class PoaService {
  private readonly logger = new Logger(PoaService.name);

  // P1A: OfficeApprovalService revoke capability-gate için (ClientService.assertCanManageLifecycle /
  // LawyerService.assertCanManageLawyerLifecycle ile birebir desen). AuditService @Global (AuditModule).
  private readonly storage: RuntimeStoragePaths;

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private officeApproval: OfficeApprovalService,
    storage?: RuntimeStoragePaths,
  ) {
    // DI her zaman saglar (StorageModule @Global). Dogrudan `new` ile kurulan
    // testlerde ayni cozumleme/dogrulama zinciri kullanilir — production'da
    // eksik/guvensiz kok yine HARD FAIL uretir.
    this.storage = storage ?? runtimeStoragePaths();
  }

  /**
   * D-4: C2 frozen primitive'inin bagimliliklari — elevated sinyali OFFICE'ten (`isApproverEligible`,
   * yalniz gerektiginde), audit `AuditService.log`. OFFICE eligibility hesabi KOPYALANMAZ.
   */
  private workspaceCommandDeps() {
    return {
      isApproverEligible: (userId: string, actorTenantId: string) =>
        this.officeApproval.isApproverEligible(userId, actorTenantId),
      auditLog: (input: Parameters<AuditService['log']>[0]) => this.audit.log(input),
    };
  }

  /**
   * Müvekkilin tüm vekaletlerini getir
   */
  async findByClient(clientId: string, tenantId: string) {
    return this.prisma.clientPowerOfAttorney.findMany({
      where: {
        clientId,
        client: { tenantId },
      },
      include: {
        lawyers: {
          include: {
            lawyer: {
              select: { id: true, name: true, surname: true, barNumber: true, barCity: true },
            },
          },
        },
      },
      orderBy: { dateIssued: "desc" },
    });
  }

  /**
   * Tek bir vekalet getir
   */
  async findOne(id: string, tenantId: string) {
    const poa = await this.prisma.clientPowerOfAttorney.findFirst({
      where: {
        id,
        client: { tenantId },
      },
      include: {
        client: { select: { id: true, displayName: true, type: true } },
        lawyers: {
          include: {
            lawyer: {
              select: { id: true, name: true, surname: true, barNumber: true, barCity: true },
            },
          },
        },
      },
    });

    if (!poa) {
      throw new NotFoundException("Vekalet bulunamadı");
    }

    return poa;
  }

  /**
   * Yeni vekalet oluştur
   */
  /**
   * Yeni vekalet olustur — D-4 (owner GO 2026-09-06): yetki + audit SERVIS GIRISINDE.
   *
   * Onceden yalniz JwtAuthGuard vardi: VIEWER bile vekalet olusturabiliyor, `status` varsayilani ACTIVE
   * oldugundan K9 capability bagi (canCollect/canSettle/...) yetkisiz olusturulan vekaletle etkinlesiyordu.
   * Simdi: `actor` ZORUNLU; C2 frozen primitive (`POA_CREATE`, esik ADMIN VEYA canonical elevated;
   * VIEWER/tanimsiz rol fail-closed; cross-tenant TENANT_MISMATCH) HERHANGI bir yazmadan ONCE; govde
   * `projectPoaWritableInput` ile allowlist'e indirgenir (`status`/`isActive`/`tenantId` gonderimi 400).
   * Istek basina TEK yetki karari ve TEK audit: dedup/suppress ve ic avukat baglama (`linkLawyers`)
   * ayri karar/audit URETMEZ; audit metadata `status: created | duplicate_suppressed`.
   *
   * @remarks Çağrıldığı yerler:
   * - PoaController.create() -> POST /poa
   */
  async create(dto: CreatePoaDto, tenantId: string, actor: ClientWorkspaceCommandActor) {
    const input = projectPoaWritableInput(dto as unknown as Record<string, unknown>, 'CREATE') as unknown as CreatePoaDto;
    if (!input.clientId) {
      throw new BadRequestException('clientId zorunludur');
    }
    return runAuthorizedClientWorkspaceCommand(
      this.workspaceCommandDeps(),
      actor,
      { tenantId, clientId: input.clientId, commandType: CLIENT_WORKSPACE_COMMAND.POA_CREATE },
      () => this.createUnchecked(input, tenantId),
      (r: any) => ({
        poaId: r?.id ?? null,
        status: r?._suppressedDuplicate ? 'duplicate_suppressed' : 'created',
        lawyerCount: input.lawyerIds?.length ?? 0,
      }),
    );
  }

  /**
   * Vekalet olusturma govdesi — yetki KARARI YOKTUR; yalniz `create()` (yetki verilmis) cagirir.
   * @remarks Çağrıldığı yerler: PoaService.create() (D-4 kapisindan sonra).
   */
  private async createUnchecked(dto: CreatePoaDto, tenantId: string) {
    // Müvekkil kontrolü
    const client = await this.prisma.client.findFirst({
      where: { id: dto.clientId, tenantId },
    });

    if (!client) {
      throw new NotFoundException("Müvekkil bulunamadı");
    }

    // Süreli vekalet kontrolü
    if (dto.isLimited && !dto.validUntil) {
      throw new BadRequestException("Süreli vekalet için geçerlilik bitiş tarihi zorunludur");
    }

    // PR-2: SEMANTİK IDEMPOTENCY — aynı vekalet evrakı tekrar taranınca yeni kayıt AÇMA.
    // Anahtar: clientId + normalizedNotaryName + dateIssued (aktif). Anahtar eksikse (noter/tarih
    // yoksa) güvenli taraf = normal create (yanlış-merge etme). Eşleşme varsa mevcut aktif döner;
    // boş alanlar yeni taramadan zenginleşir, dolu alanlar ezilmez. (Aynı client+noter+gün gerçek
    // hayatta nadiren 2 ayrı vekalet olabilir → bu PR yalnız TARAMA kaynaklı duplicate'i bastırır;
    // kullanıcı "yine de yeni kayıt aç" override'ı ileride tasarlanabilir.)
    if (dto.notaryName && dto.dateIssued) {
      const activePoas = await this.prisma.clientPowerOfAttorney.findMany({
        where: { clientId: dto.clientId, isActive: true },
      });
      const wantNotary = normalizeNotaryName(dto.notaryName);
      const match = activePoas.find(
        (poa) => normalizeNotaryName(poa.notaryName) === wantNotary && sameIssueDay(poa.dateIssued, dto.dateIssued),
      );
      if (match) {
        this.logger.warn(
          `[PR-2] duplicate scan suppressed → mevcut aktif vekalet döndürüldü (${match.id}); ` +
            `client=${dto.clientId}, noter="${dto.notaryName}", tarih=${dto.dateIssued}`,
        );
        const enrichment = buildPoaEnrichment(match, dto);
        if (Object.keys(enrichment).length > 0) {
          await this.prisma.clientPowerOfAttorney.update({ where: { id: match.id }, data: enrichment });
        }
        // Fix E: suppress edilen MEVCUT POA'ya taramadan gelen lawyerIds'i idempotent +
        // tenant-güvenli reconcile et. Eskiden eklenmiyordu → reactivate edilen müvekkilde
        // aktif POA avukatsız kalıyordu ("geçerli vekalet bulunamadı"). addLawyers DEĞİŞMEDEN ayrı yol.
        await this.reconcileSuppressedLawyers(match.id, dto.lawyerIds, tenantId);
        const existing = await this.findOne(match.id, tenantId);
        // PR-2a: kullanıcıya "mükerrer bastırıldı" sinyali. TRANSIENT alan (persist edilmez,
        // API kontratı bozulmaz) → frontend bilgilendirici notice gösterir.
        return { ...(existing as any), _suppressedDuplicate: true };
      }
    }

    const { lawyerIds, clientId: _, ...poaData } = dto;

    // Vekalet oluştur
    const poa = await this.prisma.clientPowerOfAttorney.create({
      data: {
        ...poaData,
        // UYAP-POA-TENANT-SAFETY-I01: tenant server-authoritative parametreden gelir; client
        // composite (id, tenantId) ile bağlanır → cross-tenant POA↔Client bağı DB'de imkânsız.
        tenant: { connect: { id: tenantId } },
        client: { connect: { id_tenantId: { id: dto.clientId, tenantId } } },
        status: PoaStatus.ACTIVE,
      },
      include: {
        lawyers: {
          include: {
            lawyer: {
              select: { id: true, name: true, surname: true, barNumber: true, barCity: true },
            },
          },
        },
      },
    });

    // Avukatları ekle
    if (lawyerIds && lawyerIds.length > 0) {
      await this.linkLawyers(poa.id, lawyerIds, tenantId); // D-4: yetki+audit create()'te BIR kez; ic bag ayri karar URETMEZ
    }

    this.logger.log(`Yeni vekalet oluşturuldu: ${poa.id} (Müvekkil: ${client.displayName})`);

    return this.findOne(poa.id, tenantId);
  }

  /**
   * Vekalet güncelle
   */
  /**
   * Vekalet guncelle — D-4: yetki + audit SERVIS GIRISINDE (`POA_UPDATE`, ADMIN VEYA elevated).
   * Yazilabilir alanlar `POA_UPDATE_WRITABLE_FIELDS` ile acikca sinirli: `status`/`isActive`
   * (lifecycle yalniz `delete()` = revoke, elevated-only), `clientId` ve dosya alanlari 400 ile
   * reddedilir → genel update daha siki lifecycle kuralini ASAMAZ. Avukat listesi degisimi ayni
   * istegin parcasidir (ayri karar/audit yok).
   *
   * @remarks Çağrıldığı yerler:
   * - PoaController.update() -> PUT /poa/:id
   */
  async update(id: string, dto: UpdatePoaDto, tenantId: string, actor: ClientWorkspaceCommandActor) {
    const input = projectPoaWritableInput(dto as unknown as Record<string, unknown>, 'UPDATE') as UpdatePoaDto;
    // Tenant-scoped okuma (yan etki YOK): audit entityId icin clientId; yok/cross-tenant → NotFound.
    const existing = await this.findOne(id, tenantId);
    return runAuthorizedClientWorkspaceCommand(
      this.workspaceCommandDeps(),
      actor,
      { tenantId, clientId: existing.clientId, commandType: CLIENT_WORKSPACE_COMMAND.POA_UPDATE },
      () => this.updateUnchecked(id, input, tenantId, existing),
      () => ({
        poaId: id,
        status: 'updated',
        fields: Object.keys(input).filter((k) => k !== 'lawyerIds'),
        lawyersReplaced: input.lawyerIds !== undefined,
      }),
    );
  }

  /**
   * Guncelleme govdesi — yetki KARARI YOKTUR; yalniz `update()` (yetki verilmis) cagirir.
   * @remarks Çağrıldığı yerler: PoaService.update() (D-4 kapisindan sonra).
   */
  private async updateUnchecked(id: string, dto: UpdatePoaDto, tenantId: string, existing: { validUntil?: Date | null }) {

    // Süreli vekalet kontrolü
    if (dto.isLimited && !dto.validUntil && !existing.validUntil) {
      throw new BadRequestException("Süreli vekalet için geçerlilik bitiş tarihi zorunludur");
    }

    const { lawyerIds, ...poaData } = dto;

    const poa = await this.prisma.clientPowerOfAttorney.update({
      where: { id },
      data: poaData,
    });

    // Avukatları güncelle
    if (lawyerIds !== undefined) {
      // Mevcut avukatları sil
      await this.prisma.poaLawyer.deleteMany({ where: { poaId: id } });
      // Yeni avukatları ekle
      if (lawyerIds.length > 0) {
        await this.linkLawyers(id, lawyerIds, tenantId); // D-4: tek karar/tek audit update()'te
      }
    }

    this.logger.log(`Vekalet güncellendi: ${id}`);

    return this.findOne(id, tenantId);
  }

  /**
   * P1A (owner-locked 2026-07-02) — Vekaletname kalıcı hukuki yetki kaydı: fiziksel silme YOK.
   * ClientService.remove() / LawyerService.delete() ile BİREBİR desen (reuse, yeni altyapı YOK):
   * PARTNER veya canApproveOfficeActions=true delege avukat. PoaLawyer/PoaExpiryNotificationDelivery
   * ilişkilerine DOKUNULMAZ — status=REVOKED + isActive=false, checkValidPoa()'nın zaten okuduğu
   * aynı iki alan (böylece revoke aynı anda avukatın yetkisini de geçersiz kılar).
   */
  private async assertCanManagePoaLifecycle(userId: string | undefined, tenantId: string): Promise<void> {
    if (!userId || !(await this.officeApproval.isApproverEligible(userId, tenantId))) {
      throw new ForbiddenException(
        "Vekaleti iptal etme yetkiniz yok (PARTNER veya yetkilendirilmiş avukat gerekir)"
      );
    }
  }

  /// <remarks>
  /// Çağrıldığı yerler:
  /// - PoaController.delete() → DELETE /poa/:id (userId req.user.id'den; Task P1A)
  ///
  /// Task P1A: bu artık fiziksel silme DEĞİL, status=REVOKED + isActive=false iptalidir. Zaten
  /// iptal edilmiş bir kayıt için idempotent şekilde tekrar uygulanır (ClientService.remove() /
  /// LawyerService.delete() ile birebir); ayrı bir "already revoked" dalı YOK.
  /// </remarks>
  async delete(id: string, tenantId: string, actor?: AuditActor) {
    const existing = await this.findOne(id, tenantId); // Yetki kontrolü + old snapshot

    // P1A: iptal yetkisi — transaction'dan ÖNCE (yetkisiz aktör hiçbir yazma yapmaz).
    await this.assertCanManagePoaLifecycle(actor?.userId, tenantId);

    // P1A: revoke + audit AYNI transaction (old snapshot revoke ÖNCESİ alındı).
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.clientPowerOfAttorney.updateMany({
        where: { id, client: { tenantId } },
        data: { status: PoaStatus.REVOKED, isActive: false },
      });
      if (count === 0) throw new NotFoundException("Vekalet bulunamadı");

      await this.audit.logInTransaction(tx, {
        tenantId,
        action: "POA_REVOKE",
        entityType: "POA",
        entityId: id,
        userId: actor?.userId,
        oldValues: existing,
        newValues: { status: PoaStatus.REVOKED, isActive: false },
      });

      this.logger.log(`Vekalet iptal edildi: ${id}`);

      return { success: true };
    });
  }

  /**
   * Vekalete avukat ekle — D-4: yetki + audit SERVIS GIRISINDE (`POA_LAWYERS_ADD`).
   *
   * @remarks Çağrıldığı yerler:
   * - PoaController.addLawyers() -> POST /poa/:id/lawyers
   */
  async addLawyers(poaId: string, lawyerIds: string[], tenantId: string, actor: ClientWorkspaceCommandActor) {
    const poa = await this.findOne(poaId, tenantId); // tenant-scoped okuma; audit icin clientId
    return runAuthorizedClientWorkspaceCommand(
      this.workspaceCommandDeps(),
      actor,
      { tenantId, clientId: poa.clientId, commandType: CLIENT_WORKSPACE_COMMAND.POA_LAWYERS_ADD },
      () => this.linkLawyers(poaId, lawyerIds, tenantId),
      (r) => ({ poaId, status: 'lawyers_added', count: r.count }),
    );
  }

  /**
   * Avukat baglama govdesi — yetki KARARI YOKTUR (D-4: karar+audit cagiran giriste: create/update/addLawyers).
   *
   * @remarks Çağrıldığı yerler: PoaService.createUnchecked / updateUnchecked / addLawyers.
   * CBND-2 (H6): poaId tenant doğrulaması removeLawyer ile AYNI desende (findOne → Yetki
   * kontrolü). Önceden yalnız lawyerIds tenant-doğrulanıyordu; poaId doğrulanmadan poaLawyer.createMany
   * çalıştırılıyordu → cross-tenant poaId (tahmin/sızma ile ele geçirilmiş cuid) ile yabancı tenant'ın
   * vekaletine yazılabiliyordu (ilk eklenen isPrimary:true → hedef POA'nın mevcut primary'siyle çift-
   * primary bozulması + findOne include ile yabancı avukat adı/baro no görünürlüğü). İç çağıranlar
   * (create() satır ~220, update() satır ~252) zaten aynı tenant'a ait id kullanıyor — bu guard onlar
   * için no-op (fazladan bir tenant-scoped sorgu, davranış değişmez).
   */
  private async linkLawyers(poaId: string, lawyerIds: string[], tenantId: string) {
    await this.findOne(poaId, tenantId); // Yetki kontrolü (removeLawyer ile aynı desen)

    // Avukatların varlığını kontrol et
    const lawyers = await this.prisma.lawyer.findMany({
      where: { id: { in: lawyerIds }, tenantId },
    });

    if (lawyers.length !== lawyerIds.length) {
      throw new BadRequestException("Bazı avukatlar bulunamadı");
    }

    // İlk avukat primary olsun
    // UYAP-POA-TENANT-SAFETY-I01: tenantId zorunlu; composite FK POA ve Lawyer'ı aynı tenant'a kilitler.
    const data = lawyerIds.map((lawyerId, index) => ({
      tenantId,
      poaId,
      lawyerId,
      isPrimary: index === 0,
    }));

    await this.prisma.poaLawyer.createMany({ data });

    return { success: true, count: lawyerIds.length };
  }

  /**
   * PR-2 suppress yolu için avukat reconcile (Fix E). Suppress edilen MEVCUT POA'ya,
   * taramadan gelen lawyerIds'ten EKSİK olanları idempotent + tenant-güvenli ekler.
   *
   * Çağrıldığı yerler:
   * - PoaService.create() → PR-2 duplicate-suppress dalı (TEK çağıran).
   *
   * Neden: Fix B sonrası tarama akışı lawyerIds gönderiyor; eski suppress yolu bunları
   * DÜŞÜRÜYORDU → reactivate edilen müvekkilde aktif POA avukatsız kalıyordu. addLawyers
   * DEĞİŞTİRİLMEDEN ayrı, idempotent yol.
   *
   * Idempotency: mevcut PoaLawyer ile filtre + createMany skipDuplicates (@@unique[poaId,lawyerId]).
   * Multitenant: yalnız tenant'a ait avukatlar eklenir (cross-tenant/invalid FİLTRELENİR, throw YOK
   * → suppress başarı yolu patlamaz). lawyerIds boş/undefined → NO-OP.
   */
  private async reconcileSuppressedLawyers(
    poaId: string,
    lawyerIds: string[] | undefined,
    tenantId: string,
  ): Promise<void> {
    if (!lawyerIds || lawyerIds.length === 0) return; // boş → no-op

    // Mevcut bağlar (filtre + primary kararı için tek sorgu)
    const existingLinks = await this.prisma.poaLawyer.findMany({
      where: { poaId },
      select: { lawyerId: true, isPrimary: true },
    });
    const linked = new Set(existingLinks.map((l) => l.lawyerId));

    // Eksik + benzersiz adaylar
    const candidateIds = [...new Set(lawyerIds)].filter((id) => !linked.has(id));
    if (candidateIds.length === 0) return; // hepsi zaten bağlı → no-op

    // Multitenant guard: yalnız bu tenant'a ait avukatlar (cross-tenant/invalid FİLTRELENİR)
    const validLawyers = await this.prisma.lawyer.findMany({
      where: { id: { in: candidateIds }, tenantId },
      select: { id: true },
    });
    if (validLawyers.length === 0) return;

    // POA'da primary yoksa ilk eklenen primary olsun; varsa yeni primary OLMASIN
    const hasPrimaryAlready = existingLinks.some((l) => l.isPrimary);
    // UYAP-POA-TENANT-SAFETY-I01: tenantId zorunlu (validLawyers zaten tenant-scoped sorgudan gelir).
    const data = validLawyers.map((l, index) => ({
      tenantId,
      poaId,
      lawyerId: l.id,
      isPrimary: !hasPrimaryAlready && index === 0,
    }));

    await this.prisma.poaLawyer.createMany({ data, skipDuplicates: true });
    this.logger.log(
      `[Fix E] suppress reconcile → POA ${poaId}: ${data.length} avukat bağı eklendi (idempotent)`,
    );
  }

  /**
   * Vekaletten avukat cikar — D-4: yetki + audit SERVIS GIRISINDE (`POA_LAWYER_REMOVE`).
   *
   * @remarks Çağrıldığı yerler:
   * - PoaController.removeLawyer() -> DELETE /poa/:id/lawyers/:lawyerId
   */
  async removeLawyer(poaId: string, lawyerId: string, tenantId: string, actor: ClientWorkspaceCommandActor) {
    const poa = await this.findOne(poaId, tenantId); // Yetki kontrolü (tenant) + audit icin clientId
    return runAuthorizedClientWorkspaceCommand(
      this.workspaceCommandDeps(),
      actor,
      { tenantId, clientId: poa.clientId, commandType: CLIENT_WORKSPACE_COMMAND.POA_LAWYER_REMOVE },
      async () => {
        const { count } = await this.prisma.poaLawyer.deleteMany({ where: { poaId, lawyerId } });
        return { success: true as const, removed: count };
      },
      (r) => ({ poaId, status: 'lawyer_removed', removed: r.removed }),
    );
  }

  /**
   * Müvekkil + Avukat için geçerli vekalet kontrolü
   */
  async checkValidPoa(clientId: string, lawyerId: string, tenantId: string): Promise<PoaValidationResult> {
    const now = new Date();

    const validPoa = await this.prisma.clientPowerOfAttorney.findFirst({
      where: {
        clientId,
        client: { tenantId },
        status: PoaStatus.ACTIVE,
        isActive: true,
        lawyers: {
          some: { lawyerId },
        },
        OR: [
          { isLimited: false },
          {
            isLimited: true,
            validUntil: { gte: now },
          },
        ],
      },
      include: {
        lawyers: {
          include: {
            lawyer: {
              select: { id: true, name: true, surname: true },
            },
          },
        },
      },
    });

    if (!validPoa) {
      return {
        isValid: false,
        message: "Geçerli vekalet bulunamadı",
      };
    }

    // Kalan gün hesapla
    let daysRemaining: number | undefined;
    if (validPoa.isLimited && validPoa.validUntil) {
      const diffTime = validPoa.validUntil.getTime() - now.getTime();
      daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    return {
      isValid: true,
      poa: validPoa,
      daysRemaining,
      message: daysRemaining !== undefined && daysRemaining <= 30
        ? `Vekalet ${daysRemaining} gün içinde sona erecek`
        : undefined,
    };
  }

  /**
   * Müvekkil + Birden fazla avukat için geçerli vekalet kontrolü
   * Seçili avukatlardan herhangi birine verilmiş vekalet varsa geçerli sayılır
   */
  async checkValidPoaForLawyers(clientId: string, lawyerIds: string[], tenantId: string): Promise<PoaValidationResult> {
    const now = new Date();

    // Seçili avukatlardan herhangi birine verilmiş geçerli vekalet var mı?
    const validPoa = await this.prisma.clientPowerOfAttorney.findFirst({
      where: {
        clientId,
        client: { tenantId },
        status: PoaStatus.ACTIVE,
        isActive: true,
        lawyers: {
          some: { lawyerId: { in: lawyerIds } },
        },
        OR: [
          { isLimited: false },
          {
            isLimited: true,
            validUntil: { gte: now },
          },
        ],
      },
      include: {
        lawyers: {
          include: {
            lawyer: {
              select: { id: true, name: true, surname: true },
            },
          },
        },
      },
    });

    if (!validPoa) {
      return {
        isValid: false,
        message: "Seçili avukatlardan hiçbirine verilmiş geçerli vekalet bulunamadı",
      };
    }

    // Kalan gün hesapla
    let daysRemaining: number | undefined;
    if (validPoa.isLimited && validPoa.validUntil) {
      const diffTime = validPoa.validUntil.getTime() - now.getTime();
      daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    // Vekalette hangi avukatlar var
    const poaLawyerIds = validPoa.lawyers.map(l => l.lawyerId);
    const matchedLawyers = validPoa.lawyers
      .filter(l => lawyerIds.includes(l.lawyerId))
      .map(l => `${l.lawyer.name} ${l.lawyer.surname}`);

    return {
      isValid: true,
      poa: validPoa,
      daysRemaining,
      message: daysRemaining !== undefined && daysRemaining <= 30
        ? `Vekalet ${daysRemaining} gün içinde sona erecek (${matchedLawyers.join(", ")})`
        : `Geçerli vekalet var (${matchedLawyers.join(", ")})`,
    };
  }

  /**
   * Süresi dolmak üzere olan vekaletleri getir
   */
  async getExpiringPoas(tenantId: string, days: number = 30) {
    const now = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    return this.prisma.clientPowerOfAttorney.findMany({
      where: {
        client: { tenantId },
        isLimited: true,
        status: PoaStatus.ACTIVE,
        validUntil: {
          gte: now,
          lte: futureDate,
        },
      },
      include: {
        client: { select: { id: true, displayName: true } },
        lawyers: {
          include: {
            lawyer: {
              select: { id: true, name: true, surname: true },
            },
          },
        },
      },
      orderBy: { validUntil: "asc" },
    });
  }

  /**
   * Süresi dolan vekaletleri EXPIRED olarak işaretle (Cron job için)
   */
  async updateExpiredPoas() {
    const now = new Date();

    const result = await this.prisma.clientPowerOfAttorney.updateMany({
      where: {
        isLimited: true,
        status: PoaStatus.ACTIVE,
        validUntil: { lt: now },
      },
      data: {
        status: PoaStatus.EXPIRED,
      },
    });

    if (result.count > 0) {
      this.logger.log(`${result.count} vekalet süresi dolmuş olarak işaretlendi`);
    }

    return result;
  }

  /**
   * Vekalete dosya yükle — OWN-13 I02-R6 (owner §13/11 eşiği) SERVİS-GİRİŞ kapısı.
   *
   * Legacy rota (`POST /poa/:id/upload`) yalnız JwtAuthGuard taşıyordu: VIEWER ve
   * elevated olmayan USER vekalet dosyasını yükleyip mevcut dosyayı DEĞİŞTİREBİLİYORDU,
   * AuditLog YOKTU. Yetki artık burada, GERÇEK yan etkiden (dosya yazımı + DB update) ÖNCE:
   *  - `actor` ZORUNLU: actor geçirmeyen üretim çağrısı DERLENMEZ (OWN-13 R1 deseni),
   *  - eşik C2-B02 ile AYNI frozen primitive (`runAuthorizedClientWorkspaceCommand`,
   *    komut tipi `POA_FILE_UPLOAD`): ADMIN VEYA canonical elevated
   *    (`officeApproval.isApproverEligible`); VIEWER/tanımsız rol fail-closed; cross-tenant
   *    aktör TENANT_MISMATCH; `isApproverEligible` yalnız gerektiğinde sorgulanır,
   *  - başarılı yükleme `CLIENT_WORKSPACE_COMMAND` AuditLog üretir (poaId + status; dosya
   *    adı/yolu ve ham PII metadata'ya YAZILMAZ); yetkisiz aktörde hiçbir yazma ve audit
   *    OLUŞMAZ; persist hata verirse audit ÜRETİLMEZ.
   * Workspace rotası (`POST /clients/:clientId/poas/:poaId/file`) AYNI primitive'i
   * ClientController.uploadPoaFile içinde çalıştırır (C2-B02, sertifikalı); bu yüzden
   * `uploadFileForClientWorkspace` bu kapıdan DEĞİL doğrudan `persistPoaFile`'dan geçer —
   * istek başına tam olarak BİR yetki kararı ve BİR audit kaydı. D-5: yanıt `filePath` TAŞIMAZ
   * (`LegacyPoaUploadResult`).
   *
   * @remarks Çağrıldığı yerler:
   * - PoaController.uploadFile() -> POST /poa/:id/upload
   */
  async uploadFile(
    poaId: string,
    file: Express.Multer.File,
    tenantId: string,
    actor: ClientWorkspaceCommandActor,
  ) {
    // Tenant-scoped okuma (yan etki YOK): audit entityId için clientId gerekir; cross-tenant
    // veya yok → NotFound (mevcut davranış). Yetki kararı hemen ardından, yazımdan ÖNCE gelir.
    const poa = await this.findOne(poaId, tenantId);

    return runAuthorizedClientWorkspaceCommand(
      {
        isApproverEligible: (userId, actorTenantId) =>
          this.officeApproval.isApproverEligible(userId, actorTenantId),
        auditLog: (input) => this.audit.log(input),
      },
      actor,
      { tenantId, clientId: poa.clientId, commandType: CLIENT_WORKSPACE_COMMAND.POA_FILE_UPLOAD },
      async () => {
        // D-5 (owner GO 2026-09-06): legacy yanit sunucu dosya yolunu TASIMAZ. Tek HTTP tuketici
        // (web settings/clients) govdeyi kullanmaz, listeyi yeniden yukler; tip sozlesmesi
        // LegacyPoaUploadResult ile acik.
        const uploaded = await this.persistPoaFile(poaId, file, tenantId);
        const result: LegacyPoaUploadResult = {
          success: true,
          hasFile: true,
          fileSize: uploaded.fileSize ?? null,
          mimeType: uploaded.mimeType ?? null,
        };
        return result;
      },
      () => ({ poaId, status: "uploaded" }),
    );
  }

  /**
   * Vekalet dosyasını fiziksel olarak yazar ve DB'yi günceller — yetki KARARI YOKTUR.
   * PRIVATE: yalnız yetkisi ZATEN verilmiş iki giriş noktasından çağrılır.
   *
   * @remarks Çağrıldığı yerler:
   * - PoaService.uploadFile() (legacy rota; yetki + audit AYNI metotta, bu çağrıdan ÖNCE)
   * - PoaService.uploadFileForClientWorkspace() (workspace rotası; yetki + audit
   *   ClientController.uploadPoaFile'daki C2-B02 primitive'inde)
   */
  private async persistPoaFile(poaId: string, file: Express.Multer.File, tenantId: string) {
    const poa = await this.findOne(poaId, tenantId);

    // Dosya adı oluştur (release DISI data root; bkz. C37 storage sozlesmesi)
    const ext = path.extname(file.originalname);
    const filename = `${poaId}_${Date.now()}${ext}`;
    const filePath = this.storage.filePath("POA_UPLOADS", filename, tenantId);

    // Eski dosyayı sil — yalnizca kova ICINDE ise (containment fail-closed)
    if (poa.filePath) {
      try {
        const previous = this.storage.assertContained("POA_UPLOADS", poa.filePath, tenantId);
        if (fs.existsSync(previous)) {
          fs.unlinkSync(previous);
        }
      } catch (e) {
        this.logger.warn(`Eski dosya silinemedi: ${poa.filePath}`);
      }
    }

    // Yeni dosyayı kaydet
    fs.writeFileSync(filePath, file.buffer);

    // Veritabanını güncelle
    const updated = await this.prisma.clientPowerOfAttorney.update({
      where: { id: poaId },
      data: {
        filePath,
        fileSize: file.size,
        mimeType: file.mimetype,
      },
    });

    this.logger.log(`Vekalet dosyası yüklendi: ${poaId} (${file.originalname})`);

    return {
      success: true,
      filePath: updated.filePath,
      fileSize: updated.fileSize,
      mimeType: updated.mimeType,
    };
  }

  /**
   * Client Workspace POA upload V1 safe wrapper.
   *
   * <remarks>
   * Cagrildigi yerler:
   * - ClientController.uploadPoaFile() -> POST /clients/:clientId/poas/:poaId/file
   * </remarks>
   */
  async uploadFileForClientWorkspace(
    clientId: string,
    poaId: string,
    file: Express.Multer.File,
    tenantId: string,
  ): Promise<ClientWorkspacePoaUploadResult> {
    const poa = await this.prisma.clientPowerOfAttorney.findFirst({
      where: {
        id: poaId,
        clientId,
        client: { id: clientId, tenantId, isActive: true },
      },
      select: { id: true, clientId: true },
    });
    if (!poa) {
      throw new NotFoundException("Vekalet bulunamadi");
    }

    // OWN-13 I02-R6: yetki + audit çağıran ClientController.uploadPoaFile'daki C2-B02
    // primitive'inde — burada İKİNCİ kapı/audit YOK; doğrudan persist adımı.
    const uploaded = await this.persistPoaFile(poaId, file, tenantId);

    return {
      clientId: poa.clientId,
      poaId: poa.id,
      hasFile: true,
      fileSize: uploaded.fileSize ?? null,
      mimeType: uploaded.mimeType ?? null,
    };
  }

  /**
   * Vekalet dosyasını getir
   */
  async getFile(poaId: string, tenantId: string) {
    const poa = await this.findOne(poaId, tenantId);

    if (!poa.filePath || !fs.existsSync(poa.filePath)) {
      throw new NotFoundException("Dosya bulunamadı");
    }

    const buffer = fs.readFileSync(poa.filePath);
    const ext = path.extname(poa.filePath);
    const filename = `vekalet_${poa.journalNo || poa.poaNumber || poaId}${ext}`;

    return {
      buffer,
      mimeType: poa.mimeType || "application/octet-stream",
      filename,
    };
  }

  /**
   * Vekalet dosyasini sil — D-4: yetki + audit SERVIS GIRISINDE (`POA_FILE_DELETE`).
   *
   * @remarks Çağrıldığı yerler:
   * - PoaController.deleteFile() -> DELETE /poa/:id/file
   */
  async deleteFile(poaId: string, tenantId: string, actor: ClientWorkspaceCommandActor) {
    const poa = await this.findOne(poaId, tenantId);
    return runAuthorizedClientWorkspaceCommand(
      this.workspaceCommandDeps(),
      actor,
      { tenantId, clientId: poa.clientId, commandType: CLIENT_WORKSPACE_COMMAND.POA_FILE_DELETE },
      () => this.deleteFileUnchecked(poa, poaId, tenantId),
      () => ({ poaId, status: 'file_deleted' }),
    );
  }

  /** Dosya silme govdesi — yetki KARARI YOKTUR; yalniz `deleteFile()` cagirir. */
  private async deleteFileUnchecked(poa: { filePath: string | null }, poaId: string, tenantId: string) {

    // Veritabaninda saklanan yol GUVENILMEZDIR: silmeden once kova icinde
    // oldugu operasyon aninda dogrulanir (TOCTOU + reparse dahil).
    if (poa.filePath) {
      const target = this.storage.assertContained("POA_UPLOADS", poa.filePath, tenantId);
      if (fs.existsSync(target)) {
        fs.unlinkSync(target);
      }
    }

    await this.prisma.clientPowerOfAttorney.update({
      where: { id: poaId },
      data: {
        filePath: null,
        fileSize: null,
        mimeType: null,
      },
    });

    this.logger.log(`Vekalet dosyası silindi: ${poaId}`);

    return { success: true };
  }
}
