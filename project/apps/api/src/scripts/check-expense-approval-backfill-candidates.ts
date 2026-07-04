/**
 * FAZ-1b ExpenseRequest.expenseApprovalStatus backfill-aday raporu — SALT-OKUMA. Hiçbir yazma yolu YOKTUR.
 *
 * Politika (S8-B FAZ-1b owner-lock, memory: s8b-faz1-expense-wiring-analysis.md): grandfather
 * PAID/RECEIVED -> APPROVED, LAWYER_PAID HARİÇ. Bu script yalnız "kaç kayıt etkilenecek" sorusuna
 * cevap verir; ExpenseRequest tablosuna DOKUNMAZ, DB'ye yalnız SELECT/count atar.
 *
 * Kullanım (project/apps/api altından):
 *   npx tsx src/scripts/check-expense-approval-backfill-candidates.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const GRANDFATHER_STATUSES = ['PAID', 'RECEIVED'] as const;

function short(id: string): string {
  return id.slice(0, 8) + '…';
}

async function main() {
  console.log('=== FAZ-1b ExpenseRequest approval backfill-aday raporu (SALT-OKUMA) ===\n');

  const totalCount = await prisma.expenseRequest.count();
  console.log(`Toplam ExpenseRequest: ${totalCount}\n`);

  console.log('--- Status dağılımı (tüm kayıtlar) ---');
  const statusGroups = await prisma.expenseRequest.groupBy({
    by: ['status'],
    _count: { _all: true },
  });
  for (const g of statusGroups.sort((a, b) => b._count._all - a._count._all)) {
    console.log(`  ${g.status.padEnd(12)}: ${g._count._all}`);
  }

  console.log('\n--- expenseApprovalStatus dağılımı (tüm kayıtlar) ---');
  const approvalGroups = await prisma.expenseRequest.groupBy({
    by: ['expenseApprovalStatus'],
    _count: { _all: true },
  });
  for (const g of approvalGroups.sort((a, b) => b._count._all - a._count._all)) {
    console.log(`  ${g.expenseApprovalStatus.padEnd(18)}: ${g._count._all}`);
  }

  // Politika: grandfather adayı = status IN (PAID, RECEIVED) AND expenseApprovalStatus != APPROVED.
  // LAWYER_PAID kasıtlı HARİÇ (owner-lock).
  const candidates = await prisma.expenseRequest.findMany({
    where: {
      status: { in: [...GRANDFATHER_STATUSES] },
      expenseApprovalStatus: { not: 'APPROVED' },
    },
    select: {
      id: true,
      tenantId: true,
      caseId: true,
      status: true,
      expenseApprovalStatus: true,
      totalAmount: true,
      paidTotal: true,
      currency: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`\n=== GRANDFATHER ADAYI (status IN [PAID,RECEIVED] AND expenseApprovalStatus != APPROVED) ===`);
  console.log(`Toplam aday: ${candidates.length}`);

  const byApprovalStatus: Record<string, number> = {};
  const byTenant: Record<string, number> = {};
  let totalAmountSum = 0;
  for (const c of candidates) {
    byApprovalStatus[c.expenseApprovalStatus] = (byApprovalStatus[c.expenseApprovalStatus] ?? 0) + 1;
    byTenant[c.tenantId] = (byTenant[c.tenantId] ?? 0) + 1;
    totalAmountSum += Number(c.totalAmount);
  }
  console.log('  expenseApprovalStatus kırılımı:', byApprovalStatus);
  console.log('  tenant kırılımı:', byTenant);
  console.log(`  Toplam totalAmount (aday satırlar, para-birimi karışık olabilir, kaba toplam): ${totalAmountSum.toFixed(2)}`);

  // LAWYER_PAID kaç tane var + kaçı zaten APPROVED değil (bilgi amaçlı — grandfather kapsamı DIŞI, ayrı sayılır)
  const lawyerPaidNotApproved = await prisma.expenseRequest.count({
    where: { status: 'LAWYER_PAID', expenseApprovalStatus: { not: 'APPROVED' } },
  });
  console.log(`\n(Bilgi) LAWYER_PAID + expenseApprovalStatus != APPROVED (grandfather kapsamı DIŞI, dokunulmayacak): ${lawyerPaidNotApproved}`);

  // REJECTED durumundaki adaylar ayrıca ilginç: grandfather'ın "PENDING_APPROVAL -> APPROVED" mı yoksa
  // "REJECTED -> APPROVED" da mı yazacağı owner kararı gerektirir. Ayrı say.
  const rejectedCandidates = candidates.filter((c) => c.expenseApprovalStatus === 'REJECTED');
  console.log(`(Bilgi) Adaylar içinde expenseApprovalStatus=REJECTED olanlar (owner ayrıca karar vermeli): ${rejectedCandidates.length}`);

  console.log('\n--- Spot-check: ilk 10 aday (en eski önce) ---');
  for (const c of candidates.slice(0, 10)) {
    console.log(
      `  id=${short(c.id)} tenant=${short(c.tenantId)} case=${short(c.caseId)} status=${c.status} ` +
        `approval=${c.expenseApprovalStatus} totalAmount=${c.totalAmount} paidTotal=${c.paidTotal} ` +
        `currency=${c.currency} createdAt=${c.createdAt.toISOString().slice(0, 10)}`,
    );
  }

  console.log('\nNOT: bu bir SALT-OKUMA raporudur; hiçbir ExpenseRequest satırı oluşturulmadı/değiştirilmedi.');
  console.log('Gerçek backfill APPLY = ayrı, owner-GO gerektiren sonraki task.');

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('Backfill-aday raporu HATA:', e);
  process.exit(1);
});
