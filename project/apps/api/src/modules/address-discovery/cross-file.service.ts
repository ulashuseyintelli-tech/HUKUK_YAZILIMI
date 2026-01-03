import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

export interface CrossFileMatch {
  caseId: string;
  caseFileNumber: string;
  caseDebtorId: string;
  debtorName: string;
  matchType: 'TCKN' | 'VKN' | 'MERSIS' | 'NAME';
}

export interface CrossFileAddressDto {
  addressId: string;
  street: string;
  city: string;
  district?: string;
  fullText?: string;
  source: string;
  verified: boolean;
  confidenceScore?: number;
  fromCaseId: string;
  fromCaseFileNumber: string;
  lastUsedAt?: Date;
  notificationSuccess?: boolean;
}

@Injectable()
export class CrossFileService {
  private readonly logger = new Logger(CrossFileService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Aynı borçluyu diğer dosyalarda bul (TCKN/VKN bazlı)
   */
  async findSameDebtor(tenantId: string, debtorId: string): Promise<CrossFileMatch[]> {
    const debtor = await this.prisma.debtor.findFirst({
      where: { id: debtorId, tenantId },
      select: {
        id: true,
        name: true,
        tckn: true,
        vkn: true,
        mersisNo: true,
        type: true,
      },
    });

    if (!debtor) {
      throw new NotFoundException('Borçlu bulunamadı');
    }

    const matches: CrossFileMatch[] = [];

    // TCKN ile eşleşme (gerçek kişi)
    if (debtor.tckn) {
      const tcknMatches = await this.prisma.caseDebtor.findMany({
        where: {
          debtor: {
            tenantId,
            tckn: debtor.tckn,
            id: { not: debtorId },
          },
        },
        include: {
          case: { select: { id: true, fileNumber: true } },
          debtor: { select: { name: true } },
        },
      });

      for (const match of tcknMatches) {
        matches.push({
          caseId: match.case.id,
          caseFileNumber: match.case.fileNumber,
          caseDebtorId: match.id,
          debtorName: match.debtor.name,
          matchType: 'TCKN',
        });
      }
    }

    // VKN ile eşleşme (tüzel kişi)
    if (debtor.vkn) {
      const vknMatches = await this.prisma.caseDebtor.findMany({
        where: {
          debtor: {
            tenantId,
            vkn: debtor.vkn,
            id: { not: debtorId },
          },
        },
        include: {
          case: { select: { id: true, fileNumber: true } },
          debtor: { select: { name: true } },
        },
      });

      for (const match of vknMatches) {
        // Duplicate kontrolü
        if (!matches.some(m => m.caseDebtorId === match.id)) {
          matches.push({
            caseId: match.case.id,
            caseFileNumber: match.case.fileNumber,
            caseDebtorId: match.id,
            debtorName: match.debtor.name,
            matchType: 'VKN',
          });
        }
      }
    }

    // MERSİS ile eşleşme
    if (debtor.mersisNo) {
      const mersisMatches = await this.prisma.caseDebtor.findMany({
        where: {
          debtor: {
            tenantId,
            mersisNo: debtor.mersisNo,
            id: { not: debtorId },
          },
        },
        include: {
          case: { select: { id: true, fileNumber: true } },
          debtor: { select: { name: true } },
        },
      });

      for (const match of mersisMatches) {
        if (!matches.some(m => m.caseDebtorId === match.id)) {
          matches.push({
            caseId: match.case.id,
            caseFileNumber: match.case.fileNumber,
            caseDebtorId: match.id,
            debtorName: match.debtor.name,
            matchType: 'MERSIS',
          });
        }
      }
    }

    return matches;
  }

  /**
   * Diğer dosyalardaki adresleri getir
   */
  async getAddressesFromOtherCases(
    tenantId: string,
    debtorId: string,
    currentCaseId: string,
  ): Promise<CrossFileAddressDto[]> {
    // Aynı borçluyu bul
    const matches = await this.findSameDebtor(tenantId, debtorId);
    
    if (matches.length === 0) {
      return [];
    }

    const otherDebtorIds = matches.map(m => m.caseDebtorId);
    
    // Diğer dosyalardaki borçluların adreslerini al
    const otherCaseDebtors = await this.prisma.caseDebtor.findMany({
      where: { id: { in: otherDebtorIds } },
      select: { debtorId: true, caseId: true },
    });

    const debtorIds = [...new Set(otherCaseDebtors.map(cd => cd.debtorId))];

    // Bu borçluların adreslerini al
    const addresses = await this.prisma.debtorAddress.findMany({
      where: {
        debtorId: { in: debtorIds },
      },
      include: {
        debtor: {
          include: {
            caseDebtors: {
              where: { caseId: { not: currentCaseId } },
              include: {
                case: { select: { id: true, fileNumber: true } },
              },
              take: 1,
            },
          },
        },
        serviceHistory: {
          orderBy: { actionDate: 'desc' },
          take: 1,
        },
      },
    });

    // Mevcut dosyadaki adresleri al (duplicate kontrolü için)
    const currentDebtor = await this.prisma.debtor.findUnique({
      where: { id: debtorId },
      include: { debtorAddresses: { select: { street: true, city: true } } },
    });

    const currentAddressKeys = new Set(
      currentDebtor?.debtorAddresses.map(a => `${a.street}-${a.city}`) || []
    );

    // Sonuçları formatla
    const result: CrossFileAddressDto[] = [];

    for (const address of addresses) {
      const addressKey = `${address.street}-${address.city}`;
      
      // Mevcut dosyada zaten varsa atla
      if (currentAddressKeys.has(addressKey)) {
        continue;
      }

      const fromCase = address.debtor.caseDebtors[0]?.case;
      if (!fromCase) continue;

      const lastService = address.serviceHistory[0];

      result.push({
        addressId: address.id,
        street: address.street,
        city: address.city,
        district: address.district || undefined,
        fullText: address.fullText || undefined,
        source: address.source,
        verified: address.verified,
        confidenceScore: address.confidenceScore || undefined,
        fromCaseId: fromCase.id,
        fromCaseFileNumber: fromCase.fileNumber,
        lastUsedAt: lastService?.actionDate,
        notificationSuccess: lastService?.toStatus === 'DELIVERED',
      });
    }

    // Güven skoruna göre sırala
    return result.sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0));
  }

  /**
   * Adresi mevcut dosyaya kopyala
   */
  async copyAddressToCase(
    tenantId: string,
    sourceAddressId: string,
    targetDebtorId: string,
  ): Promise<any> {
    // Kaynak adresi al
    const sourceAddress = await this.prisma.debtorAddress.findUnique({
      where: { id: sourceAddressId },
      include: { debtor: { select: { tenantId: true } } },
    });

    if (!sourceAddress || sourceAddress.debtor.tenantId !== tenantId) {
      throw new NotFoundException('Kaynak adres bulunamadı');
    }

    // Hedef borçluyu doğrula
    const targetDebtor = await this.prisma.debtor.findFirst({
      where: { id: targetDebtorId, tenantId },
    });

    if (!targetDebtor) {
      throw new NotFoundException('Hedef borçlu bulunamadı');
    }

    // Aynı adres zaten var mı kontrol et
    const existingAddress = await this.prisma.debtorAddress.findFirst({
      where: {
        debtorId: targetDebtorId,
        street: sourceAddress.street,
        city: sourceAddress.city,
      },
    });

    if (existingAddress) {
      return {
        success: false,
        message: 'Bu adres zaten mevcut',
        existingAddressId: existingAddress.id,
      };
    }

    // Yeni adres oluştur
    const newAddress = await this.prisma.debtorAddress.create({
      data: {
        debtorId: targetDebtorId,
        type: sourceAddress.type,
        subType: sourceAddress.subType,
        source: 'CROSS_FILE',
        street: sourceAddress.street,
        city: sourceAddress.city,
        district: sourceAddress.district,
        postalCode: sourceAddress.postalCode,
        country: sourceAddress.country,
        fullText: sourceAddress.fullText,
        legalPriority: 'LOW', // Cross-file adresler düşük öncelikli
        verified: false, // Yeni dosyada doğrulanmamış
        isPrimary: false,
        notes: `Dosya ${sourceAddressId} kaynağından kopyalandı`,
        confidenceScore: Math.max((sourceAddress.confidenceScore || 0) - 20, 10), // Skor düşür
      },
    });

    this.logger.log(`Adres kopyalandı: ${sourceAddressId} -> ${newAddress.id}`);

    return {
      success: true,
      newAddressId: newAddress.id,
      address: newAddress,
    };
  }

  /**
   * Başka dosyada farklı adres var mı kontrol et (uyarı için)
   */
  async hasDifferentAddressInOtherCase(
    tenantId: string,
    debtorId: string,
    currentCaseId: string,
  ): Promise<boolean> {
    const otherAddresses = await this.getAddressesFromOtherCases(
      tenantId,
      debtorId,
      currentCaseId,
    );

    return otherAddresses.length > 0;
  }

  /**
   * Cross-file adres sayısını getir (badge için)
   */
  async getCrossFileAddressCount(
    tenantId: string,
    debtorId: string,
    currentCaseId: string,
  ): Promise<number> {
    const addresses = await this.getAddressesFromOtherCases(
      tenantId,
      debtorId,
      currentCaseId,
    );
    return addresses.length;
  }
}
