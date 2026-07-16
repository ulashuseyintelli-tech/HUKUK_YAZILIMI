import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DocumentService } from '../document.service';
import { DocumentTemplateService } from '../document-template.service';

/**
 * CLIENT-SEC-H2B regression — document services fail-closed tenant enforcement.
 *
 * Kapsam (DocumentService.prepareDocumentData + DocumentTemplateService.prepareVariablesFromCase):
 * - tenantId olmadan (undefined) çağrı fail-closed: ForbiddenException, Prisma'ya HİÇ ulaşılmaz.
 * - same-tenant case/document data başarılı (mevcut document-passive-policy.spec.ts ile tutarlı).
 * - cross-tenant lookup (tenantId dolu ama yanlış) reddedilir — bu zaten önceden de tenant-scoped'du,
 *   burada regresyon-koruması olarak yeniden doğrulanıyor.
 * - opsiyonel-tenant fail-open fallback deseni artık YOK: undefined ile HER ZAMAN throw.
 */
describe('CLIENT-SEC-H2B — document services fail-closed tenant', () => {
  const makeCase = () => ({
    id: 'case-1',
    fileNumber: '2026/1',
    principalAmount: 100,
    interestRate: 0,
    createdAt: new Date('2026-01-01'),
    startDate: new Date('2026-01-01'),
    client: { name: 'Alacakli', identityNo: '1', address: { text: 'Adres' } },
    debtors: [{ debtor: { name: 'Borclu', identityNo: '2', addresses: { primary: 'Adres' } } }],
    lawyers: [],
    formType: null,
    collections: [],
    executionOffice: null,
    dues: [],
    notes: null,
  });

  describe('DocumentService.prepareDocumentData', () => {
    it('tenantId undefined → ForbiddenException; Prisma HİÇ çağrılmaz', async () => {
      const prisma: any = { case: { findFirst: jest.fn() } };
      const service = new DocumentService(prisma, {} as any);

      await expect(service.prepareDocumentData('case-1', undefined)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.case.findFirst).not.toHaveBeenCalled();
    });

    it('same-tenant: case.findFirst({id,tenantId}) ile başarılı döner', async () => {
      const prisma: any = { case: { findFirst: jest.fn().mockResolvedValue(makeCase()) } };
      const service = new DocumentService(prisma, {} as any);

      const data = await service.prepareDocumentData('case-1', 'tenant-A');

      expect(prisma.case.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'case-1', tenantId: 'tenant-A' } }),
      );
      expect(data.debtor.name).toBe('Borclu');
    });

    it('cross-tenant (tenantId dolu ama yanlış, findFirst null döner): NotFoundException — regresyon-koruması', async () => {
      const prisma: any = { case: { findFirst: jest.fn().mockResolvedValue(null) } };
      const service = new DocumentService(prisma, {} as any);

      await expect(service.prepareDocumentData('case-1', 'tenant-B')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.case.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'case-1', tenantId: 'tenant-B' } }),
      );
    });
  });

  describe('DocumentTemplateService.prepareVariablesFromCase', () => {
    it('tenantId undefined → ForbiddenException; Prisma HİÇ çağrılmaz', async () => {
      const prisma: any = { case: { findFirst: jest.fn() } };
      const service = new DocumentTemplateService(prisma);

      await expect(service.prepareVariablesFromCase('case-1', undefined)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.case.findFirst).not.toHaveBeenCalled();
    });

    it('same-tenant: case.findFirst({id,tenantId}) ile başarılı döner', async () => {
      const prisma: any = { case: { findFirst: jest.fn().mockResolvedValue(makeCase()) } };
      const service = new DocumentTemplateService(prisma);

      await service.prepareVariablesFromCase('case-1', 'tenant-A');

      expect(prisma.case.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'case-1', tenantId: 'tenant-A' } }),
      );
    });

    it('cross-tenant (findFirst null döner): NotFoundException — regresyon-koruması', async () => {
      const prisma: any = { case: { findFirst: jest.fn().mockResolvedValue(null) } };
      const service = new DocumentTemplateService(prisma);

      await expect(service.prepareVariablesFromCase('case-1', 'tenant-B')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
