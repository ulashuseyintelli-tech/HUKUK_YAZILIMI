import { Allow, IsBoolean, IsEnum, IsObject, IsOptional, IsString } from "class-validator";
import { LawyerRank, LawyerRole } from "@prisma/client";

/**
 * OFFICE-FB0105-LAWYER-CREATE-WRITE-BOUNDARY-R01 — `POST /api/lawyers` typed DTO.
 *
 * ÖLÇÜM: create gövdesi satır-içi TypeScript tip literali ile tipliydi. Tip runtime'da
 * silinir; global `ValidationPipe` metatype `Object` gördüğü için HİÇ çalışmıyordu. Gövde
 * olduğu gibi `LawyerService.create`e ulaşıp `prisma.lawyer.create({ data: { ..., ...data } })`
 * içine spread ediliyordu — yani HER Lawyer sütunu istemciden yazılabiliyordu.
 * Aynı kusur sınıfı staff tarafında F-B03-03 ile kapatılmıştı (`dto/staff.dto.ts`).
 *
 * BU DTO YENİ SERBESTLİK EKLEMEZ: yalnız controller'ın bugün zaten kabul ettiği alan
 * kümesini + UI'nin (settings/office LawyerModal) gerçekten gönderdiği alanları tipler.
 * Credential ve sunucu-denetimli alanlar BİLEREK YOKTUR → `forbidNonWhitelisted: true`
 * onları 400 ile reddeder.
 *
 * BİLEREK KABUL EDİLMEYENLER ve nedeni:
 *   uyapToken / eSignatureSerial / uyapUsername
 *       Credential alanları. Ürün akışında bunlara yazan MEŞRU yol yok; F-B01-05'in konusu.
 *       `uyapToken` şemada "// Şifrelenmiş" diye işaretliydi ama şifreleme kodu YOK —
 *       yani düz metin kimlik bilgisi "şifreli" sanılarak saklanabilirdi.
 *   tenantId / officeId / id / userId / createdAt / updatedAt / sortOrder / isActive
 *       Sunucu denetimindedir. `tenantId` özellikle kritikti: servis `...data`yı EN SONDA
 *       spread ettiği için gövdeden gelen `tenantId` güvenilen değeri EZİYORDU.
 *   permissionsLockedBy / permissionsLockedAt
 *       Kilit denetim izidir; istemci yazamaz.
 *   canApproveOfficeActions
 *       K1-4b delegation bayrağı. `update` yolunda otorite guard'ı var; create yolunda YOKTU.
 *       UI'nin kendi yorumu da bunu zaten varsayıyor ("create DTO'su kabul etmiyor") ve
 *       create'te her zaman `false` gönderiyor → engellemek gerçek akış için ETKİSİZ.
 *
 * AÇIK KALAN (owner ürün kararı, bu DTO DEĞİŞTİRMEZ): `lawyerRank` / `defaultPermissions` /
 *   `permissionsLocked` / `canModifyOtherPermissions` create'te H2 otorite kontrolünden
 *   GEÇMEZ (update'te geçer). UI bunları create'te gerçekten ayarladığı için burada
 *   kabul edilmeye devam eder; simetriyi kurmak davranış değişikliğidir.
 */

/**
 * Savunmacı passthrough: gelecekte bir tüketici GET satırının tamamını create'e geri
 * gönderirse istek 400 OLMASIN diye TANINIR — ama servis allow-list'inde olmadığı için
 * ASLA persist EDİLMEZ. (Staff tarafındaki `StaffMutationPassthroughDto` ile aynı desen.)
 */
class LawyerCreatePassthroughDto {
  @Allow() displayName?: unknown; // türetilmiş alan; GET yanıtında var, persist edilmez
  @Allow() barName?: unknown;
  @Allow() lawyerType?: unknown;
  @Allow() identityNo?: unknown; // @deprecated — tckn kullanılır

  /**
   * ÖLÇÜLEN TÜKETİCİ SÖZLEŞMESİ: settings/office LawyerModal form state'i
   * `canApproveOfficeActions`ı HER ZAMAN gönderir (create'te sabit `false`, page.tsx:1609).
   * DTO bunu TANIMAZSA `forbidNonWhitelisted: true` isteği 400 yapar ve F01-YETKİLİ avukat
   * oluşturma akışı KIRILIR. (Bu spec yazılırken gerçekten kırıldı — testle yakalandı.)
   *
   * Bu yüzden alan TANINIR ama `LAWYER_CREATE_PERSIST_FIELDS`te YOKTUR → ASLA persist
   * EDİLMEZ. Staff tarafındaki `userId` ile birebir aynı desen: "DTO tanır, allow-map yazmaz".
   * K1-4b delegation yalnız `update` yolundan, otorite guard'ıyla kurulur.
   */
  @Allow() canApproveOfficeActions?: unknown;
}

export class CreateLawyerDto extends LawyerCreatePassthroughDto {
  @IsString() name: string;
  @IsString() surname: string;

  @IsOptional() @IsString() tckn?: string;
  @IsOptional() @IsString() gender?: string;
  @IsOptional() @IsString() barNumber?: string;
  @IsOptional() @IsString() barCity?: string;
  @IsOptional() @IsString() tbbNo?: string;
  @IsOptional() @IsString() vergiDairesi?: string;
  @IsOptional() @IsString() vergiNo?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() mobilePhone?: string;
  @IsOptional() @IsString() whatsappPhone?: string;
  @IsOptional() @IsString() fax?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() district?: string;
  @IsOptional() @IsString() bankName?: string;
  @IsOptional() @IsString() branchName?: string;
  @IsOptional() @IsString() iban?: string;
  @IsOptional() @IsString() title?: string;

  @IsOptional() @IsBoolean() isInHouseCounsel?: boolean;
  @IsOptional() @IsBoolean() isEmployee?: boolean;
  @IsOptional() @IsBoolean() canSign?: boolean;
  @IsOptional() @IsBoolean() canAppearInUyap?: boolean;
  @IsOptional() @IsBoolean() canBeResponsible?: boolean;
  @IsOptional() @IsBoolean() isDefaultForNewCases?: boolean;

  @IsOptional() @IsEnum(LawyerRole) role?: LawyerRole;
  @IsOptional() @IsEnum(LawyerRank) lawyerRank?: LawyerRank;

  // H2 alanları — create'te bugünkü davranış korunur (yukarıdaki "AÇIK KALAN" şerhi).
  @IsOptional() @IsObject() defaultPermissions?: Record<string, unknown>;
  @IsOptional() @IsBoolean() permissionsLocked?: boolean;
  @IsOptional() @IsBoolean() canModifyOtherPermissions?: boolean;
}

/**
 * Servis `create` yolunun persist allow-list'i — DTO'dan BAĞIMSIZ ikinci savunma.
 * HTTP dışı çağıranlar (seed.service `l as any`, case.service) de bu sınırdan geçer.
 * Sıra ve içerik `CreateLawyerDto` ile birebir aynıdır; credential ve sunucu-denetimli
 * alanlar burada da YOKTUR.
 */
export const LAWYER_CREATE_PERSIST_FIELDS = [
  "name",
  "surname",
  "tckn",
  "gender",
  "barNumber",
  "barCity",
  "tbbNo",
  "vergiDairesi",
  "vergiNo",
  "email",
  "phone",
  "mobilePhone",
  "whatsappPhone",
  "fax",
  "address",
  "city",
  "district",
  "bankName",
  "branchName",
  "iban",
  "title",
  "isInHouseCounsel",
  "isEmployee",
  "canSign",
  "canAppearInUyap",
  "canBeResponsible",
  "isDefaultForNewCases",
  "role",
  "lawyerRank",
  "defaultPermissions",
  "permissionsLocked",
  "canModifyOtherPermissions",
] as const;

export type LawyerCreatePersistField = (typeof LAWYER_CREATE_PERSIST_FIELDS)[number];
