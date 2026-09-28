import { DocumentSourceType, InstrumentType, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { stableJsonHash } from '../../permission-diagnostics/guided-edge/canonical-json';
import { domainSeparatedFormationHash } from '../formation-intent/claim-item-formation-canonical';
import {
  CaseDocumentExactVersionResolverPort,
  type ExactCaseDocumentSourceV1,
  type ResolveExactCaseDocumentInput,
} from '../formation-intent/claim-item-formation-resolver.ports';

export const CASE_INSTRUMENT_RECORD_FINGERPRINT_VERSION = 'CaseInstrumentRecordFingerprintV1' as const;
export const CASE_INSTRUMENT_RECORD_CLASSIFICATION_VERSION = 'CaseInstrumentRecordClassificationV1' as const;
export const CASE_INSTRUMENT_RECORD_RESOLUTION_VERSION = 'CaseInstrumentExactRecordResolutionV1' as const;
export const CHECK_INSTRUMENT_RECORD = 'CHECK_INSTRUMENT_RECORD' as const;
export const CHECK_DISHONOUR_RECORD = 'CHECK_DISHONOUR_RECORD' as const;

/** Hesaplama ve hukuki değerlendirme için değişmez çek kaydı girdileri (sunucu kaynaklı). */
export interface CekRecordCalculationInputsV1 {
  readonly instrumentId: string;
  readonly tenantId: string;
  readonly caseId: string;
  readonly serialNo: string;
  /** Kuruş (minor unit) cinsinden, işaretsiz tam sayı. */
  readonly amountMinor: bigint;
  readonly currency: string;
  readonly minorUnit: 2;
  readonly issueDate: string;
  readonly presentmentDate: string | null;
  readonly isBounced: boolean;
  readonly bounceDate: string | null;
}

type InstrumentRow = {
  id: string;
  tenantId: string;
  caseId: string;
  instrumentType: InstrumentType;
  serialNo: string;
  amount: Prisma.Decimal;
  currency: string;
  issueDate: Date;
  presentmentDate: Date | null;
  isBounced: boolean;
  bounceDate: Date | null;
};

const SELECT = {
  id: true,
  tenantId: true,
  caseId: true,
  instrumentType: true,
  serialNo: true,
  amount: true,
  currency: true,
  issueDate: true,
  presentmentDate: true,
  isBounced: true,
  bounceDate: true,
} as const;

/** Decimal(15,2) → kuruş; ondalık basamağı 2'yi aşan veya pozitif olmayan tutar desteklenmez (null). */
export function decimalToMinor(value: Prisma.Decimal): bigint | null {
  if (!value.isFinite() || value.lte(0) || value.decimalPlaces() > 2) return null;
  const fixed = value.toFixed(2);
  return BigInt(fixed.replace('.', ''));
}

/**
 * K3 AUTO-GENERATE FORMATION (owner kararı 2026-09-28 "çek kaydı kaynak + yalnız tazminat") — formation kaynağı
 * olarak sunucudaki çek kaydının (CaseInstrument, instrumentType = CEK) DEĞİŞMEZ SÜRÜMÜ.
 *
 * Belge platformu (Document Platform V4) ve dosya içeriği YOKTUR; kaynak gerçeği bu kayıttır. Sürüm, kaydın
 * hesaplama ve hukuki değerlendirme için anlamlı alanlarının (seri, tutar, para birimi, keşide / ibraz tarihi,
 * karşılıksız işareti ve tarihi) kanonik parmak izidir: bu alanlardan biri onaya kadar değişirse sürüm kimliği
 * değişir ve finalizer eski onay içeriğini REDDEDER (bayat veri). Kiracı ve dosya kapsamı dışındaki kayıt veya çek
 * dışı enstrüman çözülmez (null → FORMATION_SOURCE_UNAVAILABLE).
 *
 * `documentId` port alanı burada çek kaydının kimliğidir (port kaynak-türü nötrdür).
 */
export class CaseInstrumentExactRecordResolverService extends CaseDocumentExactVersionResolverPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async resolveExactVersion(input: ResolveExactCaseDocumentInput): Promise<ExactCaseDocumentSourceV1 | null> {
    if (input.sourceType !== 'CASE_INSTRUMENT') return null;
    const inputs = await this.readCekRecord(input.tenantId, input.caseId, input.documentId);
    if (!inputs) return null;
    return this.project(inputs);
  }

  /**
   * Çek kaydının değişmez hesaplama girdileri; kiracı/dosya kapsamında ve yalnız CEK. Tutar kuruşa çevrilemiyorsa
   * (pozitif değil / 2 ondalıktan fazla) null.
   */
  async readCekRecord(tenantId: string, caseId: string, instrumentId: string): Promise<CekRecordCalculationInputsV1 | null> {
    const row = (await this.prisma.caseInstrument.findFirst({
      where: { id: instrumentId, tenantId, caseId },
      select: SELECT,
    })) as InstrumentRow | null;
    if (!row || row.instrumentType !== InstrumentType.CEK) return null;
    const amountMinor = decimalToMinor(row.amount);
    if (amountMinor === null || !/^[A-Z]{3}$/.test(row.currency)) return null;
    return Object.freeze({
      instrumentId: row.id,
      tenantId: row.tenantId,
      caseId: row.caseId,
      serialNo: row.serialNo,
      amountMinor,
      currency: row.currency,
      minorUnit: 2,
      issueDate: row.issueDate.toISOString(),
      presentmentDate: row.presentmentDate === null ? null : row.presentmentDate.toISOString(),
      isBounced: row.isBounced,
      bounceDate: row.bounceDate === null ? null : row.bounceDate.toISOString(),
    });
  }

  project(inputs: CekRecordCalculationInputsV1): ExactCaseDocumentSourceV1 {
    const evidenceClasses = [
      CHECK_INSTRUMENT_RECORD,
      ...(inputs.isBounced && inputs.bounceDate !== null ? [CHECK_DISHONOUR_RECORD] : []),
    ].sort();
    const record = {
      instrumentId: inputs.instrumentId,
      tenantId: inputs.tenantId,
      caseId: inputs.caseId,
      instrumentType: 'CEK',
      serialNo: inputs.serialNo,
      amountMinor: inputs.amountMinor.toString(),
      currency: inputs.currency,
      minorUnit: inputs.minorUnit,
      issueDate: inputs.issueDate,
      presentmentDate: inputs.presentmentDate,
      isBounced: inputs.isBounced,
      bounceDate: inputs.bounceDate,
    };
    const binaryContentHash = domainSeparatedFormationHash(CASE_INSTRUMENT_RECORD_FINGERPRINT_VERSION, record);
    const documentEnvelopeHash = stableJsonHash({
      sourceType: 'CASE_INSTRUMENT',
      instrumentId: inputs.instrumentId,
      tenantId: inputs.tenantId,
      caseId: inputs.caseId,
    });
    const classificationHash = stableJsonHash({
      classificationVersion: CASE_INSTRUMENT_RECORD_CLASSIFICATION_VERSION,
      documentType: 'CEK',
      evidenceClasses,
    });
    const canonicalSourceFingerprint = domainSeparatedFormationHash(CASE_INSTRUMENT_RECORD_FINGERPRINT_VERSION, {
      binaryContentHash,
      documentEnvelopeHash,
      classificationHash,
    });
    const versionId = `civ1:${canonicalSourceFingerprint}`;
    const opaqueEvidenceRefs = [`case-instrument:${inputs.instrumentId}`];
    const resolutionHash = stableJsonHash({
      resolutionContractVersion: CASE_INSTRUMENT_RECORD_RESOLUTION_VERSION,
      versionId,
      canonicalSourceFingerprint,
      evidenceClasses,
      opaqueEvidenceRefs,
    });
    return Object.freeze({
      tenantId: inputs.tenantId,
      caseId: inputs.caseId,
      sourceType: 'CASE_INSTRUMENT',
      documentId: inputs.instrumentId,
      versionId,
      version: canonicalSourceFingerprint.slice(0, 16),
      binaryContentHash,
      documentEnvelopeHash,
      classificationHash,
      canonicalSourceFingerprint,
      fingerprintAlgorithm: 'SHA-256',
      fingerprintVersion: CASE_INSTRUMENT_RECORD_FINGERPRINT_VERSION,
      fingerprintVerified: true,
      documentType: 'CEK',
      claimItemDocumentSourceType: DocumentSourceType.CEK,
      documentClassificationVersion: CASE_INSTRUMENT_RECORD_CLASSIFICATION_VERSION,
      lifecycleStatus: 'ACTIVE',
      availabilityStatus: 'AVAILABLE',
      availableForFormation: true,
      evidenceClasses: Object.freeze(evidenceClasses),
      opaqueEvidenceRefs: Object.freeze(opaqueEvidenceRefs),
      resolutionContractVersion: CASE_INSTRUMENT_RECORD_RESOLUTION_VERSION,
      resolutionHash,
    });
  }
}
