/**
 * Mevcut takiplerdeki ilişkileri kontrol et
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkCaseRelations() {
  console.log('📊 Mevcut Takiplerin İlişki Durumu\n');

  const cases = await prisma.case.findMany({
    select: {
      id: true,
      fileNumber: true,
      executionOfficeId: true,
      clientId: true,
      executionOffice: {
        select: { name: true }
      },
      client: {
        select: { name: true, displayName: true }
      },
      _count: {
        select: {
          debtors: true,
          lawyers: true,
          caseClients: true,
        }
      }
    },
    orderBy: { fileNumber: 'asc' }
  });

  console.log('─'.repeat(120));
  console.log(
    'Dosya No'.padEnd(15),
    '| İcra Dairesi'.padEnd(35),
    '| Müvekkil'.padEnd(25),
    '| Borçlu'.padEnd(8),
    '| Avukat'.padEnd(8),
    '| CaseClient'
  );
  console.log('─'.repeat(120));

  let missingExecutionOffice = 0;
  let missingClient = 0;
  let missingDebtors = 0;
  let missingLawyers = 0;

  for (const c of cases) {
    const execOffice = c.executionOffice?.name || '✗ YOK';
    const client = c.client?.displayName || c.client?.name || '✗ YOK';
    
    if (!c.executionOfficeId) missingExecutionOffice++;
    if (!c.clientId) missingClient++;
    if (c._count.debtors === 0) missingDebtors++;
    if (c._count.lawyers === 0) missingLawyers++;

    console.log(
      c.fileNumber.padEnd(15),
      '|', execOffice.substring(0, 33).padEnd(33),
      '|', client.substring(0, 23).padEnd(23),
      '|', String(c._count.debtors).padEnd(6),
      '|', String(c._count.lawyers).padEnd(6),
      '|', String(c._count.caseClients)
    );
  }

  console.log('─'.repeat(120));
  console.log('\n📊 Özet:');
  console.log(`   - Toplam takip: ${cases.length}`);
  console.log(`   - İcra dairesi eksik: ${missingExecutionOffice}`);
  console.log(`   - Müvekkil eksik: ${missingClient}`);
  console.log(`   - Borçlu eksik: ${missingDebtors}`);
  console.log(`   - Avukat eksik: ${missingLawyers}`);

  await prisma.$disconnect();
}

checkCaseRelations();
