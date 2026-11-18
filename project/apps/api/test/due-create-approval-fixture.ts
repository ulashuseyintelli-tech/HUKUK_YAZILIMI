import { PrismaClient } from '@prisma/client';
import { resolveTestDatabaseUrl } from './test-db-env';

/**
 * Due EKLEME talebini GERÇEK iki kişi onayıyla uygulayan test yardımcıları (yalnız disposable test veritabanı).
 *
 * `POST /cases/:id/dues` artık Due / kalem oluşturmaz; mevcut yüksek etkili kalem değişikliği onayına talep açar (202)
 * ve kalem ikinci kişinin onayında oluşur (owner kararı 19.11.2026). Konusu kalem ekleme onayı OLMAYAN HTTP testleri
 * hazırlık kalemini bu yardımcıyla, üretimdeki AYNI yoldan (talep → başka hesabın onayı → köprü) oluşturur. Onay
 * kuralının kendisi due-change-approval.http.db-gated.integration.spec.ts içinde sınanır.
 */
export interface DueApprovalDecider {
  approve(id: string, approverUserId: string, note?: string): Promise<unknown>;
}

type HttpResult = { status: number; body: any };

function assertDisposable(): void {
  if (!resolveTestDatabaseUrl(process.env)) throw new Error('Due approval fixture requires an explicit safe TEST_DATABASE_URL');
}

/**
 * Kiracıda onay yetkili (PARTNER avukat, personel kaydı yok, görüntüleyici değil) ve `notUserId`'den FARKLI bir hesap:
 * varsa onu, yoksa yeni açtığı hesabı döner. Talep eden kendi talebini onaylayamaz.
 */
export async function ensureDueApprover(db: PrismaClient, tenantId: string, notUserId: string): Promise<string> {
  assertDisposable();
  const existing = await db.user.findFirst({
    where: {
      tenantId,
      isActive: true,
      id: { not: notUserId },
      role: { not: 'VIEWER' },
      staffMember: null,
      lawyer: { lawyerRank: 'PARTNER' },
    },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  if (existing) return existing.id;
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const user = await db.user.create({
    data: { tenantId, email: `due-onayci-${suffix}@example.test`, name: 'Sentetik', surname: 'Onayci', role: 'USER' },
  });
  await db.lawyer.create({ data: { tenantId, userId: user.id, name: 'Sentetik', surname: 'Onayci', lawyerRank: 'PARTNER' } });
  return user.id;
}

/** Onaylanan kalem ekleme talebinin oluşturduğu Due kimliği (yürütmenin denetim kaydından). */
export async function approvedDueIdOf(db: PrismaClient, tenantId: string, approvalRequestId: string): Promise<string> {
  const applied = await db.auditLog.findFirst({
    where: { tenantId, action: 'CASE_DUE_CREATE_APPROVED_APPLIED', metadata: { path: ['approvalRequestId'], equals: approvalRequestId } },
    orderBy: { createdAt: 'desc' },
  });
  const dueId = (applied?.metadata as { dueId?: unknown } | null)?.dueId;
  if (typeof dueId !== 'string' || !dueId) throw new Error(`Approved due fixture: no applied record for approval ${approvalRequestId}`);
  return dueId;
}

/**
 * `post`: talep eden hesabın isteği gönderdiği işlev (dosyada mali yazma yetkili olmalı). Talep 202 + `approvalRequired`
 * dönmelidir; ardından `approverUserId` (verilmezse `ensureDueApprover`) onaylar ve oluşan Due kimliği döner.
 */
export async function createApprovedDue(input: {
  readonly db: PrismaClient;
  readonly approvals: DueApprovalDecider;
  readonly post: (path: string, body: Record<string, unknown>) => PromiseLike<HttpResult>;
  readonly caseId: string;
  readonly due: Record<string, unknown>;
  readonly requesterUserId: string;
  readonly approverUserId?: string;
}): Promise<{ dueId: string; approvalRequestId: string }> {
  assertDisposable();
  const parent = await input.db.case.findUniqueOrThrow({ where: { id: input.caseId }, select: { tenantId: true } });
  const res = await input.post(`/cases/${input.caseId}/dues`, input.due);
  if (res.status !== 202 || res.body?.approvalRequired !== true || typeof res.body?.approvalRequestId !== 'string') {
    throw new Error(`Due create request was not admitted: ${res.status} ${JSON.stringify(res.body).slice(0, 300)}`);
  }
  const approvalRequestId = res.body.approvalRequestId as string;
  const approverUserId = input.approverUserId ?? (await ensureDueApprover(input.db, parent.tenantId, input.requesterUserId));
  await input.approvals.approve(approvalRequestId, approverUserId);
  return { dueId: await approvedDueIdOf(input.db, parent.tenantId, approvalRequestId), approvalRequestId };
}
