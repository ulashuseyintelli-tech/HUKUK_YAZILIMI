/**
 * A1 — Kambiyo İlişki & Müracaat Motoru · FAZ 0: InstrumentChain veri kontratı
 * ----------------------------------------------------------------------------
 * Bu dosya YALNIZCA TİP TANIMIDIR. Bilinçli olarak HİÇBİR YERE import EDİLMEZ
 * (davranış-nötr / no-op). Amaç: Faz 1 (OCR → JSON popülasyonu), Faz 2 (motor)
 * ve Faz 3 (arka-yüz OCR) için ORTAK, ileri-uyumlu hedef şekli ÖNCEDEN kilitlemek.
 *
 * Kararlar / WHY (TEKRAR DEĞİL — referans):
 *  - docs/ocr-draft-architecture.md §5 + §5.0 A1-V1 kavram sözleşmesi
 *    (payeeName ≠ holderName ≠ clientMatch; K1–K8; V2 manuel zincir; V3 müracaat)
 *  - docs/a1-kambiyo-motoru-uygulama-plan.md (Faz 0 = bu kontrat)
 *  - docs/case-instrument-canonical-design.md (CaseInstrument = evrak; endorsers/avals Json)
 *
 * İLKE: motor OCR'ın doğruluğuna değil AVUKAT doğrulamasına dayanır → her düğüm /
 * kenar `provenance` (kaynak + güven + onay) taşır; MANUAL = otoriter, OCR = aday.
 *
 * KALICILIK EŞLEMESİ (migration YOK — mevcut CaseInstrument JSON kolonları):
 *   CaseInstrument.endorsers Json?  ←  { nodes, endorsements }   (EndorsersJsonShape)
 *   CaseInstrument.avals     Json?  ←  AvalEdge[]                 (AvalsJsonShape)
 *
 * ⚠️ IMPACT / TODO (Faz 1'de ele alınacak — Faz 0 DOKUNMAZ):
 *   template-engine.service.ts `instrument.endorsers`'ı `string[]` (isim listesi)
 *   bekliyor (≈ satır 80 tip, ≈ satır 395 okuma). Yeni şekil `{ nodes, endorsements }`
 *   NESNESİDİR. Faz 1 popülasyonu açılınca template-engine okuması güncellenmeli, ör:
 *     endorsers = chain.nodes.filter(n => n.role === 'ENDORSER').map(n => n.party.name)
 *   Faz 0 tip-only olduğundan VE kolon bugün boş olduğundan kırılma YOK.
 */

/** Bir düğüm/kenarın VERİSİNİN kökeni (A2 köken). MANUAL = otoriter, OCR = aday. */
export type ChainSource = "MANUAL" | "OCR" | "XML";

/**
 * Her düğüm VE her kenarda ZORUNLU köken/güven damgası.
 * `confidence` OPSİYONEL DEĞİLDİR (ulas kararı): zincirdeki her parça güven taşır.
 */
export interface ChainProvenance {
  source: ChainSource;
  /** 0..1 — ZORUNLU. OCR düşük; MANUAL onaylı = 1 kabul edilebilir. */
  confidence: number;
  /** Avukat onayı (varsa). MANUAL + verified = otoriter kenar. */
  verifiedById?: string;
  /** ISO-8601. */
  verifiedAt?: string;
}

/**
 * Senet üzerindeki taraf rolü.
 * HOLDER (güncel hamil) BURADA YOK — rol değil, Faz 2 motorunun TÜRETTİĞİ sonuçtur.
 */
export type InstrumentPartyRole = "DRAWER" | "PAYEE" | "ENDORSER" | "AVALIST";

export type InstrumentPartyType = "INDIVIDUAL" | "COMPANY" | "PUBLIC_INSTITUTION";

/** Taraf kimliği. `partyId` = Faz 4 Party Registry slotu (Faz 0–3'te boş kalır). */
export interface ChainPartyRef {
  name: string;
  /** VKN/TCKN — yalnız checksum-geçerliyse doldurulur. */
  identityNo?: string;
  type: InstrumentPartyType;
  partyId?: string;
}

/** Zincir düğümü: kişi/şirket + rol + konum + köken. */
export interface InstrumentPartyNode {
  role: InstrumentPartyRole;
  party: ChainPartyRef;
  /** DRAWER=0, PAYEE=1, ENDORSER 1..n; sıra bilinmiyorsa null (A1-d HOLD). */
  position: number | null;
  provenance: ChainProvenance;
}

/** Ciro türü. WHITE = beyaz ciro (lehdar ismi yok; hamil zilyetlikle belirlenir). */
export type EndorsementType = "FULL" | "WHITE";

/** Ciro kenarı (fromPosition → toPosition). */
export interface EndorsementEdge {
  fromPosition: number;
  /** WHITE ciroda lehdar yok → null. */
  toPosition: number | null;
  type: EndorsementType;
  provenance: ChainProvenance;
}

/**
 * Aval kenarı (avalist → garanti edilen taraf).
 * `guaranteesPosition` varsayılan = DRAWER(0) [TTK: kimin için belirsizse keşideci].
 */
export interface AvalEdge {
  avalistPosition: number;
  guaranteesPosition: number;
  /** Para: string/minor-unit (Decimal serileştirme tutarlılığı). */
  amount?: string;
  provenance: ChainProvenance;
}

/**
 * Bir CaseInstrument'ın tam kambiyo zinciri.
 * holder + recourse() = TÜRETİLİR (Faz 2 motoru hesaplar); BURADA SAKLANMAZ.
 */
export interface InstrumentChain {
  nodes: InstrumentPartyNode[];
  endorsements: EndorsementEdge[];
  avals: AvalEdge[];
}

/** CaseInstrument.endorsers Json? kolonunun Faz-1 hedef şekli. */
export type EndorsersJsonShape = Pick<InstrumentChain, "nodes" | "endorsements">;

/** CaseInstrument.avals Json? kolonunun Faz-1 hedef şekli. */
export type AvalsJsonShape = InstrumentChain["avals"];
