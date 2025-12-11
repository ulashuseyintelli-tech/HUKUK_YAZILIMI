import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ReportService {
  constructor(private prisma: PrismaService) {}

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
}
