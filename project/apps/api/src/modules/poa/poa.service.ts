import { Injectable, Logger, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { PoaStatus, PoaScopeType } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

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

export interface UpdatePoaDto extends Partial<CreatePoaDto> {
  status?: PoaStatus;
}

export interface PoaValidationResult {
  isValid: boolean;
  poa?: any;
  message?: string;
  daysRemaining?: number;
}

@Injectable()
export class PoaService {
  private readonly logger = new Logger(PoaService.name);

  constructor(private prisma: PrismaService) {}

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
  async create(dto: CreatePoaDto, tenantId: string) {
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
        client: { connect: { id: dto.clientId } },
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
      await this.addLawyers(poa.id, lawyerIds, tenantId);
    }

    this.logger.log(`Yeni vekalet oluşturuldu: ${poa.id} (Müvekkil: ${client.displayName})`);

    return this.findOne(poa.id, tenantId);
  }

  /**
   * Vekalet güncelle
   */
  async update(id: string, dto: UpdatePoaDto, tenantId: string) {
    const existing = await this.findOne(id, tenantId);

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
        await this.addLawyers(id, lawyerIds, tenantId);
      }
    }

    this.logger.log(`Vekalet güncellendi: ${id}`);

    return this.findOne(id, tenantId);
  }

  /**
   * Vekalet sil
   */
  async delete(id: string, tenantId: string) {
    await this.findOne(id, tenantId); // Yetki kontrolü

    await this.prisma.clientPowerOfAttorney.delete({ where: { id } });

    this.logger.log(`Vekalet silindi: ${id}`);

    return { success: true };
  }

  /**
   * Vekalete avukat ekle
   */
  async addLawyers(poaId: string, lawyerIds: string[], tenantId: string) {
    // Avukatların varlığını kontrol et
    const lawyers = await this.prisma.lawyer.findMany({
      where: { id: { in: lawyerIds }, tenantId },
    });

    if (lawyers.length !== lawyerIds.length) {
      throw new BadRequestException("Bazı avukatlar bulunamadı");
    }

    // İlk avukat primary olsun
    const data = lawyerIds.map((lawyerId, index) => ({
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
    const data = validLawyers.map((l, index) => ({
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
   * Vekaletten avukat çıkar
   */
  async removeLawyer(poaId: string, lawyerId: string, tenantId: string) {
    await this.findOne(poaId, tenantId); // Yetki kontrolü

    await this.prisma.poaLawyer.deleteMany({
      where: { poaId, lawyerId },
    });

    return { success: true };
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
   * Vekalete dosya yükle
   */
  async uploadFile(poaId: string, file: Express.Multer.File, tenantId: string) {
    const poa = await this.findOne(poaId, tenantId);

    // Uploads klasörünü oluştur
    const uploadsDir = path.join(process.cwd(), "data", "uploads", "poa", tenantId);
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    // Dosya adı oluştur
    const ext = path.extname(file.originalname);
    const filename = `${poaId}_${Date.now()}${ext}`;
    const filePath = path.join(uploadsDir, filename);

    // Eski dosyayı sil
    if (poa.filePath && fs.existsSync(poa.filePath)) {
      try {
        fs.unlinkSync(poa.filePath);
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
   * Vekalet dosyasını sil
   */
  async deleteFile(poaId: string, tenantId: string) {
    const poa = await this.findOne(poaId, tenantId);

    if (poa.filePath && fs.existsSync(poa.filePath)) {
      fs.unlinkSync(poa.filePath);
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
