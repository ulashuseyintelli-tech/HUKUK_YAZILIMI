import { defaultMessageTemplateTokens, seedDefaultMessageTemplates } from './message-template-defaults';
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { MessageTemplateCategory, MessageTemplateChannel } from '@prisma/client';
import { UpdateMessageTemplateDto, validateMessageTemplateUpdate } from './dto/update-message-template.dto';
export { UpdateMessageTemplateDto } from './dto/update-message-template.dto';

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

  /** Caller: MessageTemplateController.update. Existing F01 and system-template policies are unchanged. */
  async update(tenantId: string, id: string, input: UpdateMessageTemplateDto) {
    const dto = await validateMessageTemplateUpdate(input);
    const existing = await this.findOne(tenantId, id);

    // System templates can only update body and subject
    if (existing.isSystem) {
      return this.prisma.messageTemplate.update({
        where: { id, tenantId },
        data: {
          subject: dto.subject,
          body: dto.body,
        },
      });
    }

    return this.prisma.messageTemplate.update({
      where: { id, tenantId },
      data: {
        name: dto.name, description: dto.description, subject: dto.subject,
        body: dto.body, isActive: dto.isActive, sortOrder: dto.sortOrder,
      },
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
    return defaultMessageTemplateTokens(category);
  }

  // Varsayılan şablonları oluştur (seed için)
  async seedDefaultTemplates(tenantId: string) {
    await seedDefaultMessageTemplates(this.prisma, tenantId);
    return { success: true, message: 'Varsayılan şablonlar oluşturuldu' };
  }
}
