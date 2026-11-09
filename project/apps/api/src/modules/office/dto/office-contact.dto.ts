import { IsDateString, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { OFFICE_CONTACT_KEYS } from '../office-contact.constants';

export class UpdateOfficeContactDto {
  @IsOptional() @IsString() address?: string | null;
  @IsOptional() @IsString() city?: string | null;
  @IsOptional() @IsString() district?: string | null;
  @IsOptional() @IsString() postalCode?: string | null;
  @IsOptional() @IsString() phone?: string | null;
  @IsOptional() @IsString() fax?: string | null;
  @IsOptional() @IsString() email?: string | null;
  @IsOptional() @IsString() website?: string | null;
}
export class UpdateStaffContactDto {
  @IsOptional() @IsString() email?: string | null;
  @IsOptional() @IsString() phone?: string | null;
  @IsOptional() @IsString() mobilePhone?: string | null;
  @IsOptional() @IsString() whatsappPhone?: string | null;
}
export class OfficeContactRevokeDto {
  @IsIn(OFFICE_CONTACT_KEYS) permissionKey: string;
  @IsString() @IsNotEmpty() @MaxLength(1000) reason: string;
}
export class OfficeContactGrantDto extends OfficeContactRevokeDto {
  @IsDateString() validFrom: string;
  @IsDateString() validUntil: string;
}
