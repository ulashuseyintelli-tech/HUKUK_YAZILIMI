import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { findOrCreateDebtorAddress } from '@/common/address-hash.util'; // RFA-006 adres dedup
import { CaseDebtorLifecycleGuardService } from '../case-debtor-lifecycle-guard/case-debtor-lifecycle-guard.service';
import {
  CreateInstitutionLetterDto,
  MarkLetterAsSentDto,
  MarkLetterAsRespondedDto,
  InstitutionType,
  INSTITUTION_LETTER_TEMPLATES,
} from './dto/institution-letter.dto';

@Injectable()
export class InstitutionLetterService {
  private readonly logger = new Logger(InstitutionLetterService.name);

  constructor(
    private prisma: PrismaService,
    private caseDebtorLifecycleGuard: CaseDebtorLifecycleGuardService,
  ) {}

  /**
   * Kurum yazısı oluştur
   */
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - AddressDiscoveryController.createInstitutionLetter() → POST /address-discovery/institution-letter (kurum yazısı oluşturma)
  /// </remarks>
  async createLetter(tenantId: string, dto: CreateInstitutionLetterDto) {
    await this.caseDebtorLifecycleGuard.assertActiveByCaseDebtorId(tenantId, dto.caseDebtorId);

    // CaseDebtor'u doğrula
    const caseDebtor = await this.prisma.caseDebtor.findFirst({
      where: { id: dto.caseDebtorId },
      include: {
        case: {
          select: {
            tenantId: true,
            fileNumber: true,
            executionFileNumber: true,
            executionOffice: { select: { name: true, city: true } },
          },
        },
        debtor: {
          select: {
            id: true,
            name: true,
            identityNo: true,
            type: true,
          },
        },
      },
    });

    if (!caseDebtor || caseDebtor.case.tenantId !== tenantId) {
      throw new NotFoundException('Borçlu bulunamadı');
    }

    // Şablon bilgilerini al
    const template = INSTITUTION_LETTER_TEMPLATES[dto.institution];
    if (!template) {
      throw new BadRequestException('Geçersiz kurum türü');
    }

    // Yazı türü geçerli mi?
    if (!template.letterTypes.includes(dto.letterType)) {
      throw new BadRequestException(
        `Bu kurum için geçerli yazı türleri: ${template.letterTypes.join(', ')}`
      );
    }

    // Varsayılan konu ve içerik
    const subject = dto.subject || template.defaultSubject;
    const body = dto.body || this.generateLetterBody(dto.institution, dto.letterType, {
      debtorName: caseDebtor.debtor.name,
      debtorIdentityNo: caseDebtor.debtor.identityNo,
      caseNumber: caseDebtor.case.executionFileNumber || caseDebtor.case.fileNumber,
      executionOffice: caseDebtor.case.executionOffice?.name,
    });

    const letter = await this.prisma.institutionLetter.create({
      data: {
        tenantId,
        caseDebtorId: dto.caseDebtorId,
        institution: dto.institution,
        letterType: dto.letterType,
        subject,
        body,
        status: 'DRAFT',
      },
      include: {
        caseDebtor: {
          include: {
            debtor: { select: { id: true, name: true } },
            case: { select: { id: true, fileNumber: true } },
          },
        },
      },
    });

    this.logger.log(
      `Kurum yazısı oluşturuldu: ${template.name} - ${caseDebtor.debtor.name}`
    );

    return letter;
  }

  /**
   * Yazıyı gönderildi olarak işaretle
   */
  async markAsSent(tenantId: string, letterId: string, dto: MarkLetterAsSentDto) {
    const letter = await this.prisma.institutionLetter.findFirst({
      where: { id: letterId, tenantId },
    });

    if (!letter) {
      throw new NotFoundException('Yazı bulunamadı');
    }

    if (letter.status !== 'DRAFT') {
      throw new BadRequestException('Sadece taslak yazılar gönderilebilir');
    }

    return this.prisma.institutionLetter.update({
      where: { id: letterId },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        sentMethod: dto.sentMethod,
      },
    });
  }

  /**
   * Yanıt alındı olarak işaretle
   */
  async markAsResponded(
    tenantId: string,
    letterId: string,
    dto: MarkLetterAsRespondedDto
  ) {
    const letter = await this.prisma.institutionLetter.findFirst({
      where: { id: letterId, tenantId },
      include: {
        caseDebtor: { include: { debtor: { select: { id: true } } } },
      },
    });

    if (!letter) {
      throw new NotFoundException('Yazı bulunamadı');
    }

    if (letter.status !== 'SENT') {
      throw new BadRequestException('Sadece gönderilmiş yazılara yanıt kaydedilebilir');
    }

    // Adresleri ekle
    if (dto.addresses && dto.addresses.length > 0) {
      const debtorId = letter.caseDebtor.debtor.id;
      const addressSource = this.getAddressSourceFromInstitution(letter.institution as InstitutionType);

      for (const addr of dto.addresses) {
        // RFA-006: normalize hash dedup (eski zayıf fullText findFirst yerine). Idempotent.
        await findOrCreateDebtorAddress(this.prisma, {
          debtorId,
          fullText: addr.fullAddress,
          city: addr.city || 'Bilinmiyor',
          district: addr.district,
          street: addr.fullAddress.substring(0, 200),
          type: 'DECLARED',
          source: addressSource as any,
          verifiedSource: `Kurum Yazısı - ${letterId}`,
          verified: true,
          verifiedAt: new Date(),
        });
      }
    }

    return this.prisma.institutionLetter.update({
      where: { id: letterId },
      data: {
        status: 'RESPONDED',
        respondedAt: new Date(),
        responseNotes: dto.responseNotes,
        addressesFound: dto.addressesFound || dto.addresses?.length || 0,
      },
    });
  }

  /**
   * Yanıt yok olarak işaretle
   */
  async markAsNoResponse(tenantId: string, letterId: string) {
    const letter = await this.prisma.institutionLetter.findFirst({
      where: { id: letterId, tenantId },
    });

    if (!letter) {
      throw new NotFoundException('Yazı bulunamadı');
    }

    return this.prisma.institutionLetter.update({
      where: { id: letterId },
      data: { status: 'NO_RESPONSE' },
    });
  }

  /**
   * Borçlu için yazıları getir
   */
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - AddressDiscoveryController.getInstitutionLetters() → GET /address-discovery/institution-letter/debtor/:caseDebtorId (kurum yazısı geçmişi)
  /// </remarks>
  async getLettersForDebtor(tenantId: string, caseDebtorId: string) {
    const letters = await this.prisma.institutionLetter.findMany({
      where: { tenantId, caseDebtorId },
      include: {
        caseDebtor: { select: { lifecycleStatus: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return letters.map((letter: any) => ({
      ...letter,
      caseDebtorLifecycleStatus: letter.caseDebtor?.lifecycleStatus,
      caseDebtorLifecycleLabel: letter.caseDebtor?.lifecycleStatus,
    }));
  }

  /**
   * Tek bir yazıyı getir
   */
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - AddressDiscoveryController.getInstitutionLetter() → GET /address-discovery/institution-letter/:letterId (kurum yazısı detayı)
  /// </remarks>
  async getLetter(tenantId: string, letterId: string) {
    const letter = await this.prisma.institutionLetter.findFirst({
      where: { id: letterId, tenantId },
      include: {
        caseDebtor: {
          include: {
            debtor: { select: { id: true, name: true, identityNo: true } },
            case: { select: { id: true, fileNumber: true } },
          },
        },
      },
    });

    if (!letter) {
      throw new NotFoundException('Yazı bulunamadı');
    }

    return {
      ...letter,
      caseDebtorLifecycleStatus: letter.caseDebtor?.lifecycleStatus,
      caseDebtorLifecycleLabel: letter.caseDebtor?.lifecycleStatus,
    };
  }

  /**
   * Yazıyı sil (sadece taslak)
   */
  async deleteLetter(tenantId: string, letterId: string) {
    const letter = await this.prisma.institutionLetter.findFirst({
      where: { id: letterId, tenantId },
    });

    if (!letter) {
      throw new NotFoundException('Yazı bulunamadı');
    }

    if (letter.status !== 'DRAFT') {
      throw new BadRequestException('Sadece taslak yazılar silinebilir');
    }

    await this.prisma.institutionLetter.delete({ where: { id: letterId } });
    return { success: true };
  }

  /**
   * Kurum şablonlarını getir
   */
  getInstitutionTemplates() {
    return Object.entries(INSTITUTION_LETTER_TEMPLATES).map(([key, value]) => ({
      institution: key,
      ...value,
    }));
  }

  /**
   * Yazı içeriği oluştur
   */
  private generateLetterBody(
    institution: InstitutionType,
    letterType: string,
    data: {
      debtorName: string;
      debtorIdentityNo?: string | null;
      caseNumber: string;
      executionOffice?: string;
    }
  ): string {
    const identityInfo = data.debtorIdentityNo
      ? `T.C. Kimlik No / Vergi No: ${data.debtorIdentityNo}`
      : '';

    const baseText = `
Sayın Yetkili,

${data.executionOffice || 'İcra Müdürlüğü'} ${data.caseNumber} sayılı dosyamızda borçlu olarak kayıtlı bulunan;

Borçlu: ${data.debtorName}
${identityInfo}

hakkında aşağıda belirtilen bilgilerin tarafımıza iletilmesini rica ederiz.
`.trim();

    const requestText = this.getRequestTextByType(institution, letterType);

    return `${baseText}\n\n${requestText}\n\nBilgilerinize arz ederiz.\n\nSaygılarımızla,`;
  }

  private getRequestTextByType(institution: InstitutionType, letterType: string): string {
    const requests: Record<string, Record<string, string>> = {
      [InstitutionType.SGK]: {
        ADRES_SORGU: 'Borçlunun SGK kayıtlarında yer alan güncel adres bilgisi',
        ISYERI_SORGU: 'Borçlunun çalıştığı işyeri adres ve iletişim bilgileri',
        EMEKLI_SORGU: 'Borçlunun emeklilik durumu ve maaş bilgileri',
      },
      [InstitutionType.VERGI_DAIRESI]: {
        ADRES_SORGU: 'Borçlunun vergi kayıtlarında yer alan güncel adres bilgisi',
        MUKELLEFIYET_SORGU: 'Borçlunun vergi mükellefiyet durumu ve işyeri adresi',
      },
      [InstitutionType.TICARET_SICILI]: {
        ADRES_SORGU: 'Şirketin ticaret sicilinde kayıtlı güncel merkez adresi',
        ORTAK_SORGU: 'Şirket ortaklarının kimlik ve adres bilgileri',
        YETKILI_SORGU: 'Şirket yetkililerinin kimlik ve adres bilgileri',
      },
      [InstitutionType.BELEDIYE]: {
        ADRES_SORGU: 'Borçlunun belediye kayıtlarında yer alan adres bilgisi',
        EMLAK_SORGU: 'Borçlu adına kayıtlı gayrimenkul bilgileri',
      },
      [InstitutionType.TAPU]: {
        GAYRIMENKUL_SORGU: 'Borçlu adına kayıtlı taşınmaz bilgileri',
      },
      [InstitutionType.NUFUS]: {
        ADRES_SORGU: 'Borçlunun nüfus kayıtlarında yer alan yerleşim yeri adresi',
        AILE_SORGU: 'Borçlunun aile fertlerinin kimlik ve adres bilgileri',
      },
    };

    return requests[institution]?.[letterType] || 'İlgili bilgilerin tarafımıza iletilmesi';
  }

  private getAddressSourceFromInstitution(institution: InstitutionType): string {
    const mapping: Record<InstitutionType, string> = {
      [InstitutionType.SGK]: 'SGK_LETTER',
      [InstitutionType.VERGI_DAIRESI]: 'VERGI_LETTER',
      [InstitutionType.TICARET_SICILI]: 'TICARET_SICILI_LETTER',
      [InstitutionType.BELEDIYE]: 'BELEDIYE_LETTER',
      [InstitutionType.TAPU]: 'OTHER',
      [InstitutionType.NUFUS]: 'MERNIS',
    };
    return mapping[institution] || 'OTHER';
  }
}
