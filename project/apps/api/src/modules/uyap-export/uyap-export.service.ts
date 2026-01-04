import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { UyapXmlBuilderService } from './uyap-xml-builder.service';
import { UyapCaseMapperService } from './uyap-case-mapper.service';
import { UyapDocumentService } from './uyap-document.service';
import { ExportResultDto } from './dto/uyap-export.dto';

/**
 * UYAP e-Takip Export Orchestration Service
 * 
 * Case verilerini UYAP XML formatına dönüştürür ve export eder.
 */
@Injectable()
export class UyapExportService {
  constructor(
    private prisma: PrismaService,
    private xmlBuilder: UyapXmlBuilderService,
    private caseMapper: UyapCaseMapperService,
    private documentService: UyapDocumentService,
  ) {}

  /**
   * Tek bir case'i XML olarak export et
   */
  async exportSingleCase(
    caseId: string,
    tenantId: string,
    includeDocuments = false
  ): Promise<ExportResultDto> {
    // Case'in tenant'a ait olduğunu kontrol et
    const caseData = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
      select: { id: true, fileNumber: true },
    });

    if (!caseData) {
      throw new BadRequestException('Dosya bulunamadı');
    }

    const warnings: string[] = [];
    const errors: string[] = [];

    // Validasyonları kontrol et
    const validationResult = await this.validateCaseForExport(caseId);
    warnings.push(...validationResult.warnings);
    
    if (validationResult.errors.length > 0) {
      errors.push(...validationResult.errors);
      return {
        success: false,
        fileName: '',
        fileSize: 0,
        caseCount: 0,
        errors,
        warnings,
      };
    }

    // e-Takip dosyası oluştur
    const etakipDosyasi = await this.caseMapper.mapCasesToETakipDosyasi(
      [caseId],
      tenantId
    );

    // XML oluştur
    const xml = this.xmlBuilder.buildXml(etakipDosyasi);
    const fileName = `etakip_${caseData.fileNumber}_${Date.now()}.xml`;

    return {
      success: true,
      fileName,
      fileSize: Buffer.byteLength(xml, 'utf8'),
      caseCount: 1,
      xml,
      warnings,
    };
  }

  /**
   * Birden fazla case'i toplu XML olarak export et
   */
  async exportBatchCases(
    caseIds: string[],
    tenantId: string,
    batchName?: string,
    includeDocuments = false
  ): Promise<ExportResultDto> {
    // Tüm case'lerin tenant'a ait olduğunu kontrol et
    const cases = await this.prisma.case.findMany({
      where: { id: { in: caseIds }, tenantId },
      select: { id: true, fileNumber: true },
    });

    if (cases.length !== caseIds.length) {
      throw new BadRequestException(
        `${caseIds.length - cases.length} dosya bulunamadı veya erişim yetkiniz yok`
      );
    }

    const warnings: string[] = [];
    const errors: string[] = [];
    const validCaseIds: string[] = [];

    // Her case için validasyon
    for (const caseId of caseIds) {
      const validationResult = await this.validateCaseForExport(caseId);
      
      if (validationResult.errors.length > 0) {
        const caseInfo = cases.find(c => c.id === caseId);
        errors.push(`${caseInfo?.fileNumber}: ${validationResult.errors.join(', ')}`);
      } else {
        validCaseIds.push(caseId);
        warnings.push(...validationResult.warnings.map(w => 
          `${cases.find(c => c.id === caseId)?.fileNumber}: ${w}`
        ));
      }
    }

    if (validCaseIds.length === 0) {
      return {
        success: false,
        fileName: '',
        fileSize: 0,
        caseCount: 0,
        errors,
        warnings,
      };
    }

    // e-Takip dosyası oluştur
    const etakipDosyasi = await this.caseMapper.mapCasesToETakipDosyasi(
      validCaseIds,
      tenantId
    );

    // XML oluştur
    const xml = this.xmlBuilder.buildXml(etakipDosyasi);
    const fileName = batchName 
      ? `etakip_${batchName}_${Date.now()}.xml`
      : `etakip_toplu_${validCaseIds.length}_dosya_${Date.now()}.xml`;

    return {
      success: true,
      fileName,
      fileSize: Buffer.byteLength(xml, 'utf8'),
      caseCount: validCaseIds.length,
      xml,
      warnings,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Case'in UYAP export için uygun olup olmadığını kontrol et
   */
  async validateCaseForExport(caseId: string): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    const caseData = await this.prisma.case.findUnique({
      where: { id: caseId },
      include: {
        caseClients: { include: { client: true } },
        debtors: { include: { debtor: true } },
        dues: true,
      },
    });

    if (!caseData) {
      errors.push('Dosya bulunamadı');
      return { isValid: false, errors, warnings };
    }

    // Müvekkil kontrolü
    if (!caseData.caseClients?.length) {
      errors.push('Dosyada müvekkil tanımlı değil');
    } else {
      for (const cc of caseData.caseClients) {
        const client = cc.client;
        if (!client.tckn && !client.vkn) {
          warnings.push(`Müvekkil ${client.displayName || client.name}: Kimlik numarası eksik`);
        }
      }
    }

    // Borçlu kontrolü
    if (!caseData.debtors?.length) {
      errors.push('Dosyada borçlu tanımlı değil');
    } else {
      for (const cd of caseData.debtors) {
        const debtor = cd.debtor;
        if (!debtor.tckn && !debtor.vkn && !debtor.identityNo) {
          warnings.push(`Borçlu ${debtor.name}: Kimlik numarası eksik`);
        }
      }
    }

    // Alacak kalemi kontrolü
    if (!caseData.dues?.length) {
      warnings.push('Dosyada alacak kalemi tanımlı değil');
    }

    // UYAP birim kodu kontrolü
    if (!caseData.uyapBirimKodu) {
      warnings.push('UYAP birim kodu tanımlı değil');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Export edilebilir dosyaları listele
   */
  async getExportableCases(tenantId: string, limit = 100): Promise<{
    cases: Array<{
      id: string;
      fileNumber: string;
      clientName: string;
      debtorCount: number;
      hasWarnings: boolean;
    }>;
    total: number;
  }> {
    const cases = await this.prisma.case.findMany({
      where: {
        tenantId,
        caseStatus: 'DERDEST', // Sadece aktif dosyalar
      },
      include: {
        caseClients: { include: { client: true } },
        debtors: true,
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    const result = cases.map(c => ({
      id: c.id,
      fileNumber: c.fileNumber,
      clientName: c.caseClients[0]?.client?.displayName || c.caseClients[0]?.client?.name || '-',
      debtorCount: c.debtors.length,
      hasWarnings: !c.uyapBirimKodu || c.hasUyapWarning,
    }));

    const total = await this.prisma.case.count({
      where: { tenantId, caseStatus: 'DERDEST' },
    });

    return { cases: result, total };
  }
}
