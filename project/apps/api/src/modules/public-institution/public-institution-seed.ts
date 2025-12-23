import { PrismaClient, PublicInstitutionCategory } from '@prisma/client';

// Türkiye Kamu Kurumları - DETSİS Verileri
export const PUBLIC_INSTITUTIONS_DATA = [
  // ==================== BAKANLIKLAR ====================
  { detsisNo: '1', name: 'Cumhurbaşkanlığı', category: 'BAKANLIK' as const, city: 'Ankara' },
  { detsisNo: '2', name: 'Türkiye Büyük Millet Meclisi', category: 'BAKANLIK' as const, city: 'Ankara' },
  { detsisNo: '10', name: 'Adalet Bakanlığı', category: 'BAKANLIK' as const, city: 'Ankara' },
  { detsisNo: '11', name: 'Aile ve Sosyal Hizmetler Bakanlığı', category: 'BAKANLIK' as const, city: 'Ankara' },
  { detsisNo: '12', name: 'Çalışma ve Sosyal Güvenlik Bakanlığı', category: 'BAKANLIK' as const, city: 'Ankara' },
  { detsisNo: '13', name: 'Çevre, Şehircilik ve İklim Değişikliği Bakanlığı', category: 'BAKANLIK' as const, city: 'Ankara' },
  { detsisNo: '14', name: 'Dışişleri Bakanlığı', category: 'BAKANLIK' as const, city: 'Ankara' },
  { detsisNo: '15', name: 'Enerji ve Tabii Kaynaklar Bakanlığı', category: 'BAKANLIK' as const, city: 'Ankara' },
  { detsisNo: '16', name: 'Gençlik ve Spor Bakanlığı', category: 'BAKANLIK' as const, city: 'Ankara' },
  { detsisNo: '17', name: 'Hazine ve Maliye Bakanlığı', category: 'BAKANLIK' as const, city: 'Ankara' },
  { detsisNo: '18', name: 'İçişleri Bakanlığı', category: 'BAKANLIK' as const, city: 'Ankara' },
  { detsisNo: '19', name: 'Kültür ve Turizm Bakanlığı', category: 'BAKANLIK' as const, city: 'Ankara' },
  { detsisNo: '20', name: 'Milli Eğitim Bakanlığı', category: 'BAKANLIK' as const, city: 'Ankara' },
  { detsisNo: '21', name: 'Milli Savunma Bakanlığı', category: 'BAKANLIK' as const, city: 'Ankara' },
  { detsisNo: '22', name: 'Sağlık Bakanlığı', category: 'BAKANLIK' as const, city: 'Ankara' },
  { detsisNo: '23', name: 'Sanayi ve Teknoloji Bakanlığı', category: 'BAKANLIK' as const, city: 'Ankara' },
  { detsisNo: '24', name: 'Tarım ve Orman Bakanlığı', category: 'BAKANLIK' as const, city: 'Ankara' },
  { detsisNo: '25', name: 'Ticaret Bakanlığı', category: 'BAKANLIK' as const, city: 'Ankara' },
  { detsisNo: '26', name: 'Ulaştırma ve Altyapı Bakanlığı', category: 'BAKANLIK' as const, city: 'Ankara' },

  // ==================== GENEL MÜDÜRLÜKLER ====================
  { detsisNo: '100', name: 'Emniyet Genel Müdürlüğü', category: 'GENEL_MUDURLUK' as const, city: 'Ankara' },
  { detsisNo: '101', name: 'Jandarma Genel Komutanlığı', category: 'GENEL_MUDURLUK' as const, city: 'Ankara' },
  { detsisNo: '102', name: 'Sahil Güvenlik Komutanlığı', category: 'GENEL_MUDURLUK' as const, city: 'Ankara' },
  { detsisNo: '103', name: 'Göç İdaresi Başkanlığı', category: 'GENEL_MUDURLUK' as const, city: 'Ankara' },
  { detsisNo: '104', name: 'Nüfus ve Vatandaşlık İşleri Genel Müdürlüğü', category: 'GENEL_MUDURLUK' as const, city: 'Ankara' },
  { detsisNo: '105', name: 'Tapu ve Kadastro Genel Müdürlüğü', category: 'GENEL_MUDURLUK' as const, city: 'Ankara' },
  { detsisNo: '106', name: 'Karayolları Genel Müdürlüğü', category: 'GENEL_MUDURLUK' as const, city: 'Ankara' },
  { detsisNo: '107', name: 'Devlet Su İşleri Genel Müdürlüğü', category: 'GENEL_MUDURLUK' as const, city: 'Ankara' },
  { detsisNo: '108', name: 'Orman Genel Müdürlüğü', category: 'GENEL_MUDURLUK' as const, city: 'Ankara' },
  { detsisNo: '109', name: 'Meteoroloji Genel Müdürlüğü', category: 'GENEL_MUDURLUK' as const, city: 'Ankara' },
  { detsisNo: '110', name: 'Türkiye İstatistik Kurumu', category: 'GENEL_MUDURLUK' as const, city: 'Ankara' },
  { detsisNo: '111', name: 'Gelir İdaresi Başkanlığı', category: 'GENEL_MUDURLUK' as const, city: 'Ankara' },
  { detsisNo: '112', name: 'Sosyal Güvenlik Kurumu', category: 'GENEL_MUDURLUK' as const, city: 'Ankara' },
  { detsisNo: '113', name: 'Türkiye İş Kurumu (İŞKUR)', category: 'GENEL_MUDURLUK' as const, city: 'Ankara' },
  { detsisNo: '114', name: 'PTT A.Ş.', category: 'GENEL_MUDURLUK' as const, city: 'Ankara' },
  { detsisNo: '115', name: 'TCDD Taşımacılık A.Ş.', category: 'GENEL_MUDURLUK' as const, city: 'Ankara' },
  { detsisNo: '116', name: 'Türk Hava Yolları A.O.', category: 'GENEL_MUDURLUK' as const, city: 'İstanbul' },
  { detsisNo: '117', name: 'BOTAŞ', category: 'GENEL_MUDURLUK' as const, city: 'Ankara' },
  { detsisNo: '118', name: 'TEDAŞ', category: 'GENEL_MUDURLUK' as const, city: 'Ankara' },
  { detsisNo: '119', name: 'TEİAŞ', category: 'GENEL_MUDURLUK' as const, city: 'Ankara' },

  // ==================== BAŞKANLIKLAR ====================
  { detsisNo: '200', name: 'Diyanet İşleri Başkanlığı', category: 'BASKANLIK' as const, city: 'Ankara' },
  { detsisNo: '201', name: 'Türkiye Radyo ve Televizyon Kurumu (TRT)', category: 'BASKANLIK' as const, city: 'Ankara' },
  { detsisNo: '202', name: 'Anadolu Ajansı', category: 'BASKANLIK' as const, city: 'Ankara' },
  { detsisNo: '203', name: 'Devlet Personel Başkanlığı', category: 'BASKANLIK' as const, city: 'Ankara' },
  { detsisNo: '204', name: 'Strateji ve Bütçe Başkanlığı', category: 'BASKANLIK' as const, city: 'Ankara' },
  { detsisNo: '205', name: 'İletişim Başkanlığı', category: 'BASKANLIK' as const, city: 'Ankara' },
  { detsisNo: '206', name: 'Savunma Sanayii Başkanlığı', category: 'BASKANLIK' as const, city: 'Ankara' },
  { detsisNo: '207', name: 'Milli İstihbarat Teşkilatı', category: 'BASKANLIK' as const, city: 'Ankara' },
  { detsisNo: '208', name: 'AFAD', category: 'BASKANLIK' as const, city: 'Ankara' },

  // ==================== KURULLAR ====================
  { detsisNo: '300', name: 'Rekabet Kurumu', category: 'KURUL' as const, city: 'Ankara' },
  { detsisNo: '301', name: 'Bankacılık Düzenleme ve Denetleme Kurumu (BDDK)', category: 'KURUL' as const, city: 'İstanbul' },
  { detsisNo: '302', name: 'Sermaye Piyasası Kurulu (SPK)', category: 'KURUL' as const, city: 'Ankara' },
  { detsisNo: '303', name: 'Enerji Piyasası Düzenleme Kurumu (EPDK)', category: 'KURUL' as const, city: 'Ankara' },
  { detsisNo: '304', name: 'Bilgi Teknolojileri ve İletişim Kurumu (BTK)', category: 'KURUL' as const, city: 'Ankara' },
  { detsisNo: '305', name: 'Radyo ve Televizyon Üst Kurulu (RTÜK)', category: 'KURUL' as const, city: 'Ankara' },
  { detsisNo: '306', name: 'Kamu İhale Kurumu', category: 'KURUL' as const, city: 'Ankara' },
  { detsisNo: '307', name: 'Kişisel Verileri Koruma Kurumu (KVKK)', category: 'KURUL' as const, city: 'Ankara' },
  { detsisNo: '308', name: 'Türkiye İnsan Hakları ve Eşitlik Kurumu', category: 'KURUL' as const, city: 'Ankara' },
  { detsisNo: '309', name: 'Kamu Denetçiliği Kurumu (Ombudsman)', category: 'KURUL' as const, city: 'Ankara' },
  { detsisNo: '310', name: 'Sayıştay Başkanlığı', category: 'KURUL' as const, city: 'Ankara' },
  { detsisNo: '311', name: 'Danıştay Başkanlığı', category: 'KURUL' as const, city: 'Ankara' },
  { detsisNo: '312', name: 'Yargıtay Başkanlığı', category: 'KURUL' as const, city: 'Ankara' },
  { detsisNo: '313', name: 'Anayasa Mahkemesi', category: 'KURUL' as const, city: 'Ankara' },
  { detsisNo: '314', name: 'Hakimler ve Savcılar Kurulu', category: 'KURUL' as const, city: 'Ankara' },

  // ==================== KURUMLAR ====================
  { detsisNo: '400', name: 'Türkiye Cumhuriyet Merkez Bankası', category: 'KURUM' as const, city: 'Ankara' },
  { detsisNo: '401', name: 'Türkiye Varlık Fonu', category: 'KURUM' as const, city: 'İstanbul' },
  { detsisNo: '402', name: 'Türkiye Kalkınma ve Yatırım Bankası', category: 'KURUM' as const, city: 'Ankara' },
  { detsisNo: '403', name: 'Ziraat Bankası A.Ş.', category: 'KURUM' as const, city: 'Ankara' },
  { detsisNo: '404', name: 'Halkbank A.Ş.', category: 'KURUM' as const, city: 'Ankara' },
  { detsisNo: '405', name: 'Vakıfbank A.Ş.', category: 'KURUM' as const, city: 'İstanbul' },
  { detsisNo: '406', name: 'TÜBİTAK', category: 'KURUM' as const, city: 'Ankara' },
  { detsisNo: '407', name: 'TÜBA', category: 'KURUM' as const, city: 'Ankara' },
  { detsisNo: '408', name: 'Türk Patent ve Marka Kurumu', category: 'KURUM' as const, city: 'Ankara' },
  { detsisNo: '409', name: 'Türk Standartları Enstitüsü (TSE)', category: 'KURUM' as const, city: 'Ankara' },
  { detsisNo: '410', name: 'KOSGEB', category: 'KURUM' as const, city: 'Ankara' },
  { detsisNo: '411', name: 'Türkiye Odalar ve Borsalar Birliği (TOBB)', category: 'KURUM' as const, city: 'Ankara' },
  { detsisNo: '412', name: 'Türkiye Barolar Birliği', category: 'KURUM' as const, city: 'Ankara' },
  { detsisNo: '413', name: 'Türk Tabipleri Birliği', category: 'KURUM' as const, city: 'Ankara' },
  { detsisNo: '414', name: 'TMMOB', category: 'KURUM' as const, city: 'Ankara' },
  { detsisNo: '415', name: 'Türkiye Noterler Birliği', category: 'KURUM' as const, city: 'Ankara' },
  { detsisNo: '416', name: 'Kızılay', category: 'KURUM' as const, city: 'Ankara' },
  { detsisNo: '417', name: 'Yeşilay', category: 'KURUM' as const, city: 'İstanbul' },
];

// Seed fonksiyonu
export async function seedPublicInstitutions(prisma: PrismaClient) {
  console.log('Seeding public institutions...');
  
  let created = 0;
  let skipped = 0;

  for (const inst of PUBLIC_INSTITUTIONS_DATA) {
    const existing = await prisma.publicInstitution.findUnique({
      where: { detsisNo: inst.detsisNo },
    });

    if (existing) {
      skipped++;
      continue;
    }

    await prisma.publicInstitution.create({
      data: {
        detsisNo: inst.detsisNo,
        name: inst.name,
        category: inst.category,
        city: inst.city,
        isActive: true,
      },
    });
    created++;
  }

  console.log(`Public institutions seeded: ${created} created, ${skipped} skipped`);
  return { created, skipped };
}
