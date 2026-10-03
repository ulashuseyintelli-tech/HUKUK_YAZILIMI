import {
  IsBoolean,
  IsOptional,
  IsString,
  ValidateIf,
  registerDecorator,
  type ValidationOptions,
} from "class-validator";

/**
 * OFFICE-BANK-ACCOUNT — büro banka hesabı yazma uçlarının gövde sınırı.
 *
 * Gövde SATIR-İÇİ tip literali ile tipliydi; tip runtime'da silinir, global `ValidationPipe`
 * ({ whitelist, forbidNonWhitelisted }) metatype `Object` görüp HİÇ çalışmıyordu ve servis gövdeyi
 * aynen Prisma'ya yayıyordu (`{ officeId, ...data }`). Aynı kusur sınıfı avukat (FB0105), personel
 * (F-B03-03) ve büro ayarlarında (OFFICE-PUT-BODY-BOUNDARY) DTO sınıfı + açık alan haritasıyla kapatılmıştı.
 *
 * ALAN HARİTASI: ekranın (settings/office/page.tsx) gönderdiği BEŞ alan. Başka her anahtar 400'dür;
 * `id` / `officeId` / `createdAt` HER ZAMAN sunucudan gelir, gövdeden ASLA. Aynı harita servis
 * allow-list'idir (HTTP dışı çağıranlar için ikinci savunma; hiçbir yerde nesne yayılımı yoktur).
 *
 * IBAN KURALI (avukat güncellemesindeki CANDIDATE-H1 sözleşmesiyle AYNI): IBAN ya HİÇ gönderilmez
 * (mevcut değer korunur) ya da geçerli TAM değer gönderilir. Boş / yalnız boşluk / maskeli ("*", "•", "·", "…")
 * / null / metin olmayan değer REDDEDİLİR (400) — okuma yüzeyi maskeli IBAN döndürdüğü için maskeli değerin
 * round-trip ile gerçek IBAN'ın üstüne yazılması engellenir. IBAN biçimi / sağlama toplamı BU İŞTE YOK
 * (ayrı kural); mevcut satırlara dokunulmaz.
 */

/** POST /office/bank-accounts ve PUT /office/bank-accounts/:id — ekranın gönderdiği beş alan. */
export const OFFICE_BANK_ACCOUNT_FIELDS = ["bankName", "branchName", "iban", "accountName", "isDefault"] as const;
export type OfficeBankAccountField = (typeof OFFICE_BANK_ACCOUNT_FIELDS)[number];

const MASK_CHARACTERS = /[*•·…]/;

/** `true` = gerçek (maskesiz, boş olmayan) IBAN metni. */
export function isRealIbanValue(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && !MASK_CHARACTERS.test(value);
}

/** IBAN alanı için ret sözleşmesi (null / boş / boşluk / maskeli / metin olmayan → 400). */
export function IsRealIban(options?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: "isRealIban",
      target: object.constructor,
      propertyName,
      options: {
        message: "IBAN için geçerli tam değer girin. Boş, boşluk, maskeli veya null değer kabul edilmez; değiştirmek istemiyorsanız alanı göndermeyin.",
        ...options,
      },
      validator: { validate: (value: unknown) => isRealIbanValue(value) },
    });
  };
}

export class CreateOfficeBankAccountDto {
  /** Sütun NOT NULL: eksik ya da metin olmayan değer 400. */
  @IsString() bankName!: string;
  /** Nullable sütun: `null` / `undefined` tür doğrulamasını atlar (mevcut null semantiği korunur). */
  @IsOptional() @IsString() branchName?: string | null;
  @IsRealIban() iban!: string;
  @IsOptional() @IsString() accountName?: string | null;
  /** Sütun NOT NULL: `null` 400 (yalnız `undefined` atlanır). */
  @ValidateIf((o: { isDefault?: unknown }) => o.isDefault !== undefined) @IsBoolean() isDefault?: boolean;
}

export class UpdateOfficeBankAccountDto {
  /** NOT NULL sütun: gönderildiyse metin olmalı (`null` 400); gönderilmediyse mevcut değer korunur. */
  @ValidateIf((o: { bankName?: unknown }) => o.bankName !== undefined) @IsString() bankName?: string;
  @IsOptional() @IsString() branchName?: string | null;
  /** Gönderilmediyse mevcut IBAN korunur; gönderildiyse geçerli TAM değer olmalı. */
  @ValidateIf((o: { iban?: unknown }) => o.iban !== undefined) @IsRealIban() iban?: string;
  @IsOptional() @IsString() accountName?: string | null;
  @ValidateIf((o: { isDefault?: unknown }) => o.isDefault !== undefined) @IsBoolean() isDefault?: boolean;
}

type BankAccountInput = Partial<Record<OfficeBankAccountField, unknown>>;

/**
 * Gövdeden YALNIZ haritadaki anahtarları, YALNIZ gönderilmiş (`undefined` olmayan) olanları alır.
 * `undefined` = değişmez (Prisma undefined-skip). `iban` metinse kenar boşlukları kırpılır.
 */
export function pickBankAccountFields(body: BankAccountInput): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of OFFICE_BANK_ACCOUNT_FIELDS) {
    const value = body?.[key];
    if (value === undefined) continue;
    out[key] = key === "iban" && typeof value === "string" ? value.trim() : value;
  }
  return out;
}
