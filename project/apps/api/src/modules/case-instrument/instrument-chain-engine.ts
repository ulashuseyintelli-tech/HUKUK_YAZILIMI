/**
 * A1 — Kambiyo İlişki & Müracaat Motoru · FAZ 2a: HEADLESS recourse motoru (SAF)
 * ----------------------------------------------------------------------------
 * Faz 0 kontratı (instrument-chain.contract.ts) üstünde SAF / deterministik fonksiyonlar.
 * DB YOK · migration YOK · endpoint YOK · UI YOK · CaseDebtor YARATMAZ (yalnız aday veri).
 *
 * HUKUKİ ÇEKİRDEK (V3 — ulas onayı 2026-06-23):
 *   Hamil/müvekkil MÜTESELSİL olarak müracaat eder: keşideci + kendisinden ÖNCEKİ
 *   cirantalar + bunların avalistleri. Aval kimin için verildiği belirsizse → keşideci lehine
 *   (kontratta AvalEdge.guaranteesPosition varsayılan = DRAWER(0) ile temsil edilir).
 *
 * GÜVENLİK KURALI (ulas): sırasız OCR girdisinde borçlu ÜRETME. position/sıralama yoksa →
 *   NEEDS_REVIEW (sahte "önceki" çıkarımı YOK). Motor YALNIZ sıralama verilince (Faz 2b manuel
 *   giriş / gelecekte A1-d) RESOLVED döner. Bugünkü OCR verisi (position=null) → NEEDS_REVIEW.
 *
 * Position semantiği: ordinal — 0 = keşideci; artan; hamil = en yüksek position; "önceki" = düşük position.
 */
import {
  InstrumentChain,
  InstrumentPartyNode,
  InstrumentPartyRole,
  InstrumentPartyType,
} from './instrument-chain.contract';

export type AnalysisStatus = 'RESOLVED' | 'NEEDS_REVIEW';

export interface HolderResult {
  status: AnalysisStatus;
  holderPosition?: number;
  holderNode?: InstrumentPartyNode;
  reason: string;
}

/** Müteselsil müracaat adayı (SAF veri; CaseDebtor DEĞİL — insan onayıyla kayda dönüşür). */
export interface RecourseParty {
  name: string;
  identityNo?: string;
  type: InstrumentPartyType;
  role: InstrumentPartyRole; // DRAWER | PAYEE | ENDORSER | AVALIST
  position: number | null;
  basis: string; // hukuki dayanak (insan-okur)
}

export interface RecourseResult {
  status: AnalysisStatus;
  parties: RecourseParty[]; // RESOLVED'da müteselsil küme; NEEDS_REVIEW'da boş
  reason: string;
}

export interface ChainAnalysis {
  holder: HolderResult;
  recourse: RecourseResult;
}

/** Tüm node'lar position taşıyor mu (tam sıralama)? Biri bile null → sıralama yok. */
function hasFullOrdering(chain: InstrumentChain): boolean {
  return chain.nodes.length > 0 && chain.nodes.every((n) => n.position !== null);
}

/** Recourse adayının hukuki dayanağı (insan-okur). */
function basisForRole(role: InstrumentPartyRole): string {
  switch (role) {
    case 'DRAWER':
      return 'keşideci';
    case 'PAYEE':
      return 'lehtar (ciro ile sorumlu)';
    case 'ENDORSER':
      return 'önceki ciranta';
    default:
      return role.toLowerCase();
  }
}

/**
 * Hamil (güncel holder) = zincirin SONU (en yüksek position). Tam sıralama yoksa NEEDS_REVIEW.
 *
 * Çağrıldığı yerler:
 * - analyzeChain() (aynı dosya) · instrument-chain-engine.spec.ts (unit)
 * - (Faz 2b) minimal manuel zincir UI / müracaat gösterimi
 */
export function computeHolder(chain: InstrumentChain): HolderResult {
  if (!chain.nodes || chain.nodes.length === 0) {
    return { status: 'NEEDS_REVIEW', reason: 'Zincir boş — hamil belirlenemez.' };
  }
  if (!hasFullOrdering(chain)) {
    return {
      status: 'NEEDS_REVIEW',
      reason: 'Sıralama eksik (position yok) — hamil belirlenemez (sırasız OCR; A1-d HOLD).',
    };
  }
  const maxPos = Math.max(...chain.nodes.map((n) => n.position as number));
  const tip = chain.nodes.filter((n) => n.position === maxPos);
  if (tip.length !== 1) {
    return {
      status: 'NEEDS_REVIEW',
      reason: 'Birden çok node aynı en-yüksek position — hamil belirsiz.',
    };
  }
  return { status: 'RESOLVED', holderPosition: maxPos, holderNode: tip[0], reason: 'Hamil = zincir sonu.' };
}

/**
 * V3 müracaat motoru: holderPosition verilince keşideci + kendisinden önceki cirantalar (+ lehtar)
 * + bunların AVALİSTLERİ (müteselsil). holderPosition yoksa NEEDS_REVIEW. CaseDebtor YARATMAZ —
 * yalnız aday RecourseParty[] döner. AVALIST node'ları YALNIZ aval-edge ilişkisiyle eklenir
 * (zincir-konumundan doğrudan değil).
 *
 * Çağrıldığı yerler:
 * - analyzeChain() (aynı dosya) · instrument-chain-engine.spec.ts (unit)
 * - (Faz 2b) minimal manuel zincir UI / müracaat gösterimi
 */
export function computeRecourse(
  chain: InstrumentChain,
  holderPosition: number | null | undefined,
): RecourseResult {
  if (holderPosition == null) {
    return {
      status: 'NEEDS_REVIEW',
      parties: [],
      reason: 'Hamil position bilinmiyor — müracaat kümesi hesaplanamaz (sırasız girdi).',
    };
  }

  const byPos = new Map<number, InstrumentPartyNode>();
  for (const n of chain.nodes) if (n.position !== null) byPos.set(n.position, n);

  const parties: RecourseParty[] = [];

  // V3: keşideci + kendisinden ÖNCEKİ cirantalar (+ lehtar) = position < holderPosition (AVALIST hariç).
  const beforeHolder = chain.nodes.filter(
    (n) => n.role !== 'AVALIST' && n.position !== null && (n.position as number) < holderPosition,
  );
  for (const n of beforeHolder) {
    parties.push({
      name: n.party.name,
      identityNo: n.party.identityNo,
      type: n.party.type,
      role: n.role,
      position: n.position,
      basis: basisForRole(n.role),
    });
  }

  // V3: bunların AVALİSTLERİ. Avalist, garanti ettiği taraf (guaranteesPosition) recourse'taysa dahil.
  // Aval belirsizse kontratta guaranteesPosition = DRAWER(0) defaultlu → keşideci lehine.
  const beforePositions = new Set(beforeHolder.map((n) => n.position as number));
  for (const aval of chain.avals ?? []) {
    if (!beforePositions.has(aval.guaranteesPosition)) continue; // garanti edilen recourse-dışı → avalist de dışı
    const avalistNode = byPos.get(aval.avalistPosition);
    if (!avalistNode) continue; // savunmacı: avalist node yok → atla (veri eksik kenar; çökme yok)
    const guaranteed = byPos.get(aval.guaranteesPosition);
    parties.push({
      name: avalistNode.party.name,
      identityNo: avalistNode.party.identityNo,
      type: avalistNode.party.type,
      role: 'AVALIST',
      position: avalistNode.position,
      basis: `aval (${guaranteed ? guaranteed.party.name : 'keşideci'} için)`,
    });
  }

  return {
    status: 'RESOLVED',
    parties,
    reason: 'Müteselsil müracaat: keşideci + önceki cirantalar + avalistleri (V3).',
  };
}

/**
 * Hamil + müracaat birleşik analizi. Hamil NEEDS_REVIEW ise recourse de NEEDS_REVIEW (boş).
 * SAF veri; CaseDebtor YARATMAZ (insan onayı zorunlu — A1 invaryantı). Sırasız OCR → NEEDS_REVIEW.
 *
 * Çağrıldığı yerler:
 * - instrument-chain-engine.spec.ts (unit) · (Faz 2b) minimal manuel zincir UI
 */
export function analyzeChain(chain: InstrumentChain): ChainAnalysis {
  const holder = computeHolder(chain);
  if (holder.status !== 'RESOLVED') {
    return {
      holder,
      recourse: {
        status: 'NEEDS_REVIEW',
        parties: [],
        reason: 'Hamil çözülemedi → müracaat hesaplanmaz (borçlu üretilmez).',
      },
    };
  }
  return { holder, recourse: computeRecourse(chain, holder.holderPosition) };
}
