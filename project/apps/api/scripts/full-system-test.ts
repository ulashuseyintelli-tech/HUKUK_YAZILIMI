/**
 * Sistem Testi - Tüm modülleri kontrol et
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const TENANT_ID = 'cmj4m2jek0000mvu2om5rcjv2';

interface TestResult {
  name: string;
  status: 'OK' | 'WARN' | 'FAIL';
  message: string;
  count?: number;
}

const results: TestResult[] = [];

async function test(name: string, fn: () => Promise<{ status: 'OK' | 'WARN' | 'FAIL'; message: string; count?: number }>) {
  try {
    const result = await fn();
    results.push({ name, ...result });
  } catch (error: any) {
    results.push({ name, status: 'FAIL', message: error.message });
  }
}

async function runTests() {
  console.log('🔍 Sistem Testi Başlıyor...\n');
  console.log('='.repeat(60));

  // 1. İcra Daireleri
  await test('İcra Daireleri', async () => {
    const total = await prisma.executionOffice.count({ where: { tenantId: TENANT_ID } });
    const withUyap = await prisma.executionOffice.count({ 
      where: { tenantId: TENANT_ID, uyapCode: { not: null } } 
    });
    const withIban = await prisma.executionOffice.count({ 
      where: { tenantId: TENANT_ID, iban: { not: null } } 
    });
    
    // UYAP kodu formatı kontrolü (7 haneli olmalı)
    const sample = await prisma.executionOffice.findFirst({ 
      where: { tenantId: TENANT_ID, uyapCode: { not: null } } 
    });
    const uyapFormat = sample?.uyapCode?.length === 7 ? 'OK' : 'YANLIŞ';
    
    return {
      status: total > 800 ? 'OK' : 'WARN',
      message: `Toplam: ${total} | UYAP kodlu: ${withUyap} | IBAN'lı: ${withIban} | UYAP format: ${uyapFormat}`,
      count: total
    };
  });

  // 2. Mahkemeler
  await test('Mahkemeler', async () => {
    const total = await prisma.court.count({ where: { tenantId: TENANT_ID } });
    const withUyap = await prisma.court.count({ 
      where: { tenantId: TENANT_ID, uyapCode: { not: null } } 
    });
    
    // UYAP kodu formatı kontrolü
    const sample = await prisma.court.findFirst({ 
      where: { tenantId: TENANT_ID, uyapCode: { not: null } } 
    });
    const uyapFormat = sample?.uyapCode?.length === 7 ? 'OK' : 'YANLIŞ';
    
    return {
      status: total > 14000 ? 'OK' : 'WARN',
      message: `Toplam: ${total} | UYAP kodlu: ${withUyap} | UYAP format: ${uyapFormat}`,
      count: total
    };
  });

  // 3. Avukatlar
  await test('Avukatlar', async () => {
    const total = await prisma.lawyer.count({ where: { tenantId: TENANT_ID } });
    const active = await prisma.lawyer.count({ 
      where: { tenantId: TENANT_ID, isActive: true } 
    });
    const withTckn = await prisma.lawyer.count({ 
      where: { tenantId: TENANT_ID, tckn: { not: null } } 
    });
    
    return {
      status: total > 0 ? 'OK' : 'FAIL',
      message: `Toplam: ${total} | Aktif: ${active} | TCKN'li: ${withTckn}`,
      count: total
    };
  });

  // 4. Müvekkiller
  await test('Müvekkiller', async () => {
    const total = await prisma.client.count({ where: { tenantId: TENANT_ID } });
    const withPoa = await prisma.client.count({
      where: { 
        tenantId: TENANT_ID,
        powerOfAttorneys: { some: {} }
      }
    });
    
    // Duplicate kontrolü
    const duplicates = await prisma.$queryRaw<{count: bigint}[]>`
      SELECT COUNT(*) as count FROM (
        SELECT tckn FROM "Client" 
        WHERE "tenantId" = ${TENANT_ID} AND tckn IS NOT NULL
        GROUP BY tckn HAVING COUNT(*) > 1
      ) as dups
    `;
    const dupCount = Number(duplicates[0]?.count || 0);
    
    return {
      status: dupCount === 0 ? 'OK' : 'WARN',
      message: `Toplam: ${total} | Vekaletli: ${withPoa} | Duplicate TCKN: ${dupCount}`,
      count: total
    };
  });

  // 5. Vekaletler
  await test('Vekaletler', async () => {
    const total = await prisma.clientPowerOfAttorney.count();
    const active = await prisma.clientPowerOfAttorney.count({ 
      where: { status: 'ACTIVE' } 
    });
    const withLawyer = await prisma.clientPowerOfAttorney.count({
      where: { lawyers: { some: {} } }
    });
    
    return {
      status: total > 0 ? 'OK' : 'WARN',
      message: `Toplam: ${total} | Aktif: ${active} | Avukatlı: ${withLawyer}`,
      count: total
    };
  });

  // 6. Davalar/Dosyalar
  await test('Davalar/Dosyalar', async () => {
    const total = await prisma.case.count({ where: { tenantId: TENANT_ID } });
    const active = await prisma.case.count({ 
      where: { tenantId: TENANT_ID, status: 'ACTIVE' } 
    });
    
    return {
      status: 'OK',
      message: `Toplam: ${total} | Aktif: ${active}`,
      count: total
    };
  });

  // 7. Borçlular
  await test('Borçlular', async () => {
    const total = await prisma.debtor.count({ where: { tenantId: TENANT_ID } });
    
    return {
      status: 'OK',
      message: `Toplam: ${total}`,
      count: total
    };
  });

  // 8. Lookup Tabloları
  await test('Lookup Tabloları', async () => {
    const takipTuru = await prisma.lookupTakipTuru.count({ where: { tenantId: TENANT_ID } });
    const asama = await prisma.lookupAsama.count({ where: { tenantId: TENANT_ID } });
    const risk = await prisma.lookupRisk.count({ where: { tenantId: TENANT_ID } });
    
    return {
      status: takipTuru > 0 && asama > 0 ? 'OK' : 'WARN',
      message: `Takip Türü: ${takipTuru} | Aşama: ${asama} | Risk: ${risk}`,
    };
  });

  // 9. Ofis Bilgileri
  await test('Ofis Bilgileri', async () => {
    const office = await prisma.office.findFirst({ 
      where: { tenantId: TENANT_ID },
      include: { bankAccounts: true }
    });
    
    if (!office) {
      return { status: 'FAIL', message: 'Ofis kaydı bulunamadı' };
    }
    
    const hasBank = office.bankAccounts && office.bankAccounts.length > 0;
    const hasAddress = office.address && office.city;
    
    return {
      status: hasBank && hasAddress ? 'OK' : 'WARN',
      message: `${office.name} | Banka: ${hasBank ? office.bankAccounts.length + ' hesap' : 'YOK'} | Adres: ${hasAddress ? 'VAR' : 'YOK'}`,
    };
  });

  // 10. Kullanıcılar
  await test('Kullanıcılar', async () => {
    const total = await prisma.user.count({ where: { tenantId: TENANT_ID } });
    
    return {
      status: total > 0 ? 'OK' : 'FAIL',
      message: `Toplam: ${total}`,
      count: total
    };
  });

  // Sonuçları yazdır
  console.log('\n📊 TEST SONUÇLARI\n');
  console.log('='.repeat(60));
  
  let okCount = 0, warnCount = 0, failCount = 0;
  
  for (const r of results) {
    const icon = r.status === 'OK' ? '✅' : r.status === 'WARN' ? '⚠️' : '❌';
    console.log(`${icon} ${r.name}`);
    console.log(`   ${r.message}`);
    console.log('');
    
    if (r.status === 'OK') okCount++;
    else if (r.status === 'WARN') warnCount++;
    else failCount++;
  }
  
  console.log('='.repeat(60));
  console.log(`\n📈 ÖZET: ✅ ${okCount} OK | ⚠️ ${warnCount} WARN | ❌ ${failCount} FAIL\n`);
  
  // Yapılacaklar listesi
  if (warnCount > 0 || failCount > 0) {
    console.log('📝 YAPILACAKLAR:');
    console.log('-'.repeat(40));
    
    for (const r of results) {
      if (r.status === 'WARN' || r.status === 'FAIL') {
        console.log(`• ${r.name}: ${r.message}`);
      }
    }
  }
}

runTests()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
