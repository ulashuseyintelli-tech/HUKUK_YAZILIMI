import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Masraf Paketleri ve Kalemleri Seed
 * 
 * Paketler:
 * - UYAP_PRE: UYAP Öncesi / Takip Açılış Masrafları
 * - RE_TEBLIGAT: Yeniden Tebligat Masrafları
 * - HACIZ: Haciz İşlemi Masrafları
 * - SATIS: Satış İşlemi Masrafları
 */

async function seedCostPackages() {
  console.log('🏷️  Masraf paketleri seed başlıyor...');

  // ============================================
  // PAKET 1: UYAP ÖNCESİ / TAKİP AÇILIŞ
  // ============================================
  let uyapPrePackage = await prisma.costPackage.findFirst({
    where: { code: 'UYAP_PRE', tenantId: null },
  });

  if (!uyapPrePackage) {
    uyapPrePackage = await prisma.costPackage.create({
      data: {
        code: 'UYAP_PRE',
        name: 'UYAP Öncesi / Takip Açılış Masrafları',
        description: 'Takibin UYAP\'a gönderilebilmesi için gerekli başlangıç masrafları',
        caseTypes: Prisma.JsonNull, // Tüm takip türleri için geçerli
        sortOrder: 1,
        isActive: true,
        isSystem: true,
        messageTemplateCode: 'TPL_UYAP_PRE',
      },
    });
  }

  // UYAP_PRE Kalemleri
  const uyapPreItems = [
    { itemCode: 'BASVURMA_HARCI', label: 'Başvurma Harcı', defaultAmount: 615.40, sortOrder: 1, isEditable: false },
    { itemCode: 'VEKALET_HARCI', label: 'Vekalet Harcı', defaultAmount: 87.50, sortOrder: 2, isEditable: false },
    { itemCode: 'PESIN_HARC', label: 'Peşin Harç', defaultAmount: 5722.19, sortOrder: 3, isEditable: true, calcRule: { type: 'percentage', rate: 0.005, base: 'principalAmount', min: 100 } },
    { itemCode: 'DOSYA_GIDERI', label: 'Dosya Gideri', defaultAmount: 2.00, sortOrder: 4, isEditable: false },
    { itemCode: 'TEBLIGAT_GIDERI', label: 'Tebligat Gideri', defaultAmount: 15.00, sortOrder: 5, isEditable: true, calcRule: { type: 'per_unit', unitAmount: 15.00, multiplier: 'debtorCount' } },
    { itemCode: 'VEKALET_PULU', label: 'Vekalet Pulu', defaultAmount: 138.00, sortOrder: 6, isEditable: false },
  ];

  for (const item of uyapPreItems) {
    const existingItem = await prisma.costPackageItem.findFirst({
      where: { packageId: uyapPrePackage.id, itemCode: item.itemCode },
    });

    if (!existingItem) {
      await prisma.costPackageItem.create({
        data: {
          packageId: uyapPrePackage.id,
          itemCode: item.itemCode,
          label: item.label,
          defaultAmount: item.defaultAmount,
          sortOrder: item.sortOrder,
          isEditable: item.isEditable,
          isRequired: true,
          calcRule: item.calcRule ? item.calcRule : Prisma.JsonNull,
        },
      });
    }
  }

  console.log(`  ✅ UYAP_PRE paketi: ${uyapPreItems.length} kalem`);

  // ============================================
  // PAKET 2: YENİDEN TEBLİGAT
  // ============================================
  let reTebligatPackage = await prisma.costPackage.findFirst({
    where: { code: 'RE_TEBLIGAT', tenantId: null },
  });

  if (!reTebligatPackage) {
    reTebligatPackage = await prisma.costPackage.create({
      data: {
        code: 'RE_TEBLIGAT',
        name: 'Yeniden Tebligat Masrafları',
        description: 'Tebligat iade olduğunda veya yeni adrese tebligat gerektiğinde',
        caseTypes: Prisma.JsonNull,
        sortOrder: 2,
        isActive: true,
        isSystem: true,
        messageTemplateCode: 'TPL_RE_TEBLIGAT',
      },
    });
  }

  const reTebligatItems = [
    { itemCode: 'YENIDEN_TEBLIGAT', label: 'Yeniden Tebligat Gideri', defaultAmount: 15.00, sortOrder: 1, isEditable: true, calcRule: { type: 'per_unit', unitAmount: 15.00, multiplier: 'tebligatCount' } },
    { itemCode: 'POSTA_GIDERI', label: 'Posta/Kargo Gideri', defaultAmount: 25.00, sortOrder: 2, isEditable: true },
  ];

  for (const item of reTebligatItems) {
    const existingItem = await prisma.costPackageItem.findFirst({
      where: { packageId: reTebligatPackage.id, itemCode: item.itemCode },
    });

    if (!existingItem) {
      await prisma.costPackageItem.create({
        data: {
          packageId: reTebligatPackage.id,
          itemCode: item.itemCode,
          label: item.label,
          defaultAmount: item.defaultAmount,
          sortOrder: item.sortOrder,
          isEditable: item.isEditable,
          isRequired: true,
          calcRule: (item as any).calcRule ? (item as any).calcRule : Prisma.JsonNull,
        },
      });
    }
  }

  console.log(`  ✅ RE_TEBLIGAT paketi: ${reTebligatItems.length} kalem`);

  // ============================================
  // PAKET 3: HACİZ
  // ============================================
  let hacizPackage = await prisma.costPackage.findFirst({
    where: { code: 'HACIZ', tenantId: null },
  });

  if (!hacizPackage) {
    hacizPackage = await prisma.costPackage.create({
      data: {
        code: 'HACIZ',
        name: 'Haciz İşlemi Masrafları',
        description: 'Haciz işlemine çıkılması için gerekli masraflar',
        caseTypes: Prisma.JsonNull,
        sortOrder: 3,
        isActive: true,
        isSystem: true,
        messageTemplateCode: 'TPL_HACIZ',
      },
    });
  }

  const hacizItems = [
    { itemCode: 'HACIZ_HARCI', label: 'Haciz Harcı', defaultAmount: 500.00, sortOrder: 1, isEditable: true },
    { itemCode: 'HACIZ_YOLLUK', label: 'Haciz Yolluk Gideri', defaultAmount: 350.00, sortOrder: 2, isEditable: true },
    { itemCode: 'HACIZ_BILIRKISI', label: 'Bilirkişi Ücreti', defaultAmount: 1000.00, sortOrder: 3, isEditable: true },
    { itemCode: 'HACIZ_MUHAFAZA', label: 'Muhafaza Gideri', defaultAmount: 500.00, sortOrder: 4, isEditable: true },
  ];

  for (const item of hacizItems) {
    const existingItem = await prisma.costPackageItem.findFirst({
      where: { packageId: hacizPackage.id, itemCode: item.itemCode },
    });

    if (!existingItem) {
      await prisma.costPackageItem.create({
        data: {
          packageId: hacizPackage.id,
          itemCode: item.itemCode,
          label: item.label,
          defaultAmount: item.defaultAmount,
          sortOrder: item.sortOrder,
          isEditable: item.isEditable,
          isRequired: false,
        },
      });
    }
  }

  console.log(`  ✅ HACIZ paketi: ${hacizItems.length} kalem`);

  // ============================================
  // PAKET 4: SATIŞ
  // ============================================
  let satisPackage = await prisma.costPackage.findFirst({
    where: { code: 'SATIS', tenantId: null },
  });

  if (!satisPackage) {
    satisPackage = await prisma.costPackage.create({
      data: {
        code: 'SATIS',
        name: 'Satış İşlemi Masrafları',
        description: 'Satış işlemi için gerekli masraflar',
        caseTypes: Prisma.JsonNull,
        sortOrder: 4,
        isActive: true,
        isSystem: true,
        messageTemplateCode: 'TPL_SATIS',
      },
    });
  }

  const satisItems = [
    { itemCode: 'SATIS_AVANSI', label: 'Satış Avansı', defaultAmount: 2000.00, sortOrder: 1, isEditable: true },
    { itemCode: 'ILAN_GIDERI', label: 'İlan Gideri', defaultAmount: 1500.00, sortOrder: 2, isEditable: true },
    { itemCode: 'KIYMET_TAKDIRI', label: 'Kıymet Takdiri Ücreti', defaultAmount: 1000.00, sortOrder: 3, isEditable: true },
  ];

  for (const item of satisItems) {
    const existingItem = await prisma.costPackageItem.findFirst({
      where: { packageId: satisPackage.id, itemCode: item.itemCode },
    });

    if (!existingItem) {
      await prisma.costPackageItem.create({
        data: {
          packageId: satisPackage.id,
          itemCode: item.itemCode,
          label: item.label,
          defaultAmount: item.defaultAmount,
          sortOrder: item.sortOrder,
          isEditable: item.isEditable,
          isRequired: false,
        },
      });
    }
  }

  console.log(`  ✅ SATIS paketi: ${satisItems.length} kalem`);

  console.log('✅ Masraf paketleri seed tamamlandı!');
}

/**
 * Stage Event Kuralları Seed
 */
async function seedStageEventRules() {
  console.log('⚡ Stage event kuralları seed başlıyor...');

  const rules = [
    {
      eventCode: 'EVT_UYAP_SEND_CLICKED',
      packageCode: 'UYAP_PRE',
      actionType: 'BLOCK_UNTIL_PAID',
      hardBlock: true,
      messageTemplateCode: 'TPL_UYAP_PRE',
      priority: 100,
    },
    {
      eventCode: 'EVT_TEBLIGAT_RETURNED',
      packageCode: 'RE_TEBLIGAT',
      actionType: 'CREATE_EXPENSE_REQUEST',
      hardBlock: false,
      messageTemplateCode: 'TPL_RE_TEBLIGAT',
      priority: 80,
    },
    {
      eventCode: 'EVT_NEW_ADDRESS_ADDED',
      packageCode: 'RE_TEBLIGAT',
      actionType: 'SUGGEST_ONLY',
      hardBlock: false,
      messageTemplateCode: 'TPL_RE_TEBLIGAT',
      priority: 30,
    },
    {
      eventCode: 'EVT_HACIZ_INIT',
      packageCode: 'HACIZ',
      actionType: 'CREATE_EXPENSE_REQUEST',
      hardBlock: false,
      messageTemplateCode: 'TPL_HACIZ',
      priority: 90,
    },
    {
      eventCode: 'EVT_HACIZ_EXECUTED',
      packageCode: null,
      actionType: 'DEBIT_FROM_BALANCE',
      hardBlock: false,
      priority: 95,
    },
    {
      eventCode: 'EVT_SALE_INIT',
      packageCode: 'SATIS',
      actionType: 'CREATE_EXPENSE_REQUEST',
      hardBlock: false,
      messageTemplateCode: 'TPL_SATIS',
      priority: 85,
    },
    {
      eventCode: 'EVT_BALANCE_LOW',
      packageCode: null,
      actionType: 'SUGGEST_ONLY',
      hardBlock: false,
      priority: 10,
    },
  ];

  for (const rule of rules) {
    const existing = await prisma.stageEventRule.findFirst({
      where: { eventCode: rule.eventCode, tenantId: null },
    });

    if (!existing) {
      await prisma.stageEventRule.create({
        data: {
          eventCode: rule.eventCode,
          packageCode: rule.packageCode,
          actionType: rule.actionType as any,
          hardBlock: rule.hardBlock,
          messageTemplateCode: rule.messageTemplateCode || null,
          priority: rule.priority,
          isActive: true,
        },
      });
    }
  }

  console.log(`  ✅ ${rules.length} stage event kuralı oluşturuldu`);
  console.log('✅ Stage event kuralları seed tamamlandı!');
}

/**
 * Masraf Mesaj Şablonları Seed
 */
async function seedCostMessageTemplates() {
  console.log('📧 Masraf mesaj şablonları seed başlıyor...');

  const templates = [
    {
      code: 'TPL_UYAP_PRE',
      name: 'UYAP Öncesi Masraf Talebi',
      category: 'EXPENSE_REQUEST',
      channel: 'EMAIL',
      subject: '{{caseFileNumber}} – Takip Açılış Masraf Avansı ({{totalAmount}} TL)',
      body: `Sayın {{clientName}},

{{executionOfficeName}} nezdinde başlatılacak takip kapsamında dosyanın UYAP'a gönderilebilmesi için başlangıç masraf avansı gerekmektedir.

Masraf Kalemleri:
{{items}}

Toplam: {{totalAmount}} TL
Son Ödeme Tarihi: {{dueDate}}

Ödeme Bilgisi:
IBAN: {{officeIban}}
Açıklama: {{paymentReference}}

Ödeme yapıldığında dosya UYAP'a gönderim aşamasına alınacaktır.

Bilgilerinize sunarız.
{{lawyerName}} – {{officeName}}
{{officePhone}}`,
    },
    {
      code: 'TPL_RE_TEBLIGAT',
      name: 'Yeniden Tebligat Masraf Talebi',
      category: 'EXPENSE_REQUEST',
      channel: 'EMAIL',
      subject: '{{caseFileNumber}} – Yeniden Tebligat Masraf Talebi ({{totalAmount}} TL)',
      body: `Sayın {{clientName}},

{{executionOfficeName}} nezdindeki dosyamızda tebligat işlemi sonuçlanmadığı için yeniden tebligat çıkarılması gerekmektedir. İşlemin yapılabilmesi için aşağıdaki masraf avansının karşılanması gereklidir.

Masraf Kalemleri:
{{items}}

Toplam: {{totalAmount}} TL
Son Ödeme Tarihi: {{dueDate}}

Ödeme Bilgisi:
IBAN: {{officeIban}}
Açıklama: {{paymentReference}}

Ödeme sonrasında yeniden tebligat işlemi başlatılacaktır.

{{lawyerName}} – {{officeName}}
{{officePhone}}`,
    },
    {
      code: 'TPL_HACIZ',
      name: 'Haciz İşlemi Masraf Talebi',
      category: 'EXPENSE_REQUEST',
      channel: 'EMAIL',
      subject: '{{caseFileNumber}} – Haciz İşlemi Masraf Talebi ({{totalAmount}} TL)',
      body: `Sayın {{clientName}},

{{executionOfficeName}} nezdindeki dosyada haciz işlemlerine geçilebilmesi için aşağıdaki masraf avansının karşılanması gerekmektedir.

Masraf Kalemleri:
{{items}}

Toplam: {{totalAmount}} TL
Son Ödeme Tarihi: {{dueDate}}

Ödeme Bilgisi:
IBAN: {{officeIban}}
Açıklama: {{paymentReference}}

Ödeme sonrasında haciz işlemleri planlanarak yürütülecektir.

{{lawyerName}} – {{officeName}}
{{officePhone}}`,
    },
    {
      code: 'TPL_SATIS',
      name: 'Satış İşlemi Masraf Talebi',
      category: 'EXPENSE_REQUEST',
      channel: 'EMAIL',
      subject: '{{caseFileNumber}} – Satış İşlemi Masraf Talebi ({{totalAmount}} TL)',
      body: `Sayın {{clientName}},

{{executionOfficeName}} nezdindeki dosyada satış işlemlerine geçilebilmesi için aşağıdaki masraf avansının karşılanması gerekmektedir.

Masraf Kalemleri:
{{items}}

Toplam: {{totalAmount}} TL
Son Ödeme Tarihi: {{dueDate}}

Ödeme Bilgisi:
IBAN: {{officeIban}}
Açıklama: {{paymentReference}}

Ödeme sonrasında satış işlemleri başlatılacaktır.

{{lawyerName}} – {{officeName}}
{{officePhone}}`,
    },
  ];

  for (const tpl of templates) {
    // Önce mevcut şablonu kontrol et
    const existing = await prisma.messageTemplate.findFirst({
      where: { code: tpl.code },
    });

    if (!existing) {
      // Tenant olmadan sistem şablonu olarak oluştur
      await prisma.messageTemplate.create({
        data: {
          tenantId: 'system', // Sistem şablonu için özel tenant
          code: tpl.code,
          name: tpl.name,
          category: tpl.category as any,
          channel: tpl.channel as any,
          subject: tpl.subject,
          body: tpl.body,
          isActive: true,
          isSystem: true,
          availableTokens: [
            'clientName', 'caseFileNumber', 'executionFileNumber', 'executionOfficeName',
            'totalAmount', 'dueDate', 'items', 'lawyerName', 'officeName', 'officePhone',
            'officeIban', 'paymentReference'
          ],
        },
      });
      console.log(`  ✅ ${tpl.code} şablonu oluşturuldu`);
    } else {
      console.log(`  ⏭️  ${tpl.code} şablonu zaten mevcut`);
    }
  }

  console.log('✅ Masraf mesaj şablonları seed tamamlandı!');
}

async function main() {
  console.log('🚀 Masraf Otomasyon Sistemi Seed Başlıyor...\n');
  
  await seedCostPackages();
  console.log('');
  
  await seedStageEventRules();
  console.log('');
  
  await seedCostMessageTemplates();
  console.log('');
  
  console.log('🎉 Tüm seed işlemleri tamamlandı!');
}

main()
  .catch((e) => {
    console.error('❌ Seed hatası:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
