import { PublicInstitutionService } from './public-institution.service';

describe('PublicInstitutionService.search parameter boundary', () => {
  const createService = () => {
    const prisma = {
      publicInstitution: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    return {
      prisma,
      service: new PublicInstitutionService(prisma as any),
    };
  };

  it('rejects a non-scalar query before constructing the Prisma filter', async () => {
    const { prisma, service } = createService();

    await expect(service.search(['maliye', 'adalet'] as any)).resolves.toEqual([]);
    expect(prisma.publicInstitution.findMany).not.toHaveBeenCalled();
  });

  it('preserves the existing string search contract', async () => {
    const { prisma, service } = createService();

    await service.search('maliye', 15);

    expect(prisma.publicInstitution.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isActive: true,
        }),
        take: 15,
      }),
    );
  });
});
