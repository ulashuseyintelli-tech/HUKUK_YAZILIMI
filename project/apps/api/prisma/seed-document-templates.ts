import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const documentTemplates = [
  // ==================== TAKİP TALEBİ ŞABLONLARI ====================
  {
    code: 'TAKIP_TALEBI_GENEL',
    name: 'Takip Talebi - Genel',
    title: 'İLAMLI İCRA TAKİP TALEBİ',
    description: 'Genel alacak için ilamlı icra takip talebi (değişken faizli)',
    category: 'TAKIP_TALEBI',
    subCategory: 'GENEL',
    currency: 'TRY',
    iikMaddesi: 'İİK m.4',
    templateContent: `T.C.
{{executionOffice.name}}

DOSYA NO: {{fileNumber}}

ALACAKLI: {{creditor.name}}
{{creditor.identityNo ? 'TC/VKN: ' + creditor.identityNo : ''}}
Adres: {{creditor.address}}

VEKİLİ: {{lawyer.name}}
{{lawyer.barNumber ? 'Baro Sicil No: ' + lawyer.barNumber : ''}}

BORÇLU: {{debtor.name}}
{{debtor.identityNo ? 'TC/VKN: ' + debtor.identityNo : ''}}
Adres: {{debtor.address}}

ALACAĞIN TÜRÜ: {{caseType}}

ALACAK MİKTARI:
Asıl Alacak: {{principal}} TL
{{interestStartDate ? 'Faiz Başlangıç Tarihi: ' + interestStartDate : ''}}
Faiz Türü: Değişen oranlarda yasal faiz

TALEP:
Yukarıda belirtilen asıl alacak {{principal}} TL'nin {{interestStartDate}} tarihinden itibaren işleyecek değişen oranlarda yasal faizi ile birlikte tahsili için icra takibi başlatılmasını, borçluya ödeme emri gönderilmesini talep ederim.

Tarih: {{date}}

{{lawyer.name}}
Alacaklı Vekili`,
    variables: JSON.stringify([
      'executionOffice.name', 'fileNumber', 'creditor.name', 'creditor.identityNo',
      'creditor.address', 'lawyer.name', 'lawyer.barNumber', 'debtor.name',
      'debtor.identityNo', 'debtor.address', 'caseType', 'principal',
      'interestStartDate', 'date'
    ]),
  },
  {
    code: 'TAKIP_TALEBI_NAFAKA',
    name: 'Takip Talebi - Nafaka',
    title: 'İLAMLI İCRA TAKİP TALEBİ (NAFAKA)',
    description: 'Nafaka alacağı için ilamlı icra takip talebi (dönemsel)',
    category: 'TAKIP_TALEBI',
    subCategory: 'NAFAKA',
    currency: 'TRY',
    iikMaddesi: 'İİK m.4',
    templateContent: `T.C.
{{executionOffice.name}}

DOSYA NO: {{fileNumber}}

ALACAKLI: {{creditor.name}}
{{creditor.identityNo ? 'TC/VKN: ' + creditor.identityNo : ''}}
Adres: {{creditor.address}}

VEKİLİ: {{lawyer.name}}
{{lawyer.barNumber ? 'Baro Sicil No: ' + lawyer.barNumber : ''}}

BORÇLU: {{debtor.name}}
{{debtor.identityNo ? 'TC/VKN: ' + debtor.identityNo : ''}}
Adres: {{debtor.address}}

ALACAĞIN TÜRÜ: NAFAKA ALACAĞI

ALACAK MİKTARI:
Birikmiş Nafaka: {{principal}} TL ({{nafakaPeriod}})
Aylık Nafaka: {{monthlyAmount}} TL

TALEP:
Yukarıda belirtilen birikmiş nafaka alacağı {{principal}} TL ile devam eden aylar için aylık {{monthlyAmount}} TL nafakanın tahsili için icra takibi başlatılmasını, borçluya ödeme emri gönderilmesini talep ederim.

Nafaka alacağı süreklilik arz ettiğinden, takip eden ayların nafaka alacakları da bu dosyadan tahsil edilecektir.

Tarih: {{date}}

{{lawyer.name}}
Alacaklı Vekili`,
    variables: JSON.stringify([
      'executionOffice.name', 'fileNumber', 'creditor.name', 'creditor.identityNo',
      'creditor.address', 'lawyer.name', 'lawyer.barNumber', 'debtor.name',
      'debtor.identityNo', 'debtor.address', 'principal', 'nafakaPeriod',
      'monthlyAmount', 'date'
    ]),
  },
  {
    code: 'TAKIP_TALEBI_DOVIZ',
    name: 'Takip Talebi - Döviz',
    title: 'İLAMLI İCRA TAKİP TALEBİ (DÖVİZ)',
    description: 'Döviz alacağı için ilamlı icra takip talebi (kur hesaplamalı)',
    category: 'TAKIP_TALEBI',
    subCategory: 'DOVIZ',
    currency: null, // Tüm dövizler için
    iikMaddesi: 'İİK m.4',
    templateContent: `T.C.
{{executionOffice.name}}

DOSYA NO: {{fileNumber}}

ALACAKLI: {{creditor.name}}
{{creditor.identityNo ? 'TC/VKN: ' + creditor.identityNo : ''}}
Adres: {{creditor.address}}

VEKİLİ: {{lawyer.name}}
{{lawyer.barNumber ? 'Baro Sicil No: ' + lawyer.barNumber : ''}}

BORÇLU: {{debtor.name}}
{{debtor.identityNo ? 'TC/VKN: ' + debtor.identityNo : ''}}
Adres: {{debtor.address}}

ALACAĞIN TÜRÜ: DÖVİZ ALACAĞI

ALACAK MİKTARI:
Asıl Alacak: {{principal}} {{currency}}
Vade Tarihi: {{dueDate}}

TALEP:
Yukarıda belirtilen {{principal}} {{currency}} tutarındaki alacağın, fiili ödeme tarihindeki T.C. Merkez Bankası efektif satış kuru üzerinden Türk Lirası karşılığının tahsili için icra takibi başlatılmasını, borçluya ödeme emri gönderilmesini talep ederim.

Döviz alacağı olması nedeniyle, ödeme tarihindeki güncel kur esas alınacaktır.

Tarih: {{date}}

{{lawyer.name}}
Alacaklı Vekili`,
    variables: JSON.stringify([
      'executionOffice.name', 'fileNumber', 'creditor.name', 'creditor.identityNo',
      'creditor.address', 'lawyer.name', 'lawyer.barNumber', 'debtor.name',
      'debtor.identityNo', 'debtor.address', 'principal', 'currency', 'dueDate', 'date'
    ]),
  },

  // ==================== ÖDEME EMRİ ŞABLONLARI ====================
  {
    code: 'ODEME_EMRI_GENEL',
    name: 'Ödeme Emri - Genel',
    title: 'ÖDEME EMRİ',
    description: 'Genel alacak için ödeme emri',
    category: 'ODEME_EMRI',
    subCategory: 'GENEL',
    currency: 'TRY',
    iikMaddesi: 'İİK m.32',
    templateContent: `T.C.
{{executionOffice.name}}

DOSYA NO: {{fileNumber}}
TARİH: {{date}}

ÖDEME EMRİ

ALACAKLI: {{creditor.name}}
BORÇLU: {{debtor.name}}
Adres: {{debtor.address}}

ALACAK BİLGİLERİ:
Asıl Alacak: {{principal}} TL
İşlemiş Faiz: {{interest}} TL
Masraflar: {{expenses}} TL
TOPLAM: {{total}} TL

İşbu ödeme emrinin tebliğinden itibaren 10 GÜN içinde yukarıda yazılı borcu ödemeniz, borcun tamamına veya bir kısmına ya da alacaklının takip hakkına itirazınız varsa 7 GÜN içinde icra dairesine bildirmeniz, aksi halde cebri icraya devam olunacağı ihtar olunur.

İCRA DAİRESİ HESAP BİLGİLERİ:
Banka: {{executionOffice.bankName}}
IBAN: {{executionOffice.iban}}

İcra Müdürü
İmza - Mühür`,
    variables: JSON.stringify([
      'executionOffice.name', 'executionOffice.bankName', 'executionOffice.iban',
      'fileNumber', 'date', 'creditor.name', 'debtor.name', 'debtor.address',
      'principal', 'interest', 'expenses', 'total'
    ]),
  },
  {
    code: 'ODEME_EMRI_NAFAKA',
    name: 'Ödeme Emri - Nafaka',
    title: 'ÖDEME EMRİ (NAFAKA)',
    description: 'Nafaka alacağı için ödeme emri',
    category: 'ODEME_EMRI',
    subCategory: 'NAFAKA',
    currency: 'TRY',
    iikMaddesi: 'İİK m.32',
    templateContent: `T.C.
{{executionOffice.name}}

DOSYA NO: {{fileNumber}}
TARİH: {{date}}

ÖDEME EMRİ (NAFAKA ALACAĞI)

ALACAKLI: {{creditor.name}}
BORÇLU: {{debtor.name}}
Adres: {{debtor.address}}

ALACAK BİLGİLERİ:
Birikmiş Nafaka: {{principal}} TL
Aylık Nafaka: {{monthlyAmount}} TL
Nafaka Dönemi: {{nafakaPeriod}}
TOPLAM: {{total}} TL

İşbu ödeme emrinin tebliğinden itibaren 10 GÜN içinde yukarıda yazılı borcu ödemeniz gerekmektedir.

UYARI: Nafaka alacağı süreklilik arz etmekte olup, devam eden ayların nafaka alacakları da bu dosyadan tahsil edilecektir.

İCRA DAİRESİ HESAP BİLGİLERİ:
Banka: {{executionOffice.bankName}}
IBAN: {{executionOffice.iban}}

İcra Müdürü
İmza - Mühür`,
    variables: JSON.stringify([
      'executionOffice.name', 'executionOffice.bankName', 'executionOffice.iban',
      'fileNumber', 'date', 'creditor.name', 'debtor.name', 'debtor.address',
      'principal', 'monthlyAmount', 'nafakaPeriod', 'total'
    ]),
  },
  {
    code: 'ODEME_EMRI_DOVIZ',
    name: 'Ödeme Emri - Döviz',
    title: 'ÖDEME EMRİ (DÖVİZ)',
    description: 'Döviz alacağı için ödeme emri',
    category: 'ODEME_EMRI',
    subCategory: 'DOVIZ',
    currency: null,
    iikMaddesi: 'İİK m.32',
    templateContent: `T.C.
{{executionOffice.name}}

DOSYA NO: {{fileNumber}}
TARİH: {{date}}

ÖDEME EMRİ (DÖVİZ ALACAĞI)

ALACAKLI: {{creditor.name}}
BORÇLU: {{debtor.name}}
Adres: {{debtor.address}}

ALACAK BİLGİLERİ:
Asıl Alacak: {{principal}} {{currency}}
Kur Hesaplama: Fiili ödeme tarihindeki TCMB efektif satış kuru

İşbu ödeme emrinin tebliğinden itibaren 10 GÜN içinde yukarıda yazılı borcu ödemeniz gerekmektedir.

UYARI: Döviz alacağı olması nedeniyle, ödeme tarihindeki T.C. Merkez Bankası efektif satış kuru üzerinden Türk Lirası karşılığı tahsil edilecektir.

İCRA DAİRESİ HESAP BİLGİLERİ:
Banka: {{executionOffice.bankName}}
IBAN: {{executionOffice.iban}}

İcra Müdürü
İmza - Mühür`,
    variables: JSON.stringify([
      'executionOffice.name', 'executionOffice.bankName', 'executionOffice.iban',
      'fileNumber', 'date', 'creditor.name', 'debtor.name', 'debtor.address',
      'principal', 'currency'
    ]),
  },

  // ==================== HACİZ MÜZEKKERESİ ŞABLONLARI ====================
  {
    code: 'HACIZ_BANKA',
    name: 'Haciz Müzekkeresi - Banka',
    title: 'BANKA HACİZ MÜZEKKERESİ',
    description: 'Banka hesaplarına haciz müzekkeresi',
    category: 'HACIZ_MUZEKKERESI',
    subCategory: 'GENEL',
    currency: 'TRY',
    iikMaddesi: 'İİK m.89',
    templateContent: `T.C.
{{executionOffice.name}}

DOSYA NO: {{fileNumber}}
TARİH: {{date}}

BANKA HACİZ MÜZEKKERESİ

MUHATAP: {{bankName}}

BORÇLU BİLGİLERİ:
Ad Soyad/Unvan: {{debtor.name}}
TC/VKN: {{debtor.identityNo}}

ALACAK MİKTARI: {{total}} TL

İİK'nın 89. maddesi gereğince, yukarıda kimlik bilgileri yazılı borçlunun bankanız nezdindeki tüm hesaplarına (vadesiz, vadeli, döviz, yatırım hesapları dahil) {{total}} TL tutarında HACİZ KONULMASINI,

Haciz konulan meblağın icra dairemiz hesabına aktarılmasını,

Borçlunun hesap bilgilerinin tarafımıza bildirilmesini rica ederim.

İCRA DAİRESİ HESAP BİLGİLERİ:
Banka: {{executionOffice.bankName}}
IBAN: {{executionOffice.iban}}

İcra Müdürü
İmza - Mühür`,
    variables: JSON.stringify([
      'executionOffice.name', 'executionOffice.bankName', 'executionOffice.iban',
      'fileNumber', 'date', 'bankName', 'debtor.name', 'debtor.identityNo', 'total'
    ]),
  },
  {
    code: 'HACIZ_ARAC',
    name: 'Haciz Müzekkeresi - Araç',
    title: 'ARAÇ HACİZ MÜZEKKERESİ',
    description: 'Araç üzerine haciz müzekkeresi',
    category: 'HACIZ_MUZEKKERESI',
    subCategory: 'GENEL',
    currency: 'TRY',
    iikMaddesi: 'İİK m.85',
    templateContent: `T.C.
{{executionOffice.name}}

DOSYA NO: {{fileNumber}}
TARİH: {{date}}

ARAÇ HACİZ MÜZEKKERESİ

MUHATAP: Emniyet Genel Müdürlüğü / Trafik Tescil Şube Müdürlüğü

BORÇLU BİLGİLERİ:
Ad Soyad/Unvan: {{debtor.name}}
TC/VKN: {{debtor.identityNo}}

ALACAK MİKTARI: {{total}} TL

İİK'nın 85. maddesi gereğince, yukarıda kimlik bilgileri yazılı borçlunun adına kayıtlı tüm motorlu taşıtlar üzerine {{total}} TL tutarında HACİZ ŞERHİ İŞLENMESİNİ,

Borçlu adına kayıtlı araç bilgilerinin tarafımıza bildirilmesini rica ederim.

İcra Müdürü
İmza - Mühür`,
    variables: JSON.stringify([
      'executionOffice.name', 'fileNumber', 'date', 'debtor.name', 'debtor.identityNo', 'total'
    ]),
  },
  {
    code: 'HACIZ_MAAS',
    name: 'Haciz Müzekkeresi - Maaş',
    title: 'MAAŞ HACİZ MÜZEKKERESİ',
    description: 'Maaş üzerine haciz müzekkeresi',
    category: 'HACIZ_MUZEKKERESI',
    subCategory: 'GENEL',
    currency: 'TRY',
    iikMaddesi: 'İİK m.83',
    templateContent: `T.C.
{{executionOffice.name}}

DOSYA NO: {{fileNumber}}
TARİH: {{date}}

MAAŞ HACİZ MÜZEKKERESİ

MUHATAP: {{employerName}}

BORÇLU BİLGİLERİ:
Ad Soyad: {{debtor.name}}
TC Kimlik No: {{debtor.identityNo}}

ALACAK MİKTARI: {{total}} TL

İİK'nın 83. maddesi gereğince, yukarıda kimlik bilgileri yazılı borçlunun kurumunuzdan almakta olduğu maaş/ücretin 1/4'ünün (dörtte birinin) her ay kesilmesini ve icra dairemiz hesabına yatırılmasını,

Kesintilerin borç tamamen ödeninceye kadar devam etmesini rica ederim.

NOT: Nafaka alacaklarında kesinti oranı maaşın 1/2'sine (yarısına) kadar çıkabilir.

İCRA DAİRESİ HESAP BİLGİLERİ:
Banka: {{executionOffice.bankName}}
IBAN: {{executionOffice.iban}}

İcra Müdürü
İmza - Mühür`,
    variables: JSON.stringify([
      'executionOffice.name', 'executionOffice.bankName', 'executionOffice.iban',
      'fileNumber', 'date', 'employerName', 'debtor.name', 'debtor.identityNo', 'total'
    ]),
  },
];

async function main() {
  const tenant = await prisma.tenant.findFirst();
  if (!tenant) {
    console.error('❌ Tenant bulunamadı!');
    return;
  }

  console.log('📄 Belge şablonları oluşturuluyor...');

  for (const template of documentTemplates) {
    const existing = await prisma.documentTemplate.findUnique({
      where: { code: template.code },
    });

    if (existing) {
      await prisma.documentTemplate.update({
        where: { code: template.code },
        data: template as any,
      });
      console.log(`🔄 Güncellendi: ${template.name}`);
    } else {
      await prisma.documentTemplate.create({
        data: template as any,
      });
      console.log(`✅ Oluşturuldu: ${template.name}`);
    }
  }

  console.log('\n✅ Belge şablonları tamamlandı!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
