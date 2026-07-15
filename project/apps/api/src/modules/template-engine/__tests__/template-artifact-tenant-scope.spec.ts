import { TemplateEngineService } from '../template-engine.service';

/**
 * CLIENT-SEC-H1 (S4) regression — Template artifact list/download tenant + ownership scoping.
 *
 * Kapsam:
 * - (T-03/T-06) listDocumentArtifacts tenant-scoped: findMany {caseId, tenantId} (caseId tek başına DEĞİL).
 * - (T-03/T-06) downloadArtifact tenant-scoped ownership: findFirst {id, tenantId} (findUnique {id} DEĞİL);
 *   cross-tenant artifactId eşleşmez → null → controller 404 (metadata/varlık ifşası yok).
 */
describe('CLIENT-SEC-H1 (S4) — Template artifact tenant/ownership scoping', () => {
  const build = () => {
    const prisma: any = {
      documentArtifact: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
      },
    };
    const svc = new TemplateEngineService(prisma, {} as any);
    return { svc, prisma };
  };

  it('listDocumentArtifacts: tenant-scoped findMany {caseId, tenantId} (T-06)', async () => {
    const { svc, prisma } = build();
    await svc.listDocumentArtifacts('case-1', 'tenant-A');
    expect(prisma.documentArtifact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { caseId: 'case-1', tenantId: 'tenant-A' } }),
    );
  });

  it('downloadArtifact: tenant-scoped findFirst {id, tenantId}; findUnique KULLANILMAZ; cross-tenant → null (T-03)', async () => {
    const { svc, prisma } = build();
    prisma.documentArtifact.findFirst.mockResolvedValue(null); // cross-tenant artifact eşleşmez

    const res = await svc.downloadArtifact('artifact-B', 'tenant-A');

    expect(prisma.documentArtifact.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'artifact-B', tenantId: 'tenant-A' } }),
    );
    expect(prisma.documentArtifact.findUnique).not.toHaveBeenCalled();
    // cross-tenant/eksik → null → controller 404 (metadata ifşası yok):
    expect(res).toBeNull();
  });
});
