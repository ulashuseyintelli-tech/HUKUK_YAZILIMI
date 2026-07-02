/**
 * FAZ-1b ExpenseRequest.expenseApprovalStatus backfill — APPLY (owner-GO alındı 2026-07-03).
 *
 * Politika (S8-B FAZ-1b owner-lock, memory: s8b-faz1-expense-wiring-analysis.md): grandfather
 * PAID/RECEIVED -> APPROVED. LAWYER_PAID durumu ve zaten REJECTED edilmiş kayıtlar HARİÇ — yalnız
 * status IN (PAID, RECEIVED) AND expenseApprovalStatus = PENDING_APPROVAL dokunulur. REJECTED bir
 * kaydı otomatik APPROVED'a çevirmek gerçek bir insan reddini sessizce ezer; bu script BUNU YAPMAZ
 * (bkz. check-expense-approval-backfill-candidates.ts'nin kendi REJECTED uyarısı).
 *
 * Yazma şekli ExpenseRequestService.approveForDistribution() ile BİREBİR AYNI (expenseApprovalStatus/
 * approvedAt/approvedById + expenseAuditLog, aynı transaction deseni) — yalnız action=
 * 'APPROVAL_GRANTED_BACKFILL' ile gerçek kullanıcı tıklamasından ayrıştırılır.
 *
 * GERÇEK İNSAN ACTOR ZORUNLU (emsal: #805 "require human actor for payment reversal" — bu commit
 * finansal event'lerde actor:{type:'SYSTEM'} deseninden actor:{type:'HUMAN',userId} desenine geçti;
 * aynı ilke burada da uygulanır). Sentetik/SYSTEM/null actor YASAK. User.email tenant-scoped unique
 * olduğu için actor her tenant için AYRI resolve edilir; bir tenant'ta bulunamazsa o tenant'ın
 * adayları SKIP edilir (yanlış kişiye atfetmektense dokunmamak tercih edilir) ve raporda açıkça listelenir.
 *
 * Kullanım (project/apps/api altından):
 *   npx tsx src/scripts/apply-expense-approval-backfill.ts --actor-email=you@example.com
 *
 * Varsayılan DRY-RUN'dır (yalnız ne yapılacağını yazar, DB'ye dokunmaz). Gerçek yazma için:
 *   npx tsx src/scripts/apply-expense-approval-backfill.ts --actor-email=you@example.com --confirm
 */

import { PrismaClient } from '@prisma/client';
import { parseArgs, partitionByActorAvailability, type BackfillCandidate } from './apply-expense-approval-backfill-logic';

const prisma = new PrismaClient();

const GRANDFATHER_STATUSES = ['PAID', 'RECEIVED'] as const;
const BACKFILL_ACTION = 'APPROVAL_GRANTED_BACKFILL';

function short(id: string): string {
  return id.slice(0, 8) + '…';
}

async function main() {
  console.log('=== FAZ-1b ExpenseRequest approval backfill — APPLY ===\n');

  const { actorEmail, confirm } = parseArgs(process.argv.slice(2));
  if (!actorEmail) {
    console.error('HATA: --actor-email=<email> zorunlu (gerçek insan actor — bkz. #805 emsali). Çıkılıyor.');
    process.exit(1);
  }

  const candidates: BackfillCandidate[] = await prisma.expenseRequest.findMany({
    where: {
      status: { in: [...GRANDFATHER_STATUSES] },
      expenseApprovalStatus: 'PENDING_APPROVAL',
    },
    select: {
      id: true,
      tenantId: true,
      caseId: true,
      status: true,
      totalAmount: true,
      paidTotal: true,
      currency: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`Aday sayısı (status IN [PAID,RECEIVED] AND expenseApprovalStatus=PENDING_APPROVAL): ${candidates.length}`);

  if (candidates.length === 0) {
    console.log('\nHiç aday yok. Yapılacak bir şey yok, çıkılıyor.');
    await prisma.$disconnect();
    return;
  }

  const tenantIds = [...new Set(candidates.map((c) => c.tenantId))];
  const actorByTenant = new Map<string, string>(); // tenantId -> userId

  console.log(`\n--- Actor resolve (${tenantIds.length} tenant) ---`);
  for (const tenantId of tenantIds) {
    const user = await prisma.user.findFirst({
      where: { tenantId, email: actorEmail },
      select: { id: true, email: true, name: true, surname: true },
    });
    if (!user) {
      console.warn(`  ⚠ tenant=${short(tenantId)}: "${actorEmail}" bu tenant'ta bulunamadı — bu tenant'ın adayları SKIP edilecek.`);
      continue;
    }
    console.log(`  ✓ tenant=${short(tenantId)}: actor=${user.name} ${user.surname} (${user.email}, id=${short(user.id)})`);
    actorByTenant.set(tenantId, user.id);
  }

  const { applicable, skipped } = partitionByActorAvailability(candidates, actorByTenant);

  console.log(`\n--- Uygulanacak: ${applicable.length} · Skip (actor yok): ${skipped.length} ---`);
  for (const c of applicable) {
    console.log(
      `  ${confirm ? 'APPLY' : 'DRY-RUN'} id=${short(c.id)} tenant=${short(c.tenantId)} case=${short(c.caseId)} ` +
        `status=${c.status} totalAmount=${c.totalAmount} paidTotal=${c.paidTotal} currency=${c.currency} ` +
        `createdAt=${c.createdAt.toISOString().slice(0, 10)}`,
    );
  }

  if (!confirm) {
    console.log('\nDRY-RUN tamamlandı — hiçbir kayıt değiştirilmedi. Gerçek yazma için --confirm ekleyin.');
    await prisma.$disconnect();
    return;
  }

  console.log("\n--- APPLY başlıyor (her satır kendi transaction'ında, approveForDistribution ile aynı şekil) ---");
  let applied = 0;
  for (const c of applicable) {
    const actorUserId = actorByTenant.get(c.tenantId)!;
    await prisma.$transaction(async (tx) => {
      await tx.expenseRequest.update({
        where: { id: c.id },
        data: { expenseApprovalStatus: 'APPROVED', approvedAt: new Date(), approvedById: actorUserId },
      });
      await tx.expenseAuditLog.create({
        data: {
          expenseRequestId: c.id,
          action: BACKFILL_ACTION,
          details: {
            scope: 'DISTRIBUTION',
            backfill: true,
            reason: 'FAZ-1b grandfather backfill: FAZ-1b öncesi PAID/RECEIVED, approval kavramı henüz yokken kapanmış',
            previousExpenseApprovalStatus: 'PENDING_APPROVAL',
          },
          userId: actorUserId,
        },
      });
    });
    applied += 1;
  }

  console.log(`\nTamamlandı: ${applied} kayıt APPROVED olarak backfill edildi.`);
  if (skipped.length > 0) {
    console.log(`⚠ ${skipped.length} kayıt SKIP edildi (actor "${actorEmail}" ilgili tenant'ta yok) — dokunulmadı:`);
    for (const c of skipped) {
      console.log(`  id=${short(c.id)} tenant=${short(c.tenantId)}`);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('Backfill APPLY HATA:', e);
  process.exit(1);
});
