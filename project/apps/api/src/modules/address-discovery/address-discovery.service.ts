import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { AddressResearchStatus, DebtorType } from '@prisma/client';
import { ClientInfoRequestService } from './client-info-request.service';
import { CrossFileService } from './cross-file.service';

/**
 * UYAP Sorgu Hiyerarşisi
 */
const QUERY_HIERARCHY = [
  { code: 'AA', type: 'NUFUS_ADRES', name: 'MERNİS', priority: 1 },
  { code: 'AB', type: 'SGK', name: 'SGK İşyeri', priority: 2 },
  { code: 'AF', type: 'TICARET_ODASI', name: 'Ticaret Odası', priority: 3 },
  { code: 'AJ', type: 'VERGI_DAIRESI', name: 'Vergi Dairesi', priority: 4 },
  { code: 'AR', type: 'GSM', name: 'GSM Operatörleri', priority: 5 },
  { code: 'AL', type: 'GUMRUK', name: 'Gümrük', priority: 6 },
  { code: 'AH', type: 'ORTAKLAR', name: 'Şirket Ortakları', priority: 7 },
  { code: 'AN', type: 'AILE', name: 'Aile Üyeleri', priority: 8 },
  { code: 'AP', type: 'ORTAK_DETAY', name: 'Ortak Detayları', priority: 9 },
];

// Gerçek kişi için öncelikli sorgular
const INDIVIDUAL_QUERIES = ['AA', 'AB', 'AR', 'AN'];

// Tüzel kişi için öncelikli sorgular
const COMPANY_QUERIES = ['AF', 'AJ', 'AB', 'AH', 'AP'];

export interface ResearchSuggestion {
  action: string;
  actionCode?: string;
  priority: number;
  reason: string;
  description: string;
}

export interface ResearchTimelineItem {
  date: Date;
  type: 'CLIENT_INFO' | 'UYAP_QUERY' | 'INSTITUTION_LETTER' | 'CROSS_FILE' | 'STATUS_CHANGE';
  title: string;
  description?: string;
  status?: string;
  metadata?: any;
}

@Injectable()
export class AddressDiscoveryService {
  private readonly logger = new Logger(AddressDiscoveryService.name);

  constructor(
    private prisma: PrismaService,
    private clientInfoRequestService: ClientInfoRequestService,
    private crossFileService: CrossFileService,
  ) {}

  /**
   * Araştırma durumunu getir veya oluştur
   */
  async getOrCreateResearch(tenantId: string, caseDebtorId: string) {
    let research = await this.prisma.addressResearch.findUnique({
      where: { caseDebtorId },
    });

    if (!research) {
      // CaseDebtor'u doğrula
      const caseDebtor = await this.prisma.caseDebtor.findFirst({
        where: { id: caseDebtorId },
        include: { case: { select: { tenantId: true } } },
      });

      if (!caseDebtor || caseDebtor.case.tenantId !== tenantId) {
        throw new NotFoundException('Dosya borçlusu bulunamadı');
      }

      research = await this.prisma.addressResearch.create({
        data: {
          tenantId,
          caseDebtorId,
          status: 'NOT_STARTED',
        },
      });
    }

    return research;
  }

  /**
   * Araştırma durumunu getir (detaylı)
   */
  async getResearchStatus(tenantId: string, caseDebtorId: string) {
    const research = await this.getOrCreateResearch(tenantId, caseDebtorId);

    // İlgili verileri al
    const caseDebtor = await this.prisma.caseDebtor.findUnique({
      where: { id: caseDebtorId },
      include: {
        debtor: {
          select: {
            id: true,
            name: true,
            type: true,
            debtorAddresses: {
              select: { id: true, source: true, verified: true, confidenceScore: true },
            },
          },
        },
        case: { select: { id: true, fileNumber: true } },
        uyapQueries: {
          select: { queryType: true, status: true, addressesFound: true },
        },
        institutionLetters: {
          select: { institution: true, status: true, addressesFound: true },
        },
        serviceHistory: {
          where: { toStatus: { in: ['RETURNED', 'FAILED'] } },
          select: { id: true },
        },
      },
    });

    // Cross-file adres sayısı
    const crossFileCount = await this.crossFileService.getCrossFileAddressCount(
      tenantId,
      caseDebtor!.debtor.id,
      caseDebtor!.case.id,
    );

    // Müvekkil bilgi talepleri
    const clientInfoRequests = await this.prisma.clientInfoRequest.findMany({
      where: { caseId: caseDebtor!.case.id },
      select: { status: true },
    });

    // İstatistikleri hesapla
    const completedUyapQueries = caseDebtor!.uyapQueries.filter(q => q.status === 'COMPLETED').length;
    const totalUyapQueries = caseDebtor!.uyapQueries.length;
    const sentInstitutionLetters = caseDebtor!.institutionLetters.filter(l => l.status !== 'DRAFT').length;
    const respondedClientRequests = clientInfoRequests.filter(r => r.status === 'RESPONDED').length;

    return {
      ...research,
      debtor: caseDebtor!.debtor,
      case: caseDebtor!.case,
      statistics: {
        totalAddresses: caseDebtor!.debtor.debtorAddresses.length,
        verifiedAddresses: caseDebtor!.debtor.debtorAddresses.filter(a => a.verified).length,
        failedNotifications: caseDebtor!.serviceHistory.length,
        crossFileAddresses: crossFileCount,
        uyapQueries: {
          total: totalUyapQueries,
          completed: completedUyapQueries,
        },
        institutionLetters: {
          total: caseDebtor!.institutionLetters.length,
          sent: sentInstitutionLetters,
        },
        clientInfoRequests: {
          total: clientInfoRequests.length,
          responded: respondedClientRequests,
        },
      },
    };
  }

  /**
   * Araştırmayı başlat
   */
  async startResearch(tenantId: string, caseDebtorId: string) {
    const research = await this.getOrCreateResearch(tenantId, caseDebtorId);

    if (research.status !== 'NOT_STARTED') {
      return research;
    }

    return this.prisma.addressResearch.update({
      where: { id: research.id },
      data: {
        status: 'IN_PROGRESS',
        startedAt: new Date(),
      },
    });
  }

  /**
   * Sonraki aksiyonu öner
   */
  async suggestNextAction(tenantId: string, caseDebtorId: string): Promise<ResearchSuggestion[]> {
    const status = await this.getResearchStatus(tenantId, caseDebtorId);
    const suggestions: ResearchSuggestion[] = [];

    const { statistics, debtor } = status;
    const debtorType = debtor.type;

    // 1. Müvekkil bilgi talebi gönderilmemiş
    if (statistics.clientInfoRequests.total === 0) {
      suggestions.push({
        action: 'SEND_CLIENT_INFO_REQUEST',
        priority: 1,
        reason: 'Müvekkile henüz bilgi talebi gönderilmedi',
        description: 'Müvekkile borçlu adres/telefon bilgisi talep e-postası gönderin',
      });
    }

    // 2. 2+ başarısız tebligat → UYAP AA öner
    if (statistics.failedNotifications >= 2) {
      // UYAP sorguları henüz implement edilmedi, sadece öneri göster
      suggestions.push({
        action: 'SUGGEST_UYAP_QUERY',
        actionCode: 'AA',
        priority: 2,
        reason: `${statistics.failedNotifications} başarısız tebligat var`,
        description: 'UYAP MERNİS (AA) sorgusu yapın',
      });
    }

    // 3. Borçlu tipine göre sorgu önerileri
    const recommendedQueries = debtorType === 'COMPANY' || debtorType === 'PUBLIC_INSTITUTION'
      ? COMPANY_QUERIES
      : INDIVIDUAL_QUERIES;

    const completedQueryCodes = (status as any).uyapQueries
      ?.filter((q: any) => q.status === 'COMPLETED')
      .map((q: any) => this.getQueryCode(q.queryType)) || [];

    for (const code of recommendedQueries) {
      if (!completedQueryCodes.includes(code)) {
        const queryInfo = QUERY_HIERARCHY.find(q => q.code === code);
        if (queryInfo) {
          suggestions.push({
            action: 'SUGGEST_UYAP_QUERY',
            actionCode: code,
            priority: queryInfo.priority + 10,
            reason: `${queryInfo.name} sorgusu henüz yapılmadı`,
            description: `UYAP ${queryInfo.name} (${code}) sorgusu yapın`,
          });
        }
      }
    }

    // 4. Cross-file adres var
    if (statistics.crossFileAddresses > 0) {
      suggestions.push({
        action: 'CHECK_CROSS_FILE',
        priority: 3,
        reason: `Başka dosyalarda ${statistics.crossFileAddresses} farklı adres bulundu`,
        description: 'Diğer dosyalardaki adresleri inceleyin ve kopyalayın',
      });
    }

    // 5. 3+ iade → Kurum yazısı öner
    if (statistics.failedNotifications >= 3 && statistics.institutionLetters.sent === 0) {
      suggestions.push({
        action: 'SUGGEST_INSTITUTION_LETTER',
        priority: 4,
        reason: `${statistics.failedNotifications} başarısız tebligat var, kurum yazısı gerekebilir`,
        description: 'SGK, Vergi Dairesi veya Ticaret Sicili\'ne yazı gönderin',
      });
    }

    // Önceliğe göre sırala
    return suggestions.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Araştırma timeline'ını getir
   */
  async getResearchTimeline(tenantId: string, caseDebtorId: string): Promise<ResearchTimelineItem[]> {
    const caseDebtor = await this.prisma.caseDebtor.findFirst({
      where: { id: caseDebtorId },
      include: { case: { select: { tenantId: true, id: true } } },
    });

    if (!caseDebtor || caseDebtor.case.tenantId !== tenantId) {
      throw new NotFoundException('Dosya borçlusu bulunamadı');
    }

    const timeline: ResearchTimelineItem[] = [];

    // Müvekkil bilgi talepleri
    const clientRequests = await this.prisma.clientInfoRequest.findMany({
      where: { caseId: caseDebtor.case.id },
      orderBy: { sentAt: 'desc' },
    });

    for (const req of clientRequests) {
      timeline.push({
        date: req.sentAt,
        type: 'CLIENT_INFO',
        title: 'Müvekkil Bilgi Talebi',
        description: `E-posta gönderildi: ${req.emailTo}`,
        status: req.status,
      });

      if (req.respondedAt) {
        timeline.push({
          date: req.respondedAt,
          type: 'CLIENT_INFO',
          title: 'Müvekkil Yanıtı',
          description: req.responseNotes || 'Yanıt alındı',
          status: 'RESPONDED',
        });
      }
    }

    // UYAP sorguları
    const uyapQueries = await this.prisma.uyapQuery.findMany({
      where: { caseDebtorId },
      orderBy: { requestedAt: 'desc' },
    });

    for (const query of uyapQueries) {
      const queryInfo = QUERY_HIERARCHY.find(q => q.type === query.queryType);
      timeline.push({
        date: query.requestedAt,
        type: 'UYAP_QUERY',
        title: `UYAP Sorgusu: ${queryInfo?.name || query.queryType}`,
        description: `Sorgu kodu: ${query.queryCode}`,
        status: query.status,
        metadata: { addressesFound: query.addressesFound },
      });
    }

    // Kurum yazıları
    const letters = await this.prisma.institutionLetter.findMany({
      where: { caseDebtorId },
      orderBy: { createdAt: 'desc' },
    });

    for (const letter of letters) {
      timeline.push({
        date: letter.createdAt,
        type: 'INSTITUTION_LETTER',
        title: `Kurum Yazısı: ${letter.institution}`,
        description: letter.subject,
        status: letter.status,
        metadata: { addressesFound: letter.addressesFound },
      });
    }

    // Tarihe göre sırala (en yeni en üstte)
    return timeline.sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  /**
   * Araştırma durumunu güncelle
   */
  async updateResearchStatus(
    tenantId: string,
    caseDebtorId: string,
    updates: Partial<{
      clientInfoRequested: boolean;
      uyapQueriesCompleted: boolean;
      crossFileChecked: boolean;
      institutionLettersSent: boolean;
      totalAddressesFound: number;
      failedNotifications: number;
    }>,
  ) {
    const research = await this.getOrCreateResearch(tenantId, caseDebtorId);

    return this.prisma.addressResearch.update({
      where: { id: research.id },
      data: updates,
    });
  }

  /**
   * Araştırmayı tamamla
   */
  async completeResearch(tenantId: string, caseDebtorId: string) {
    const research = await this.getOrCreateResearch(tenantId, caseDebtorId);

    return this.prisma.addressResearch.update({
      where: { id: research.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });
  }

  /**
   * Araştırmayı tükendi olarak işaretle
   */
  async markAsExhausted(tenantId: string, caseDebtorId: string) {
    const research = await this.getOrCreateResearch(tenantId, caseDebtorId);

    return this.prisma.addressResearch.update({
      where: { id: research.id },
      data: {
        status: 'EXHAUSTED',
        completedAt: new Date(),
      },
    });
  }

  /**
   * Query type'dan kod al
   */
  private getQueryCode(queryType: string): string {
    const query = QUERY_HIERARCHY.find(q => q.type === queryType);
    return query?.code || '';
  }
}
