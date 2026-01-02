/**
 * Örnek Takipler ve Borçlu Bilgileri Seed Script
 * Her takip tipi için gerçekçi örnek veriler oluşturur
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TENANT_ID = 'cmj4m2jek0000mvu2om5rcjv2';

// Gerçekçi Türk isimleri
const FIRST_NAMES = ['Ahmet', 'Mehmet', 'Mustafa', 'Ali', 'Hüseyin', 'Fatma', 'Ayşe', 'Emine', 'Hatice', 'Zeynep', 'Burak', 'Emre', 'Can', 'Deniz', 'Ece'];
const LAST_NAMES = ['Yılmaz', 'Kaya', 'Demir', 'Çelik', 'Şahin', 'Yıldız', 'Yıldırım', 'Öztürk', 'Aydın', 'Özdemir', 'Arslan', 'Doğan', 'Kılıç', 'Aslan', 'Çetin'];
const COMPANY_NAMES = ['Anadolu Ticaret A.Ş.', 'Marmara İnşaat Ltd. Şti.', 'Ege Tekstil San. Tic. A.Ş.', 'Karadeniz Gıda Ltd. Şti.', 'Akdeniz Turizm A.Ş.'];

// İstanbul ilçeleri ve mahalleler
const ISTANBUL_DISTRICTS = [
  { district: 'Kadıköy', neighborhoods: ['Caferağa', 'Moda', 'Fenerbahçe', 'Kozyatağı', 'Bostancı'] },
  { district: 'Beşiktaş', neighborhoods: ['Levent', 'Etiler', 'Bebek', 'Ortaköy', 'Arnavutköy'] },
  { district: 'Şişli', neighborhoods: ['Mecidiyeköy', 'Nişantaşı', 'Osmanbey', 'Bomonti', 'Fulya'] },
  { district: 'Üsküdar', neighborhoods: ['Çengelköy', 'Kuzguncuk', 'Beylerbeyi', 'Acıbadem', 'Altunizade'] },
  { district: 'Bakırköy', neighborhoods: ['Ataköy', 'Yeşilköy', 'Florya', 'Zeytinlik', 'Kartaltepe'] },
  { district: 'Ataşehir', neighborhoods: ['Küçükbakkalköy', 'İçerenköy', 'Yenisahra', 'Barbaros', 'Ferhatpaşa'] },
];

// Sokak isimleri
const STREETS = ['Atatürk Cad.', 'Cumhuriyet Cad.', 'İstiklal Cad.', 'Bağdat Cad.', 'Barbaros Bulvarı', 'Halaskargazi Cad.', 'Vatan Cad.', 'Millet Cad.'];

function generateTCKN(): string {
  // Geçerli TCKN formatı (11 haneli, ilk hane 0 olamaz)
  let tckn = String(Math.floor(Math.random() * 9) + 1);
  for (let i = 0; i < 10; i++) {
    tckn += String(Math.floor(Math.random() * 10));
  }
  return tckn;
}

function generateVKN(): string {
  // 10 haneli vergi kimlik numarası
  let vkn = '';
  for (let i = 0; i < 10; i++) {
    vkn += String(Math.floor(Math.random() * 10));
  }
  return vkn;
}

function generatePhone(): string {
  const prefixes = ['532', '533', '535', '536', '537', '538', '539', '542', '543', '544', '545', '546', '505', '506', '507'];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  let number = '';
  for (let i = 0; i < 7; i++) {
    number += String(Math.floor(Math.random() * 10));
  }
  return `0${prefix}${number}`;
}

function generateAddress(): { street: string; city: string; district: string; neighborhood: string } {
  const location = ISTANBUL_DISTRICTS[Math.floor(Math.random() * ISTANBUL_DISTRICTS.length)];
  const neighborhood = location.neighborhoods[Math.floor(Math.random() * location.neighborhoods.length)];
  const street = STREETS[Math.floor(Math.random() * STREETS.length)];
  const no = Math.floor(Math.random() * 150) + 1;
  const daire = Math.floor(Math.random() * 20) + 1;
  
  return {
    street: `${street} No:${no} D:${daire}`,
    city: 'İstanbul',
    district: location.district,
    neighborhood
  };
}

function generateFileNumber(year: number, index: number): string {
  return `${year}/${String(index).padStart(4, '0')}`;
}

async function main() {
  console.log('🚀 Örnek takipler ve borçlu bilgileri oluşturuluyor...\n');

  // 1. Mevcut müvekkilleri al
  const clients = await prisma.client.findMany({
    where: { tenantId: TENANT_ID, isActive: true },
    take: 5
  });

  if (clients.length === 0) {
    console.log('❌ Müvekkil bulunamadı. Önce müvekkil oluşturun.');
    return;
  }

  // 2. Mevcut avukatları al
  const lawyers = await prisma.lawyer.findMany({
    where: { tenantId: TENANT_ID, isActive: true },
    take: 3
  });

  // 3. İcra dairelerini al
  const executionOffices = await prisma.executionOffice.findMany({
    where: { tenantId: TENANT_ID, isActive: true },
    take: 10
  });

  // 4. Lookup verilerini al
  const lookups = await prisma.lookupTakipTuru.findMany({
    where: { tenantId: TENANT_ID, isActive: true }
  });

  const risks = await prisma.lookupRisk.findMany({
    where: { tenantId: TENANT_ID, isActive: true }
  });

  const asamalar = await prisma.lookupAsama.findMany({
    where: { tenantId: TENANT_ID, isActive: true }
  });

  console.log(`📊 Mevcut veriler:`);
  console.log(`   - ${clients.length} müvekkil`);
  console.log(`   - ${lawyers.length} avukat`);
  console.log(`   - ${executionOffices.length} icra dairesi`);
  console.log(`   - ${lookups.length} takip türü`);
  console.log('');

  // 5. Örnek borçlular oluştur (eksik bilgileri tamamla)
  console.log('👤 Borçlular oluşturuluyor/güncelleniyor...\n');

  const debtors: any[] = [];

  // Gerçek kişi borçlular
  for (let i = 0; i < 15; i++) {
    const firstName = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
    const lastName = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
    const address = generateAddress();
    const gender = ['Ahmet', 'Mehmet', 'Mustafa', 'Ali', 'Hüseyin', 'Burak', 'Emre', 'Can'].includes(firstName) ? 'E' : 'K';
    
    const debtor = await prisma.debtor.create({
      data: {
        tenantId: TENANT_ID,
        type: 'INDIVIDUAL',
        firstName,
        lastName,
        name: `${firstName} ${lastName}`,
        tckn: generateTCKN(),
        identityNo: generateTCKN(),
        gender,
        birthDate: new Date(1960 + Math.floor(Math.random() * 40), Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1),
        fatherName: FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)],
        phone: generatePhone(),
        email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@email.com`,
        riskLevel: ['DUSUK', 'ORTA', 'YUKSEK'][Math.floor(Math.random() * 3)] as any,
        debtorAddresses: {
          create: [
            {
              addressType: 'EV',
              street: address.street,
              city: address.city,
              district: address.district,
              isPrimary: true,
              isMernis: true
            },
            {
              addressType: 'IS',
              street: generateAddress().street,
              city: 'İstanbul',
              district: generateAddress().district,
              isPrimary: false
            }
          ]
        }
      }
    });
    debtors.push(debtor);
    console.log(`   ✅ ${debtor.name} (Gerçek Kişi)`);
  }

  // Tüzel kişi borçlular
  for (let i = 0; i < 5; i++) {
    const companyName = COMPANY_NAMES[i] || `${LAST_NAMES[i]} Holding A.Ş.`;
    const address = generateAddress();
    
    const debtor = await prisma.debtor.create({
      data: {
        tenantId: TENANT_ID,
        type: 'COMPANY',
        companyName,
        name: companyName,
        vkn: generateVKN(),
        identityNo: generateVKN(),
        taxOffice: `${address.district} Vergi Dairesi`,
        mersisNo: `0${generateVKN()}${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`,
        phone: generatePhone(),
        email: `info@${companyName.toLowerCase().replace(/[^a-z]/g, '')}.com.tr`,
        riskLevel: ['DUSUK', 'ORTA', 'YUKSEK'][Math.floor(Math.random() * 3)] as any,
        debtorAddresses: {
          create: {
            addressType: 'IS',
            street: address.street,
            city: address.city,
            district: address.district,
            isPrimary: true
          }
        }
      }
    });
    debtors.push(debtor);
    console.log(`   ✅ ${debtor.name} (Tüzel Kişi)`);
  }

  console.log(`\n📁 Toplam ${debtors.length} borçlu oluşturuldu.\n`);

  // 6. Her takip tipi için örnek takipler oluştur
  console.log('📋 Örnek takipler oluşturuluyor...\n');

  const caseTypes = [
    { type: 'GENERAL_EXECUTION', name: 'İlamsız Genel Haciz', subType: 'GENEL', count: 3 },
    { type: 'BOND', name: 'Kambiyo - Senet', subType: 'KAMBIYO', count: 2 },
    { type: 'CHECK', name: 'Kambiyo - Çek', subType: 'KAMBIYO', count: 2 },
    { type: 'RENTAL', name: 'Kira Alacağı', subType: 'KIRA', count: 2 },
    { type: 'OTHER', name: 'İlamlı Takip', subType: 'ILAMLI', count: 2 },
    { type: 'OTHER', name: 'Nafaka', subType: 'NAFAKA', count: 1 },
    { type: 'MORTGAGE', name: 'İpotekli Takip', subType: 'REHIN', count: 1 },
  ];

  let caseIndex = 1000;

  for (const caseType of caseTypes) {
    console.log(`\n📂 ${caseType.name} takipleri:`);
    
    for (let i = 0; i < caseType.count; i++) {
      caseIndex++;
      const client = clients[Math.floor(Math.random() * clients.length)];
      const debtor = debtors[Math.floor(Math.random() * debtors.length)];
      const office = executionOffices.length > 0 ? executionOffices[Math.floor(Math.random() * executionOffices.length)] : null;
      const lawyer = lawyers.length > 0 ? lawyers[Math.floor(Math.random() * lawyers.length)] : null;
      const risk = risks.length > 0 ? risks[Math.floor(Math.random() * risks.length)] : null;
      const asama = asamalar.length > 0 ? asamalar[Math.floor(Math.random() * asamalar.length)] : null;

      // Takip tutarı (türe göre değişken)
      let principalAmount: number;
      switch (caseType.type) {
        case 'NAFAKA':
          principalAmount = 5000 + Math.floor(Math.random() * 15000);
          break;
        case 'KIRA':
          principalAmount = 10000 + Math.floor(Math.random() * 50000);
          break;
        case 'IPOTEKLI':
          principalAmount = 500000 + Math.floor(Math.random() * 2000000);
          break;
        case 'KAMBIYO_CEK':
        case 'KAMBIYO_SENET':
          principalAmount = 50000 + Math.floor(Math.random() * 200000);
          break;
        default:
          principalAmount = 20000 + Math.floor(Math.random() * 100000);
      }

      const fileNumber = generateFileNumber(2025, caseIndex);
      const executionFileNumber = office ? `2025/${Math.floor(Math.random() * 90000) + 10000}` : null;

      try {
        const newCase = await prisma.case.create({
          data: {
            tenantId: TENANT_ID,
            fileNumber,
            executionFileNumber,
            type: caseType.type as any,
            subType: caseType.subType,
            subCategory: caseType.type === 'NAFAKA' ? 'NAFAKA' : 'GENEL',
            currency: 'TRY',
            caseStatus: 'DERDEST',
            status: 'ACTIVE',
            principalAmount,
            interestType: 'YASAL',
            interestRate: 24,
            caseDate: new Date(2025, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1),
            startDate: new Date(),
            clientId: client.id,
            executionOfficeId: office?.id,
            riskId: risk?.id,
            asamaId: asama?.id,
            isAutomationEnabled: Math.random() > 0.3,
            hasArticle4Request: Math.random() > 0.5,
            notes: `${caseType.name} - Örnek takip dosyası`,
            // Nafaka için ek bilgiler
            ...(caseType.type === 'NAFAKA' && {
              nafakaStartDate: new Date(2024, 0, 1),
              monthlyNafakaAmount: 5000 + Math.floor(Math.random() * 5000)
            }),
            // Borçlu ilişkisi
            debtors: {
              create: {
                debtorId: debtor.id,
                role: 'ASIL_BORCLU'
              }
            },
            // Avukat ilişkisi
            ...(lawyer && {
              lawyers: {
                create: {
                  lawyerId: lawyer.id
                }
              }
            })
          }
        });

        console.log(`   ✅ ${fileNumber} - ${client.displayName || client.name} vs ${debtor.name} (${principalAmount.toLocaleString('tr-TR')} TL)`);
      } catch (error: any) {
        if (error.code === 'P2002') {
          console.log(`   ⚠️ ${fileNumber} zaten mevcut, atlanıyor...`);
        } else {
          console.error(`   ❌ Hata: ${error.message}`);
        }
      }
    }
  }

  console.log('\n✅ Örnek veriler başarıyla oluşturuldu!');
  console.log('\n📊 Özet:');
  console.log(`   - ${debtors.length} yeni borçlu`);
  console.log(`   - ${caseTypes.reduce((sum, ct) => sum + ct.count, 0)} yeni takip`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
