/**
 * Takiplerdeki borçuların adres durumunu kontrol et
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkCaseDebtorAddresses() {
  console.log('📊 Takiplerdeki Borçuların Adres Durumu\n');

  // Tüm CaseDebtor kayıtlarını al
  const caseDebtors = await prisma.caseDebtor.findMany({
    include: {
      case: { select: { fileNumber: true } },
      debtor: {
        include: {
          debtorAddresses: true,
        }
      },
      selectedAddress: true,
    },
    orderBy: { case: { fileNumber: 'asc' } }
  });

  console.log('─'.repeat(120));
  console.log(
    'Dosya No'.padEnd(15),
    '| Borçlu'.padEnd(30),
    '| TCKN/VKN'.padEnd(15),
    '| Adres Sayısı'.padEnd(15),
    '| Seçili Adres'
  );
  console.log('─'.repeat(120));

  let withAddress = 0;
  let withoutAddress = 0;

  for (const cd of caseDebtors) {
    const addressCount = cd.debtor.debtorAddresses.length;
    const hasJsonAddress = cd.debtor.addresses && Object.keys(cd.debtor.addresses as any).length > 0;
    const hasSelectedAddress = !!cd.selectedAddress;
    
    if (addressCount > 0 || hasJsonAddress) {
      withAddress++;
    } else {
      withoutAddress++;
    }

    const addressStatus = addressCount > 0 ? `${addressCount} adet` : (hasJsonAddress ? 'JSON var' : '✗ YOK');
    const selectedStatus = hasSelectedAddress ? '✓' : '✗';
    
    console.log(
      cd.case.fileNumber.padEnd(15),
      '|', cd.debtor.name.substring(0, 28).padEnd(28),
      '|', (cd.debtor.identityNo || cd.debtor.tckn || cd.debtor.vkn || '-').padEnd(13),
      '|', addressStatus.padEnd(13),
      '|', selectedStatus
    );
  }

  console.log('─'.repeat(120));
  console.log(`\n📊 Özet:`);
  console.log(`   - Toplam takip-borçlu ilişkisi: ${caseDebtors.length}`);
  console.log(`   - Adresi olan borçlu: ${withAddress}`);
  console.log(`   - Adresi olmayan borçlu: ${withoutAddress}`);

  await prisma.$disconnect();
}

checkCaseDebtorAddresses();
