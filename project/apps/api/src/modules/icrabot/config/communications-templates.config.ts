/**
 * COMMUNICATIONS TEMPLATES v4
 * 
 * Müvekkil/avukat bildirim şablonları.
 * Avans talebi, hatırlatma, risk raporu, durum bildirimi vs.
 */

// ==================== TYPES ====================

export type NotificationChannel = 'EMAIL' | 'SMS' | 'WHATSAPP' | 'IN_APP' | 'PUSH';
export type RecipientType = 'CLIENT' | 'ATTORNEY' | 'STAFF' | 'DEBTOR';
export type TemplateCategory = 
  | 'ADVANCE_REQUEST'
  | 'ADVANCE_REMINDER'
  | 'RISK_ALERT'
  | 'STATUS_UPDATE'
  | 'ACTION_REQUIRED'
  | 'PAYMENT_NOTIFICATION'
  | 'TEBLIGAT_UPDATE';

export interface TemplateVariable {
  name: string;
  description: string;
  example: string;
  required: boolean;
}

export interface CommunicationTemplate {
  templateId: string;
  name: string;
  description: string;
  category: TemplateCategory;
  
  // Kanallar
  channels: NotificationChannel[];
  defaultChannel: NotificationChannel;
  
  // Alıcı
  recipientType: RecipientType;
  
  // İçerik
  subject: string; // Email için
  body: string;
  smsBody?: string; // SMS için kısa versiyon
  
  // Değişkenler
  variables: TemplateVariable[];
  
  // Ayarlar
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  allowBatching: boolean; // Toplu gönderilebilir mi
  maxReminders: number; // Maksimum hatırlatma sayısı
  reminderIntervalDays: number[]; // Hatırlatma aralıkları
  
  isActive: boolean;
}

// ==================== TEMPLATES ====================

export const COMMUNICATION_TEMPLATES: CommunicationTemplate[] = [
  
  // ==================== AVANS TALEPLERİ ====================
  
  {
    templateId: 'YAKALAMA_AVANSI_TALEBI',
    name: 'Yakalama Avansı Talebi',
    description: 'Araç yakalama için müvekkilden avans talebi',
    category: 'ADVANCE_REQUEST',
    channels: ['EMAIL', 'SMS', 'WHATSAPP'],
    defaultChannel: 'EMAIL',
    recipientType: 'CLIENT',
    subject: '{{dosyaNo}} - Araç Yakalama Avansı Talebi',
    body: `Sayın {{muvekkilAdi}},

{{dosyaNo}} numaralı icra dosyanızda borçlu {{borcluAdi}} adına kayıtlı {{aracBilgisi}} plakalı araç tespit edilmiştir.

**Araç Bilgileri:**
- Plaka: {{plaka}}
- Marka/Model: {{markaModel}}
- Yıl: {{yil}}
- Tahmini Değer: {{tahminiDeger}} TL

**Haciz Durumu:**
- Sıramız: {{hacizSirasi}}. sıra
{{#if onHacizVar}}
- Önümüzde {{onHacizSayisi}} adet haciz bulunmaktadır.
{{else}}
- Araç üzerinde bizden önce haciz bulunmamaktadır.
{{/if}}

Aracın yakalanması için **{{avanstutar}} TL** yakalama avansı yatırılması gerekmektedir.

**Ödeme Bilgileri:**
Banka: {{bankaAdi}}
IBAN: {{iban}}
Açıklama: {{dosyaNo}} Yakalama Avansı

Son ödeme tarihi: {{sonOdemeTarihi}}

Ödemenizi yaptıktan sonra dekontunuzu bu e-postaya yanıt olarak göndermenizi rica ederiz.

Saygılarımızla,
{{buroAdi}}`,
    smsBody: `{{dosyaNo}} dosyanızda {{plaka}} plakalı araç tespit edildi. Yakalama için {{avanstutar}} TL avans gerekli. Detaylar e-posta ile gönderildi.`,
    variables: [
      { name: 'dosyaNo', description: 'Dosya numarası', example: '2024/12345', required: true },
      { name: 'muvekkilAdi', description: 'Müvekkil adı', example: 'ABC Şirketi', required: true },
      { name: 'borcluAdi', description: 'Borçlu adı', example: 'Ahmet Yılmaz', required: true },
      { name: 'plaka', description: 'Araç plakası', example: '34 ABC 123', required: true },
      { name: 'markaModel', description: 'Araç marka/model', example: 'Toyota Corolla', required: true },
      { name: 'yil', description: 'Araç yılı', example: '2020', required: true },
      { name: 'tahminiDeger', description: 'Tahmini değer', example: '450.000', required: false },
      { name: 'hacizSirasi', description: 'Haciz sırası', example: '1', required: true },
      { name: 'onHacizVar', description: 'Ön haciz var mı', example: 'true', required: true },
      { name: 'onHacizSayisi', description: 'Ön haciz sayısı', example: '2', required: false },
      { name: 'avanstutar', description: 'Avans tutarı', example: '5.000', required: true },
      { name: 'bankaAdi', description: 'Banka adı', example: 'Ziraat Bankası', required: true },
      { name: 'iban', description: 'IBAN', example: 'TR00 0000 0000 0000 0000 0000 00', required: true },
      { name: 'sonOdemeTarihi', description: 'Son ödeme tarihi', example: '15.01.2026', required: true },
      { name: 'buroAdi', description: 'Büro adı', example: 'XYZ Hukuk Bürosu', required: true },
    ],
    priority: 'HIGH',
    allowBatching: false,
    maxReminders: 3,
    reminderIntervalDays: [2, 5, 7],
    isActive: true,
  },
  
  {
    templateId: 'AVANS_HATIRLATMA',
    name: 'Avans Hatırlatma',
    description: 'Bekleyen avans için hatırlatma',
    category: 'ADVANCE_REMINDER',
    channels: ['EMAIL', 'SMS'],
    defaultChannel: 'EMAIL',
    recipientType: 'CLIENT',
    subject: '{{dosyaNo}} - Avans Hatırlatması ({{hatirlatmaNo}}. Hatırlatma)',
    body: `Sayın {{muvekkilAdi}},

{{dosyaNo}} numaralı icra dosyanız için talep edilen {{avansTuru}} henüz tarafımıza ulaşmamıştır.

**Talep Edilen Avans:** {{avanstutar}} TL
**Talep Tarihi:** {{talepTarihi}}
**Son Ödeme Tarihi:** {{sonOdemeTarihi}}

{{#if gecikmeGunu}}
Ödemeniz **{{gecikmeGunu}} gün** gecikmiştir.
{{/if}}

Avans yatırılmadan işlemlere devam edilememektedir. En kısa sürede ödemenizi yapmanızı rica ederiz.

**Ödeme Bilgileri:**
IBAN: {{iban}}
Açıklama: {{dosyaNo}} {{avansTuru}}

Saygılarımızla,
{{buroAdi}}`,
    smsBody: `{{dosyaNo}} için {{avanstutar}} TL {{avansTuru}} bekleniyor. Son tarih: {{sonOdemeTarihi}}. Lütfen ödemenizi yapınız.`,
    variables: [
      { name: 'dosyaNo', description: 'Dosya numarası', example: '2024/12345', required: true },
      { name: 'muvekkilAdi', description: 'Müvekkil adı', example: 'ABC Şirketi', required: true },
      { name: 'avansTuru', description: 'Avans türü', example: 'Yakalama Avansı', required: true },
      { name: 'avanstutar', description: 'Avans tutarı', example: '5.000', required: true },
      { name: 'talepTarihi', description: 'Talep tarihi', example: '01.01.2026', required: true },
      { name: 'sonOdemeTarihi', description: 'Son ödeme tarihi', example: '15.01.2026', required: true },
      { name: 'gecikmeGunu', description: 'Gecikme günü', example: '5', required: false },
      { name: 'hatirlatmaNo', description: 'Hatırlatma numarası', example: '2', required: true },
      { name: 'iban', description: 'IBAN', example: 'TR00 0000 0000 0000 0000 0000 00', required: true },
      { name: 'buroAdi', description: 'Büro adı', example: 'XYZ Hukuk Bürosu', required: true },
    ],
    priority: 'HIGH',
    allowBatching: true,
    maxReminders: 3,
    reminderIntervalDays: [2, 5, 7],
    isActive: true,
  },
  
  // ==================== RİSK UYARILARI ====================
  
  {
    templateId: 'ISTIRAK_RISKI_UYARISI',
    name: 'İştirak Riski Uyarısı',
    description: 'Ön hacizler nedeniyle yüksek risk uyarısı',
    category: 'RISK_ALERT',
    channels: ['EMAIL', 'IN_APP'],
    defaultChannel: 'EMAIL',
    recipientType: 'ATTORNEY',
    subject: '⚠️ {{dosyaNo}} - Yüksek İştirak Riski Tespit Edildi',
    body: `**DİKKAT: Yüksek Risk Uyarısı**

{{dosyaNo}} numaralı dosyada {{varlikTuru}} üzerinde iştirak riski tespit edilmiştir.

**Varlık Bilgileri:**
- Tür: {{varlikTuru}}
- Tanım: {{varlikTanim}}
- Tahmini Değer: {{tahminiDeger}} TL

**Haciz Durumu:**
- Toplam Haciz: {{toplamHaciz}} adet
- Bizim Sıramız: {{bizimSira}}. sıra
- Önümüzdeki Alacak Toplamı: {{onAlacakToplam}} TL (tahmini)

**Risk Analizi:**
- Risk Skoru: {{riskSkoru}}/100
- Risk Seviyesi: {{riskSeviyesi}}
- Tahmini Tahsilat Payımız: {{tahminiPay}} TL

**Öneri:** {{oneri}}

**Bloklu İşlemler:**
{{#each blokluIslemler}}
- {{this}}
{{/each}}

Bu dosyada masraflı işlemlere devam etmek için onayınız gerekmektedir.

[Onayla] [Reddet] [Detayları Gör]`,
    variables: [
      { name: 'dosyaNo', description: 'Dosya numarası', example: '2024/12345', required: true },
      { name: 'varlikTuru', description: 'Varlık türü', example: 'Araç', required: true },
      { name: 'varlikTanim', description: 'Varlık tanımı', example: '34 ABC 123 - Toyota Corolla', required: true },
      { name: 'tahminiDeger', description: 'Tahmini değer', example: '450.000', required: true },
      { name: 'toplamHaciz', description: 'Toplam haciz sayısı', example: '4', required: true },
      { name: 'bizimSira', description: 'Bizim sıramız', example: '3', required: true },
      { name: 'onAlacakToplam', description: 'Ön alacak toplamı', example: '380.000', required: true },
      { name: 'riskSkoru', description: 'Risk skoru', example: '78', required: true },
      { name: 'riskSeviyesi', description: 'Risk seviyesi', example: 'YÜKSEK', required: true },
      { name: 'tahminiPay', description: 'Tahmini pay', example: '25.000', required: true },
      { name: 'oneri', description: 'Öneri', example: 'Masraflı işlemlerden kaçınılması önerilir', required: true },
      { name: 'blokluIslemler', description: 'Bloklu işlemler listesi', example: '["Yakalama", "Satış"]', required: true },
    ],
    priority: 'URGENT',
    allowBatching: false,
    maxReminders: 0,
    reminderIntervalDays: [],
    isActive: true,
  },
  
  // ==================== DURUM BİLDİRİMLERİ ====================
  
  {
    templateId: 'TAHSILAT_BILDIRIMI',
    name: 'Tahsilat Bildirimi',
    description: 'Dosyaya tahsilat yapıldığında müvekkile bildirim',
    category: 'PAYMENT_NOTIFICATION',
    channels: ['EMAIL', 'SMS'],
    defaultChannel: 'EMAIL',
    recipientType: 'CLIENT',
    subject: '✅ {{dosyaNo}} - Tahsilat Bildirimi',
    body: `Sayın {{muvekkilAdi}},

{{dosyaNo}} numaralı icra dosyanıza tahsilat yapılmıştır.

**Tahsilat Detayları:**
- Tarih: {{tahsilatTarihi}}
- Tutar: {{tahsilatTutar}} TL
- Kaynak: {{tahsilatKaynak}}

**Dosya Durumu:**
- Toplam Alacak: {{toplamAlacak}} TL
- Toplam Tahsilat: {{toplamTahsilat}} TL
- Kalan Alacak: {{kalanAlacak}} TL

{{#if tamTahsilat}}
🎉 Dosyanız tam tahsilat ile kapatılmıştır. Reddiyat işlemleri başlatılacaktır.
{{/if}}

Saygılarımızla,
{{buroAdi}}`,
    smsBody: `{{dosyaNo}} dosyanıza {{tahsilatTutar}} TL tahsilat yapıldı. Kalan: {{kalanAlacak}} TL`,
    variables: [
      { name: 'dosyaNo', description: 'Dosya numarası', example: '2024/12345', required: true },
      { name: 'muvekkilAdi', description: 'Müvekkil adı', example: 'ABC Şirketi', required: true },
      { name: 'tahsilatTarihi', description: 'Tahsilat tarihi', example: '10.01.2026', required: true },
      { name: 'tahsilatTutar', description: 'Tahsilat tutarı', example: '15.000', required: true },
      { name: 'tahsilatKaynak', description: 'Tahsilat kaynağı', example: 'Banka Haczi', required: true },
      { name: 'toplamAlacak', description: 'Toplam alacak', example: '100.000', required: true },
      { name: 'toplamTahsilat', description: 'Toplam tahsilat', example: '45.000', required: true },
      { name: 'kalanAlacak', description: 'Kalan alacak', example: '55.000', required: true },
      { name: 'tamTahsilat', description: 'Tam tahsilat mı', example: 'false', required: true },
      { name: 'buroAdi', description: 'Büro adı', example: 'XYZ Hukuk Bürosu', required: true },
    ],
    priority: 'NORMAL',
    allowBatching: true,
    maxReminders: 0,
    reminderIntervalDays: [],
    isActive: true,
  },
  
  {
    templateId: 'TEBLIGAT_IADE',
    name: 'Tebligat İade Bildirimi',
    description: 'Tebligat iade/bila geldiğinde avukata bildirim',
    category: 'TEBLIGAT_UPDATE',
    channels: ['EMAIL', 'IN_APP'],
    defaultChannel: 'IN_APP',
    recipientType: 'ATTORNEY',
    subject: '📬 {{dosyaNo}} - Tebligat İade Geldi',
    body: `{{dosyaNo}} numaralı dosyada tebligat iade gelmiştir.

**Tebligat Bilgileri:**
- Borçlu: {{borcluAdi}}
- Adres: {{adres}}
- İade Nedeni: {{iadeNedeni}}
- İade Tarihi: {{iadeTarihi}}

**Önerilen Aksiyonlar:**
{{#each oneriler}}
- {{this}}
{{/each}}

[Yeniden Tebligat Başlat] [TK 21 Değerlendir] [Adres Araştırması]`,
    variables: [
      { name: 'dosyaNo', description: 'Dosya numarası', example: '2024/12345', required: true },
      { name: 'borcluAdi', description: 'Borçlu adı', example: 'Ahmet Yılmaz', required: true },
      { name: 'adres', description: 'Tebligat adresi', example: 'Atatürk Cad. No:1 Kadıköy/İstanbul', required: true },
      { name: 'iadeNedeni', description: 'İade nedeni', example: 'Adreste tanınmıyor', required: true },
      { name: 'iadeTarihi', description: 'İade tarihi', example: '05.01.2026', required: true },
      { name: 'oneriler', description: 'Önerilen aksiyonlar', example: '["MERNİS sorgusu", "TK 21/2"]', required: true },
    ],
    priority: 'HIGH',
    allowBatching: false,
    maxReminders: 0,
    reminderIntervalDays: [],
    isActive: true,
  },
  
  {
    templateId: 'ITIRAZ_BILDIRIMI',
    name: 'İtiraz Bildirimi',
    description: 'Borçlu itiraz ettiğinde avukata bildirim',
    category: 'ACTION_REQUIRED',
    channels: ['EMAIL', 'IN_APP', 'PUSH'],
    defaultChannel: 'IN_APP',
    recipientType: 'ATTORNEY',
    subject: '⚠️ {{dosyaNo}} - Borçlu İtiraz Etti',
    body: `{{dosyaNo}} numaralı dosyada borçlu itiraz etmiştir.

**İtiraz Bilgileri:**
- Borçlu: {{borcluAdi}}
- İtiraz Tarihi: {{itirazTarihi}}
- İtiraz Türü: {{itirazTuru}}
- İtiraz Gerekçesi: {{itirazGerekcesi}}

**Dosya Durumu:**
- Kesinleşme süreci durduruldu
- Haciz işlemleri bloklandı

**Gerekli Aksiyonlar:**
1. İtirazın incelenmesi
2. İtirazın iptali davası değerlendirmesi
3. Müvekkile bilgi verilmesi

[İtirazı İncele] [Dava Aç] [Müvekkile Bildir]`,
    variables: [
      { name: 'dosyaNo', description: 'Dosya numarası', example: '2024/12345', required: true },
      { name: 'borcluAdi', description: 'Borçlu adı', example: 'Ahmet Yılmaz', required: true },
      { name: 'itirazTarihi', description: 'İtiraz tarihi', example: '08.01.2026', required: true },
      { name: 'itirazTuru', description: 'İtiraz türü', example: 'Borca İtiraz', required: true },
      { name: 'itirazGerekcesi', description: 'İtiraz gerekçesi', example: 'Borç ödendi iddiası', required: false },
    ],
    priority: 'URGENT',
    allowBatching: false,
    maxReminders: 0,
    reminderIntervalDays: [],
    isActive: true,
  },
];

// ==================== HELPER FUNCTIONS ====================

/**
 * Template ID'ye göre şablon getir
 */
export function getTemplate(templateId: string): CommunicationTemplate | undefined {
  return COMMUNICATION_TEMPLATES.find(t => t.templateId === templateId);
}

/**
 * Kategoriye göre şablonları getir
 */
export function getTemplatesByCategory(category: TemplateCategory): CommunicationTemplate[] {
  return COMMUNICATION_TEMPLATES.filter(t => t.category === category && t.isActive);
}

/**
 * Alıcı tipine göre şablonları getir
 */
export function getTemplatesByRecipient(recipientType: RecipientType): CommunicationTemplate[] {
  return COMMUNICATION_TEMPLATES.filter(t => t.recipientType === recipientType && t.isActive);
}

/**
 * Şablon değişkenlerini doldur
 */
export function renderTemplate(
  template: CommunicationTemplate,
  variables: Record<string, any>,
  channel?: NotificationChannel
): { subject: string; body: string } {
  let body = channel === 'SMS' && template.smsBody ? template.smsBody : template.body;
  let subject = template.subject;
  
  // Basit değişken değiştirme
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`{{${key}}}`, 'g');
    body = body.replace(regex, String(value ?? ''));
    subject = subject.replace(regex, String(value ?? ''));
  }
  
  // Koşullu blokları işle (basit implementasyon)
  body = processConditionals(body, variables);
  
  return { subject, body };
}

/**
 * Koşullu blokları işle
 */
function processConditionals(text: string, variables: Record<string, any>): string {
  // {{#if condition}}...{{/if}} bloklarını işle
  const ifRegex = /{{#if\s+(\w+)}}([\s\S]*?){{\/if}}/g;
  
  return text.replace(ifRegex, (match, condition, content) => {
    const value = variables[condition];
    if (value && value !== 'false' && value !== '0') {
      return content;
    }
    return '';
  });
}

/**
 * Zorunlu değişkenleri kontrol et
 */
export function validateTemplateVariables(
  template: CommunicationTemplate,
  variables: Record<string, any>
): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  
  for (const v of template.variables) {
    if (v.required && !(v.name in variables)) {
      missing.push(v.name);
    }
  }
  
  return { valid: missing.length === 0, missing };
}
