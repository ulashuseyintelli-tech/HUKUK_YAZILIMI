/**
 * Borçuların adres durumunu kontrol et
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkDebtorAddresses() {
  console.log('📊 Borçuların Adres Durumu\n');

  // Tüm borçuları adres bilgileriyle birlikte al
  const debtors = await prisma.debtor.findMany({
    include: {
      debtorAddresses: true,
      caseDebtors: {
        include: {
          case: { select: { fileNumber: true } }
        }
      }
    }
  });

  console.log('─'.repeat(100));
  console.log(
    'Borçlu Adı'.padEnd(30),
    '| TCKN/VKN'.padEnd(15),
    '| Adres Sayısı'.padEnd(15),
    '| JSON Adres'.padEnd(15),
    '| Takipler'
  );
  console.log('─'.repeat(100));

  let withAddress = 0;
  let withoutAddress = 0;

  for (const d of debtors) {
    const addressCount = d.debtorAddresses.length;
    const hasJsonAddress = d.addresses && Object.keys(d.addresses as any).length > 0;
    const caseNumbers = d.caseDebtors.map(cd => cd.case.fileNumber).join(', ');
    
    if (addressCount > 0 || hasJsonAddress) {
      withAddress++;
    } else {
      withoutAddress++;
    }

    const addressStatus = addressCount > 0 ? `${addressCount} adet` : (hasJsonAddress ? 'JSON var' : '✗ YOK');
    
    console.log(
      d.name.substring(0, 28).padEnd(30),
      '|', (d.identityNo || d.tckn || d.vkn || '-').padEnd(13),
      '|', addressStatus.padEnd(13),
      '|', (hasJsonAddress ? '✓' : '✗').padEnd(13),
      '|', caseNumbers.substring(0, 30)
    );
  }

  console.log('─'.repeat(100));
  console.log(`\n📊 Özet:`);
  console.log(`   - Toplam borçlu: ${debtors.length}`);
  console.log(`   - Adresi olan: ${withAddress}`);
  console.log(`   - Adresi olmayan: ${withoutAddress}`);

  // Detaylı adres bilgisi
  console.log('\n\n📍 Borçu Adres Detayları:\n');
  for (const d of debtors) {
    console.log(`\n${d.name} (${d.identityNo || d.tckn || '-'}):`);
    
    if (d.debtorAddresses.length > 0) {
      console.log('  DebtorAddress tablosu:');
      for (const addr of d.debtorAddresses) {
        console.log(`    - [${addr.addressType}] ${addr.street}, ${addr.district || ''} ${addr.city}`);
      }
    }
    
    if (d.addresses && Object.keys(d.addresses as any).length > 0) {
      console.log('  JSON addresses alanı:');
      console.log('   ', JSON.stringify(d.addresses));
    }
    
    if (d.debtorAddresses.length === 0 && (!d.addresses || Object.keys(d.addresses as any).length === 0)) {
      console.log('  ⚠️ HİÇ ADRES YOK!');
    }
  }

  await prisma.$disconnect();
}

checkDebtorAddresses();
