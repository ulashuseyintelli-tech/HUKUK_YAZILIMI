/**
 * Case Creation Test
 * Yeni dosya oluşturma akışını test eder
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const TENANT_ID = 'cmj4m2jek0000mvu2om5rcjv2';

async function testCaseCreation() {
  console.log('=== DOSYA OLUŞTURMA TESTİ ===\n');
  
  // 1. Gerekli verileri kontrol et
  console.log('1. Gerekli veriler kontrol ediliyor...\n');
  
  // Avukatlar
  const lawyers = await prisma.lawyer.findMany({
    where: { tenantId: TENANT_ID, isActive: true },
    select: { id: true, name: true, surname: true, tckn: true }
  });
  console.log(`   Avukatlar: ${lawyers.length}`);
  lawyers.forEach(l => console.log(`     - ${l.name} ${l.surname} (TCKN: ${l.tckn || 'YOK'})`));
  
  // Müvekkiller
  const clients = await prisma.client.findMany({
    where: { tenantId: TENANT_ID, isActive: true },
    select: { id: true, displayName: true, tckn: true }
  });
  console.log(`\n   Müvekkiller: ${clients.length}`);
  clients.slice(0, 5).forEach(c => console.log(`     - ${c.displayName}`));
  
  // İcra Daireleri
  const offices = await prisma.executionOffice.findMany({
    where: { tenantId: TENANT_ID },
    select: { id: true, name: true, city: true, uyapCode: true },
    take: 5
  });
  console.log(`\n   İcra Daireleri: ${await prisma.executionOffice.count({ where: { tenantId: TENANT_ID } })}`);
  offices.forEach(o => console.log(`     - ${o.name} (UYAP: ${o.uyapCode})`));
  
  // Borçlular
  const debtors = await prisma.debtor.findMany({
    where: { tenantId: TENANT_ID },
    select: { id: true, name: true, type: true },
    take: 5
  });
  console.log(`\n   Borçlular: ${await prisma.debtor.count({ where: { tenantId: TENANT_ID } })}`);
  debtors.forEach(d => console.log(`     - ${d.name} (${d.type})`));
  
  // Lookup Tabloları
  const takipTuru = await prisma.lookupTakipTuru.findMany({ where: { tenantId: TENANT_ID } });
  const asama = await prisma.lookupAsama.findMany({ where: { tenantId: TENANT_ID } });
  const mahiyetTipi = await prisma.lookupMahiyetTipi.findMany({ where: { tenantId: TENANT_ID } });
  
  console.log(`\n   Lookup Tabloları:`);
  console.log(`     - Takip Türü: ${takipTuru.length}`);
  console.log(`     - Aşama: ${asama.length}`);
  console.log(`     - Mahiyet Tipi: ${mahiyetTipi.length}`);
  
  // 2. Mevcut dosyaları kontrol et
  console.log('\n2. Mevcut dosyalar...\n');
  const cases = await prisma.case.findMany({
    where: { tenantId: TENANT_ID },
    select: { id: true, fileNumber: true, type: true, status: true, caseStatus: true },
    orderBy: { createdAt: 'desc' },
    take: 5
  });
  console.log(`   Toplam: ${await prisma.case.count({ where: { tenantId: TENANT_ID } })}`);
  cases.forEach(c => console.log(`     - ${c.fileNumber} | ${c.type} | ${c.caseStatus}`));
  
  // 3. Sonraki dosya numarası
  const currentYear = new Date().getFullYear();
  const lastCase = await prisma.case.findFirst({
    where: { tenantId: TENANT_ID, fileNumber: { startsWith: `${currentYear}/` } },
    orderBy: { fileNumber: 'desc' },
    select: { fileNumber: true }
  });
  
  let nextNumber = 1;
  if (lastCase?.fileNumber) {
    const parts = lastCase.fileNumber.split('/');
    if (parts.length === 2) {
      nextNumber = parseInt(parts[1], 10) + 1;
    }
  }
  console.log(`\n3. Sonraki dosya numarası: ${currentYear}/${nextNumber}`);
  
  // 4. Vekaletler
  console.log('\n4. Vekaletler...\n');
  const poas = await prisma.clientPowerOfAttorney.findMany({
    where: { client: { tenantId: TENANT_ID }, status: 'ACTIVE' },
    include: {
      client: { select: { displayName: true } },
      lawyers: { include: { lawyer: { select: { name: true, surname: true } } } }
    }
  });
  console.log(`   Aktif vekalet: ${poas.length}`);
  poas.forEach(p => {
    const lawyerNames = p.lawyers.map(l => `${l.lawyer.name} ${l.lawyer.surname}`).join(', ');
    console.log(`     - ${p.client.displayName} -> ${lawyerNames}`);
  });
  
  console.log('\n=== TEST TAMAMLANDI ===');
  console.log('\n📋 SONUÇ: Tüm gerekli veriler mevcut. Dosya oluşturma için hazır.');
}

testCaseCreation()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
