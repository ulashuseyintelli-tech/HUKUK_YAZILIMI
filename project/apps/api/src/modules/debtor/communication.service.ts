import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import {
  SendSmsDto,
  SendEmailDto,
  LogPhoneCallDto,
  CommunicationChannel,
} from "./dto/communication.dto";

@Injectable()
export class DebtorCommunicationService {
  constructor(private prisma: PrismaService) {}

  // ==================== SEND OPERATIONS ====================

  async sendSms(tenantId: string, debtorId: string, dto: SendSmsDto) {
    const debtor = await this.prisma.debtor.findFirst({
      where: { id: debtorId, tenantId },
    });

    if (!debtor) {
      throw new NotFoundException("Borçlu bulunamadı");
    }

    if (!debtor.phone) {
      throw new BadRequestException("Borçlunun telefon numarası yok");
    }

    // Create communication record
    const communication = await this.prisma.debtorCommunication.create({
      data: {
        tenantId,
        debtorId,
        caseId: dto.caseId,
        channel: CommunicationChannel.SMS,
        templateId: dto.templateId,
        content: dto.content,
        status: "PENDING",
      },
    });

    // TODO: Integrate with SMS provider (NetGSM, İleti Merkezi, etc.)
    // For now, mock the send operation
    const sent = await this.mockSendSms(debtor.phone, dto.content);

    // Update status
    await this.prisma.debtorCommunication.update({
      where: { id: communication.id },
      data: {
        status: sent ? "SENT" : "FAILED",
        sentAt: sent ? new Date() : null,
        failReason: sent ? null : "SMS gönderimi başarısız",
      },
    });

    return this.prisma.debtorCommunication.findUnique({
      where: { id: communication.id },
    });
  }


  async sendEmail(tenantId: string, debtorId: string, dto: SendEmailDto) {
    const debtor = await this.prisma.debtor.findFirst({
      where: { id: debtorId, tenantId },
    });

    if (!debtor) {
      throw new NotFoundException("Borçlu bulunamadı");
    }

    if (!debtor.email) {
      throw new BadRequestException("Borçlunun e-posta adresi yok");
    }

    const communication = await this.prisma.debtorCommunication.create({
      data: {
        tenantId,
        debtorId,
        caseId: dto.caseId,
        channel: CommunicationChannel.EMAIL,
        templateId: dto.templateId,
        content: `${dto.subject}\n\n${dto.content}`,
        status: "PENDING",
      },
    });

    // TODO: Integrate with email provider (SMTP, SendGrid, etc.)
    const sent = await this.mockSendEmail(debtor.email, dto.subject, dto.content);

    await this.prisma.debtorCommunication.update({
      where: { id: communication.id },
      data: {
        status: sent ? "SENT" : "FAILED",
        sentAt: sent ? new Date() : null,
        failReason: sent ? null : "E-posta gönderimi başarısız",
      },
    });

    return this.prisma.debtorCommunication.findUnique({
      where: { id: communication.id },
    });
  }

  async logPhoneCall(tenantId: string, debtorId: string, dto: LogPhoneCallDto) {
    const debtor = await this.prisma.debtor.findFirst({
      where: { id: debtorId, tenantId },
    });

    if (!debtor) {
      throw new NotFoundException("Borçlu bulunamadı");
    }

    return this.prisma.debtorCommunication.create({
      data: {
        tenantId,
        debtorId,
        caseId: dto.caseId,
        channel: CommunicationChannel.PHONE_CALL,
        content: dto.callNotes,
        callDuration: dto.callDuration,
        callNotes: dto.callNotes,
        status: "SENT",
        sentAt: new Date(),
      },
    });
  }

  // ==================== HISTORY ====================

  async getCommunicationHistory(
    tenantId: string,
    debtorId: string,
    params?: { caseId?: string; channel?: string; page?: number; limit?: number }
  ) {
    const { caseId, channel, page = 1, limit = 20 } = params || {};

    const where: any = { tenantId, debtorId };
    if (caseId) where.caseId = caseId;
    if (channel) where.channel = channel;

    const [communications, total] = await Promise.all([
      this.prisma.debtorCommunication.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.debtorCommunication.count({ where }),
    ]);

    return {
      data: communications,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ==================== TEMPLATES ====================

  getMessageTemplates() {
    // Predefined message templates
    return [
      {
        id: "odeme_hatirlatma_nazik",
        name: "Ödeme Hatırlatma (Nazik)",
        channel: "SMS",
        content: "Sayın {name}, {amount} TL tutarındaki borcunuzun ödeme tarihi yaklaşmaktadır. Bilgilerinize sunarız.",
      },
      {
        id: "odeme_hatirlatma_resmi",
        name: "Ödeme Hatırlatma (Resmi)",
        channel: "SMS",
        content: "Sayın {name}, {caseNumber} dosya numaralı takipte {amount} TL borcunuz bulunmaktadır. En kısa sürede ödemenizi rica ederiz.",
      },
      {
        id: "icra_oncesi_uyari",
        name: "İcra Öncesi Son Uyarı",
        channel: "SMS",
        content: "Sayın {name}, {amount} TL borcunuz için icra takibi başlatılacaktır. Ödeme için son tarih: {deadline}",
      },
      {
        id: "haciz_oncesi_uyari",
        name: "Haciz Öncesi Ödeme Çağrısı",
        channel: "SMS",
        content: "Sayın {name}, {caseNumber} dosyasında haciz işlemi başlatılacaktır. Ödeme için iletişime geçiniz.",
      },
      {
        id: "taksit_teklifi",
        name: "Taksit/Uzlaşma Teklifi",
        channel: "EMAIL",
        content: "Sayın {name},\n\n{amount} TL tutarındaki borcunuz için taksit imkanı sunmaktayız.\n\nDetaylı bilgi için bizimle iletişime geçebilirsiniz.",
      },
    ];
  }

  // ==================== MOCK PROVIDERS ====================

  private async mockSendSms(phone: string, content: string): Promise<boolean> {
    // Mock SMS sending - always returns true for now
    console.log(`[MOCK SMS] To: ${phone}, Content: ${content}`);
    return true;
  }

  private async mockSendEmail(email: string, subject: string, content: string): Promise<boolean> {
    // Mock email sending - always returns true for now
    console.log(`[MOCK EMAIL] To: ${email}, Subject: ${subject}`);
    return true;
  }
}
