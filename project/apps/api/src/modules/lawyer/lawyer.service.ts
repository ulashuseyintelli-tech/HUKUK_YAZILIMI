import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { LawyerRole, LawyerRank } from "@prisma/client";

// Rol'e göre varsayılan unvan/sıfat
const DEFAULT_TITLES: Record<string, string> = {
  OWNER: "Av.",        // Büro sahibi avukat
  PARTNER: "Av.",      // Ortak avukat
  EMPLOYEE: "Av.",     // Çalışan avukat
  INTERN: "Stj. Av.",  // Stajyer avukat
};

// Avukat için görüntüleme adı oluştur (Unvan Ad Soyad)
// Dilekçeler, evraklar ve listelerde kullanılır
// Örnek: "Av. Ulaş Hüseyin Telli", "Stj. Av. Mehmet Yılmaz"
export function getLawyerDisplayName(lawyer: { 
  name: string; 
  surname: string; 
  title?: string | null;
  role?: LawyerRole | string;
}): string {
  const fullName = `${lawyer.name} ${lawyer.surname}`.trim();
  
  // Önce özel title varsa onu kullan, yoksa role'e göre varsayılan
  const title = lawyer.title || DEFAULT_TITLES[lawyer.role as string] || "Av.";
  
  return `${title} ${fullName}`;
}

// Mevcut unvan seçenekleri (UI'da dropdown için)
export const TITLE_OPTIONS = [
  { value: "Av.", label: "Av. (Avukat)" },
  { value: "Stj. Av.", label: "Stj. Av. (Stajyer Avukat)" },
  { value: "Huk. Müş.", label: "Huk. Müş. (Hukuk Müşaviri)" },
  { value: "İcra Kat.", label: "İcra Kat. (İcra Katibi)" },
  { value: "Sek.", label: "Sek. (Sekreter)" },
  { value: "Muh.", label: "Muh. (Muhasebeci)" },
  { value: "Arş.", label: "Arş. (Arşiv Sorumlusu)" },
  { value: "", label: "(Unvansız)" },
];

// Avukat nesnesine displayName ekle
export function withDisplayName<T extends { name: string; surname: string; title?: string | null; role?: LawyerRole | string }>(lawyer: T): T & { displayName: string } {
  return {
    ...lawyer,
    displayName: getLawyerDisplayName(lawyer),
  };
}

// Avukat listesine displayName ekle
export function withDisplayNames<T extends { name: string; surname: string; title?: string | null; role?: LawyerRole | string }>(lawyers: T[]): (T & { displayName: string })[] {
  return lawyers.map(withDisplayName);
}

@Injectable()
export class LawyerService {
  constructor(private prisma: PrismaService) {}

  // Tüm avukatları getir (displayName ile birlikte)
  async findAll(tenantId: string, search?: string, includeInactive = false) {
    const where: any = { tenantId };

    if (!includeInactive) {
      where.isActive = true;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { surname: { contains: search, mode: "insensitive" } },
        { barNumber: { contains: search, mode: "insensitive" } },
        { tckn: { contains: search, mode: "insensitive" } },
      ];
    }

    const lawyers = await this.prisma.lawyer.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });

    // Her avukata displayName ekle (Av. Ad Soyad)
    return withDisplayNames(lawyers);
  }

  // Varsayılan avukatları getir (yeni takiplerde otomatik seçilecekler)
  async findDefaults(tenantId: string) {
    const lawyers = await this.prisma.lawyer.findMany({
      where: {
        tenantId,
        isActive: true,
        isDefaultForNewCases: true,
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });

    return withDisplayNames(lawyers);
  }

  // Tek avukat getir
  async findOne(tenantId: string, id: string) {
    const lawyer = await this.prisma.lawyer.findFirst({
      where: { id, tenantId },
    });

    if (!lawyer) {
      throw new NotFoundException("Avukat bulunamadı");
    }

    return withDisplayName(lawyer);
  }

  // Avukat oluştur
  async create(
    tenantId: string,
    data: {
      name: string;
      surname: string;
      tckn?: string;
      gender?: string;
      barNumber?: string;
      barCity?: string;
      tbbNo?: string;
      vergiDairesi?: string;
      vergiNo?: string;
      email?: string;
      phone?: string;
      fax?: string;
      address?: string;
      city?: string;
      district?: string;
      bankName?: string;
      branchName?: string;
      iban?: string;
      isInHouseCounsel?: boolean;
      isEmployee?: boolean;
      role?: LawyerRole;
      title?: string; // Unvan/Sıfat (Av., Stj. Av., Huk. Müş., vb.)
      canSign?: boolean;
      canAppearInUyap?: boolean;
      canBeResponsible?: boolean;
      isDefaultForNewCases?: boolean;
      // Yeni alanlar
      lawyerRank?: LawyerRank;
      defaultPermissions?: any;
      permissionsLocked?: boolean;
      canModifyOtherPermissions?: boolean;
    }
  ) {
    // Office'i al veya oluştur
    let office = await this.prisma.office.findUnique({
      where: { tenantId },
    });

    if (!office) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
      });
      office = await this.prisma.office.create({
        data: {
          tenantId,
          name: tenant?.name || "Hukuk Bürosu",
        },
      });
    }

    // Sıralama için mevcut en yüksek sortOrder'ı bul
    const maxSort = await this.prisma.lawyer.aggregate({
      where: { tenantId },
      _max: { sortOrder: true },
    });

    const lawyer = await this.prisma.lawyer.create({
      data: {
        tenantId,
        officeId: office.id,
        sortOrder: (maxSort._max.sortOrder || 0) + 1,
        ...data,
      },
    });

    return withDisplayName(lawyer);
  }

  // Avukat güncelle
  async update(
    tenantId: string,
    id: string,
    data: {
      name?: string;
      surname?: string;
      tckn?: string;
      gender?: string;
      barNumber?: string;
      barCity?: string;
      tbbNo?: string;
      vergiDairesi?: string;
      vergiNo?: string;
      email?: string;
      phone?: string;
      fax?: string;
      address?: string;
      city?: string;
      district?: string;
      bankName?: string;
      branchName?: string;
      iban?: string;
      isInHouseCounsel?: boolean;
      isEmployee?: boolean;
      role?: LawyerRole;
      title?: string; // Unvan/Sıfat (Av., Stj. Av., Huk. Müş., vb.)
      canSign?: boolean;
      canAppearInUyap?: boolean;
      canBeResponsible?: boolean;
      isDefaultForNewCases?: boolean;
      sortOrder?: number;
      isActive?: boolean;
      // Yeni alanlar
      lawyerRank?: LawyerRank;
      defaultPermissions?: any;
      permissionsLocked?: boolean;
      canModifyOtherPermissions?: boolean;
    }
  ) {
    // Avukatın bu tenant'a ait olduğunu kontrol et
    await this.findOne(tenantId, id);

    const lawyer = await this.prisma.lawyer.update({
      where: { id },
      data,
    });

    return withDisplayName(lawyer);
  }

  // Avukat sil (kalıcı silme)
  async delete(tenantId: string, id: string) {
    await this.findOne(tenantId, id);

    // Önce CaseLawyer ilişkilerini sil
    await this.prisma.caseLawyer.deleteMany({
      where: { lawyerId: id },
    });

    // Sonra avukatı kalıcı olarak sil
    return this.prisma.lawyer.delete({
      where: { id },
    });
  }

  // Avukat sıralamasını güncelle
  async updateOrder(tenantId: string, lawyerIds: string[]) {
    const updates = lawyerIds.map((id, index) =>
      this.prisma.lawyer.updateMany({
        where: { id, tenantId },
        data: { sortOrder: index },
      })
    );

    await this.prisma.$transaction(updates);

    return this.findAll(tenantId);
  }

  // Varsayılan avukatları ayarla
  async setDefaults(tenantId: string, lawyerIds: string[]) {
    // Önce tüm varsayılanları kaldır
    await this.prisma.lawyer.updateMany({
      where: { tenantId },
      data: { isDefaultForNewCases: false },
    });

    // Seçilenleri varsayılan yap
    if (lawyerIds.length > 0) {
      await this.prisma.lawyer.updateMany({
        where: { id: { in: lawyerIds }, tenantId },
        data: { isDefaultForNewCases: true },
      });
    }

    return this.findAll(tenantId);
  }
}
