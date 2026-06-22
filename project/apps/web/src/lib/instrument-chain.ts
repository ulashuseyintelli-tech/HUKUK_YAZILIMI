/**
 * A1 Faz 2b-B — Kambiyo zinciri: FRONTEND tip aynası + SAF UI↔kontrat dönüşümleri.
 * ----------------------------------------------------------------------------
 * Motor mantığı BACKEND'de (instrument-chain-engine #381) ve POST /case-instruments/chain/analyze
 * (#384) ile çağrılır. Burada YALNIZ veri şekli (Faz 0 InstrumentChain kontratının aynası — frontend
 * backend src'yi import edemez) + UI satırları ↔ kontrat dönüşümü. HESAPLAMA / müracaat türetme YOK.
 */

export type ChainSource = 'MANUAL' | 'OCR' | 'XML';
export type InstrumentPartyRole = 'DRAWER' | 'PAYEE' | 'ENDORSER' | 'AVALIST';
export type InstrumentPartyType = 'INDIVIDUAL' | 'COMPANY' | 'PUBLIC_INSTITUTION';

export interface ChainProvenance {
  source: ChainSource;
  confidence: number;
  verifiedById?: string;
  verifiedAt?: string;
}
export interface ChainPartyRef {
  name: string;
  identityNo?: string;
  type: InstrumentPartyType;
  partyId?: string;
}
export interface InstrumentPartyNode {
  role: InstrumentPartyRole;
  party: ChainPartyRef;
  position: number | null;
  provenance: ChainProvenance;
}
export interface EndorsementEdge {
  fromPosition: number;
  toPosition: number | null;
  type: 'FULL' | 'WHITE';
  provenance: ChainProvenance;
}
export interface AvalEdge {
  avalistPosition: number;
  guaranteesPosition: number;
  amount?: string;
  provenance: ChainProvenance;
}
export interface InstrumentChain {
  nodes: InstrumentPartyNode[];
  endorsements: EndorsementEdge[];
  avals: AvalEdge[];
}

/** 2a motor yanıtı. */
export type AnalysisStatus = 'RESOLVED' | 'NEEDS_REVIEW';
export interface HolderResult {
  status: AnalysisStatus;
  holderPosition?: number;
  holderNode?: InstrumentPartyNode;
  reason: string;
}
export interface RecourseParty {
  name: string;
  identityNo?: string;
  type: InstrumentPartyType;
  role: InstrumentPartyRole;
  position: number | null;
  basis: string;
}
export interface RecourseResult {
  status: AnalysisStatus;
  parties: RecourseParty[];
  reason: string;
}
export interface ChainAnalysis {
  holder: HolderResult;
  recourse: RecourseResult;
}

// ── UI satır modelleri (düz; nested party'yi helper kurar) ──────────────────

/** Düğüm satırı. `position` boş → null (sıra bilinmiyor → motor NEEDS_REVIEW döner). */
export interface ChainNodeRow {
  role: InstrumentPartyRole;
  name: string;
  identityNo: string;
  partyType: InstrumentPartyType;
  position: number | null;
  source: ChainSource;
  confidence: number;
  verified: boolean;
}
/** Aval kenarı satırı (avalist düğüm sırası → garanti edilen sıra; belirsiz = keşideci 0). */
export interface AvalRow {
  avalistPosition: number;
  guaranteesPosition: number;
}

export const ROLE_OPTIONS: InstrumentPartyRole[] = ['DRAWER', 'PAYEE', 'ENDORSER', 'AVALIST'];
export const PARTY_TYPE_OPTIONS: InstrumentPartyType[] = ['INDIVIDUAL', 'COMPANY', 'PUBLIC_INSTITUTION'];

export const ROLE_LABELS: Record<InstrumentPartyRole, string> = {
  DRAWER: 'Keşideci',
  PAYEE: 'Lehtar',
  ENDORSER: 'Ciranta',
  AVALIST: 'Avalist',
};
export const PARTY_TYPE_LABELS: Record<InstrumentPartyType, string> = {
  INDIVIDUAL: 'Şahıs',
  COMPANY: 'Şirket',
  PUBLIC_INSTITUTION: 'Kurum',
};

export function emptyNodeRow(): ChainNodeRow {
  return {
    role: 'ENDORSER',
    name: '',
    identityNo: '',
    partyType: 'INDIVIDUAL',
    position: null,
    source: 'MANUAL',
    confidence: 1,
    verified: false,
  };
}

/**
 * UI satırları → backend InstrumentChain (POST /chain/analyze gövdesi).
 * endorsements şu an boş (2b-B kapsam dışı; motor müracaatı position+aval'dan hesaplar).
 * `nowIso` test edilebilirlik için enjekte edilebilir (verified damgası).
 */
export function rowsToChain(rows: ChainNodeRow[], avals: AvalRow[], nowIso?: string): InstrumentChain {
  return {
    nodes: rows.map((r) => ({
      role: r.role,
      party: {
        name: r.name.trim(),
        ...(r.identityNo.trim() ? { identityNo: r.identityNo.trim() } : {}),
        type: r.partyType,
      },
      position: r.position,
      provenance: {
        source: r.source,
        confidence: r.confidence,
        ...(r.verified ? { verifiedAt: nowIso ?? new Date().toISOString() } : {}),
      },
    })),
    endorsements: [],
    avals: avals.map((a) => ({
      avalistPosition: a.avalistPosition,
      guaranteesPosition: a.guaranteesPosition,
      provenance: { source: 'MANUAL' as const, confidence: 1 },
    })),
  };
}

/**
 * Kalıcı endorsers/avals JSON (Faz 0 / Faz 1a OCR şekli) → UI satırları.
 * Legacy (string[] endorsers) veya boş → boş satır listesi (kırılmaz).
 */
export function instrumentToRows(
  endorsers: unknown,
  avals: unknown,
): { rows: ChainNodeRow[]; avalRows: AvalRow[] } {
  const e = endorsers as { nodes?: unknown } | null | undefined;
  const nodes = e && Array.isArray(e.nodes) ? (e.nodes as any[]) : [];
  const rows: ChainNodeRow[] = nodes.map((n) => ({
    role: (n?.role as InstrumentPartyRole) ?? 'ENDORSER',
    name: n?.party?.name ?? '',
    identityNo: n?.party?.identityNo ?? '',
    partyType: (n?.party?.type as InstrumentPartyType) ?? 'INDIVIDUAL',
    position: typeof n?.position === 'number' ? n.position : null,
    source: (n?.provenance?.source as ChainSource) ?? 'OCR',
    confidence: typeof n?.provenance?.confidence === 'number' ? n.provenance.confidence : 0.5,
    verified: !!(n?.provenance?.verifiedAt || n?.provenance?.verifiedById),
  }));
  const avalRows: AvalRow[] = Array.isArray(avals)
    ? (avals as any[]).map((a) => ({
        avalistPosition: Number(a?.avalistPosition) || 0,
        guaranteesPosition: Number(a?.guaranteesPosition) || 0,
      }))
    : [];
  return { rows, avalRows };
}

/** Kaydetme için kalıcı `endorsers` JSON şekli (Faz 0 EndorsersJsonShape: { nodes, endorsements }). */
export function chainToEndorsersJson(chain: InstrumentChain): {
  nodes: InstrumentPartyNode[];
  endorsements: EndorsementEdge[];
} {
  return { nodes: chain.nodes, endorsements: chain.endorsements };
}
