import { Type } from "class-transformer";
import {
  IsDateString,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsString,
  MinLength,
  ValidateNested,
} from "class-validator";

/** Smoke login girdisi. `credential` YALNIZ process memory'de kullanılır. */
export class SmokeLoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  tenantSlug!: string;

  @IsString()
  @MinLength(16)
  credential!: string;
}

/** İmzalanan envelope gövdesi. Secret İÇERMEZ; imza ayrı alanda gelir. */
export class SmokeProvisionEnvelopeDto {
  @IsIn(["SMOKE_PROVISION"])
  operation!: "SMOKE_PROVISION";

  @IsString()
  @IsNotEmpty()
  nonce!: string;

  @IsDateString()
  notBeforeUtc!: string;

  @IsDateString()
  notAfterUtc!: string;

  @IsString()
  @IsNotEmpty()
  tenantName!: string;

  @IsString()
  @IsNotEmpty()
  tenantSlug!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  surname!: string;

  @IsString()
  @IsNotEmpty()
  packageManifestSha256!: string;

  @IsString()
  @IsNotEmpty()
  baselineSha256!: string;
}

/** Provisioning isteği: envelope + imza + credential. */
export class SmokeProvisionDto {
  @ValidateNested()
  @Type(() => SmokeProvisionEnvelopeDto)
  envelope!: SmokeProvisionEnvelopeDto;

  @IsString()
  @IsNotEmpty()
  signatureBase64!: string;

  @IsString()
  @MinLength(16)
  credential!: string;
}
