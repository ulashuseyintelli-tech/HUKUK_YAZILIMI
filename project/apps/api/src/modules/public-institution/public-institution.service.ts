import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PublicInstitutionCategory } from '@prisma/client';

@Injectable()
export class PublicInstitutionService {
  constructor(private prisma: PrismaService) {}

  // Autocomplete arama - isim veya DETSİS no ile
  async search(query: string, limit = 20) {
    if (!query || query.length < 2) {
      return [];
    }

    return this.prisma.publicInstitution.findMany({
      where: {
        isActive: true,
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { shortName: { contains: query, mode: 'insensitive' } },
          { detsisNo: { startsWith: query } },
        ],
      },
      select: {
        id: true,
        detsisNo: true,
        name: true,
        shortName: true,
        category: true,
        city: true,
        district: true,
        address: true,
        phone: true,
        kepAddress: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      take: limit,
    });
  }

  // Kategoriye göre listele
  async findByCategory(category: PublicInstitutionCategory, limit = 100) {
    return this.prisma.publicInstitution.findMany({
      where: { category, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      take: limit,
    });
  }

  // DETSİS numarasına göre bul
  async findByDetsisNo(detsisNo: string) {
    return this.prisma.publicInstitution.findUnique({
      where: { detsisNo },
      include: {
        parent: { select: { id: true, name: true, detsisNo: true } },
      },
    });
  }

  // ID'ye göre bul
  async findById(id: string) {
    return this.prisma.publicInstitution.findUnique({
      where: { id },
      include: {
        parent: { select: { id: true, name: true, detsisNo: true } },
        children: {
          where: { isActive: true },
          select: { id: true, name: true, detsisNo: true, category: true },
          orderBy: { name: 'asc' },
        },
      },
    });
  }

  // Şehre göre listele
  async findByCity(city: string, limit = 100) {
    return this.prisma.publicInstitution.findMany({
      where: { city, isActive: true },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      take: limit,
    });
  }

  // Tüm kategorileri getir (dropdown için)
  getCategories() {
    return Object.values(PublicInstitutionCategory).map((cat) => ({
      value: cat,
      label: this.getCategoryLabel(cat),
    }));
  }

  private getCategoryLabel(category: PublicInstitutionCategory): string {
    const labels: Record<PublicInstitutionCategory, string> = {
      BAKANLIK: 'Bakanlıklar',
      GENEL_MUDURLUK: 'Genel Müdürlükler',
      BASKANLIK: 'Başkanlıklar',
      KURUL: 'Kurullar',
      KURUM: 'Kurumlar',
      UNIVERSITE: 'Üniversiteler',
      BELEDIYE: 'Belediyeler',
      IL_OZEL_IDARESI: 'İl Özel İdareleri',
      VALILIK: 'Valilikler',
      KAYMAKAMLIK: 'Kaymakamlıklar',
      MAHKEME: 'Mahkemeler',
      SAVCILIK: 'Savcılıklar',
      ICRA_DAIRESI: 'İcra Daireleri',
      CEZAEVI: 'Cezaevleri',
      HASTANE: 'Hastaneler',
      DIGER: 'Diğer',
    };
    return labels[category] || category;
  }

  // İstatistikler
  async getStats() {
    const [total, byCategory] = await Promise.all([
      this.prisma.publicInstitution.count({ where: { isActive: true } }),
      this.prisma.publicInstitution.groupBy({
        by: ['category'],
        where: { isActive: true },
        _count: true,
      }),
    ]);

    return {
      total,
      byCategory: byCategory.map((c) => ({
        category: c.category,
        label: this.getCategoryLabel(c.category),
        count: c._count,
      })),
    };
  }
}
