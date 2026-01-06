import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Tenant ID'yi al (varsayılan tenant)
  const tenant = await prisma.tenant.findFirst();
  if (!tenant) {
    console.error('Tenant bulunamadı! Önce tenant oluşturun.');
    process.exit(1);
  }
  const tenantId = tenant.id;
  console.log(`Tenant: ${tenant.name} (${tenantId})`);

  // ==================== TAKİP TÜRLERİ ====================
  // Önce takip türlerini oluştur (varsayılan değerler sonra eklenecek)
  const takipTurleri = [
    { code: 'ILAMSIZ_GENEL', name: 'İlamsız Genel Haciz', description: 'Genel alacak takibi', sortOrder: 1 },
    { code: 'ILAMSIZ_KIRA', name: 'İlamsız Kira', description: 'Kira alacağı takibi', sortOrder: 2 },
    { code: 'ILAMSIZ_TAHLIYE', name: 'İlamsız Tahliye', description: 'Kiracı tahliyesi takibi', sortOrder: 3 },
    { code: 'ILAMLI', name: 'İlamlı Takip', description: 'Mahkeme kararına dayalı takip', sortOrder: 4 },
    { code: 'NAFAKA', name: 'Nafaka', description: 'Nafaka alacağı takibi', sortOrder: 5 },
    { code: 'KAMBIYO_CEK', name: 'Kambiyo - Çek', description: 'Çeke dayalı takip', sortOrder: 6 },
    { code: 'KAMBIYO_SENET', name: 'Kambiyo - Senet', description: 'Senede dayalı takip', sortOrder: 7 },
    { code: 'REHIN_TASINIR', name: 'Rehin - Taşınır', description: 'Taşınır rehni paraya çevirme', sortOrder: 8 },
    { code: 'REHIN_TASINMAZ', name: 'Rehin - Taşınmaz (İpotek)', description: 'İpotek paraya çevirme', sortOrder: 9 },
    { code: 'IFLAS_ADI', name: 'İflas - Adi Takip', description: 'Tacir borçluya karşı adi alacak için iflas', sortOrder: 10 },
    { code: 'IFLAS_KAMBIYO', name: 'İflas - Kambiyo', description: 'Tacir borçluya karşı kambiyo senedi için iflas', sortOrder: 11 },
  ];

  for (const item of takipTurleri) {
    await prisma.lookupTakipTuru.upsert({
      where: { tenantId_code: { tenantId, code: item.code } },
      update: { name: item.name, description: item.description, sortOrder: item.sortOrder },
      create: { tenantId, ...item },
    });
  }
  console.log(`✓ ${takipTurleri.length} Takip Türü eklendi`);

  // ==================== AŞAMALAR ====================
  const asamalar = [
    { code: 'DOSYA_ACILDI', name: 'Dosya Açıldı', description: 'Takip başlatıldı', sortOrder: 1 },
    { code: 'ODEME_EMRI_TEBLIG', name: 'Ödeme Emri Tebliğ Aşaması', description: 'Ödeme emri gönderildi', sortOrder: 2 },
    { code: 'TEBLIGAT_IADE', name: 'Tebligat İade / Adres Araştırması', description: 'Tebligat iade geldi', sortOrder: 3 },
    { code: 'HACIZ_TALEP', name: 'Haciz Talep Edildi', description: 'Haciz talebi yapıldı', sortOrder: 4 },
    { code: 'HACIZ_YAPILDI', name: 'Haciz Yapıldı', description: 'Haciz işlemi tamamlandı', sortOrder: 5 },
    { code: 'MAAS_HACZI', name: 'Maaş Haczi', description: 'Maaş haczi uygulandı', sortOrder: 6 },
    { code: 'SATIS_ASAMASI', name: 'Satış Aşaması', description: 'Satış süreci başladı', sortOrder: 7 },
    { code: 'TAHSILAT_KAPAMA', name: 'Tahsilat / Kapama Hazırlığı', description: 'Tahsilat yapıldı', sortOrder: 8 },
    { code: 'DOSYA_KAPANDI', name: 'Dosya Kapatıldı', description: 'Takip sonlandı', sortOrder: 9 },
  ];

  for (const item of asamalar) {
    await prisma.lookupAsama.upsert({
      where: { tenantId_code: { tenantId, code: item.code } },
      update: { name: item.name, description: item.description, sortOrder: item.sortOrder },
      create: { tenantId, ...item },
    });
  }
  console.log(`✓ ${asamalar.length} Aşama eklendi`);


  // ==================== RİSK SINIFLARI ====================
  const riskler = [
    { code: 'DUSUK', name: 'Düşük', description: 'Tahsil ihtimali yüksek', color: '#22c55e', sortOrder: 1 },
    { code: 'ORTA', name: 'Orta', description: 'Tahsil ihtimali orta', color: '#eab308', sortOrder: 2 },
    { code: 'YUKSEK', name: 'Yüksek', description: 'Tahsil ihtimali düşük', color: '#ef4444', sortOrder: 3 },
  ];

  for (const item of riskler) {
    await prisma.lookupRisk.upsert({
      where: { tenantId_code: { tenantId, code: item.code } },
      update: { name: item.name, description: item.description, color: item.color, sortOrder: item.sortOrder },
      create: { tenantId, ...item },
    });
  }
  console.log(`✓ ${riskler.length} Risk Sınıfı eklendi`);

  // ==================== BORÇLU TİPLERİ ====================
  const borcluTipleri = [
    { code: 'GERCEK_KISI', name: 'Gerçek Kişi', description: 'Bireysel borçlu', sortOrder: 1 },
    { code: 'TUZEL_KISI', name: 'Tüzel Kişi (Şirket)', description: 'Şirket borçlu', sortOrder: 2 },
    { code: 'KAMU', name: 'Kamu Kurumu', description: 'Kamu kurumu borçlu', sortOrder: 3 },
  ];

  for (const item of borcluTipleri) {
    await prisma.lookupBorcluTipi.upsert({
      where: { tenantId_code: { tenantId, code: item.code } },
      update: { name: item.name, description: item.description, sortOrder: item.sortOrder },
      create: { tenantId, ...item },
    });
  }
  console.log(`✓ ${borcluTipleri.length} Borçlu Tipi eklendi`);

  // ==================== DURUM ETİKETLERİ ====================
  const durumEtiketleri = [
    { code: 'MASRAF_BEKLIYOR', name: 'Masraf Bekliyor', description: 'Masraf yatırılması bekleniyor', color: '#f97316', sortOrder: 1 },
    { code: 'MUVAFAKAT_BEKLIYOR', name: 'Muvafakat Bekliyor', description: 'Müvekkil onayı bekleniyor', color: '#8b5cf6', sortOrder: 2 },
    { code: 'ADRES_ARASTIRMA', name: 'Adres Araştırması Gerekiyor', description: 'Yeni adres araştırılacak', color: '#06b6d4', sortOrder: 3 },
    { code: 'MERNIS_BEKLIYOR', name: 'MERNİS Bekliyor', description: 'MERNİS sorgusu bekleniyor', color: '#3b82f6', sortOrder: 4 },
    { code: 'ARABULUCULUK', name: 'Arabuluculuk Süreci', description: 'Arabuluculuk görüşmesi', color: '#10b981', sortOrder: 5 },
    { code: 'SULH_GORUSMESI', name: 'Sulh Görüşmesi', description: 'Sulh görüşmesi yapılıyor', color: '#14b8a6', sortOrder: 6 },
    { code: 'KAPANACAK_TAHSIL', name: 'Kapanacak (Tahsil)', description: 'Tahsilat tamamlandı, kapatılacak', color: '#22c55e', sortOrder: 7 },
    { code: 'KAPANACAK_FERAGAT', name: 'Kapanacak (Feragat)', description: 'Feragat edildi, kapatılacak', color: '#84cc16', sortOrder: 8 },
    { code: 'BEKLEMEDE', name: 'Beklemede', description: 'Genel bekleme durumu', color: '#6b7280', sortOrder: 9 },
  ];

  for (const item of durumEtiketleri) {
    await prisma.lookupDurumEtiketi.upsert({
      where: { tenantId_code: { tenantId, code: item.code } },
      update: { name: item.name, description: item.description, color: item.color, sortOrder: item.sortOrder },
      create: { tenantId, ...item },
    });
  }
  console.log(`✓ ${durumEtiketleri.length} Durum Etiketi eklendi`);

  // ==================== MAHİYET TİPLERİ (Alacak Türleri) ====================
  const mahiyetTipleri = [
    { code: 'PARA', name: 'Genel Para Alacağı', description: 'Genel para alacağı takibi', uyapCode: null, sortOrder: 1 },
    { code: 'KIRA', name: 'Kira Alacağı', description: 'Kira bedeli alacağı', uyapCode: null, sortOrder: 2 },
    { code: 'AIDAT', name: 'Aidat / Site Gideri', description: 'Apartman/site aidatı ve ortak giderler', uyapCode: null, sortOrder: 3 },
    { code: 'KREDI', name: 'Kredi Alacağı', description: 'Tüketici/ticari kredi alacağı', uyapCode: null, sortOrder: 4 },
    { code: 'KREDI_KARTI', name: 'Kredi Kartı Alacağı', description: 'Kredi kartı borcu', uyapCode: null, sortOrder: 5 },
    { code: 'BANKA', name: 'Banka Alacağı (İİK 68)', description: 'Banka genel kredi sözleşmesine dayalı alacak', uyapCode: null, sortOrder: 6 },
    { code: 'NAFAKA', name: 'Nafaka Alacağı', description: 'Nafaka alacağı takibi', uyapCode: '201', sortOrder: 7 },
    { code: 'KIRA_FARK', name: 'Kira Farkı / Ecrimisil', description: 'Kira farkı ve ecrimisil alacağı', uyapCode: null, sortOrder: 8 },
    { code: 'FATURA', name: 'Fatura Alacağı', description: 'Fatura ve cari hesap alacağı', uyapCode: null, sortOrder: 9 },
    { code: 'CEK', name: 'Çek Alacağı', description: 'Çeke dayalı alacak', uyapCode: null, sortOrder: 10 },
    { code: 'SENET', name: 'Senet Alacağı', description: 'Senede dayalı alacak', uyapCode: null, sortOrder: 11 },
    { code: 'TAZMINAT', name: 'Tazminat Alacağı', description: 'Mahkeme kararına dayalı tazminat', uyapCode: null, sortOrder: 12 },
    { code: 'ICRA_INKAR', name: 'İcra İnkâr Tazminatı', description: 'İcra inkâr tazminatı içeren dosya', uyapCode: null, sortOrder: 13 },
    { code: 'ISCILIK', name: 'İşçilik Alacağı', description: 'İşçilik ve kıdem tazminatı alacağı', uyapCode: null, sortOrder: 14 },
    { code: 'TAHLIYE', name: 'Tahliye', description: 'Kiracı tahliyesi takibi', uyapCode: null, sortOrder: 15 },
    { code: 'IPOTEK', name: 'İpotek Alacağı', description: 'İpotek akit tablosuna dayalı alacak', uyapCode: null, sortOrder: 16 },
    { code: 'REHIN', name: 'Rehin Alacağı', description: 'Taşınır rehni alacağı (araç, ticari işletme vb.)', uyapCode: null, sortOrder: 17 },
    { code: 'DIGER', name: 'Diğer', description: 'Diğer alacak türleri', uyapCode: null, sortOrder: 99 },
  ];

  for (const item of mahiyetTipleri) {
    await prisma.lookupMahiyetTipi.upsert({
      where: { tenantId_code: { tenantId, code: item.code } },
      update: { name: item.name, description: item.description, uyapCode: item.uyapCode, sortOrder: item.sortOrder },
      create: { tenantId, ...item },
    });
  }
  console.log(`✓ ${mahiyetTipleri.length} Mahiyet Tipi eklendi`);

  // ==================== TAKİP TÜRÜ VARSAYILAN DEĞERLERİ ====================
  // Takip türlerine varsayılan mahiyet tipi ve borçlu tipi ata
  // Risk durumu dosya açıldıktan sonra manuel belirlenir (otomatik atanmaz)
  
  const takipTuruDefaults: Record<string, { mahiyetKodu: string; borcluTipiKodu: string }> = {
    'ILAMSIZ_GENEL': { mahiyetKodu: 'PARA', borcluTipiKodu: 'GERCEK_KISI' },
    'ILAMSIZ_KIRA': { mahiyetKodu: 'KIRA', borcluTipiKodu: 'GERCEK_KISI' },
    'ILAMSIZ_TAHLIYE': { mahiyetKodu: 'TAHLIYE', borcluTipiKodu: 'GERCEK_KISI' },
    'ILAMLI': { mahiyetKodu: 'TAZMINAT', borcluTipiKodu: 'GERCEK_KISI' },
    'NAFAKA': { mahiyetKodu: 'NAFAKA', borcluTipiKodu: 'GERCEK_KISI' },
    'KAMBIYO_CEK': { mahiyetKodu: 'CEK', borcluTipiKodu: 'TUZEL_KISI' },
    'KAMBIYO_SENET': { mahiyetKodu: 'SENET', borcluTipiKodu: 'GERCEK_KISI' },
    'REHIN_TASINIR': { mahiyetKodu: 'REHIN', borcluTipiKodu: 'GERCEK_KISI' },
    'REHIN_TASINMAZ': { mahiyetKodu: 'IPOTEK', borcluTipiKodu: 'GERCEK_KISI' },
    'IFLAS_ADI': { mahiyetKodu: 'PARA', borcluTipiKodu: 'TUZEL_KISI' },
    'IFLAS_KAMBIYO': { mahiyetKodu: 'SENET', borcluTipiKodu: 'TUZEL_KISI' },
  };

  // Mahiyet tipleri ve borçlu tiplerini al
  const mahiyetTipleriDb = await prisma.lookupMahiyetTipi.findMany({ where: { tenantId } });
  const borcluTipleriDb = await prisma.lookupBorcluTipi.findMany({ where: { tenantId } });
  
  // Takip türlerini varsayılan değerlerle güncelle
  for (const [takipKodu, defaults] of Object.entries(takipTuruDefaults)) {
    const mahiyetTipi = mahiyetTipleriDb.find(m => m.code === defaults.mahiyetKodu);
    const borcluTipi = borcluTipleriDb.find(b => b.code === defaults.borcluTipiKodu);
    
    if (mahiyetTipi && borcluTipi) {
      await prisma.lookupTakipTuru.update({
        where: { tenantId_code: { tenantId, code: takipKodu } },
        data: {
          defaultMahiyetTipiId: mahiyetTipi.id,
          defaultBorcluTipiId: borcluTipi.id,
        },
      });
    }
  }
  console.log(`✓ Takip türü varsayılan değerleri güncellendi`);

  console.log('\n✅ Tüm lookup verileri başarıyla eklendi!');
}

main()
  .catch((e) => {
    console.error('Hata:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
