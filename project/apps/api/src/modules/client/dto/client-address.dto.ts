import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const CLIENT_ADDRESS_TYPES = ['MERNIS', 'TICARI', 'TEBLIGAT', 'FATURA', 'BEYAN'] as const;

/**
 * Dedicated ClientAddress CRUD endpoint'lerinin input şekli. `CreateClientDto.addresses[]`
 * (create-client.dto.ts, embedded array) ile KARIŞTIRILMAZ — o, müvekkil create/update'inde
 * flat kolonlara çöken ayrı bir yol; bu DTO'lar ClientAddress-2'nin kendi tablosuna gerçekten
 * yazan POST/PUT/DELETE endpoint'leri içindir.
 *
 * `isCurrent` kasıtlı olarak YOK — create/update payload'ından kontrol edilmez (ClientAddress-2
 * design-gate kararı): yeni adresler her zaman isCurrent=true, arşivleme ayrı bir aksiyon olacak.
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
