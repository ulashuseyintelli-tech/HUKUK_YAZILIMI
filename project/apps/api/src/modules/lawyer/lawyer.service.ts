import { Injectable, NotFoundException, ConflictException } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { LawyerRole, LawyerRank } from "@prisma/client";
import { normalizePersonName } from "@/common/name-match.util";

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
      mobilePhone?: string;
      whatsappPhone?: string;
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
    // PR-AUDIT: duplicate guard — aynı baro no/TCKN VEYA aynı ad-soyad → yeni AÇMA, mevcut döndür.
    // (Eskiden guard yoktu → "Ulaş Hüseyin Telli" gibi mükerrer avukat açılıyordu → yetki/atama karışıklığı.)
    const wantName = normalizePersonName(data.name, data.surname);
    const allLawyers = await this.prisma.lawyer.findMany({ where: { tenantId } });
    const dup = allLawyers.find(
      (l) =>
        (data.barNumber && l.barNumber === data.barNumber) ||
        (data.tckn && l.tckn === data.tckn) ||
        (!!wantName && normalizePersonName(l.name, l.surname) === wantName),
    );
    if (dup) {
      const wasReactivated = (dup as any).isActive === false;
      if (wasReactivated) {
        await this.prisma.lawyer.update({ where: { id: dup.id }, data: { isActive: true } });
      }
      return { ...(dup as any), isActive: true, _existingReturned: true, _reactivated: wasReactivated };
    }

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
      mobilePhone?: string;
      whatsappPhone?: string;
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
      // PR-U1: isim benzerliği review'ını bilinçli geç ("Benzerliğe rağmen güncelle").
      confirmSimilarNameUpdate?: boolean;
    }
  ) {
    // Avukatın bu tenant'a ait olduğunu kontrol et
    const existing = await this.findOne(tenantId, id);

    // PR-U1: UPDATE-PATH DUPLICATE GUARD. create guard'ı vardı ama edit yan kapısı açıktı
    // (örn. "Ulaş Telli" açıp sonra "Hüseyin" ekleyerek mükerrer üretmek). Self (id) HARİÇ,
    // yalnız AKTİF diğer kayıtlara bakılır. confirmSimilarNameUpdate yalnız İSİM review'ını geçer
    // (kimlik collision'ı GEÇMEZ). Yalnız ilgili alan GERÇEKTEN değişince tetiklenir.
    const mergedTckn = data.tckn ?? existing.tckn;
    const mergedBar = data.barNumber ?? existing.barNumber;
    const tcknChanged = data.tckn !== undefined && data.tckn !== existing.tckn;
    const barChanged = data.barNumber !== undefined && data.barNumber !== existing.barNumber;

    if (tcknChanged || barChanged) {
      const others = await this.prisma.lawyer.findMany({
        where: { tenantId, isActive: true, id: { not: id } },
      });
      const idDup = others.find(
        (l) => (mergedTckn && l.tckn === mergedTckn) || (mergedBar && l.barNumber === mergedBar),
      );
      if (idDup) {
        throw new ConflictException({
          code: "DUPLICATE_IDENTITY",
          message: "Bu kimlik/baro numarasına sahip başka bir avukat mevcut",
          existingLawyer: { id: idDup.id, name: `${idDup.name} ${idDup.surname}`.replace(/\s+/g, " ").trim() },
        });
      }
    }

    const wantName = normalizePersonName(data.name ?? existing.name, data.surname ?? existing.surname);
    const nameChanged = wantName !== normalizePersonName(existing.name, existing.surname);
    if (nameChanged && !data.confirmSimilarNameUpdate && wantName) {
      const others = await this.prisma.lawyer.findMany({
        where: { tenantId, isActive: true, id: { not: id } },
      });
      const candidates = others
        .filter((l) => normalizePersonName(l.name, l.surname) === wantName)
        .map((l) => ({ id: l.id, name: `${l.name} ${l.surname}`.replace(/\s+/g, " ").trim() }));
      if (candidates.length > 0) {
        throw new ConflictException({
          code: "SIMILAR_NAME_REVIEW",
          message: "Benzer isimli avukat mevcut. Benzerliğe rağmen bu kaydı güncelleyebilir veya vazgeçebilirsiniz.",
          candidates,
        });
      }
    }

    // confirmSimilarNameUpdate transient → prisma'ya YAZILMAZ.
    const { confirmSimilarNameUpdate, ...writeData } = data;
    const lawyer = await this.prisma.lawyer.update({
      where: { id },
      data: writeData,
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
