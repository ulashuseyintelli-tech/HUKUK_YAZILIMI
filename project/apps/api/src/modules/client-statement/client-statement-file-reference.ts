import type { PrismaService } from '@/prisma/prisma.service';
import { toClientSafeFileReference } from './client-statement-render.contract';
import type { ClientSafeFileReferenceV1 } from '../client-financial-disclosure/client-safe-file-reference.contract';

/**
 * CAD C3-B01 — client-safe dosya referanslarının KAPSAM-DOĞRULANMIŞ çözümü.
 *
 * Owner amendment (ratifiye): referans "aynı tenant ve aynı müvekkil kapsamından
 * DOĞRULANMADAN projekte edilemez". Bu yüzden burada `Case.fileNumber` doğrudan caseId
 * ile okunmaz; sorgu HER ZAMAN (a) tenantId ve (b) müvekkilin kendi CaseClient bağı
 * üzerinden sınırlanır. Bağı olmayan bir dosyanın referansı DÖNMEZ — sessizce atlanır
 * (fail-closed; başka alana veya iç ID'ye düşülmez).
 */
export async function resolveClientSafeFileReferences(
  prisma: PrismaService,
  tenantId: string,
  clientId: string,
  caseIds: readonly string[],
): Promise<ReadonlyMap<string, ClientSafeFileReferenceV1>> {
  const unique = [...new Set(caseIds.filter((id): id is string => typeof id === 'string' && id.length > 0))];
  if (unique.length === 0) return new Map();

  // Kapsam kanıtı: yalnız BU müvekkilin BU tenant'taki dosya bağları.
  const links = await prisma.caseClient.findMany({
    where: { clientId, caseId: { in: unique }, client: { tenantId }, case: { tenantId } },
    select: { caseId: true, case: { select: { fileNumber: true } } },
  });

  const out = new Map<string, ClientSafeFileReferenceV1>();
  for (const link of links) {
    const ref = toClientSafeFileReference(link.case?.fileNumber);
    if (ref) out.set(link.caseId, ref); // fileNumber yoksa KAYIT YOK (fallback yok)
  }
  return out;
}
