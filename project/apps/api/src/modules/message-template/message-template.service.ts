import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { MessageTemplateCategory, MessageTemplateChannel } from '@prisma/client';

export interface CreateMessageTemplateDto {
  code: string;
  name: string;
  description?: string;
  category: MessageTemplateCategory;
  channel: MessageTemplateChannel;
  subject?: string;
  body: string;
  availableTokens?: string[];
}

export interface UpdateMessageTemplateDto {
  name?: string;
  description?: string;
  subject?: string;
  body?: string;
  isActive?: boolean;
  sortOrder?: number;
}

// Token değerleri için tip
export interface TemplateTokens {
  clientName?: string;
  caseFileNumber?: string;
  executionFileNumber?: string;
  executionOfficeName?: string;
  totalAmount?: string;
  dueDate?: string;
  items?: string;
  lawyerName?: string;
  officePhone?: string;
  officeEmail?: string;
  officeName?: string;
  officeIban?: string;
  debtorName?: string;
  [key: string]: string | undefined;
}

/**
 * Render sonrası çözülmemiş {{token}} kaldığında fail-closed hata: malformed içerik
 * provider'a GÖNDERİLMEZ (sessiz global strip YOK). Yalnız token ADLARINI taşır —
 * değer/PII/secret İÇERMEZ; çağıran dispatch bunu kontrollü FAILED'a çevirir.
 */
export class UnresolvedTemplateTokenError extends Error {
  constructor(public readonly tokenNames: string[]) {
    super(`Çözülmemiş şablon token(lar)ı: ${tokenNames.join(', ')}`);
    this.name = 'UnresolvedTemplateTokenError';
  }
}

@Injectable()
export class MessageTemplateService {
  constructor(private prisma: PrismaService) {}

  async findAll(tenantId: string, params?: { category?: MessageTemplateCategory; channel?: MessageTemplateChannel; isActive?: boolean }) {
    const where: any = { tenantId };
    if (params?.category) where.category = params.category;
    if (params?.channel) where.channel = params.channel;
    if (params?.isActive !== undefined) where.isActive = params.isActive;

    return this.prisma.messageTemplate.findMany({
      where,
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(tenantId: string, id: string) {
    const template = await this.prisma.messageTemplate.findFirst({
      where: { id, tenantId },
    });

    if (!template) {
      throw new NotFoundException('Şablon bulunamadı');
    }

    return template;
  }

  async findByCode(tenantId: string, code: string) {
    const template = await this.prisma.messageTemplate.findFirst({
      where: { tenantId, code, isActive: true },
    });

    if (!template) {
      throw new NotFoundException(`Şablon bulunamadı: ${code}`);
    }

    return template;
  }

  async create(tenantId: string, dto: CreateMessageTemplateDto) {
    // Check if code already exists
    const existing = await this.prisma.messageTemplate.findFirst({
      where: { tenantId, code: dto.code },
    });

    if (existing) {
      throw new ConflictException(`Bu kod zaten kullanılıyor: ${dto.code}`);
    }

    return this.prisma.messageTemplate.create({
      data: {
        tenantId,
        code: dto.code,
        name: dto.name,
        description: dto.description,
        category: dto.category,
        channel: dto.channel,
        subject: dto.subject,
        body: dto.body,
        availableTokens: dto.availableTokens || this.getDefaultTokens(dto.category),
        isActive: true,
        isSystem: false,
      },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateMessageTemplateDto) {
    const existing = await this.findOne(tenantId, id);

    // System templates can only update body and subject
    if (existing.isSystem) {
      return this.prisma.messageTemplate.update({
        where: { id },
        data: {
          subject: dto.subject,
          body: dto.body,
        },
      });
    }

    return this.prisma.messageTemplate.update({
      where: { id },
      data: dto,
    });
  }

  async delete(tenantId: string, id: string) {
    const existing = await this.findOne(tenantId, id);

    if (existing.isSystem) {
      throw new ConflictException('Sistem şablonları silinemez');
    }

    await this.prisma.messageTemplate.delete({ where: { id } });
    return { success: true };
  }

  // Token'ları değiştirerek mesaj oluştur
  renderTemplate(template: { subject?: string | null; body: string }, tokens: TemplateTokens): { subject?: string; body: string } {
    let subject = template.subject || undefined;
    let body = template.body;

    // Replace all provided tokens
    for (const [key, value] of Object.entries(tokens)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      if (subject) subject = subject.replace(regex, value || '');
      body = body.replace(regex, value || '');
    }

    // FAIL-CLOSED (owner kritik düzeltmesi): çözülmemiş {{token}} kalırsa malformed
    // içerik ÜRETİLMEZ — sessiz strip YOK. Yalnız token ADLARI toplanır (değer/PII/secret
    // sızmaz); çağıran dispatch bunu kontrollü FAILED'a çevirir, provider'a gönderilmez.
    const unresolved = new Set<string>();
    const collect = (s: string | undefined): void => {
      if (!s) return;
      for (const m of s.matchAll(/{{\s*([\w.]+)\s*}}/g)) unresolved.add(m[1]);
    };
    collect(subject);
    collect(body);
    if (unresolved.size > 0) {
      throw new UnresolvedTemplateTokenError([...unresolved].sort());
    }

    return { subject, body };
  }

  // Kategori bazlı varsayılan token'lar
  private getDefaultTokens(category: MessageTemplateCategory): string[] {
    const commonTokens = ['clientName', 'caseFileNumber', 'executionFileNumber', 'executionOfficeName', 'lawyerName', 'officeName', 'officePhone'];
    
    switch (category) {
      case 'EXPENSE_REQUEST':
        // W4-ACT02A/B içerik sözleşmesi: hesap sahibi/unvan + ödeme açıklaması referansı da taşınır.
        return [...commonTokens, 'totalAmount', 'dueDate', 'items', 'officeIban', 'accountHolder', 'paymentReference'];
      case 'EXPENSE_REMINDER':
        return [...commonTokens, 'totalAmount', 'dueDate', 'items', 'officeIban'];
      case 'COLLECTION_INFO':
        return [...commonTokens, 'totalAmount', 'collectionAmount', 'remainingAmount'];
      case 'CLIENT_INFO':
        return [...commonTokens, 'debtorName', 'status'];
      case 'DEBTOR_NOTICE':
        return ['debtorName', 'caseFileNumber', 'executionFileNumber', 'totalAmount', 'dueDate'];
      case 'PAYMENT_INFO':
        return [...commonTokens, 'totalAmount', 'paidAmount', 'remainingAmount'];
      case 'CLIENT_APPROVAL':
        return [...commonTokens, 'subjectLabel', 'decision'];
      case 'STATEMENT_READY':
        return [...commonTokens, 'periodStart', 'periodEnd', 'closingBalance'];
      case 'EXPENSE_ACTUAL':
        // C1-B05-B: gerçekleşen masraf — insan-okur dosya referansı + tarih + açıklama + tr-TR tutar.
        return [...commonTokens, 'expenseDate', 'description', 'amount', 'currency'];
      default:
        return commonTokens;
    }
  }

  // Varsayılan şablonları oluştur (seed için)
  async seedDefaultTemplates(tenantId: string) {
    const templates = [
      {
        // C1-B05-B: gerçekleşen masraf bildirimi (ayrı template/event — owner kararı).
        // Raw iç ID YOK; yalnız insan-okur dosya referansı; fail-closed render tüm token'ları ister.
        code: 'EXPENSE_ACTUAL_POSTED',
        name: 'Gerçekleşen Masraf Bildirimi',
        category: 'EXPENSE_ACTUAL' as MessageTemplateCategory,
        channel: 'EMAIL' as MessageTemplateChannel,
        subject: '{{caseFileNumber}} - Gerçekleşen Masraf Bildirimi',
        body: `Sayın {{clientName}},

{{caseFileNumber}} numaralı dosyanızda aşağıdaki masraf gerçekleşmiş ve masraf avansı bakiyenizden karşılanmıştır:

Masraf Tarihi: {{expenseDate}}
Açıklama: {{description}}
Tutar: {{amount}} {{currency}}

Bu bildirim bilgilendirme amaçlıdır; ayrıca bir ödeme talep edilmemektedir.

Saygılarımızla,
{{officeName}}
{{officePhone}}`,
      },
      {
        code: 'EXPENSE_REQUEST',
        name: 'Masraf Talebi',
        category: 'EXPENSE_REQUEST' as MessageTemplateCategory,
        channel: 'EMAIL' as MessageTemplateChannel,
        // W4-ACT02A/B içerik sözleşmesi (owner): açık amaç cümlesi + kalem türü/açıklaması/tutarı
        // (request kayıtlarından render edilir; hardcoded kategori listesi YOK) + hesap sahibi +
        // ödeme açıklaması referansı + gerçekleşen-masraf bilgilendirme cümlesi. Raw iç-ID YOK.
        subject: '{{caseFileNumber}} - Masraf Talebi',
        body: `Sayın {{clientName}},

{{caseFileNumber}} sayılı dosyanız kapsamındaki işlemlerin yürütülebilmesi için aşağıda dökümü verilen {{totalAmount}} TL masraf avansının {{dueDate}} tarihine kadar belirtilen hesaba ödenmesini rica ederiz.

Masraf Kalemleri:
{{items}}

Genel Toplam: {{totalAmount}} TL
Son Ödeme Tarihi: {{dueDate}}

Ödeme Bilgileri:
Hesap Sahibi: {{accountHolder}}
IBAN: {{officeIban}}
Ödeme Açıklaması: {{paymentReference}}

Ödemeniz alındıktan sonra bu avans kullanılarak karşılanan masrafların her biri ayrıca tarafınıza bildirilecektir.

Dekontunuzu bu e-postaya yanıt olarak iletebilirsiniz.

Saygılarımızla,
{{officeName}}
{{officePhone}}`,
      },
      {
        code: 'EXPENSE_REMINDER',
        name: 'Masraf Hatırlatma',
        category: 'EXPENSE_REMINDER' as MessageTemplateCategory,
        channel: 'EMAIL' as MessageTemplateChannel,
        subject: '{{caseFileNumber}} - Masraf Hatırlatma',
        body: `Sayın {{clientName}},

{{executionFileNumber}} sayılı icra dosyası için daha önce talep edilen masrafların henüz karşılanmadığını hatırlatmak isteriz.

Toplam Tutar: {{totalAmount}} TL
Son Ödeme Tarihi: {{dueDate}}

Ödeme Bilgileri:
{{officeIban}}

Saygılarımızla,
{{officeName}}`,
      },
      {
        code: 'CASE_OPENED',
        name: 'Dosya Açıldı Bildirimi',
        category: 'CLIENT_INFO' as MessageTemplateCategory,
        channel: 'EMAIL' as MessageTemplateChannel,
        subject: '{{caseFileNumber}} - Dosya Açıldı',
        body: `Sayın {{clientName}},

{{debtorName}} aleyhine açılan icra takibi dosyası oluşturulmuştur.

Dosya No: {{caseFileNumber}}
İcra Dosya No: {{executionFileNumber}}
İcra Dairesi: {{executionOfficeName}}

Dosyanızla ilgili gelişmeleri size bildireceğiz.

Saygılarımızla,
{{officeName}}
{{officePhone}}`,
      },
      {
        code: 'COLLECTION_INFO',
        name: 'Tahsilat Bildirimi',
        category: 'COLLECTION_INFO' as MessageTemplateCategory,
        channel: 'EMAIL' as MessageTemplateChannel,
        subject: '{{caseFileNumber}} - Tahsilat Bildirimi',
        body: `Sayın {{clientName}},

{{executionFileNumber}} sayılı icra dosyasında tahsilat gerçekleşmiştir.

Tahsil Edilen: {{collectionAmount}} TL
Kalan Borç: {{remainingAmount}} TL

Saygılarımızla,
{{officeName}}`,
      },
      {
        code: 'EXPENSE_REQUEST_SMS',
        name: 'Masraf Talebi (SMS)',
        category: 'EXPENSE_REQUEST' as MessageTemplateCategory,
        channel: 'SMS' as MessageTemplateChannel,
        subject: null,
        body: `{{caseFileNumber}} dosyası için {{totalAmount}} TL masraf talebi. Son tarih: {{dueDate}}. {{officeName}}`,
      },
      // ===== Faz 3 (mail merkezi) — yeni sistem şablonları =====
      {
        code: 'PARTIAL_PAYMENT_BALANCE',
        name: 'Kısmi Ödeme Sonrası Bakiye',
        category: 'PAYMENT_INFO' as MessageTemplateCategory,
        channel: 'EMAIL' as MessageTemplateChannel,
        subject: '{{caseFileNumber}} - Kısmi Ödeme Alındı',
        body: `Sayın {{clientName}},

{{executionFileNumber}} sayılı dosyada kısmi ödemeniz alınmıştır.

Ödenen Tutar: {{paidAmount}} TL
Kalan Tutar: {{remainingAmount}} TL

Saygılarımızla,
{{officeName}}`,
      },
      {
        code: 'PAYMENT_RECEIVED',
        name: 'Ödeme Alındı Teyidi',
        category: 'PAYMENT_INFO' as MessageTemplateCategory,
        channel: 'EMAIL' as MessageTemplateChannel,
        subject: '{{caseFileNumber}} - Ödeme Alındı',
        body: `Sayın {{clientName}},

{{executionFileNumber}} sayılı dosyada {{totalAmount}} TL tutarındaki ödemeniz tam olarak alınmıştır. Teşekkür ederiz.

Saygılarımızla,
{{officeName}}`,
      },
      {
        code: 'APPROVAL_REQUEST',
        name: 'Müvekkil İşlem Onayı Talebi',
        category: 'CLIENT_APPROVAL' as MessageTemplateCategory,
        channel: 'EMAIL' as MessageTemplateChannel,
        subject: '{{caseFileNumber}} - Onayınız Gerekiyor',
        body: `Sayın {{clientName}},

{{executionFileNumber}} sayılı dosyada aşağıdaki işlem için onayınızı rica ederiz:

{{subjectLabel}}

Onayınızı bürumuza iletebilirsiniz.

Saygılarımızla,
{{officeName}}`,
      },
      {
        code: 'APPROVAL_RESULT',
        name: 'Onay Sonucu Teyidi',
        category: 'CLIENT_APPROVAL' as MessageTemplateCategory,
        channel: 'EMAIL' as MessageTemplateChannel,
        subject: '{{caseFileNumber}} - Onay Sonucu',
        body: `Sayın {{clientName}},

{{executionFileNumber}} sayılı dosyadaki şu işlem için kararınız kaydedilmiştir:

İşlem: {{subjectLabel}}
Karar: {{decision}}

Saygılarımızla,
{{officeName}}`,
      },
      {
        code: 'STATEMENT_READY',
        name: 'Müvekkil Ekstresi Hazır',
        category: 'STATEMENT_READY' as MessageTemplateCategory,
        channel: 'EMAIL' as MessageTemplateChannel,
        // caseFileSuffix: client-level "" (temiz), case-level " — {insan-okur no}". Ham {{}} kalmaz.
        subject: 'Hesap Ekstreniz Hazır{{caseFileSuffix}}',
        // fileReferenceClause: client-level "" (dosya cümlesi YOK), case-level "{no} sayılı dosyanız için ".
        // closingBalanceLine: nötr etiketli, mutlak tutar (owner kararı). Tarih Europe/Istanbul, para tr-TR.
        body: `Sayın {{clientName}},

{{fileReferenceClause}}{{periodStart}} - {{periodEnd}} dönemine ait hesap ekstreniz hazırlanmıştır.

{{closingBalanceLine}}

Ayrıntılı bilgi için büromuzla iletişime geçebilirsiniz.

Saygılarımızla,
{{officeName}}`,
      },
      // ===== Faz 4.3 (intake link) =====
      {
        code: 'INTAKE_LINK',
        name: 'Müvekkil Bilgi Formu Linki',
        category: 'CLIENT_INFO' as MessageTemplateCategory,
        channel: 'EMAIL' as MessageTemplateChannel,
        subject: '{{caseFileNumber}} - Bilgi Formu',
        body: `Sayın {{clientName}},

{{executionFileNumber}} sayılı dosyanız için bazı bilgilere ihtiyacımız var. Aşağıdaki güvenli bağlantıdan formu doldurabilirsiniz:

{{intakeUrl}}

Son geçerlilik: {{expiresAt}}

Saygılarımızla,
{{officeName}}`,
      },
    ];

    for (const template of templates) {
      const existing = await this.prisma.messageTemplate.findFirst({
        where: { tenantId, code: template.code },
      });

      if (!existing) {
        await this.prisma.messageTemplate.create({
          data: {
            tenantId,
            ...template,
            isActive: true,
            isSystem: true,
            availableTokens: this.getDefaultTokens(template.category),
          },
        });
      }
    }

    return { success: true, message: 'Varsayılan şablonlar oluşturuldu' };
  }
}
