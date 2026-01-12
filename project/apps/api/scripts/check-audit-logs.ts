import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('AddressAuditLog kayitlari kontrol ediliyor...\n');
  
  const logs = await prisma.addressAuditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  
  console.log(`Toplam ${logs.length} kayit bulundu:\n`);
  
  for (const log of logs) {
    console.log(`[${log.createdAt.toISOString()}] ${log.action}`);
    console.log(`  Case: ${log.caseId}`);
    console.log(`  Note: ${log.noteText || '-'}`);
    console.log(`  ShowInNotes: ${log.showInNotes}`);
    console.log('');
  }
  
  // AddressTask kayitlari
  console.log('\n--- AddressTask Kayitlari ---\n');
  const tasks = await prisma.addressTask.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  
  console.log(`Toplam ${tasks.length} gorev bulundu:\n`);
  for (const task of tasks) {
    console.log(`[${task.createdAt.toISOString()}] ${task.taskType} - ${task.status}`);
    console.log(`  Title: ${task.title}`);
    console.log('');
  }
}

main()
  .catch((e) => {
    console.error('Hata:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
