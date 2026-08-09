/**
 * W4 EXPENSE PRODUCT COMPLETION R01 — KANONİK MASRAF KALEMİ KATALOĞU (owner D1).
 *
 * TEK API-authoritative kaynak: opening seti + manuel web listesi + stage setleri +
 * legacy alias'lar burada birleşir. Prisma enum/migration YOK — `itemCode: String`
 * backward-compatible korunur; LEGACY kodlar alias olarak OKUNUR (backfill yapılmaz),
 * YENİ kayıtlar yalnız kanonik ASCII kodlarla yazılır.
 *
 * ClaimItemType (alacak bileşeni) AYRI domain'dir ve bu katalogla KARIŞTIRILMAZ.
 */

export type ExpenseItemGroup = 'ICRA_TAKIP' | 'DAVA_BASVURU' | 'CEZA_OZEL' | 'GENEL';

export interface ExpenseItemCatalogEntry {
  /** Stable ASCII kod — yeni kayıtların tek yazım biçimi. */
  code: string;
  /** Türkçe büro etiketi (iç ekranlar). */
  officeLabel: string;
  /** Türkçe müvekkil etiketi (mail/ekstre yüzeyi). */
  clientLabel: string;
  group: ExpenseItemGroup;
  /** Otomatik set kalemlerinde kullanılabilen kanonik client-safe açıklama. */
  defaultClientDescription: string;
  /** Manuel eklemede anlamlı açıklama zorunlu mu (DIGER her zaman true). */
  manualDescriptionRequired: boolean;
  /** Eski/legacy kodlar — SALT-OKUMA eşleme; yeni yazımda kullanılmaz. */
  legacyAliases: readonly string[];
  deprecated?: boolean;
}

const E = (e: ExpenseItemCatalogEntry) => e;

export const EXPENSE_ITEM_CATALOG: readonly ExpenseItemCatalogEntry[] = [
  // ===== İCRA / TAKİP =====
  E({ code: 'BASVURMA_HARCI', officeLabel: 'Başvurma Harcı', clientLabel: 'Başvurma harcı', group: 'ICRA_TAKIP', defaultClientDescription: 'Takip açılışı başvurma harcı', manualDescriptionRequired: false, legacyAliases: [] }),
  E({ code: 'PESIN_HARC', officeLabel: 'Peşin Harç', clientLabel: 'Peşin harç', group: 'ICRA_TAKIP', defaultClientDescription: 'Takip tutarı üzerinden peşin harç', manualDescriptionRequired: false, legacyAliases: [] }),
  E({ code: 'VEKALET_HARCI', officeLabel: 'Vekalet Harcı', clientLabel: 'Vekalet harcı', group: 'ICRA_TAKIP', defaultClientDescription: 'Vekaletname harcı', manualDescriptionRequired: false, legacyAliases: [] }),
  E({ code: 'VEKALET_PULU', officeLabel: 'Vekalet Pulu', clientLabel: 'Vekalet pulu', group: 'ICRA_TAKIP', defaultClientDescription: 'Baro vekalet pulu', manualDescriptionRequired: false, legacyAliases: [] }),
  E({ code: 'DOSYA_GIDERI', officeLabel: 'Dosya Gideri', clientLabel: 'Dosya gideri', group: 'ICRA_TAKIP', defaultClientDescription: 'Dosya masrafı', manualDescriptionRequired: false, legacyAliases: [] }),
  E({ code: 'TEBLIGAT_GIDERI', officeLabel: 'Tebligat Gideri', clientLabel: 'Tebligat gideri', group: 'ICRA_TAKIP', defaultClientDescription: 'Tebligat gönderim gideri', manualDescriptionRequired: false, legacyAliases: ['TEBLIGAT'] }),
  E({ code: 'POSTA', officeLabel: 'Posta/Kargo', clientLabel: 'Posta/kargo gideri', group: 'ICRA_TAKIP', defaultClientDescription: 'Posta/kargo gönderim gideri', manualDescriptionRequired: false, legacyAliases: [] }),
  E({ code: 'HACIZ', officeLabel: 'Haciz Gideri', clientLabel: 'Haciz gideri', group: 'ICRA_TAKIP', defaultClientDescription: 'Haciz işlemi gideri', manualDescriptionRequired: false, legacyAliases: [] }),
  E({ code: 'MUHAFAZA_YEDIEMIN', officeLabel: 'Muhafaza/Yediemin Gideri', clientLabel: 'Muhafaza/yediemin gideri', group: 'ICRA_TAKIP', defaultClientDescription: 'Haczedilen malın muhafaza/yediemin gideri', manualDescriptionRequired: false, legacyAliases: [] }),
  E({ code: 'KIYMET_TAKDIRI', officeLabel: 'Kıymet Takdiri Gideri', clientLabel: 'Kıymet takdiri gideri', group: 'ICRA_TAKIP', defaultClientDescription: 'Kıymet takdiri (değer tespiti) gideri', manualDescriptionRequired: false, legacyAliases: [] }),
  E({ code: 'SATIS_AVANSI', officeLabel: 'Satış Avansı', clientLabel: 'Satış avansı', group: 'ICRA_TAKIP', defaultClientDescription: 'Satış işlemleri avansı', manualDescriptionRequired: false, legacyAliases: [] }),
  E({ code: 'ISTIHBARAT_SORGU', officeLabel: 'İstihbarat/Sorgu Gideri', clientLabel: 'Sorgu gideri', group: 'ICRA_TAKIP', defaultClientDescription: 'Malvarlığı/adres sorgu gideri', manualDescriptionRequired: false, legacyAliases: [] }),

  // ===== DAVA / BAŞVURU =====
  E({ code: 'DAVA_ACILIS_GIDERI', officeLabel: 'Dava Açılış Harç ve Giderleri', clientLabel: 'Dava açılış giderleri', group: 'DAVA_BASVURU', defaultClientDescription: 'Dava açılış harç ve giderleri', manualDescriptionRequired: true, legacyAliases: [] }),
  E({ code: 'GIDER_AVANSI', officeLabel: 'Gider Avansı', clientLabel: 'Gider avansı', group: 'DAVA_BASVURU', defaultClientDescription: 'Mahkeme gider avansı', manualDescriptionRequired: false, legacyAliases: [] }),
  E({ code: 'DELIL_AVANSI', officeLabel: 'Delil Avansı', clientLabel: 'Delil avansı', group: 'DAVA_BASVURU', defaultClientDescription: 'Delil ikamesi avansı', manualDescriptionRequired: false, legacyAliases: [] }),
  E({ code: 'BILIRKISI', officeLabel: 'Bilirkişi Ücreti', clientLabel: 'Bilirkişi ücreti', group: 'DAVA_BASVURU', defaultClientDescription: 'Bilirkişi inceleme ücreti', manualDescriptionRequired: false, legacyAliases: [] }),
  E({ code: 'KESIF', officeLabel: 'Keşif Gideri', clientLabel: 'Keşif gideri', group: 'DAVA_BASVURU', defaultClientDescription: 'Keşif ve yerinde inceleme gideri', manualDescriptionRequired: false, legacyAliases: ['KEŞIF'] }),
  E({ code: 'TANIK_GIDERI', officeLabel: 'Tanık Gideri', clientLabel: 'Tanık gideri', group: 'DAVA_BASVURU', defaultClientDescription: 'Tanık dinletme gideri', manualDescriptionRequired: false, legacyAliases: [] }),
  E({ code: 'NOTER_GIDERI', officeLabel: 'Noter Gideri', clientLabel: 'Noter gideri', group: 'DAVA_BASVURU', defaultClientDescription: 'Noter işlem gideri', manualDescriptionRequired: true, legacyAliases: [] }),
  E({ code: 'TERCUME_GIDERI', officeLabel: 'Tercüme Gideri', clientLabel: 'Tercüme gideri', group: 'DAVA_BASVURU', defaultClientDescription: 'Yeminli tercüme gideri', manualDescriptionRequired: true, legacyAliases: [] }),
  E({ code: 'ISTINAF_TEMYIZ_GIDERI', officeLabel: 'İstinaf/Temyiz Gideri', clientLabel: 'Kanun yolu başvuru gideri', group: 'DAVA_BASVURU', defaultClientDescription: 'İstinaf/temyiz başvuru harç ve gideri', manualDescriptionRequired: false, legacyAliases: [] }),
  E({ code: 'ARABULUCULUK_GIDERI', officeLabel: 'Arabuluculuk Gideri', clientLabel: 'Arabuluculuk gideri', group: 'DAVA_BASVURU', defaultClientDescription: 'Arabuluculuk süreç gideri', manualDescriptionRequired: false, legacyAliases: [] }),

  // ===== CEZA / ÖZEL İŞ =====
  E({ code: 'CEK_SIKAYET_GIDERI', officeLabel: 'Karşılıksız Çek Şikâyet Gideri', clientLabel: 'Çek şikâyeti gideri', group: 'CEZA_OZEL', defaultClientDescription: 'Karşılıksız çek şikâyeti/dava gideri', manualDescriptionRequired: false, legacyAliases: [] }),

  // ===== GENEL =====
  // HARC: legacy kayıtlar İÇİN okunur; yeni seçimlerde spesifik harç kodları tercih edilir
  // (deprecated DEĞİL — genel harç ihtiyacı meşru; açıklama zorunlu tutulur).
  E({ code: 'HARC', officeLabel: 'Harç (Genel)', clientLabel: 'Harç', group: 'GENEL', defaultClientDescription: 'Harç ödemesi', manualDescriptionRequired: true, legacyAliases: ['HARÇ'] }),
  E({ code: 'DIGER', officeLabel: 'Diğer', clientLabel: 'Diğer masraf', group: 'GENEL', defaultClientDescription: '', manualDescriptionRequired: true, legacyAliases: [] }),
];

const BY_CODE = new Map(EXPENSE_ITEM_CATALOG.map((e) => [e.code, e] as const));
const BY_ALIAS = new Map(
  EXPENSE_ITEM_CATALOG.flatMap((e) => e.legacyAliases.map((a) => [a, e] as const)),
);

/** Kod veya legacy alias → katalog kaydı (yoksa undefined — çağıran fail-closed karar verir). */
export function findExpenseCatalogEntry(codeOrAlias: string): ExpenseItemCatalogEntry | undefined {
  return BY_CODE.get(codeOrAlias) ?? BY_ALIAS.get(codeOrAlias);
}

/** Alias'ı kanonik koda çözer; bilinmeyen kod olduğu gibi döner (legacy okunabilirlik). */
export function resolveCanonicalExpenseCode(codeOrAlias: string): string {
  return findExpenseCatalogEntry(codeOrAlias)?.code ?? codeOrAlias;
}

/** YENİ yazım için geçerli mi: yalnız kanonik kod veya bilinen alias kabul edilir. */
export function isKnownExpenseCode(codeOrAlias: string): boolean {
  return findExpenseCatalogEntry(codeOrAlias) !== undefined;
}

/** Web/istemci için aktif katalog görünümü (deprecated hariç; ikinci bağımsız liste taşınmaz). */
export function activeExpenseCatalogForClient(): Array<
  Pick<ExpenseItemCatalogEntry, 'code' | 'officeLabel' | 'clientLabel' | 'group' | 'manualDescriptionRequired'>
> {
  return EXPENSE_ITEM_CATALOG.filter((e) => !e.deprecated).map(
    ({ code, officeLabel, clientLabel, group, manualDescriptionRequired }) => ({
      code,
      officeLabel,
      clientLabel,
      group,
      manualDescriptionRequired,
    }),
  );
}
