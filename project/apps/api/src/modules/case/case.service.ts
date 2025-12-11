import { Injectable, NotFoundException, ConflictException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { CreateCaseDto, UpdateCaseDto, CaseSubCategory, Currency } from "./dto/case.dto";
import { Prisma, LegalCaseStatus } from "@prisma/client";
import { isInitialStatus } from "../case-status/case-status.service";

@Injectable()
export class CaseService {
  constructor(private prisma: PrismaService) {}

  /**
   * İlamlı Alt Kategori Validasyonları
   * - Nafaka + Döviz aynı anda seçilemez
   * - Döviz seçildiğinde kur tarihi zorunlu
   * - Nafaka seçildiğinde aylık tutar önerilir
   */
  private validateSubCategoryRules(dto: CreateCaseDto) {
    const { subCategory, currency, exchangeDate, nafakaStartDate, monthlyNafakaAmount } = dto;

    // Kural 1: Nafaka + Döviz aynı anda olamaz
    if (subCategory === CaseSubCategory.NAFAKA && currency && currency !== Currency.TRY) {
      throw new BadRequestException(
        "Nafaka alacağı sadece TL cinsinden olabilir. Döviz ve nafaka aynı anda seçilemez."
      );
    }

    // Kural 2: Döviz alacağı seçildiğinde para birimi TRY olamaz
    if (subCategory === CaseSubCategory.DOVIZ && (!currency || currency === Currency.TRY)) {
      throw new BadRequestException(
        "Döviz alacağı seçildiğinde para birimi (USD, EUR, GBP, CHF) belirtilmelidir."
      );
    }

    // Kural 3: Döviz alacağı için kur tarihi zorunlu (uyarı seviyesinde)
    if (subCategory === CaseSubCategory.DOVIZ && !exchangeDate) {
      // Uyarı: Kur tarihi belirtilmedi, fiili ödeme tarihi kullanılacak
      // Bu bir hata değil, sadece bilgi
    }

    // Kural 4: Nafaka için başlangıç tarihi ve aylık tutar önerilir
    if (subCategory === CaseSubCategory.NAFAKA) {
      if (!nafakaStartDate) {
        // Uyarı seviyesinde - zorunlu değil
      }
      if (!monthlyNafakaAmount) {
        // Uyarı seviyesinde - zorunlu değil
      }
    }

    // Kural 5: Alt kategori otomatik belirleme (currency'ye göre)
    // Bu frontend'de yapılacak, backend sadece validasyon yapar
  }

  /**
   * Alt kategoriye göre faiz açıklaması otomatik oluştur
   */
  private generateInterestDescription(subCategory: CaseSubCategory, currency?: Currency): string {
    switch (subCategory) {
      case CaseSubCategory.NAFAKA:
        return "devam eden aylarla birlikte tahsili talebidir.";
      case CaseSubCategory.DOVIZ:
        return "fiili ödeme tarihindeki T.C. Merkez Bankası efektif satış kuru üzerinden Türk Lirası karşılığının tahsili talebidir.";
      case CaseSubCategory.GENEL:
      default:
        return "değişen oranlarda yasal faizi ile birlikte tahsili talebidir.";
    }
  }

  async findAll(tenantId: string, params?: { status?: string; page?: number; limit?: number }) {
    const { status, page = 1, limit = 20 } = params || {};

    const where: any = { tenantId };
    if (status) where.status = status;

    const [cases, total] = await Promise.all([
      this.prisma.case.findMany({
        where,
        include: {
          client: { select: { id: true, name: true } },
          debtors: {
            include: { debtor: { select: { id: true, name: true } } },
          },
          _count: { select: { tasks: true } },
        },
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.case.count({ where }),
    ]);

    return {
      data: cases,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(tenantId: string, id: string) {
    const caseItem = await this.prisma.case.findFirst({
      where: { id, tenantId },
      include: {
        client: true,
        court: true,
        formType: { select: { id: true, name: true, code: true } },
        executionOffice: true,
        debtors: { include: { debtor: true } },
        lawyers: { include: { lawyer: true } },
        tasks: { orderBy: { createdAt: "desc" }, take: 10 },
        collections: { orderBy: { date: "desc" } },
        dues: true,
        lifecycleEvents: { orderBy: { createdAt: "desc" }, take: 20 },
        statusHistory: { 
          orderBy: { createdAt: "desc" }, 
          take: 10,
          include: { changedBy: { select: { name: true, surname: true } } }
        },
        riskReports: { orderBy: { createdAt: "desc" }, take: 1 },
        // Lookup ilişkileri
        takipTuru: { select: { id: true, code: true, name: true } },
        asama: { select: { id: true, code: true, name: true } },
        risk: { select: { id: true, code: true, name: true, color: true } },
        borcluTipi: { select: { id: true, code: true, name: true } },
        durumEtiketi: { select: { id: true, code: true, name: true, color: true } },
        mahiyetTipi: { select: { id: true, code: true, name: true, uyapCode: true } },
        sorumluPersonel: { select: { id: true, name: true, surname: true } },
        groups: { include: { group: { select: { id: true, name: true, color: true } } } },
      },
    });

    if (!caseItem) {
      throw new NotFoundException("Takip bulunamadı");
    }

    // Raporlama özeti oluştur
    const reportingSummary = this.buildReportingSummary(caseItem);

    return {
      ...caseItem,
      reportingSummary,
    };
  }

  /**
   * Raporlama özeti oluştur
   * Format: "Mahiyet / Takip Türü / Risk: X / Durum: Y"
   */
  private buildReportingSummary(caseItem: any): string {
    const parts: string[] = [];

    // Mahiyet Tipi
    if (caseItem.mahiyetTipi?.name) {
      parts.push(caseItem.mahiyetTipi.name);
    }

    // Takip Türü (kısa)
    if (caseItem.takipTuru?.name) {
      // Kısa versiyon: "İlamsız Genel Haciz" -> "İlamsız"
      const shortName = caseItem.takipTuru.name.split(' ')[0];
      parts.push(shortName);
    }

    // Risk
    if (caseItem.risk?.name) {
      parts.push(`Risk: ${caseItem.risk.name}`);
    }

    // Durum Etiketi
    if (caseItem.durumEtiketi?.name) {
      parts.push(`Durum: ${caseItem.durumEtiketi.name}`);
    }

    // Grup sayısı
    const groupCount = caseItem.groups?.length || 0;
    if (groupCount > 0) {
      parts.push(`${groupCount} grup`);
    }

    return parts.length > 0 ? parts.join(' / ') : 'Sınıflandırılmamış';
  }

  async create(tenantId: string, dto: CreateCaseDto) {
    // B.5: Başlangıç statüsü validasyonu
    if (dto.caseStatus && !isInitialStatus(dto.caseStatus as LegalCaseStatus)) {
      throw new BadRequestException(
        `Geçersiz başlangıç statüsü: ${dto.caseStatus}. Sadece DERDEST, ISLEMDE veya DERKENAR seçilebilir.`
      );
    }

    // İlamlı Alt Kategori Validasyonları
    this.validateSubCategoryRules(dto);

    try {
      return await this.prisma.$transaction(async (tx) => {
        // 1. Alacaklı (Client) - mevcut veya yeni
        let clientId: string | undefined;
        if (dto.creditors && dto.creditors.length > 0) {
          const firstCreditor = dto.creditors[0];
          if (firstCreditor.id) {
            // Mevcut client kullan
            clientId = firstCreditor.id;
          } else {
            // Yeni client oluştur
            const client = await tx.client.create({
              data: {
                tenantId,
                type: firstCreditor.type,
                name: firstCreditor.name,
                identityNo: firstCreditor.identityNo,
                taxOffice: firstCreditor.taxOffice,
                phone: firstCreditor.phone,
                email: firstCreditor.email,
                address: firstCreditor.address ? { text: firstCreditor.address } : undefined,
              },
            });
            clientId = client.id;
          }
        }

        // 2. Case oluştur
        const newCase = await tx.case.create({
          data: {
            tenantId,
            fileNumber: dto.fileNumber,
            executionFileNumber: dto.executionFileNumber,
            type: dto.type,
            subType: dto.subType,
            status: dto.status || "ACTIVE",
            // Yeni alanlar
            executionPath: dto.executionPath || "HACIZ",
            caseStatus: dto.caseStatus || "DERDEST",
            caseDate: dto.startDate ? new Date(dto.startDate) : new Date(),
            executionOfficeId: dto.executionOfficeId,
            uyapBirimKodu: dto.uyapBirimKodu,
            hasUyapWarning: !dto.uyapBirimKodu,
            hasArticle4Request: dto.hasArticle4Request || false,
            isAutomationEnabled: true,
            // Alt Kategori ve Para Birimi (UYAP Uyumlu)
            subCategory: dto.subCategory || "GENEL",
            currency: dto.currency || "TRY",
            // MTS Bilgileri
            isMtsCase: dto.isMtsCase || false,
            mtsReferenceNo: dto.mtsReferenceNo,
            // Faiz Bilgileri
            interestType: dto.interestType || "YASAL",
            interestStartDate: dto.interestStartDate ? new Date(dto.interestStartDate) : undefined,
            interestDescription: dto.interestDescription || this.generateInterestDescription(
              (dto.subCategory as CaseSubCategory) || CaseSubCategory.GENEL,
              dto.currency as Currency
            ),
            // Döviz Bilgileri (Prisma generate sonrası aktif olacak)
            ...(dto.exchangeDate && { exchangeDate: new Date(dto.exchangeDate) }),
            ...(dto.exchangeRateType && { exchangeRateType: dto.exchangeRateType }),
            ...(!dto.exchangeRateType && dto.subCategory === "DOVIZ" && { exchangeRateType: "ODEME_TARIHI" }),
            // Nafaka Bilgileri
            ...(dto.nafakaStartDate && { nafakaStartDate: new Date(dto.nafakaStartDate) }),
            ...(dto.monthlyNafakaAmount && { monthlyNafakaAmount: dto.monthlyNafakaAmount }),
            // OCR / Belge Tarama Bilgileri
            ...(dto.preDetectedCaseType && { preDetectedCaseType: dto.preDetectedCaseType }),
            ...(dto.preDetectedSubCategory && { preDetectedSubCategory: dto.preDetectedSubCategory }),
            ...(dto.ocrText && { ocrText: dto.ocrText.substring(0, 2000) }), // İlk 2000 karakter
            ...(dto.isAutoDetected !== undefined && { isAutoDetected: dto.isAutoDetected }),
            ...(dto.confidenceScore !== undefined && { confidenceScore: dto.confidenceScore }),
            ...(dto.sourceDocumentId && { sourceDocumentId: dto.sourceDocumentId }),
            ...(dto.detectionKeywords && { detectionKeywords: dto.detectionKeywords }),
            // Eski alanlar
            clientId,
            courtId: dto.courtId,
            principalAmount: dto.principalAmount,
            interestRate: dto.interestRate,
            startDate: dto.startDate ? new Date(dto.startDate) : undefined,
            notes: dto.notes,
          },
        });

        // 3. Avukatları - mevcut veya yeni
        if (dto.lawyers && dto.lawyers.length > 0) {
          for (const lawyerDto of dto.lawyers) {
            let lawyerId: string;
            if (lawyerDto.id) {
              // Mevcut avukat kullan
              lawyerId = lawyerDto.id;
            } else {
              // Yeni avukat oluştur
              const lawyer = await tx.lawyer.create({
                data: {
                  tenantId,
                  name: lawyerDto.name,
                  surname: lawyerDto.surname,
                  barNumber: lawyerDto.barNumber,
                },
              });
              lawyerId = lawyer.id;
            }

            await tx.caseLawyer.create({
              data: {
                caseId: newCase.id,
                lawyerId,
                canSign: lawyerDto.canSign || false,
              },
            });
          }
        }

        // 4. Borçluları - mevcut veya yeni
        if (dto.debtors && dto.debtors.length > 0) {
          for (const debtorDto of dto.debtors) {
            let debtorId: string;
            if (debtorDto.id) {
              // Mevcut borçlu kullan
              debtorId = debtorDto.id;
            } else {
              // Yeni borçlu oluştur
              const debtor = await tx.debtor.create({
                data: {
                  tenantId,
                  type: debtorDto.type,
                  name: debtorDto.name,
                  identityNo: debtorDto.identityNo,
                  taxOffice: debtorDto.taxOffice,
                  phone: debtorDto.phone,
                  email: debtorDto.email,
                  addresses: debtorDto.address ? { primary: debtorDto.address } : undefined,
                },
              });
              debtorId = debtor.id;
            }

            await tx.caseDebtor.create({
              data: {
                caseId: newCase.id,
                debtorId,
                role: "DEBTOR",
              },
            });
          }
        }

        // 5. Alacak Kalemleri (Dues)
        if (dto.dues && dto.dues.length > 0) {
          for (const dueDto of dto.dues) {
            await tx.due.create({
              data: {
                caseId: newCase.id,
                type: dueDto.type,
                description: dueDto.description,
                amount: dueDto.amount,
                dueDate: new Date(dueDto.dueDate),
              },
            });
          }

          // Ana para toplamını hesapla ve case'e yaz
          const principalDues = dto.dues.filter(d => d.type === 'PRINCIPAL');
          if (principalDues.length > 0) {
            const totalPrincipal = principalDues.reduce((sum, d) => sum + d.amount, 0);
            await tx.case.update({
              where: { id: newCase.id },
              data: { principalAmount: totalPrincipal },
            });
          }
        }

        // 6. Tam case'i döndür
        return tx.case.findUnique({
          where: { id: newCase.id },
          include: {
            client: { select: { id: true, name: true } },
            debtors: {
              include: { debtor: { select: { id: true, name: true } } },
            },
            lawyers: {
              include: { lawyer: { select: { id: true, name: true, surname: true } } },
            },
            dues: true,
          },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") {
          throw new ConflictException(`Bu dosya numarası (${dto.fileNumber}) zaten kullanılıyor`);
        }
      }
      throw error;
    }
  }

  async update(tenantId: string, id: string, dto: UpdateCaseDto) {
    await this.findOne(tenantId, id);

    // Boş string'leri undefined'a çevir
    const data: any = { ...dto };
    if (data.startDate === "" || data.startDate === null) {
      data.startDate = undefined;
    } else if (data.startDate) {
      data.startDate = new Date(data.startDate);
    }

    // Boş string'leri temizle
    Object.keys(data).forEach((key) => {
      if (data[key] === "") {
        data[key] = undefined;
      }
    });

    return this.prisma.case.update({
      where: { id },
      data,
    });
  }

  async delete(tenantId: string, id: string) {
    await this.findOne(tenantId, id);

    return this.prisma.case.delete({
      where: { id },
    });
  }

  async getStats(tenantId: string) {
    const [total, active, closed, thisMonth] = await Promise.all([
      this.prisma.case.count({ where: { tenantId } }),
      this.prisma.case.count({ where: { tenantId, status: "ACTIVE" } }),
      this.prisma.case.count({ where: { tenantId, status: "CLOSED" } }),
      this.prisma.case.count({
        where: {
          tenantId,
          createdAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        },
      }),
    ]);

    return { total, active, closed, thisMonth };
  }

  // Sıradaki dosya numarasını al
  async getNextFileNumber(tenantId: string): Promise<string> {
    const currentYear = new Date().getFullYear();
    
    // Bu yıla ait en son dosya numarasını bul
    const lastCase = await this.prisma.case.findFirst({
      where: {
        tenantId,
        fileNumber: {
          startsWith: `${currentYear}/`,
        },
      },
      orderBy: { fileNumber: 'desc' },
      select: { fileNumber: true },
    });

    let nextNumber = 1;
    if (lastCase?.fileNumber) {
      // Format: 2025/1234
      const parts = lastCase.fileNumber.split('/');
      if (parts.length === 2) {
        const lastNumber = parseInt(parts[1], 10);
        if (!isNaN(lastNumber)) {
          nextNumber = lastNumber + 1;
        }
      }
    }

    return `${currentYear}/${nextNumber}`;
  }

  // Dosya flag'lerini güncelle (K.47-50)
  async patchFlags(tenantId: string, id: string, dto: Partial<UpdateCaseDto>) {
    await this.findOne(tenantId, id);

    // Sadece izin verilen flag'leri güncelle
    const allowedFlags = [
      'isArchived',
      'showToClient',
      'allowUyapActions',
      'hasArticle4Request',
      'isAutomationEnabled',
      'automationConfig',
    ];

    const data: any = {};
    for (const key of allowedFlags) {
      if (dto[key as keyof typeof dto] !== undefined) {
        data[key] = dto[key as keyof typeof dto];
      }
    }

    return this.prisma.case.update({
      where: { id },
      data,
    });
  }

  // Toplu güncelleme (Batch Update)
  async batchUpdate(
    tenantId: string,
    caseIds: string[],
    updates: {
      riskId?: string | null;
      durumEtiketiId?: string | null;
      sorumluPersonelId?: string | null;
      takipTuruId?: string | null;
      mahiyetTipiId?: string | null;
    },
  ) {
    // Sadece bu tenant'a ait dosyaları güncelle
    const result = await this.prisma.case.updateMany({
      where: {
        id: { in: caseIds },
        tenantId,
      },
      data: {
        ...(updates.riskId !== undefined && { riskId: updates.riskId }),
        ...(updates.durumEtiketiId !== undefined && { durumEtiketiId: updates.durumEtiketiId }),
        ...(updates.sorumluPersonelId !== undefined && { sorumluPersonelId: updates.sorumluPersonelId }),
        ...(updates.takipTuruId !== undefined && { takipTuruId: updates.takipTuruId }),
        ...(updates.mahiyetTipiId !== undefined && { mahiyetTipiId: updates.mahiyetTipiId }),
      },
    });

    return { updatedCount: result.count };
  }
}
