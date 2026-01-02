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

    // Replace all tokens
    for (const [key, value] of Object.entries(tokens)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      if (subject) subject = subject.replace(regex, value || '');
      body = body.replace(regex, value || '');
    }

    return { subject, body };
  }

  // Kategori bazlı varsayılan token'lar
  private getDefaultTokens(category: MessageTemplateCategory): string[] {
    const commonTokens = ['clientName', 'caseFileNumber', 'executionFileNumber', 'executionOfficeName', 'lawyerName', 'officeName', 'officePhone'];
    
    switch (category) {
      case 'EXPENSE_REQUEST':
      case 'EXPENSE_REMINDER':
        return [...commonTokens, 'totalAmount', 'dueDate', 'items', 'officeIban'];
      case 'COLLECTION_INFO':
        return [...commonTokens, 'totalAmount', 'collectionAmount', 'remainingAmount'];
      case 'CLIENT_INFO':
        return [...commonTokens, 'debtorName', 'status'];
      case 'DEBTOR_NOTICE':
        return ['debtorName', 'caseFileNumber', 'executionFileNumber', 'totalAmount', 'dueDate'];
      default:
        return commonTokens;
    }
  }

  // Varsayılan şablonları oluştur (seed için)
  async seedDefaultTemplates(tenantId: string) {
    const templates = [
      {
        code: 'EXPENSE_REQUEST',
        name: 'Masraf Talebi',
        category: 'EXPENSE_REQUEST' as MessageTemplateCategory,
        channel: 'EMAIL' as MessageTemplateChannel,
        subject: '{{caseFileNumber}} - Masraf Talebi',
        body: `Sayın {{clientName}},

{{executionFileNumber}} sayılı icra dosyası için aşağıdaki masrafların karşılanması gerekmektedir:

{{items}}

Toplam Tutar: {{totalAmount}} TL
Son Ödeme Tarihi: {{dueDate}}

Ödeme Bilgileri:
{{officeIban}}

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
