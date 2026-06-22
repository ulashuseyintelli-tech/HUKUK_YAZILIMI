/**
 * A1 — Kambiyo İlişki & Müracaat Motoru · FAZ 2b-A: chain/analyze endpoint GİRDİ DTO'su
 * ----------------------------------------------------------------------------
 * Faz 0 kontratını (instrument-chain.contract.ts) HTTP gövdesi olarak doğrular.
 * SAF/stateless analiz: DB YOK · yazma YOK · CaseDebtor YARATMAZ. Çıktı = aday veri.
 *
 * Global ValidationPipe (main.ts: whitelist + forbidNonWhitelisted + transform) ile birlikte:
 *   - bilinmeyen alan → 400 (forbidNonWhitelisted)
 *   - nested doğrulama → @Type + @ValidateNested
 *   - `position`/`toPosition` opsiyonel (sıra/lehdar bilinmiyorsa null veya yok) → SERVİSTE null'a normalize.
 *     (Motorun `hasFullOrdering` kontrolü `=== null` bekler; undefined'ı serviste null'a çeviriyoruz.)
 */
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  ChainSource,
  EndorsementType,
  InstrumentPartyRole,
  InstrumentPartyType,
} from '../instrument-chain.contract';

const CHAIN_SOURCES: ChainSource[] = ['MANUAL', 'OCR', 'XML'];
const PARTY_ROLES: InstrumentPartyRole[] = ['DRAWER', 'PAYEE', 'ENDORSER', 'AVALIST'];
const PARTY_TYPES: InstrumentPartyType[] = ['INDIVIDUAL', 'COMPANY', 'PUBLIC_INSTITUTION'];
const ENDORSEMENT_TYPES: EndorsementType[] = ['FULL', 'WHITE'];

/** Köken/güven damgası (her düğüm/kenarda zorunlu). */
export class ChainProvenanceDto {
  @IsIn(CHAIN_SOURCES)
  source: ChainSource;

  @IsNumber()
  @Min(0)
  @Max(1)
  confidence: number;

  @IsString()
  @IsOptional()
  verifiedById?: string;

  @IsString()
  @IsOptional()
  verifiedAt?: string;
}

/** Taraf kimliği. */
export class ChainPartyRefDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  identityNo?: string;

  @IsIn(PARTY_TYPES)
  type: InstrumentPartyType;

  @IsString()
  @IsOptional()
  partyId?: string;
}

/** Zincir düğümü. `position` null/yok ise sıra bilinmiyor → motor NEEDS_REVIEW döner. */
export class InstrumentPartyNodeDto {
  @IsIn(PARTY_ROLES)
  role: InstrumentPartyRole;

  @ValidateNested()
  @Type(() => ChainPartyRefDto)
  party: ChainPartyRefDto;

  @IsInt()
  @IsOptional()
  position?: number | null;

  @ValidateNested()
  @Type(() => ChainProvenanceDto)
  provenance: ChainProvenanceDto;
}

/** Ciro kenarı. `toPosition` null (WHITE ciro = lehdar yok) olabilir. */
export class EndorsementEdgeDto {
  @IsInt()
  fromPosition: number;

  @IsInt()
  @IsOptional()
  toPosition?: number | null;

  @IsIn(ENDORSEMENT_TYPES)
  type: EndorsementType;

  @ValidateNested()
  @Type(() => ChainProvenanceDto)
  provenance: ChainProvenanceDto;
}

/** Aval kenarı (avalist → garanti edilen taraf; belirsizse keşideci = guaranteesPosition 0). */
export class AvalEdgeDto {
  @IsInt()
  avalistPosition: number;

  @IsInt()
  guaranteesPosition: number;

  @IsString()
  @IsOptional()
  amount?: string;

  @ValidateNested()
  @Type(() => ChainProvenanceDto)
  provenance: ChainProvenanceDto;
}

/**
 * POST /case-instruments/chain/analyze gövdesi = InstrumentChain.
 * `endorsements`/`avals` verilmezse serviste [] kabul edilir (motor yalnız nodes + avals kullanır).
 */
export class AnalyzeChainDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InstrumentPartyNodeDto)
  nodes: InstrumentPartyNodeDto[];

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => EndorsementEdgeDto)
  endorsements?: EndorsementEdgeDto[];

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => AvalEdgeDto)
  avals?: AvalEdgeDto[];
}
