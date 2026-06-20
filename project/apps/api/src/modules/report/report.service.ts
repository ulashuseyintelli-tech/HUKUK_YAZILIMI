import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CollectionService } from "../collection/collection.service";
import { ValidationGateService } from "../validation-gate/validation-gate.service"; // D4e-8: pre-haciz risk teşhisi
import {
  CaseDebtReportResult,
  InterestReportResult,
  CollectionHistoryReportResult,
} from "./dto/report.dto";

@Injectable()
export class ReportService {
  constructor(
    private prisma: PrismaService,
    private collectionService: CollectionService,
    private validationGate: ValidationGateService,
  ) {}

  // 1. Müvekkil Bazlı Durum Raporu
  async getClientReport(tenantId: string, clientId?: string) {
    const where: any = { tenantId };
    if (clientId) where.clientId = clientId;

    const [total, byAsama, byDurumEtiketi, byRisk] = await Promise.all([
      this.prisma.case.count({ where }),
      this.prisma.case.groupBy({
        by: ['asamaId'],
        where,
        _count: { id: true },
        _sum: { principalAmount: true },
      }),
      this.prisma.case.groupBy({
        by: ['durumEtiketiId'],
        where,
        _count: { id: true },
      }),
      this.prisma.case.groupBy({
        by: ['riskId'],
        where,
        _count: { id: true },
        _sum: { principalAmount: true },
      }),
    ]);

    // Lookup isimlerini getir
    const [asamalar, durumEtiketleri, riskler] = await Promise.all([
      this.prisma.lookupAsama.findMany({ where: { tenantId } }),
      this.prisma.lookupDurumEtiketi.findMany({ where: { tenantId } }),
      this.prisma.lookupRisk.findMany({ where: { tenantId } }),
    ]);

    return {
      total,
      byAsama: byAsama.map(item => ({
        asama: asamalar.find(a => a.id === item.asamaId)?.name || 'Belirsiz',
        count: item._count.id,
        totalAmount: item._sum.principalAmount || 0,
      })),
      byDurumEtiketi: byDurumEtiketi.map(item => ({
        durumEtiketi: durumEtiketleri.find(d => d.id === item.durumEtiketiId)?.name || 'Belirsiz',
        color: durumEtiketleri.find(d => d.id === item.durumEtiketiId)?.color,
        count: item._count.id,
      })),
      byRisk: byRisk.map(item => ({
        risk: riskler.find(r => r.id === item.riskId)?.name || 'Belirsiz',
        color: riskler.find(r => r.id === item.riskId)?.color,
        count: item._count.id,
        totalAmount: item._sum.principalAmount || 0,
      })),
    };
  }

  // 2. Personel Performans Raporu
  async getPersonelReport(tenantId: string, personelId?: string, startDate?: string, endDate?: string) {
    const where: any = { tenantId };
    if (personelId) where.sorumluPersonelId = personelId;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const users = await this.prisma.user.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, name: true, surname: true },
    });


    const results = await Promise.all(
      users.map(async (user) => {
        const userWhere = { ...where, sorumluPersonelId: user.id };
        const [totalCases, closedCases, totalCollection] = await Promise.all([
          this.prisma.case.count({ where: userWhere }),
          this.prisma.case.count({ where: { ...userWhere, caseStatus: { in: ['HITAM', 'INFAZ'] } } }),
          this.prisma.collection.aggregate({
            where: { case: userWhere },
            _sum: { amount: true },
          }),
        ]);
        return {
          personel: `${user.name} ${user.surname}`,
          personelId: user.id,
          totalCases,
          closedCases,
          totalCollection: totalCollection._sum.amount || 0,
          closureRate: totalCases > 0 ? Math.round((closedCases / totalCases) * 100) : 0,
        };
      })
    );

    return results.filter(r => r.totalCases > 0).sort((a, b) => b.totalCases - a.totalCases);
  }

  /**
   * K3 — Kategori bazlı GÖREV performansı (ham metrik; SKOR/BADGE/LEADERBOARD YOK).
   * <remarks>
   * Çağrıldığı yerler:
   * - ReportController.getTaskPerformanceReport() → GET /reports/task-performance (yönetici/ADMIN gate)
   * </remarks>
   * Kurallar (kararlaştırıldı):
   * - people[]: YALNIZ resolutionType=MANUAL + completedByUserId dolu görevler (insan kapanışı).
   *   AUTO_SYSTEM kişiye atfedilmez (şişmeyi önler) → ayrı `system` bloğu.
   *   Legacy/eksik (resolutionType=null) sessizce düşürülmez → `unattributed`.
   * - from/to → completedAt'e uygulanır (bu dönemde KAPANANLAR).
   * - User → StaffMember/Lawyer K1 köprüsüyle resolve (Lawyer önceliklidir); eşleşmezse USER_ONLY.
   * - Tüm sorgular tenant-scoped. avgCompletionHours = avg(completedAt-createdAt), JS'te (kolon yok).
   */
  async getTaskPerformanceReport(
    tenantId: string,
    params?: { from?: string; to?: string; taskCategory?: string; resolutionType?: string }
  ) {
    const { from, to, taskCategory, resolutionType } = params || {};

    const where: any = { tenantId, status: 'COMPLETED' };
    if (from || to) {
      where.completedAt = {};
      if (from) where.completedAt.gte = new Date(from);
      if (to) where.completedAt.lte = new Date(to);
    }
    if (taskCategory) where.taskCategory = taskCategory;
    if (resolutionType) where.resolutionType = resolutionType;

    const tasks = await this.prisma.task.findMany({
      where,
      select: { completedByUserId: true, resolutionType: true, taskCategory: true, createdAt: true, completedAt: true },
    });

    const emptyCat = () => ({ LEGAL_WORKFLOW: 0, OPERATIONAL_COMPLETENESS: 0 });
    const catKey = (c: any) => (c === 'OPERATIONAL_COMPLETENESS' ? 'OPERATIONAL_COMPLETENESS' : 'LEGAL_WORKFLOW');

    const system = { autoSystemCount: 0, byCategory: emptyCat() as Record<string, number> };
    const unattributed = { count: 0 };
    const perPerson = new Map<string, { count: number; totalHours: number; byCategory: Record<string, number> }>();

    for (const t of tasks) {
      const cat = catKey(t.taskCategory);
      if (t.resolutionType === 'MANUAL' && t.completedByUserId) {
        let p = perPerson.get(t.completedByUserId);
        if (!p) { p = { count: 0, totalHours: 0, byCategory: emptyCat() }; perPerson.set(t.completedByUserId, p); }
        p.count++;
        p.byCategory[cat]++;
        if (t.completedAt && t.createdAt) p.totalHours += (t.completedAt.getTime() - t.createdAt.getTime()) / 3_600_000;
      } else if (t.resolutionType === 'AUTO_SYSTEM') {
        system.autoSystemCount++;
        system.byCategory[cat]++;
      } else {
        // resolutionType=null (legacy/PR-PERF-1 öncesi) → atfedilemez, dürüstçe ayrı sayılır.
        unattributed.count++;
      }
    }

    // K1 köprüsü ile kimlik resolve (tenant-scoped, batch).
    const userIds = [...perPerson.keys()];
    const [users, staff, lawyers] = await Promise.all([
      userIds.length ? this.prisma.user.findMany({ where: { tenantId, id: { in: userIds } }, select: { id: true, name: true, surname: true } }) : Promise.resolve([]),
      userIds.length ? this.prisma.staffMember.findMany({ where: { tenantId, userId: { in: userIds } }, select: { userId: true, firstName: true, lastName: true } }) : Promise.resolve([]),
      userIds.length ? this.prisma.lawyer.findMany({ where: { tenantId, userId: { in: userIds } }, select: { userId: true, name: true, surname: true } }) : Promise.resolve([]),
    ]);
    const userMap = new Map(users.map((u: any) => [u.id, u]));
    const staffMap = new Map(staff.map((s: any) => [s.userId, s]));
    const lawyerMap = new Map(lawyers.map((l: any) => [l.userId, l]));

    const people = [...perPerson.entries()]
      .map(([userId, p]) => {
        let personType: 'USER_ONLY' | 'STAFF_MEMBER' | 'LAWYER' = 'USER_ONLY';
        let displayName = '';
        if (lawyerMap.has(userId)) {
          personType = 'LAWYER';
          const l = lawyerMap.get(userId);
          displayName = `${l.name} ${l.surname}`.trim();
        } else if (staffMap.has(userId)) {
          personType = 'STAFF_MEMBER';
          const s = staffMap.get(userId);
          displayName = `${s.firstName} ${s.lastName}`.trim();
        } else {
          const u = userMap.get(userId);
          displayName = u ? `${u.name} ${u.surname}`.trim() : 'Bilinmeyen Kullanıcı';
        }
        return {
          personId: userId,
          personType,
          displayName,
          completedManualCount: p.count,
          avgCompletionHours: p.count > 0 ? Math.round((p.totalHours / p.count) * 10) / 10 : 0,
          byCategory: p.byCategory,
        };
      })
      .sort((a, b) => b.completedManualCount - a.completedManualCount);

    return {
      range: { from: from || null, to: to || null },
      filters: { taskCategory: taskCategory || null, resolutionType: resolutionType || null },
      people,
      system,
      unattributed,
    };
  }

  // 3. Risk Yönetimi Raporu
  async getRiskReport(tenantId: string, riskId?: string) {
    const where: any = { tenantId };
    if (riskId) where.riskId = riskId;

    const cases = await this.prisma.case.findMany({
      where,
      select: {
        id: true,
        fileNumber: true,
        principalAmount: true,
        riskScore: true,
        caseStatus: true,
        risk: { select: { name: true, color: true } },
        asama: { select: { name: true } },
        durumEtiketi: { select: { name: true, color: true } },
      },
      orderBy: { riskScore: 'desc' },
      take: 100,
    });

    const summary = await this.prisma.case.groupBy({
      by: ['riskId'],
      where: { tenantId },
      _count: { id: true },
      _sum: { principalAmount: true },
    });

    const riskler = await this.prisma.lookupRisk.findMany({ where: { tenantId } });

    return {
      summary: summary.map(item => ({
        risk: riskler.find(r => r.id === item.riskId)?.name || 'Belirsiz',
        color: riskler.find(r => r.id === item.riskId)?.color,
        count: item._count.id,
        totalAmount: item._sum.principalAmount || 0,
      })),
      cases: cases.map(c => ({
        id: c.id,
        fileNumber: c.fileNumber,
        principalAmount: c.principalAmount,
        riskScore: c.riskScore,
        risk: c.risk?.name,
        riskColor: c.risk?.color,
        asama: c.asama?.name,
        durumEtiketi: c.durumEtiketi?.name,
        caseStatus: c.caseStatus,
      })),
    };
  }

  // 4. Grup/Portföy Raporu
  async getGroupReport(tenantId: string, groupId: string) {
    const group = await this.prisma.groupDefinition.findFirst({
      where: { id: groupId, tenantId },
    });
    if (!group) return null;

    const caseGroups = await this.prisma.caseGroup.findMany({
      where: { groupId },
      include: {
        case: {
          select: {
            id: true,
            fileNumber: true,
            principalAmount: true,
            caseStatus: true,
            asama: { select: { name: true } },
            collections: { select: { amount: true } },
          },
        },
      },
    });

    const cases = caseGroups.map(cg => cg.case);
    const totalAmount = cases.reduce((sum, c) => sum + Number(c.principalAmount || 0), 0);
    const totalCollection = cases.reduce((sum, c) => 
      sum + c.collections.reduce((s, col) => s + Number(col.amount), 0), 0);

    // Aşama dağılımı
    const asamaMap = new Map<string, number>();
    cases.forEach(c => {
      const asama = c.asama?.name || 'Belirsiz';
      asamaMap.set(asama, (asamaMap.get(asama) || 0) + 1);
    });

    return {
      group: { id: group.id, name: group.name, color: group.color },
      totalCases: cases.length,
      totalAmount,
      totalCollection,
      collectionRate: totalAmount > 0 ? Math.round((totalCollection / totalAmount) * 100) : 0,
      byAsama: Array.from(asamaMap.entries()).map(([asama, count]) => ({ asama, count })),
    };
  }

  // 5. Durum Etiketi Raporu
  async getDurumEtiketiReport(tenantId: string, durumEtiketiId?: string) {
    const where: any = { tenantId };
    if (durumEtiketiId) where.durumEtiketiId = durumEtiketiId;

    const cases = await this.prisma.case.findMany({
      where,
      select: {
        id: true,
        fileNumber: true,
        executionFileNumber: true,
        principalAmount: true,
        durumEtiketi: { select: { id: true, name: true, color: true } },
        sorumluPersonel: { select: { name: true, surname: true } },
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Durum etiketine göre grupla
    const grouped = new Map<string, any[]>();
    cases.forEach(c => {
      const key = c.durumEtiketi?.name || 'Etiketsiz';
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(c);
    });

    return Array.from(grouped.entries()).map(([durumEtiketi, items]) => ({
      durumEtiketi,
      color: items[0]?.durumEtiketi?.color,
      count: items.length,
      cases: items.slice(0, 20).map(c => ({
        id: c.id,
        fileNumber: c.fileNumber,
        executionFileNumber: c.executionFileNumber,
        principalAmount: c.principalAmount,
        sorumlu: c.sorumluPersonel ? `${c.sorumluPersonel.name} ${c.sorumluPersonel.surname}` : null,
        updatedAt: c.updatedAt,
      })),
    }));
  }

  // 6. Dosya Listesi - Raporlama Özeti ile (Filtreleme destekli)
  async getCasesWithSummary(
    tenantId: string,
    filters?: {
      takipTuruId?: string;
      mahiyetTipiId?: string;
      riskId?: string;
      durumEtiketiId?: string;
      sorumluPersonelId?: string;
      caseStatus?: string;
      search?: string;
    },
  ) {
    const where: any = { tenantId };

    // Filtreleri uygula
    if (filters?.takipTuruId) where.takipTuruId = filters.takipTuruId;
    if (filters?.mahiyetTipiId) where.mahiyetTipiId = filters.mahiyetTipiId;
    if (filters?.riskId) where.riskId = filters.riskId;
    if (filters?.durumEtiketiId) where.durumEtiketiId = filters.durumEtiketiId;
    if (filters?.sorumluPersonelId) where.sorumluPersonelId = filters.sorumluPersonelId;
    if (filters?.caseStatus) where.caseStatus = filters.caseStatus;
    if (filters?.search) {
      where.OR = [
        { fileNumber: { contains: filters.search, mode: 'insensitive' } },
        { executionFileNumber: { contains: filters.search, mode: 'insensitive' } },
        { client: { name: { contains: filters.search, mode: 'insensitive' } } },
      ];
    }

    const cases = await this.prisma.case.findMany({
      where,
      select: {
        id: true,
        fileNumber: true,
        principalAmount: true,
        caseStatus: true,
        client: { select: { name: true } },
        takipTuru: { select: { name: true } },
        mahiyetTipi: { select: { name: true } },
        risk: { select: { name: true, color: true } },
        durumEtiketi: { select: { name: true, color: true } },
        sorumluPersonel: { select: { name: true, surname: true } },
        groups: { select: { id: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });

    return cases.map(c => {
      // Raporlama özeti oluştur
      const parts: string[] = [];
      if (c.mahiyetTipi?.name) parts.push(c.mahiyetTipi.name);
      if (c.takipTuru?.name) parts.push(c.takipTuru.name.split(' ')[0]);
      if (c.risk?.name) parts.push(`Risk: ${c.risk.name}`);
      if (c.durumEtiketi?.name) parts.push(`Durum: ${c.durumEtiketi.name}`);
      if (c.groups.length > 0) parts.push(`${c.groups.length} grup`);

      return {
        id: c.id,
        fileNumber: c.fileNumber,
        clientName: c.client?.name,
        principalAmount: c.principalAmount,
        caseStatus: c.caseStatus,
        takipTuru: c.takipTuru?.name,
        mahiyetTipi: c.mahiyetTipi?.name,
        risk: c.risk?.name,
        riskColor: c.risk?.color,
        durumEtiketi: c.durumEtiketi?.name,
        durumColor: c.durumEtiketi?.color,
        sorumlu: c.sorumluPersonel ? `${c.sorumluPersonel.name} ${c.sorumluPersonel.surname}` : null,
        groupCount: c.groups.length,
        reportingSummary: parts.length > 0 ? parts.join(' / ') : 'Sınıflandırılmamış',
      };
    });
  }

  // 7. Risk Özeti (Dashboard için)
  async getRiskSummary(tenantId: string) {
    // Risk sınıflarını al
    const riskler = await this.prisma.lookupRisk.findMany({
      where: { tenantId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    // Risk dağılımını hesapla
    const riskCounts = await this.prisma.case.groupBy({
      by: ['riskId'],
      where: { tenantId, caseStatus: { in: ['DERDEST', 'ISLEMDE', 'DERKENAR'] } },
      _count: { id: true },
      _sum: { principalAmount: true },
    });

    // Risk atanmamış dosyaları say
    const unassignedCount = await this.prisma.case.count({
      where: { tenantId, riskId: null, caseStatus: { in: ['DERDEST', 'ISLEMDE', 'DERKENAR'] } },
    });

    const totalActive = riskCounts.reduce((sum, r) => sum + r._count.id, 0) + unassignedCount;

    // Risk dağılımını formatla
    const distribution = riskler.map(risk => {
      const found = riskCounts.find(rc => rc.riskId === risk.id);
      return {
        id: risk.id,
        code: risk.code,
        name: risk.name,
        color: risk.color,
        count: found?._count.id || 0,
        totalAmount: Number(found?._sum.principalAmount || 0),
        percentage: totalActive > 0 ? Math.round(((found?._count.id || 0) / totalActive) * 100) : 0,
      };
    });

    // Belirsiz (risk atanmamış) ekle
    distribution.push({
      id: null as any,
      code: 'BELIRSIZ',
      name: 'Belirsiz',
      color: '#9ca3af',
      count: unassignedCount,
      totalAmount: 0,
      percentage: totalActive > 0 ? Math.round((unassignedCount / totalActive) * 100) : 0,
    });

    return {
      totalActive,
      distribution,
      // Özet istatistikler
      summary: {
        high: distribution.find(d => d.code === 'YUKSEK')?.count || 0,
        medium: distribution.find(d => d.code === 'ORTA')?.count || 0,
        low: distribution.find(d => d.code === 'DUSUK')?.count || 0,
        unassigned: unassignedCount,
      },
    };
  }

  // Genel Dashboard İstatistikleri
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - ReportController.getDashboard() → GET /reports/dashboard (dashboard özet sayımları)
  /// </remarks>
  async getDashboardStats(tenantId: string) {
    const [totalCases, activeCases, closedCases, totalCollection, byTakipTuru] = await Promise.all([
      this.prisma.case.count({ where: { tenantId } }),
      this.prisma.case.count({ where: { tenantId, caseStatus: { in: ['DERDEST', 'ISLEMDE', 'DERKENAR'] } } }),
      this.prisma.case.count({ where: { tenantId, caseStatus: { in: ['HITAM', 'INFAZ'] } } }),
      this.prisma.collection.aggregate({ where: { tenantId }, _sum: { amount: true } }),
      this.prisma.case.groupBy({
        by: ['takipTuruId'],
        where: { tenantId },
        _count: { id: true },
      }),
    ]);

    const takipTurleri = await this.prisma.lookupTakipTuru.findMany({ where: { tenantId } });

    return {
      semantics: {
        caseScope: 'ALL_CASES_BY_STATUS',
        collectionScope: 'ALL_COLLECTIONS',
        debtorLifecycleScope: 'NO_DEBTOR_LIFECYCLE_COUNT',
      },
      totalCases,
      activeCases,
      closedCases,
      totalCollection: totalCollection._sum.amount || 0,
      byTakipTuru: byTakipTuru.map(item => ({
        takipTuru: takipTurleri.find(t => t.id === item.takipTuruId)?.name || 'Belirsiz',
        count: item._count.id,
      })),
    };
  }

  // 9. Excel Export için CSV formatında veri
  async exportCasesAsCsv(
    tenantId: string,
    filters?: {
      takipTuruId?: string;
      mahiyetTipiId?: string;
      riskId?: string;
      durumEtiketiId?: string;
      sorumluPersonelId?: string;
      caseStatus?: string;
    },
  ): Promise<string> {
    const cases = await this.getCasesWithSummary(tenantId, filters);

    // CSV başlık satırı
    const headers = [
      'Dosya No',
      'Müvekkil',
      'Ana Para',
      'Takip Türü',
      'Mahiyet Tipi',
      'Risk',
      'Durum Etiketi',
      'Sorumlu',
      'Grup Sayısı',
      'Statü',
      'Raporlama Özeti',
    ];

    // CSV satırları
    const rows = cases.map((c) => [
      c.fileNumber || '',
      c.clientName || '',
      c.principalAmount ? Number(c.principalAmount).toFixed(2) : '0',
      c.takipTuru || '',
      c.mahiyetTipi || '',
      c.risk || '',
      c.durumEtiketi || '',
      c.sorumlu || '',
      c.groupCount?.toString() || '0',
      c.caseStatus || '',
      c.reportingSummary || '',
    ]);

    // CSV formatına dönüştür (UTF-8 BOM ile Türkçe karakter desteği)
    const csvContent = [
      headers.join(';'),
      ...rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(';')),
    ].join('\n');

    return '\uFEFF' + csvContent; // UTF-8 BOM
  }

  // ==================== YENİ RAPORLAR ====================

  // 10. Dosya Borç Raporu (Kapak Hesabı)
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - ReportController.getCaseDebtReport() → GET /reports/case-debt/:caseId (dosya borç raporu)
  /// </remarks>
  async getCaseDebtReport(tenantId: string, caseId: string, calculationDate?: string): Promise<CaseDebtReportResult> {
    const calcDate = calculationDate ? new Date(calculationDate) : new Date();

    // Dosya bilgilerini al
    const caseData = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
      include: {
        client: { select: { displayName: true, name: true } },
        debtors: {
          include: {
            debtor: { select: { id: true, name: true, tckn: true, vkn: true } },
          },
        },
      },
    });

    if (!caseData) {
      throw new NotFoundException('Dosya bulunamadı');
    }

    // Tahsilatları ayrı sorgula
    const collections = await (this.prisma.collection as any).findMany({
      where: { caseId, status: 'CONFIRMED' },
      include: { allocations: true },
    });

    // Alacak kalemlerini hesapla
    const principalAmount = Number(caseData.principalAmount || 0);
    const interestRate = Number(caseData.interestRate || 0);
    
    // Faiz hesaplama (basit faiz)
    let interestAmount = 0;
    if (caseData.interestStartDate && interestRate > 0) {
      const startDate = new Date(caseData.interestStartDate);
      const days = Math.floor((calcDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      interestAmount = (principalAmount * interestRate * days) / (365 * 100);
    }

    // Tahsilat toplamları
    const totalCollected = collections.reduce((sum: number, c: any) => sum + Number(c.amount || 0), 0);
    
    // Mahsup dağılımı
    // G3b: mahsup dağılımı kanonik kaynaktan (ledger-varsa-ledger / yoksa-CollectionAllocation;
    // per-case tek kaynak, çift-sayım yok). Sıfır kovalar atlanır (eski şekle yakın).
    const breakdown = await this.collectionService.getCollectedBreakdown(tenantId, caseId);
    const allocatedByType: Record<string, number> = {};
    for (const [type, amount] of Object.entries(breakdown)) {
      if (amount !== 0) allocatedByType[type] = amount;
    }

    // Masraf ve harç (varsayılan değerler - gerçek sistemde ayrı tablolardan gelir)
    const expenseAmount = 0;
    const feeAmount = 0;
    const attorneyFeeAmount = 0;

    // Toplam alacak
    const totalClaim = principalAmount + interestAmount + expenseAmount + feeAmount + attorneyFeeAmount;

    // Kalan borç
    const remainingDebt = Math.max(0, totalClaim - totalCollected);

    return {
      caseInfo: {
        id: caseData.id,
        fileNumber: caseData.fileNumber,
        executionFileNumber: caseData.executionFileNumber || undefined,
        clientName: caseData.client?.displayName || caseData.client?.name || 'Bilinmiyor',
        status: caseData.caseStatus,
        openDate: caseData.caseDate?.toISOString() || caseData.createdAt.toISOString(),
      },
      debtors: caseData.debtors.map(cd => ({
        id: cd.debtor.id,
        caseDebtorId: cd.id,
        name: cd.debtor.name,
        tcNo: cd.debtor.tckn || cd.debtor.vkn || undefined,
        role: cd.role,
        lifecycleStatus: cd.lifecycleStatus as "ACTIVE" | "PASSIVE",
        lifecycleLabel: cd.lifecycleStatus === "PASSIVE" ? "PASSIVE" : "ACTIVE",
      })),
      claimDetails: {
        principalAmount,
        currency: caseData.currency || 'TRY',
        interestAmount: Math.round(interestAmount * 100) / 100,
        interestRate: interestRate || undefined,
        interestType: caseData.interestType || undefined,
        interestStartDate: caseData.interestStartDate?.toISOString(),
        interestEndDate: calcDate.toISOString(),
        expenseAmount,
        feeAmount,
        attorneyFeeAmount,
        otherAmount: 0,
        totalClaim: Math.round(totalClaim * 100) / 100,
      },
      collectionDetails: {
        totalCollected: Math.round(totalCollected * 100) / 100,
        collectionCount: collections.length,
        byType: allocatedByType,
        lastCollectionDate: collections.length > 0 
          ? collections.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]?.date?.toISOString()
          : undefined,
      },
      balance: {
        remainingDebt: Math.round(remainingDebt * 100) / 100,
        remainingPrincipal: Math.max(0, principalAmount - (allocatedByType['PRINCIPAL'] || 0)),
        remainingInterest: Math.max(0, interestAmount - (allocatedByType['INTEREST'] || 0)),
        remainingExpense: Math.max(0, expenseAmount - (allocatedByType['EXPENSE'] || 0)),
        remainingFee: Math.max(0, feeAmount - (allocatedByType['FEE'] || 0)),
        remainingAttorneyFee: Math.max(0, attorneyFeeAmount - (allocatedByType['ATTORNEY_FEE'] || 0)),
      },
      calculationDate: calcDate.toISOString(),
      generatedAt: new Date().toISOString(),
    };
  }

  // 11. Faiz Raporu
  async getInterestReport(
    tenantId: string,
    caseId: string,
    startDate?: string,
    endDate?: string,
  ): Promise<InterestReportResult> {
    const caseData = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
    });

    if (!caseData) {
      throw new NotFoundException('Dosya bulunamadı');
    }

    const principalAmount = Number(caseData.principalAmount || 0);
    const interestRate = Number(caseData.interestRate || 0);
    const interestStartDate = startDate 
      ? new Date(startDate) 
      : (caseData.interestStartDate || caseData.caseDate || new Date());
    const interestEndDate = endDate ? new Date(endDate) : new Date();

    // Gün sayısı
    const totalDays = Math.max(0, Math.floor(
      (interestEndDate.getTime() - new Date(interestStartDate).getTime()) / (1000 * 60 * 60 * 24)
    ));

    // Toplam faiz
    const totalInterest = (principalAmount * interestRate * totalDays) / (365 * 100);

    // Günlük dağılım (son 30 gün veya toplam süre hangisi küçükse)
    const dailyBreakdown: InterestReportResult['dailyBreakdown'] = [];
    const daysToShow = Math.min(totalDays, 30);
    let cumulativeInterest = 0;

    for (let i = 0; i < daysToShow; i++) {
      const date = new Date(interestEndDate);
      date.setDate(date.getDate() - (daysToShow - 1 - i));
      
      const dailyInterest = (principalAmount * interestRate) / (365 * 100);
      cumulativeInterest += dailyInterest;

      dailyBreakdown.push({
        date: date.toISOString().split('T')[0],
        principal: principalAmount,
        rate: interestRate,
        dailyInterest: Math.round(dailyInterest * 100) / 100,
        cumulativeInterest: Math.round(cumulativeInterest * 100) / 100,
      });
    }

    return {
      caseInfo: {
        id: caseData.id,
        fileNumber: caseData.fileNumber,
        principalAmount,
        currency: caseData.currency || 'TRY',
      },
      interestDetails: {
        type: caseData.interestType || 'YASAL',
        rate: interestRate,
        startDate: new Date(interestStartDate).toISOString(),
        endDate: interestEndDate.toISOString(),
        days: totalDays,
        calculatedAmount: Math.round(totalInterest * 100) / 100,
      },
      dailyBreakdown,
      summary: {
        totalDays,
        averageRate: interestRate,
        totalInterest: Math.round(totalInterest * 100) / 100,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  // 12. Tahsilat Geçmişi Raporu
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - ReportController.getCollectionHistoryReport() → GET /reports/collection-history (tahsilat geçmişi raporu)
  /// </remarks>
  async getCollectionHistoryReport(
    tenantId: string,
    filters?: {
      caseId?: string;
      startDate?: string;
      endDate?: string;
      channels?: string[];
      statuses?: string[];
    },
  ): Promise<CollectionHistoryReportResult> {
    const where: any = { tenantId };

    if (filters?.caseId) where.caseId = filters.caseId;
    if (filters?.startDate || filters?.endDate) {
      where.date = {};
      if (filters.startDate) where.date.gte = new Date(filters.startDate);
      if (filters.endDate) where.date.lte = new Date(filters.endDate);
    }
    if (filters?.channels?.length) where.channel = { in: filters.channels };
    if (filters?.statuses?.length) where.status = { in: filters.statuses };

    const collections: any[] = await (this.prisma.collection as any).findMany({
      where,
      include: {
        case: { select: { fileNumber: true } },
        allocations: true,
      },
      orderBy: { date: 'desc' },
    });

    const caseDebtorIds = Array.from(
      new Set(
        collections
          .map((c: any) => c.caseDebtorId)
          .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0),
      ),
    );
    const caseDebtorLifecycleById = new Map<string, "ACTIVE" | "PASSIVE">();
    if (caseDebtorIds.length > 0) {
      const caseDebtors = await (this.prisma.caseDebtor as any).findMany({
        where: { id: { in: caseDebtorIds }, case: { tenantId } },
        select: { id: true, lifecycleStatus: true },
      });
      for (const cd of caseDebtors) {
        caseDebtorLifecycleById.set(cd.id, cd.lifecycleStatus as "ACTIVE" | "PASSIVE");
      }
    }

    // Özet hesaplamalar
    const confirmed = collections.filter((c: any) => c.status === 'CONFIRMED');
    const pending = collections.filter((c: any) => c.status === 'PENDING');
    const cancelled = collections.filter((c: any) => c.status === 'CANCELLED');

    const totalCollected = confirmed.reduce((sum: number, c: any) => sum + Number(c.amount || 0), 0);
    const totalPending = pending.reduce((sum: number, c: any) => sum + Number(c.amount || 0), 0);
    const totalCancelled = cancelled.reduce((sum: number, c: any) => sum + Number(c.amount || 0), 0);

    // Kanal bazlı dağılım
    const byChannelMap = new Map<string, { count: number; total: number }>();
    confirmed.forEach((c: any) => {
      const channel = c.channel || 'DIGER';
      const existing = byChannelMap.get(channel) || { count: 0, total: 0 };
      byChannelMap.set(channel, {
        count: existing.count + 1,
        total: existing.total + Number(c.amount || 0),
      });
    });

    const byChannel = Array.from(byChannelMap.entries()).map(([channel, data]) => ({
      channel,
      count: data.count,
      total: Math.round(data.total * 100) / 100,
      percentage: totalCollected > 0 ? Math.round((data.total / totalCollected) * 100) : 0,
    }));

    // Kaynak bazlı dağılım
    const bySourceMap = new Map<string, { count: number; total: number }>();
    confirmed.forEach((c: any) => {
      const source = c.sourceType || 'MANUAL';
      const existing = bySourceMap.get(source) || { count: 0, total: 0 };
      bySourceMap.set(source, {
        count: existing.count + 1,
        total: existing.total + Number(c.amount || 0),
      });
    });

    const bySource = Array.from(bySourceMap.entries()).map(([source, data]) => ({
      source,
      count: data.count,
      total: Math.round(data.total * 100) / 100,
      percentage: totalCollected > 0 ? Math.round((data.total / totalCollected) * 100) : 0,
    }));

    // Aylık dağılım
    const byMonthMap = new Map<string, { count: number; total: number }>();
    confirmed.forEach((c: any) => {
      const month = c.date.toISOString().substring(0, 7); // YYYY-MM
      const existing = byMonthMap.get(month) || { count: 0, total: 0 };
      byMonthMap.set(month, {
        count: existing.count + 1,
        total: existing.total + Number(c.amount || 0),
      });
    });

    const byMonth = Array.from(byMonthMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, data]) => ({
        month,
        count: data.count,
        total: Math.round(data.total * 100) / 100,
      }));

    return {
      summary: {
        totalCollected: Math.round(totalCollected * 100) / 100,
        totalPending: Math.round(totalPending * 100) / 100,
        totalCancelled: Math.round(totalCancelled * 100) / 100,
        collectionCount: confirmed.length,
        averageAmount: confirmed.length > 0 
          ? Math.round((totalCollected / confirmed.length) * 100) / 100 
          : 0,
      },
      byChannel,
      bySource,
      byMonth,
      collections: collections.slice(0, 100).map((c: any) => ({
        id: c.id,
        date: c.date.toISOString(),
        amount: Number(c.amount),
        currency: c.currency || 'TRY',
        channel: c.channel || 'DIGER',
        source: c.sourceType || undefined,
        status: c.status || 'CONFIRMED',
        caseFileNumber: c.case?.fileNumber || undefined,
        caseDebtorId: c.caseDebtorId || undefined,
        caseDebtorLifecycleStatus: c.caseDebtorId
          ? caseDebtorLifecycleById.get(c.caseDebtorId)
          : undefined,
        caseDebtorLifecycleLabel: c.caseDebtorId && caseDebtorLifecycleById.get(c.caseDebtorId)
          ? caseDebtorLifecycleById.get(c.caseDebtorId)
          : undefined,
        description: c.description || undefined,
      })),
      generatedAt: new Date().toISOString(),
    };
  }

  // 13. Tahsilat Özet Raporu (Dashboard için)
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - ReportController.getCollectionSummary() → GET /reports/collection-summary (tahsilat özet raporu)
  /// </remarks>
  async getCollectionSummary(tenantId: string, period?: 'week' | 'month' | 'year') {
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      case 'month':
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const [periodCollections, totalCollections, pendingCollections] = await Promise.all([
      (this.prisma.collection as any).aggregate({
        where: {
          tenantId,
          status: 'CONFIRMED',
          date: { gte: startDate },
        },
        _sum: { amount: true },
        _count: { id: true },
      }),
      (this.prisma.collection as any).aggregate({
        where: { tenantId, status: 'CONFIRMED' },
        _sum: { amount: true },
      }),
      (this.prisma.collection as any).aggregate({
        where: { tenantId, status: 'PENDING' },
        _sum: { amount: true },
        _count: { id: true },
      }),
    ]);

    return {
      semantics: {
        collectionScope: 'ALL_COLLECTIONS_BY_STATUS',
        debtorLifecycleScope: 'HISTORICAL_COLLECTIONS_INCLUDE_PASSIVE_WHEN_LINKED',
      },
      period: period || 'month',
      periodTotal: Number(periodCollections?._sum?.amount || 0),
      periodCount: periodCollections?._count?.id || 0,
      allTimeTotal: Number(totalCollections?._sum?.amount || 0),
      pendingTotal: Number(pendingCollections?._sum?.amount || 0),
      pendingCount: pendingCollections?._count?.id || 0,
    };
  }

  /**
   * D4e-8 — Pre-haciz risk DAĞILIM/TEŞHİS raporu (READ-ONLY, ölçüm). Mevcut production logic'i
   * (checkPreHacizIntelligence) örneklem dosyalar üzerinde YENİDEN ÇALIŞTIRIP dağılım çıkarır.
   * Kalıcı yazım YOK, blok YOK, ağırlık/eşik DEĞİŞMEZ. Kör tarama YOK: limit zorunlu cap'li.
   * İlk sürüm metrikleri: overallLevel dağılımı + debtorLevel dağılımı + reasonId frekansı +
   * taranan dosya/borçlu sayısı. (Signal-confirmation proxy AYRI/sonraki iş.)
   * <remarks>
   * Çağrıldığı yerler:
   * - ReportController.getPreHacizRiskDistribution() → GET /reports/pre-haciz-risk-distribution (ADMIN)
   * </remarks>
   */
  async getPreHacizRiskDistribution(
    tenantId: string,
    opts?: { limit?: number; status?: string },
  ) {
    // Cap: kör tarama yok. Default 100, üst sınır 500.
    const limit = Math.min(Math.max(1, opts?.limit ?? 100), 500);
    // Default aktif/otomasyon-açık statüler; opsiyonel tek statü override.
    const statuses = opts?.status ? [opts.status] : ["DERDEST", "ISLEMDE"];

    const cases = await this.prisma.case.findMany({
      where: { tenantId, caseStatus: { in: statuses as any } },
      select: { id: true },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    const caseIds = cases.map((c) => c.id);
    // Taranan dosyaların TOPLAM aktif borçlu sayısı (flagged-oran bağlamı için tek sorgu).
    const totalDebtorCount = caseIds.length
      ? await this.prisma.caseDebtor.count({ where: { caseId: { in: caseIds }, lifecycleStatus: "ACTIVE" } })
      : 0;

    const overallLevelDistribution: Record<string, number> = { YUKSEK: 0, ORTA: 0, DUSUK: 0, YOK: 0 };
    const debtorLevelDistribution: Record<string, number> = { YUKSEK: 0, ORTA: 0, DUSUK: 0 };
    const reasonFrequency: Record<string, number> = {};
    let flaggedDebtorCount = 0;
    let evaluatedCaseCount = 0;

    for (const c of cases) {
      try {
        const risk = await this.validationGate.checkPreHacizIntelligence(tenantId, c.id);
        overallLevelDistribution[risk.overallLevel] = (overallLevelDistribution[risk.overallLevel] || 0) + 1;
        for (const d of risk.debtors) {
          flaggedDebtorCount++;
          debtorLevelDistribution[d.level] = (debtorLevelDistribution[d.level] || 0) + 1;
          for (const r of d.reasons) {
            reasonFrequency[r.id] = (reasonFrequency[r.id] || 0) + 1;
          }
        }
        evaluatedCaseCount++; // başarıyla değerlendirilen dosya
      } catch {
        // best-effort: tek dosya hatası raporu düşürmez (teşhis aracı).
      }
    }

    return {
      params: { limit, statuses, debtorLifecycleScope: "ACTIVE_ONLY" },
      scannedCaseCount: cases.length,
      evaluatedCaseCount,
      totalDebtorCount,
      flaggedDebtorCount,
      overallLevelDistribution,
      debtorLevelDistribution,
      reasonFrequency,
    };
  }
}
