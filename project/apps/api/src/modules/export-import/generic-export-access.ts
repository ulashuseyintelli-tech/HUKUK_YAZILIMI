import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Callers: ExportImportService.getClients/getCases and ReportService.exportCasesAsCsv.
 * Owner K16 choice 3: masked generic exports only; not mutation, approval, legal
 * document or financial action authority. ADMIN/title alone grants nothing.
 */
export async function genericExportCaseScope(
  prisma: PrismaService, tenantId: string, actorUserId?: string,
): Promise<Prisma.CaseWhereInput> {
  if (!tenantId || !actorUserId) throw new ForbiddenException({ code: 'GENERIC_EXPORT_DENIED' });
  const user: Prisma.UserWhereInput = { id: actorUserId, tenantId, isActive: true, role: { in: ['USER', 'ADMIN'] } };
  const actor = await prisma.user.findFirst({ where: user, select: { id: true } });
  if (!actor) throw new ForbiddenException({ code: 'GENERIC_EXPORT_DENIED' });
  return {
    tenantId,
    // Repeat current identity/profile checks in the data query, not token claims.
    OR: [
      { lawyers: { some: { lawyer: { tenantId, isActive: true, user } } } },
      { staff: { some: { canView: true, staffMember: { tenantId, isActive: true, user } } } },
    ],
    caseClients: { some: { client: { tenantId, isActive: true } } },
  };
}

/** Callers: generic case XLSX/PDF and CSV readers; never use legacy clientId as proof. */
export function genericExportClientNames(
  links: { client: { name: string | null } }[],
): string {
  return links.map(link => link.client.name).join(', ');
}
