import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, GoneException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { ClientIntakePublicService } from './client-intake-public.service';
import { SubmitIntakeDto } from './dto/submit-intake.dto';

const TOKEN = 'raw-token-xyz';
const HASH = createHash('sha256').update(TOKEN).digest('hex');

const mockPrisma: any = {
  clientIntakeLink: { findFirst: jest.fn(), updateMany: jest.fn() },
  clientIntakeSubmission: { create: jest.fn() },
  clientIntakeField: { createMany: jest.fn() },
  $transaction: jest.fn((fn: any) => fn(mockPrisma)),
};

const activeLink = {
  id: 'lnk-1', tenantId: 'tenant-1', caseId: 'case-1', clientId: 'client-1',
  status: 'ACTIVE', scope: ['INCOME_SOURCE', 'ADDRESS'], expiresAt: null, maxUses: 1, useCount: 0,
};

const dto: SubmitIntakeDto = {
  fields: [{ category: 'INCOME_SOURCE' as any, value: 'Müteahhit' }],
};

describe('ClientIntakePublicService', () => {
  let service: ClientIntakePublicService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.clientIntakeLink.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.clientIntakeSubmission.create.mockResolvedValue({ id: 'sub-1' });
    mockPrisma.clientIntakeField.createMany.mockResolvedValue({ count: 1 });
    const module: TestingModule = await Test.createTestingModule({
      providers: [ClientIntakePublicService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get(ClientIntakePublicService);
  });

  describe('getForm', () => {
    it('yalnız { title, scope } döner — PII YOK', async () => {
      mockPrisma.clientIntakeLink.findFirst.mockResolvedValue(activeLink);
      const res = await service.getForm(TOKEN);
      expect(Object.keys(res).sort()).toEqual(['scope', 'title']);
      expect(res.scope).toEqual(['INCOME_SOURCE', 'ADDRESS']);
      // token sha256 ile aranıyor
      expect(mockPrisma.clientIntakeLink.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { tokenHash: HASH } }));
    });

    it('geçersiz token → generic NotFound', async () => {
      mockPrisma.clientIntakeLink.findFirst.mockResolvedValue(null);
      await expect(service.getForm(TOKEN)).rejects.toThrow(NotFoundException);
    });

    it('ACTIVE olmayan / expired / limit-dolu → generic NotFound', async () => {
      mockPrisma.clientIntakeLink.findFirst.mockResolvedValue({ ...activeLink, status: 'REVOKED' });
      await expect(service.getForm(TOKEN)).rejects.toThrow(NotFoundException);
      mockPrisma.clientIntakeLink.findFirst.mockResolvedValue({ ...activeLink, expiresAt: new Date(Date.now() - 1000) });
      await expect(service.getForm(TOKEN)).rejects.toThrow(NotFoundException);
      mockPrisma.clientIntakeLink.findFirst.mockResolvedValue({ ...activeLink, useCount: 1, maxUses: 1 });
      await expect(service.getForm(TOKEN)).rejects.toThrow(NotFoundException);
    });
  });

  describe('submit', () => {
    it('honeypot dolu → sessiz drop (YAZMA yok)', async () => {
      const res = await service.submit(TOKEN, { ...dto, hp: 'bot' }, '1.2.3.4', 'ua');
      expect(res).toEqual({ ok: true });
      expect(mockPrisma.clientIntakeLink.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.clientIntakeSubmission.create).not.toHaveBeenCalled();
    });

    it('geçerli → CLIENT_SUBMITTED + field yazar; sourceMeta ipHash (ham IP YOK)', async () => {
      mockPrisma.clientIntakeLink.findFirst.mockResolvedValue(activeLink);
      const res = await service.submit(TOKEN, dto, '9.9.9.9', 'Mozilla/5.0');
      expect(res).toEqual({ ok: true });

      // atomik increment (ACTIVE & useCount<maxUses)
      expect(mockPrisma.clientIntakeLink.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: 'ACTIVE', useCount: { lt: 1 } }), data: { useCount: { increment: 1 } } }),
      );
      // submission CLIENT_SUBMITTED + sourceMeta ipHash, ham IP yok
      const subArg = mockPrisma.clientIntakeSubmission.create.mock.calls[0][0];
      expect(subArg.data.status).toBe('CLIENT_SUBMITTED');
      expect(subArg.data.sourceMeta.ipHash).toBe(createHash('sha256').update('9.9.9.9').digest('hex'));
      expect(JSON.stringify(subArg.data.sourceMeta)).not.toContain('9.9.9.9');
      // field yazıldı
      expect(mockPrisma.clientIntakeField.createMany).toHaveBeenCalled();
    });

    it('scope DIŞI kategori → generic BadRequest, YAZMA yok', async () => {
      mockPrisma.clientIntakeLink.findFirst.mockResolvedValue(activeLink);
      await expect(service.submit(TOKEN, { fields: [{ category: 'ASSET' as any, value: 'x' }] }, '1.1.1.1')).rejects.toThrow(BadRequestException);
      expect(mockPrisma.clientIntakeSubmission.create).not.toHaveBeenCalled();
    });

    it('atomik limit: increment 0 satır → Gone (yarış/limit)', async () => {
      mockPrisma.clientIntakeLink.findFirst.mockResolvedValue(activeLink);
      mockPrisma.clientIntakeLink.updateMany.mockResolvedValueOnce({ count: 0 });
      await expect(service.submit(TOKEN, dto, '1.1.1.1')).rejects.toThrow(GoneException);
      expect(mockPrisma.clientIntakeSubmission.create).not.toHaveBeenCalled();
    });

    it('geçersiz token submit → generic NotFound (yazma yok)', async () => {
      mockPrisma.clientIntakeLink.findFirst.mockResolvedValue(null);
      await expect(service.submit(TOKEN, dto, '1.1.1.1')).rejects.toThrow(NotFoundException);
    });
  });
});
