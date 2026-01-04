import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import {
  UyapETakipDosyasi,
  UyapTakipTalebi,
  UyapTaraf,
  UyapVekil,
  UyapKisi,
  UyapAdres,
  UyapAlacakKalemi,
  UyapCekBilgisi,
  UyapSenetBilgisi,
  UyapTarafRolu,
  UyapDosyaTuru,
  UyapTakipTuru,
  UyapTakipYolu,
  UyapAlacakTuru,
} from './uyap-xml.types';
import {
  Client,
  Debtor,
  Due,
  CaseType,
  ExecutionPath,
  DebtorRole,
  DueType,
  Lawyer,
} from '@prisma/client';

// ClaimItem tipi (schema'da varsa)
interface ClaimItemWithInstrument {
  id: string;
  instrumentType: string;
  serialNo?: string | null;
  bankName?: string | null;
  branchName?: string | null;
  issueDate?: Date | null;
  presentmentDate?: Date | null;
  maturityDate?: Date | null;
  issuePlace?: string | null;
  paymentPlace?: string | null;
  amount: any; // Decimal
  currency: string;
}

/**
 * Case verilerini UYAP XML formatına dönüştürür
 */
@Injectable()
export class UyapCaseMapperService {
  constructor(private prisma: PrismaService) {}

  /**
   * Tek bir case'i UYAP takip talebine dönüştür
   */
  async mapCaseToTakipTalebi(caseId: string): Promise<UyapTakipTalebi> {
    const caseData = await this.prisma.case.findUnique({
      where: { id: caseId },
      include: {
        caseClients: { include: { client: true } },
        debtors: { include: { debtor: true } },
        lawyers: { include: { lawyer: true } },
        claimItems: true,
        dues: true,
      },
    });

    if (!caseData) throw new Error('Case bulunamadı');

    // Tarafları oluştur
    const taraflar: UyapTaraf[] = [];

    // Alacaklı (müvekkil) - caseClients üzerinden
    for (const cc of caseData.caseClients) {
      if (cc.client) {
        taraflar.push(this.mapClientToTaraf(cc.client, 'ALACAKLI'));
      }
    }

    // Borçlular
    for (const cd of caseData.debtors) {
      const rol = this.mapDebtorRole(cd.role);
      taraflar.push(this.mapDebtorToTaraf(cd.debtor, rol));
    }

    // Alacak kalemleri
    const alacakKalemleri = this.mapDuesToAlacakKalemleri(caseData.dues);

    // Çek/Senet bilgileri - claimItems üzerinden
    const cekler: UyapCekBilgisi[] = [];
    const senetler: UyapSenetBilgisi[] = [];

    // claimItems varsa ve instrumentType alanı varsa işle
    if (caseData.claimItems && caseData.claimItems.length > 0) {
      for (const item of caseData.claimItems) {
        const inst = item as any; // Type safety için any kullan
        if (inst.instrumentType === 'CHECK') {
          cekler.push(this.mapInstrumentToCek(inst as ClaimItemWithInstrument, alacakKalemleri));
        } else if (inst.instrumentType === 'BOND') {
          senetler.push(this.mapInstrumentToSenet(inst as ClaimItemWithInstrument, alacakKalemleri));
        }
      }
    }

    // Takip talebi oluştur
    const takipTalebi: UyapTakipTalebi = {
      dosyaBelirleyici: caseData.fileNumber,
      dosyaTuru: this.mapDosyaTuru(caseData.type),
      takipTuru: this.mapTakipTuru(caseData.type, caseData.subType),
      takipYolu: this.mapTakipYolu(caseData.executionPath),
      takipSekli: caseData.type?.includes('ILAMLI') ? 'ILAMLI' : 'ILAMSIZ',
      madde48_4Aciklama: this.generate48_4Aciklama(alacakKalemleri),
      madde48_9Aciklama: caseData.notes || undefined,
      bk84Uygula: false,
      bsmvUygula: false,
      kkdfUygula: false,
      taraflar,
      cekler: cekler.length > 0 ? cekler : undefined,
      senetler: senetler.length > 0 ? senetler : undefined,
    };

    return takipTalebi;
  }

  /**
   * Birden fazla case'i tek bir e-takip dosyasına dönüştür
   */
  async mapCasesToETakipDosyasi(
    caseIds: string[],
    tenantId: string
  ): Promise<UyapETakipDosyasi> {
    const takipTalepleri: UyapTakipTalebi[] = [];

    for (const caseId of caseIds) {
      const talep = await this.mapCaseToTakipTalebi(caseId);
      takipTalepleri.push(talep);
    }

    // Ortak vekilleri topla
    const ortakVekiller = await this.getOrtakVekiller(tenantId);

    return {
      versiyon: '1.0',
      olusturmaTarihi: new Date().toISOString(),
      olusturanSistem: 'HukukPlatform',
      ortakVekiller,
      takipTalepleri,
    };
  }

  // ==========================================
  // TARAF MAPPER'LAR
  // ==========================================

  /**
   * Client'ı UYAP Taraf formatına dönüştür
   */
  private mapClientToTaraf(client: Client, rol: UyapTarafRolu): UyapTaraf {
    const kisi: UyapKisi = {
      kimlikNo: client.tckn || client.vkn || '',
      kisiTipi: client.type === 'INDIVIDUAL' ? 'GERCEK_KISI' : 'TUZEL_KISI',
    };

    if (client.type === 'INDIVIDUAL') {
      kisi.ad = client.firstName || '';
      kisi.soyad = client.lastName || '';
    } else {
      kisi.unvan = client.companyName || client.displayName || '';
    }

    // Adres
    if (client.address) {
      kisi.adres = {
        il: client.city || '',
        ilce: client.district || '',
        tamAdres: client.address,
      };
    }

    kisi.telefon = client.phone || undefined;
    kisi.email = client.email || undefined;

    return { kisi, rol };
  }

  /**
   * Debtor'u UYAP Taraf formatına dönüştür
   */
  private mapDebtorToTaraf(debtor: Debtor, rol: UyapTarafRolu): UyapTaraf {
    const kisi: UyapKisi = {
      kimlikNo: debtor.tckn || debtor.vkn || debtor.identityNo || '',
      kisiTipi: debtor.type === 'INDIVIDUAL' ? 'GERCEK_KISI' : 'TUZEL_KISI',
    };

    if (debtor.type === 'INDIVIDUAL') {
      kisi.ad = debtor.firstName || '';
      kisi.soyad = debtor.lastName || '';
      kisi.babaAdi = debtor.fatherName || undefined;
      kisi.anneAdi = debtor.motherName || undefined;
      kisi.dogumTarihi = debtor.birthDate?.toISOString().split('T')[0];
      kisi.dogumYeri = debtor.birthPlace || undefined;
    } else if (debtor.type === 'COMPANY') {
      kisi.unvan = debtor.companyName || debtor.name || '';
    } else if (debtor.type === 'PUBLIC_INSTITUTION') {
      kisi.unvan = debtor.institutionName || debtor.name || '';
    } else if (debtor.type === 'ESTATE') {
      // Tereke - murisin bilgileri
      kisi.unvan = `${debtor.deceasedName || debtor.name} Tereke`;
    }

    kisi.telefon = debtor.phone || undefined;
    kisi.email = debtor.email || undefined;

    return { kisi, rol };
  }

  /**
   * DebtorRole'u UYAP TarafRolu'na dönüştür
   */
  private mapDebtorRole(role: DebtorRole): UyapTarafRolu {
    const roleMap: Partial<Record<DebtorRole, UyapTarafRolu>> = {
      ASIL_BORCLU: 'BORCLU',
      MUSETEREK_BORCLU: 'BORCLU',
      ADI_KEFIL: 'KEFIL',
      MUTESELSIL_KEFIL: 'KEFIL',
      AVAL: 'BORCLU',
      CIRANTA: 'BORCLU',
      LEHDAR: 'BORCLU',
      KESIDECI: 'BORCLU',
      MUHATAP: 'BORCLU',
      MIRASCI: 'BORCLU',
      TASFIYE_MEMURU: 'BORCLU',
      IFLAS_MASASI: 'BORCLU',
    };
    return roleMap[role] || 'BORCLU';
  }

  // ==========================================
  // ALACAK KALEMİ MAPPER'LAR
  // ==========================================

  /**
   * Due listesini UYAP AlacakKalemi formatına dönüştür
   */
  private mapDuesToAlacakKalemleri(dues: Due[]): UyapAlacakKalemi[] {
    return dues.map((due) => {
      const kalem: UyapAlacakKalemi = {
        tur: this.mapDueType(due.type),
        aciklama: due.description || this.getDueTypeDescription(due.type),
        tutar: Number(due.amount),
        paraBirimi: this.mapCurrency(due.currency),
      };

      // Faiz bilgisi ekle
      if (due.interestType && due.interestStartDate) {
        kalem.faiz = {
          baslangicTarihi: due.interestStartDate.toISOString().split('T')[0],
          faizTuruKodu: this.mapInterestTypeToCode(due.interestType),
          faizTuruAciklama: this.getInterestTypeDescription(due.interestType),
          faizOrani: due.interestRate ? Number(due.interestRate) : undefined,
          faizSureTipi: 'YILLIK',
        };
      }

      return kalem;
    });
  }

  /**
   * DueType'ı UYAP AlacakTuru'na dönüştür
   */
  private mapDueType(type: DueType): UyapAlacakTuru {
    const typeMap: Partial<Record<DueType, UyapAlacakTuru>> = {
      PRINCIPAL: 'ASIL_ALACAK',
      INTEREST: 'FAIZ',
      EXPENSE: 'DIGER',
      VEKALET_UCRETI: 'VEKALET_UCRETI',
      HARC: 'DIGER',
      TAZMINAT: 'DIGER',
      CEZAI_SART: 'DIGER',
      NAFAKA: 'ASIL_ALACAK',
      KIRA: 'ASIL_ALACAK',
      AIDAT: 'ASIL_ALACAK',
      KOMISYON: 'DIGER',
      PRIM: 'DIGER',
      OTHER: 'DIGER',
    };
    return typeMap[type] || 'DIGER';
  }

  /**
   * DueType için Türkçe açıklama
   */
  private getDueTypeDescription(type: DueType): string {
    const descMap: Partial<Record<DueType, string>> = {
      PRINCIPAL: 'Asıl Alacak',
      INTEREST: 'İşlemiş Faiz',
      EXPENSE: 'Masraf',
      VEKALET_UCRETI: 'Vekalet Ücreti',
      HARC: 'Harç',
      TAZMINAT: 'Tazminat',
      CEZAI_SART: 'Cezai Şart',
      NAFAKA: 'Nafaka',
      KIRA: 'Kira Alacağı',
      AIDAT: 'Aidat',
      KOMISYON: 'Komisyon',
      PRIM: 'Prim/İkramiye',
      OTHER: 'Diğer',
    };
    return descMap[type] || 'Diğer';
  }

  /**
   * Para birimini UYAP formatına dönüştür
   */
  private mapCurrency(currency: string): 'TRY' | 'USD' | 'EUR' | 'GBP' | 'CHF' {
    const validCurrencies = ['TRY', 'USD', 'EUR', 'GBP', 'CHF'];
    return validCurrencies.includes(currency) 
      ? (currency as 'TRY' | 'USD' | 'EUR' | 'GBP' | 'CHF') 
      : 'TRY';
  }

  /**
   * Faiz türünü UYAP koduna dönüştür
   */
  private mapInterestTypeToCode(interestType: string): string {
    const codeMap: Record<string, string> = {
      YASAL: 'FAIZT00002',
      TICARI: 'FAIZT00017',
      AVANS: 'FAIZT00007',
      TEMERRUT: 'FAIZT00002',
      BANKA_MEVDUAT: 'FAIZT00011',
      KAMU_BANKASI: 'FAIZT00026',
      KREDI_KARTI_AKDI: 'FAIZT00018',
      KREDI_KARTI_GECIKME: 'FAIZT00021',
      REESKONT: 'FAIZT00001',
      OZEL: 'FAIZT00003',
    };
    return codeMap[interestType] || 'FAIZT00003';
  }

  /**
   * Faiz türü açıklaması
   */
  private getInterestTypeDescription(interestType: string): string {
    const descMap: Record<string, string> = {
      YASAL: 'Adi Kanuni Faiz',
      TICARI: 'TTK 1530. Madde Temerrüt Faizi',
      AVANS: 'Reeskont Avans',
      TEMERRUT: 'Adi Kanuni Faiz',
      BANKA_MEVDUAT: 'Bankalarca 1 Yıla Kadar Vadeli Mevduatlara Fiilen Uygulanan Azami Faiz (TL)',
      KAMU_BANKASI: 'Kamu Bankalarınca 1 Yıla Kadar Vadeli Mevduatlara Fiilen Uygulanan Azami Faiz (TL)',
      KREDI_KARTI_AKDI: 'Kredi Kartı Azami Akdi Faizi (Türk Lirası)',
      KREDI_KARTI_GECIKME: 'Kredi Kartı Azami Gecikme Faizi (Türk Lirası)',
      REESKONT: 'Reeskont İskonto',
      OZEL: 'Diğer',
    };
    return descMap[interestType] || 'Diğer';
  }

  // ==========================================
  // ÇEK / SENET MAPPER'LAR
  // ==========================================

  /**
   * ClaimItem'ı UYAP Çek formatına dönüştür
   */
  private mapInstrumentToCek(
    inst: ClaimItemWithInstrument,
    alacakKalemleri: UyapAlacakKalemi[]
  ): UyapCekBilgisi {
    return {
      seriNo: inst.serialNo || '',
      bankaAdi: inst.bankName || '',
      subeAdi: inst.branchName || undefined,
      kesideTarihi: inst.issueDate?.toISOString().split('T')[0] || '',
      ibrazTarihi: inst.presentmentDate?.toISOString().split('T')[0],
      tutar: Number(inst.amount),
      paraBirimi: this.mapCurrency(inst.currency),
      alacakKalemleri,
    };
  }

  /**
   * ClaimItem'ı UYAP Senet formatına dönüştür
   */
  private mapInstrumentToSenet(
    inst: ClaimItemWithInstrument,
    alacakKalemleri: UyapAlacakKalemi[]
  ): UyapSenetBilgisi {
    return {
      senetNo: inst.serialNo || undefined,
      duzenlemeTarihi: inst.issueDate?.toISOString().split('T')[0] || '',
      vadeTarihi: inst.maturityDate?.toISOString().split('T')[0] || '',
      duzenlemeYeri: inst.issuePlace || undefined,
      odemeYeri: inst.paymentPlace || undefined,
      tutar: Number(inst.amount),
      paraBirimi: this.mapCurrency(inst.currency),
      alacakKalemleri,
    };
  }

  // ==========================================
  // TAKİP TİPİ MAPPER'LAR
  // ==========================================

  /**
   * CaseType'ı UYAP DosyaTuru'na dönüştür
   */
  private mapDosyaTuru(type: CaseType): UyapDosyaTuru {
    if (type.includes('ILAMLI')) {
      if (type.includes('IPOTEK')) return 'ILAMLI_IPOTEK';
      if (type.includes('REHIN')) return 'ILAMLI_REHIN';
      return 'ILAMLI';
    }
    return 'ILAMSIZ';
  }

  /**
   * CaseType ve subType'ı UYAP TakipTuru'na dönüştür
   */
  private mapTakipTuru(type: CaseType, subType: string | null): UyapTakipTuru {
    const typeStr = type as string;
    const subTypeStr = subType || '';
    
    // Kambiyo takipleri
    if (typeStr.includes('KAMBIYO') || subTypeStr.includes('KAMBIYO')) {
      if (subTypeStr.includes('CEK')) return 'KAMBIYO_CEK';
      if (subTypeStr.includes('SENET')) return 'KAMBIYO_SENET';
      if (subTypeStr.includes('POLICE')) return 'KAMBIYO_POLICE';
      return 'KAMBIYO_SENET';
    }

    // Özel takip türleri
    if (typeStr.includes('KIRA') || subTypeStr.includes('KIRA')) return 'KIRA';
    if (typeStr.includes('NAFAKA') || subTypeStr.includes('NAFAKA')) return 'NAFAKA';
    if (typeStr.includes('IPOTEK')) return 'IPOTEK';
    if (typeStr.includes('REHIN')) return 'REHIN';
    if (typeStr.includes('IFLAS')) return 'IFLAS';

    return 'GENEL_HACIZ';
  }

  /**
   * ExecutionPath'i UYAP TakipYolu'na dönüştür
   */
  private mapTakipYolu(path: ExecutionPath): UyapTakipYolu {
    const pathMap: Partial<Record<ExecutionPath, UyapTakipYolu>> = {
      HACIZ: 'HACIZ',
      IFLAS: 'IFLAS',
      REHIN: 'REHIN',
      IPOTEK: 'HACIZ', // İpotek için haciz yolu
      TAHLIYE: 'TAHLIYE',
    };
    return pathMap[path] || 'HACIZ';
  }

  // ==========================================
  // İİK 48/4 AÇIKLAMA ÜRETİCİ
  // ==========================================

  /**
   * İİK 48/4 için alacak kalemleri açıklaması üret
   * Format: "Asıl Alacak: 10.000,00 TL, İşlemiş Faiz: 1.500,00 TL, ..."
   */
  private generate48_4Aciklama(alacakKalemleri: UyapAlacakKalemi[]): string {
    if (!alacakKalemleri.length) return 'Alacak kalemi belirtilmemiştir.';

    const lines = alacakKalemleri.map((kalem) => {
      const formattedAmount = new Intl.NumberFormat('tr-TR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(kalem.tutar);

      let line = `${kalem.aciklama}: ${formattedAmount} ${kalem.paraBirimi}`;

      // Faiz bilgisi varsa ekle
      if (kalem.faiz) {
        line += ` (${kalem.faiz.baslangicTarihi} tarihinden itibaren ${kalem.faiz.faizTuruAciklama} işletilecektir)`;
      }

      return line;
    });

    return lines.join(', ');
  }

  // ==========================================
  // ORTAK VEKİL
  // ==========================================

  /**
   * Tenant'ın tüm avukatlarını ortak vekil olarak getir
   */
  private async getOrtakVekiller(tenantId: string): Promise<UyapVekil[]> {
    const lawyers = await this.prisma.lawyer.findMany({
      where: { tenantId, isActive: true },
    });

    return lawyers.map((lawyer) => this.mapLawyerToVekil(lawyer));
  }

  /**
   * Lawyer'ı UYAP Vekil formatına dönüştür
   */
  private mapLawyerToVekil(lawyer: Lawyer): UyapVekil {
    return {
      baroSicilNo: lawyer.barNumber || '',
      ad: lawyer.name || '',
      soyad: lawyer.surname || '',
      tckn: lawyer.tckn || undefined,
      baroAdi: lawyer.barName || undefined,
      telefon: lawyer.phone || undefined,
      email: lawyer.email || undefined,
    };
  }
}