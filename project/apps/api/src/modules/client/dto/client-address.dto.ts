import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const CLIENT_ADDRESS_TYPES = ['MERNIS', 'TICARI', 'TEBLIGAT', 'FATURA', 'BEYAN'] as const;

/**
 * Dedicated ClientAddress CRUD endpoint'lerinin input şekli. `CreateClientDto.addresses[]`
 * (create-client.dto.ts, embedded array) ile KARIŞTIRILMAZ — o, müvekkil create/update'inde
 * flat kolonlara çöken ayrı bir yol; bu DTO'lar ClientAddress-2'nin kendi tablosuna gerçekten
 * yazan POST/PUT/DELETE endpoint'leri içindir.
 *
 * `isCurrent` kasıtlı olarak YOK — create/update payload'ından kontrol edilmez (ClientAddress-2
 * design-gate kararı): yeni adresler her zaman isCurrent=true, arşivleme ayrı bir aksiyon olacak.
 *
 * CLIENT-ARC-07-ARCHIVE-RESTORE-AUDIT-I02: o "ayrı aksiyon" ARTIK VAR — `ArchiveClientAddressDto`
 * ve `RestoreClientAddressDto`. `isCurrent`/`isPrimary` bu generic DTO'lara YİNE EKLENMEDİ:
 * charter §49.4 arşiv/restore'u EXPLICIT lifecycle aksiyonu olarak zorunlu kılar, generic alan
 * güncellemesi olarak DEĞİL.
 */
export class CreateClientAddressDto {
  @IsOptional() @IsIn(CLIENT_ADDRESS_TYPES)
  type?: (typeof CLIENT_ADDRESS_TYPES)[number];

  @IsOptional() @IsString() @MaxLength(500) street?: string;
  @IsOptional() @IsString() @MaxLength(120) city?: string;
  @IsOptional() @IsString() @MaxLength(120) district?: string;
  @IsOptional() @IsString() @MaxLength(120) region?: string;
  @IsOptional() @IsString() @MaxLength(20) postalCode?: string;

  @IsOptional() @IsBoolean() isPrimary?: boolean;
}

export class UpdateClientAddressDto extends CreateClientAddressDto {}

/**
 * ARC-07 I02 — arşivleme (charter §49.4 `archive : EXPLICIT lifecycle action`).
 *
 * `replacementPrimaryAddressId` YALNIZ birincil adres arşivlenirken ve geride başka güncel adres
 * KALDIĞINDA zorunludur (§49.4 "primary arsiv: deterministik yeniden-atama OLMADAN YAPILAMAZ").
 * Servis "ilk satır kazanır" gibi bir sıralama İCAT ETMEZ — determinizm çağıranın açık seçiminden
 * gelir. Son güncel adres arşivlenirken replacement GEREKMEZ (sıfır current → sıfır primary, INV-04).
 */
export class ArchiveClientAddressDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(64)
  replacementPrimaryAddressId?: string;
}

/**
 * ARC-07 I02 — arşivden geri alma (charter §49.4 `restore : EXPLICIT lifecycle action`).
 *
 * Geri alınan adres VARSAYILAN olarak `isCurrent=true, isPrimary=false` döner. `makePrimary=true`
 * yalnız AÇIK istekle birincil yapar (aynı transaction'da eski birincil düşer). Geri alma
 * sonrasında güncel adres var ama birincil yoksa (yalnız sıfır-current'tan çıkışta olur)
 * birincilik açıkça talep edilmek zorundadır — aksi halde INV-03 ihlali reddedilir.
 */
export class RestoreClientAddressDto {
  @IsOptional() @IsBoolean()
  makePrimary?: boolean;
}
