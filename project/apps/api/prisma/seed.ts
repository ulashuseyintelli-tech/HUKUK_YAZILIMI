/**
 * Veritabanı seed scripti — EXPLICIT, boot'ta ÇALIŞMAZ.
 *
 * Çalıştırma:
 *   pnpm db:seed       → npx tsx prisma/seed.ts (yalnız seed: users + form types)
 *   pnpm db:bootstrap  → db:push && db:seed (ilk kurulum convenience wrapper)
 *   pnpm db:push       → şema (DDL) — ayrı, explicit
 *
 * API/boot HİÇBİR ZAMAN bu scripti çağırmaz (boot saflığı). Eski src/prisma/db-init.ts'in
 * (initializeDatabase: seed + koşullu `prisma db push`) yerini alır; db push artık seed'in
 * parçası DEĞİL (yalnız explicit `pnpm db:push`).
 *
 * İdempotent: var olan kayıtları atlar (findUnique/findFirst → yoksa create).
 */
import { PrismaClient, FormCategory, ProcedureType } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { seedLookupCatalog } from "../src/modules/lookup/lookup-seed";

// Form Metadata - Veritabanına eklenecek form tipleri
const FORM_TYPES = [
  {
    code: "FORM_7",
    name: "Form 7",
    title: "İlamsız İcra Takibi",
    description: "İlamsız İcra (49)",
    category: FormCategory.GENEL_ICRA,
    procedureType: ProcedureType.ILAMSIZ,
    uyapCode: "49",
    iikMaddesi: "İİK m. 42-49",
    usageScenario: "Fatura, sözleşme, cari hesap, yazılı belge – kambiyo senedi değil – ilam yok.",
    exampleCase: "X A.Ş.'nin Y Ltd.'ye kestiği fatura alacağının tahsili",
    hasJudgment: false,
    needsMortgage: false,
    isKambiyo: false,
    isRental: false,
    requiredDocuments: ["fatura", "sözleşme", "cari_hesap_ekstresi"],
    sortOrder: 1,
  },
  {
    code: "FORM_2_3_4_5",
    name: "Form 2-3-4-5",
    title: "İlamlı İcra Takibi",
    description: "İlamlı İcra (53-54-55)",
    category: FormCategory.GENEL_ICRA,
    procedureType: ProcedureType.ILAMLI,
    uyapCode: "53-54-55",
    iikMaddesi: "İİK m. 32-38",
    usageScenario: "Mahkeme kararı / hakem kararı / ilam niteliğinde belgeye dayalı para veya teminat alacağı.",
    exampleCase: "Kesinleşmiş mahkeme kararına dayalı tazminat alacağının tahsili",
    hasJudgment: true,
    needsMortgage: false,
    isKambiyo: false,
    isRental: false,
    requiredDocuments: ["ilam", "kesinlesme_serhi", "vekaletname"],
    sortOrder: 2,
    subForms: [
      { code: "FORM_2_5_TASINIR", name: "Form 2-5", title: "Taşınır Teslimi", uyapCode: "53-54", usageScenario: "Taşınır mal teslimi kararının icrası", sortOrder: 1 },
      { code: "FORM_2_5_TASINMAZ", name: "Form 2-5", title: "Taşınmaz Tahliye Ve Teslimi", uyapCode: "53-54", usageScenario: "Taşınmaz tahliye ve teslim kararının icrası", sortOrder: 2 },
      { code: "FORM_2_5_TAHLIYE", name: "Form 2-5", title: "Tahliye", uyapCode: "53-54", usageScenario: "Tahliye kararının icrası", sortOrder: 3 },
      { code: "FORM_3_5_COCUK", name: "Form 3-5", title: "Çocuk Teslimi", uyapCode: "53-55", usageScenario: "Çocuk teslimi kararının icrası", sortOrder: 4 },
      { code: "FORM_4_IS", name: "Form 4", title: "İşin Yapılması", uyapCode: "53", usageScenario: "Bir işin yapılması kararının icrası", sortOrder: 5 },
      { code: "FORM_4_IRTIFAK", name: "Form 4", title: "İrtifak Hakkı", uyapCode: "53", usageScenario: "İrtifak hakkı tesisi kararının icrası", sortOrder: 6 },
      { code: "FORM_5_TEMINAT", name: "Form 5", title: "Teminat", uyapCode: "53", usageScenario: "Teminat alacağının tahsili", sortOrder: 7 },
      { code: "FORM_5_ALACAK", name: "Form 5", title: "Alacak", uyapCode: "53", usageScenario: "Para alacağının tahsili", sortOrder: 8 },
    ],
  },
  {
    code: "FORM_10",
    name: "Form 10",
    title: "Kambiyo Senedine Dayalı Takip",
    description: "Kambiyo Senetleri (163)",
    category: FormCategory.KAMBIYO,
    procedureType: ProcedureType.KAMBIYO,
    uyapCode: "163",
    iikMaddesi: "İİK m. 167-176",
    usageScenario: "Bono / poliçe / çek alacağının tahsili – özel kambiyo takibi.",
    exampleCase: "Vadesi geçmiş 100.000 TL'lik bono alacağının tahsili",
    hasJudgment: false,
    needsMortgage: false,
    isKambiyo: true,
    isRental: false,
    requiredDocuments: ["kambiyo_senedi_aslı", "protesto", "vekaletname"],
    sortOrder: 3,
  },
  {
    code: "FORM_12",
    name: "Form 12",
    title: "İflas Yoluyla Kambiyo Takibi",
    description: "İflas Kambiyo Senetleri (152)",
    category: FormCategory.KAMBIYO,
    procedureType: ProcedureType.KAMBIYO,
    uyapCode: "152",
    iikMaddesi: "İİK m. 167, 171",
    usageScenario: "Kambiyo senedine dayalı iflas yoluyla takip.",
    exampleCase: "Tacir borçluya karşı çek alacağı için iflas takibi",
    hasJudgment: false,
    needsMortgage: false,
    isKambiyo: true,
    isRental: false,
    requiredDocuments: ["kambiyo_senedi_aslı", "ticaret_sicil_kaydı"],
    sortOrder: 4,
  },
  {
    code: "FORM_6",
    name: "Form 6",
    title: "İpotekli İlamlı Takip",
    description: "İpotek İlamlı (151)",
    category: FormCategory.IPOTEK_REHIN,
    procedureType: ProcedureType.IPOTEK,
    uyapCode: "151",
    iikMaddesi: "İİK m. 149-150",
    usageScenario: "İpotek akit tablosuna veya ilama dayalı ipotek alacağının tahsili.",
    exampleCase: "Banka kredisi için tesis edilen ipotek alacağının tahsili",
    hasJudgment: true,
    needsMortgage: true,
    isKambiyo: false,
    isRental: false,
    requiredDocuments: ["ipotek_akit_tablosu", "ilam", "tapu_kaydı"],
    sortOrder: 5,
  },
  {
    code: "FORM_9",
    name: "Form 9",
    title: "İpotekli İlamsız Takip",
    description: "İpotek İlamsız (152)",
    category: FormCategory.IPOTEK_REHIN,
    procedureType: ProcedureType.IPOTEK,
    uyapCode: "152",
    iikMaddesi: "İİK m. 148",
    usageScenario: "İpotek akit tablosuna dayalı (ilamsız) ipotek alacağının tahsili.",
    exampleCase: "Vadesi gelmiş ipotek alacağının ilamsız takibi",
    hasJudgment: false,
    needsMortgage: true,
    isKambiyo: false,
    isRental: false,
    requiredDocuments: ["ipotek_akit_tablosu", "hesap_özeti", "tapu_kaydı"],
    sortOrder: 6,
  },
  {
    code: "FORM_8",
    name: "Form 8",
    title: "Taşınır Rehni Takibi",
    description: "Taşınır Rehni (50)",
    category: FormCategory.IPOTEK_REHIN,
    procedureType: ProcedureType.REHIN,
    uyapCode: "50",
    iikMaddesi: "İİK m. 145-147",
    usageScenario: "Taşınır rehni (ticari işletme rehni, araç rehni vb.) alacağının tahsili.",
    exampleCase: "Araç rehni karşılığı verilen kredi alacağının tahsili",
    hasJudgment: false,
    needsMortgage: true,
    isKambiyo: false,
    isRental: false,
    requiredDocuments: ["rehin_sözleşmesi", "sicil_kaydı"],
    sortOrder: 7,
  },
  {
    code: "FORM_44",
    name: "Form 44",
    title: "Taşınır Rehni İlamlı Takip",
    description: "Taşınır Rehni İlamlı (201)",
    category: FormCategory.IPOTEK_REHIN,
    procedureType: ProcedureType.REHIN,
    uyapCode: "201",
    iikMaddesi: "İİK m. 145-147, 32-38",
    usageScenario: "İlama dayalı taşınır rehni alacağının tahsili.",
    exampleCase: "Mahkeme kararına dayalı rehinli alacağın tahsili",
    hasJudgment: true,
    needsMortgage: true,
    isKambiyo: false,
    isRental: false,
    requiredDocuments: ["ilam", "rehin_sözleşmesi", "sicil_kaydı"],
    sortOrder: 8,
  },
  {
    code: "FORM_11",
    name: "Form 11",
    title: "İflas Adi Takip",
    description: "İflas Adı Takip (153)",
    category: FormCategory.IFLAS,
    procedureType: ProcedureType.IFLAS,
    uyapCode: "153",
    iikMaddesi: "İİK m. 154-166",
    usageScenario: "Tacir borçluya karşı adi alacak için iflas yoluyla takip.",
    exampleCase: "Ticaret şirketine karşı fatura alacağı için iflas takibi",
    hasJudgment: false,
    needsMortgage: false,
    isKambiyo: false,
    isRental: false,
    requiredDocuments: ["alacak_belgesi", "ticaret_sicil_kaydı"],
    sortOrder: 9,
  },
  {
    code: "FORM_13",
    name: "Form 13",
    title: "Kira Alacağı Takibi",
    description: "Kira Alacakları (51)",
    category: FormCategory.KIRA,
    procedureType: ProcedureType.KIRA_ALACAK,
    uyapCode: "51",
    iikMaddesi: "İİK m. 269-269/d",
    usageScenario: "Kira sözleşmesine dayalı kira borçlarının tahsili – konut/işyeri.",
    exampleCase: "3 aylık birikmiş kira alacağının tahsili",
    hasJudgment: false,
    needsMortgage: false,
    isKambiyo: false,
    isRental: true,
    requiredDocuments: ["kira_sözleşmesi", "ihtarname"],
    sortOrder: 10,
  },
  {
    code: "FORM_14",
    name: "Form 14",
    title: "Tahliye Takibi",
    description: "Tahliye (56)",
    category: FormCategory.KIRA,
    procedureType: ProcedureType.TAHLIYE,
    uyapCode: "56",
    iikMaddesi: "İİK m. 272-276",
    usageScenario: "Kira sözleşmesi sona ermiş kiracının tahliyesi.",
    exampleCase: "Kira süresi dolan kiracının tahliye takibi",
    hasJudgment: false,
    needsMortgage: false,
    isKambiyo: false,
    isRental: true,
    requiredDocuments: ["kira_sözleşmesi", "fesih_ihtarnamesi"],
    sortOrder: 11,
  },
];

// Varsayılan kullanıcılar
const DEFAULT_USERS = [
  {
    email: "admin@hukuk.com",
    password: "admin123",
    name: "Admin",
    surname: "Kullanıcı",
    role: "ADMIN" as const,
  },
  {
    email: "user@hukuk.com",
    password: "user123",
    name: "Test",
    surname: "Kullanıcı",
    role: "USER" as const,
  },
];

async function seedFormTypes(prisma: PrismaClient): Promise<void> {
  for (const formData of FORM_TYPES) {
    const { subForms, ...formTypeData } = formData;
    
    const existingForm = await prisma.formType.findUnique({
      where: { code: formData.code },
    });

    if (!existingForm) {
      const createdForm = await prisma.formType.create({
        data: {
          ...formTypeData,
          requiredDocuments: formTypeData.requiredDocuments,
        },
      });

      // Alt formları ekle
      if (subForms && subForms.length > 0) {
        for (const subForm of subForms) {
          await prisma.formSubType.create({
            data: {
              formTypeId: createdForm.id,
              ...subForm,
            },
          });
        }
      }

      console.log(`✅ Form tipi oluşturuldu: ${formData.title}`);
    }
  }
}

async function seedDefaultUsers(prisma: PrismaClient): Promise<void> {
  // Varsayılan tenant var mı kontrol et
  let tenant = await prisma.tenant.findUnique({
    where: { slug: "demo-firma" },
  });

  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        name: "Demo Firma",
        slug: "demo-firma",
        plan: "PRO",
      },
    });
    console.log("✅ Demo tenant oluşturuldu");
  }

  // Kullanıcıları oluştur
  for (const userData of DEFAULT_USERS) {
    const existingUser = await prisma.user.findFirst({
      where: { email: userData.email },
    });

    if (!existingUser) {
      const passwordHash = await bcrypt.hash(userData.password, 10);
      await prisma.user.create({
        data: {
          tenantId: tenant.id,
          email: userData.email,
          passwordHash,
          name: userData.name,
          surname: userData.surname,
          role: userData.role,
        },
      });
      console.log(`✅ Kullanıcı oluşturuldu: ${userData.email}`);
    }
  }
}

/**
 * Seed runner — explicit `pnpm db:seed` / `pnpm db:bootstrap` ile çağrılır.
 * DB push YAPMAZ (şema için ayrı `pnpm db:push`). Şema yoksa Prisma anlamlı hata döndürür.
 */
async function main(): Promise<void> {
  const prisma = new PrismaClient();

  try {
    await prisma.$connect();
    console.log("✅ Seed: veritabanı bağlantısı başarılı");

    // Varsayılan kullanıcıları oluştur (idempotent)
    await seedDefaultUsers(prisma);

    // Form tiplerini oluştur (idempotent)
    await seedFormTypes(prisma);

    // Lookup katalog — TEK kanonik kaynak (lookup-catalog.ts). Demo Firma tenant'ına idempotent seed.
    // Bu sayede db:seed / db:bootstrap sonrası Demo Firma takip türü + mahiyet ile DOLU gelir
    // (regresyonun kök sebebi: bootstrap lookup tohumlamıyordu).
    const demoTenant = await prisma.tenant.findUnique({ where: { slug: "demo-firma" } });
    if (demoTenant) {
      const r = await seedLookupCatalog(prisma, demoTenant.id);
      console.log(
        `✅ Lookup katalog seedlendi (Demo Firma): takipTuru=${r.takipTuru}, mahiyet=${r.mahiyet}, ` +
          `asama=${r.asama}, risk=${r.risk}, borcluTipi=${r.borcluTipi}, durumEtiketi=${r.durumEtiketi}`,
      );
    }

    console.log("✅ Seed tamamlandı");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("❌ Seed başarısız:", error);
  process.exit(1);
});
