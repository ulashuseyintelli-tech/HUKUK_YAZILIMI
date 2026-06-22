// P4-2 (A1-V1b) — clientMatch: SEÇİLİ MÜVEKKİLİ bir OCR instrument'ında bul.
//
// SAF DETERMİNİSTİK (AI YOK) → tamamen unit-test edilebilir; canlı gate gerekmez (P4-3 UI'da olacak).
// BUG-4 `nameMatchKey` + kimlik-no override desenini REUSE eder (lib/lawyer-match). UI / backend / DB YOK.
//
// P1 §5.0 ayrımı: payeeName(ön-yüz lehtar) ≠ holderName(güncel hamil) ≠ clientMatch(müvekkil↔belge İLİŞKİSİ).
// Bu fonksiyon clientMatch'i üretir: müvekkil belgenin NERESİNDE görünüyor? (drawer/payee/endorsement/none)
// holderName türetmez, zincir-sırası kurmaz, borçlu/Party/CaseDebtor YARATMAZ.

import { nameMatchKey } from "./lawyer-match";
import type { Instrument } from "../components/debtor/ocr-instrument";

export type ClientMatchLocation = "FRONT_DRAWER" | "FRONT_PAYEE" | "ENDORSEMENT" | "NOT_FOUND";
// Eşleşme gücü ETİKETİ (sahte 0-100 confidence YOK — Confidence ≠ Legal Trust).
export type ClientMatchType = "IDENTITY" | "EXACT" | "SUFFIX" | "NONE";

/** Seçili müvekkil — DebtorStep `CreditorRef` ile yapısal uyumlu minimal şekil. */
export interface ClientRef {
  name: string;
  identityNo?: string;
}

export interface ClientMatchHit {
  client: ClientRef; // hangi müvekkil değerlendirildi
  found: boolean;
  location: ClientMatchLocation;
  matchType: ClientMatchType;
  matchedField: "drawerName" | "payeeName" | "endorsementNames" | null;
  matchedValue: string; // eşleşen instrument değeri (ham)
  evidence: string; // kısa insan-okur ("ENDORSEMENT/EXACT: \"Şükrü Akdoğan\"")
}

export interface ClientMatchResult {
  // İLK found müvekkil (selectedClients sırasında); hiçbiri eşleşmezse null.
  primaryMatch: ClientMatchHit | null;
  // Her selectedClient için BİR kayıt (found ya da NOT_FOUND) — çoklu müvekkile hazır.
  allMatches: ClientMatchHit[];
}

const RANK: Record<ClientMatchType, number> = { IDENTITY: 3, EXACT: 2, SUFFIX: 1, NONE: 0 };

// Türk şirket LEGAL-FORM ekleri (nameMatchKey-normalize SONRASI: UPPER ASCII, noktalama→boşluk,
// "A.Ş."→"A S", "Şti."→"STI"). Tanımlayıcı kelimeler (SANAYI/TICARET) BİLEREK strip EDİLMEZ (false-positive).
const TRAILING_COMPANY_SUFFIXES = ["ANONIM SIRKETI", "LIMITED SIRKETI", "LTD STI", "A S", "AS", "LTD", "STI", "SIRKETI"];

function digitsOnly(s: string | null | undefined): string {
  return (s || "").replace(/\D/g, "");
}

/** Metindeki 10-11 haneli kimlik-no dizileri. */
function extractIdNumbers(value: string): string[] {
  return value.match(/\d{10,11}/g) || [];
}

/**
 * nameMatchKey çıktısı (UPPER ASCII) üstünde TRAILING şirket-form ekini sadeleştirir.
 * Yalnız SON ekleri atar (mid-name false-match yok); boşa indirmez. Tanımlayıcı kelimeleri korur.
 */
export function stripCompanySuffix(normalizedUpper: string): string {
  let s = (normalizedUpper || "").trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const suf of TRAILING_COMPANY_SUFFIXES) {
      if (s === suf) break; // boşa indirme
      if (s.endsWith(" " + suf)) {
        s = s.slice(0, s.length - suf.length - 1).trim();
        changed = true;
        break;
      }
    }
  }
  return s;
}

/** Tek müvekkil ↔ tek instrument değeri için eşleşme tipi (IDENTITY>EXACT>SUFFIX>NONE). */
function valueMatchType(client: ClientRef, value: string | null | undefined): ClientMatchType {
  if (!value) return "NONE";
  const cid = digitsOnly(client.identityNo);
  if (cid.length >= 10 && extractIdNumbers(value).includes(cid)) return "IDENTITY";
  const ck = nameMatchKey(client.name);
  if (!ck) return "NONE";
  if (ck === nameMatchKey(value)) return "EXACT";
  const cks = stripCompanySuffix(ck);
  const vks = stripCompanySuffix(nameMatchKey(value));
  if (cks && cks === vks) return "SUFFIX";
  return "NONE";
}

/** Bir değer dizisindeki EN GÜÇLÜ eşleşme + eşleşen değer. */
function bestInValues(client: ClientRef, values: (string | undefined)[]): { mt: ClientMatchType; value: string } {
  let best: ClientMatchType = "NONE";
  let bestVal = "";
  for (const v of values) {
    const mt = valueMatchType(client, v);
    if (RANK[mt] > RANK[best]) {
      best = mt;
      bestVal = v || "";
    }
  }
  return { mt: best, value: bestVal };
}

/**
 * Tek müvekkil ↔ instrument. Alan sırası: drawerName(FRONT_DRAWER) → payeeName(FRONT_PAYEE) →
 * endorsementNames(ENDORSEMENT). İLK eşleşen alanın location'ı döner. Eşleşme yoksa NOT_FOUND.
 * NOT: FRONT_DRAWER sadece location'dır; "müvekkil keşideci tarafında" ters-yön UYARISI P4-3'e aittir.
 */
export function matchClientToInstrument(client: ClientRef, instrument: Instrument): ClientMatchHit {
  const fields: Array<{
    loc: ClientMatchLocation;
    field: "drawerName" | "payeeName" | "endorsementNames";
    values: (string | undefined)[];
  }> = [
    { loc: "FRONT_DRAWER", field: "drawerName", values: [instrument.drawerName] },
    { loc: "FRONT_PAYEE", field: "payeeName", values: [instrument.payeeName] },
    { loc: "ENDORSEMENT", field: "endorsementNames", values: instrument.endorsementNames ?? [] },
  ];
  for (const f of fields) {
    const { mt, value } = bestInValues(client, f.values);
    if (mt !== "NONE") {
      return {
        client,
        found: true,
        location: f.loc,
        matchType: mt,
        matchedField: f.field,
        matchedValue: value,
        evidence: `${f.loc}/${mt}: "${value}"`,
      };
    }
  }
  return {
    client,
    found: false,
    location: "NOT_FOUND",
    matchType: "NONE",
    matchedField: null,
    matchedValue: "",
    evidence: "NOT_FOUND",
  };
}

/**
 * Çoklu müvekkil: her selectedClient AYRI değerlendirilir. primaryMatch = sıradaki İLK found
 * (yoksa null); allMatches = her müvekkil için bir kayıt. Tek-müvekkil senaryosunu bozmaz.
 */
export function computeClientMatch(instrument: Instrument, selectedClients: ClientRef[]): ClientMatchResult {
  const allMatches = (selectedClients || []).map((c) => matchClientToInstrument(c, instrument));
  const primaryMatch = allMatches.find((m) => m.found) ?? null;
  return { primaryMatch, allMatches };
}

// ───────────────────────── A1-a: müvekkil anchoring (gate + uyarı) ─────────────────────────
// Mevcut eşleşme primitifleri (valueMatchType/nameMatchKey/identity) REUSE; payee'ye GÜVENMEZ.

/** Eşleşme GÜVENİLİR mi? Yalnız GÜÇLÜ kabul (IDENTITY/EXACT) — gate yanlış borçlu DÜŞÜRMESİN; SUFFIX/NONE zayıf. */
export function isReliableMatch(mt: ClientMatchType): boolean {
  return mt === "IDENTITY" || mt === "EXACT";
}

/**
 * A1-a — Bir OCR PARTY'si (sentezlenmiş taraf: name + YAPISAL identityNo) seçili müvekkillerden biriyle
 * eşleşiyor mu? Instrument alan-eşleşmesinden FARKLI: party'nin yapısal identityNo'su client identity'siyle
 * doğrudan karşılaştırılır (metne gömülü DEĞİL) + isim nameMatchKey (valueMatchType REUSE). PAYEE'ye BAKMAZ.
 * İlk eşleşen müvekkil + tip; hiçbiri eşleşmezse null.
 */
export function matchClientToParty(
  party: { name: string; identityNo?: string },
  clients: ClientRef[],
): { client: ClientRef; matchType: ClientMatchType } | null {
  for (const c of clients || []) {
    const cid = digitsOnly(c.identityNo);
    const pid = digitsOnly(party.identityNo);
    const mt: ClientMatchType = cid.length >= 10 && cid === pid ? "IDENTITY" : valueMatchType(c, party.name);
    if (mt !== "NONE") return { client: c, matchType: mt };
  }
  return null;
}

/** A1-a gate: party seçili müvekkille GÜVENİLİR eşleşiyor → borçlu adayı YAPILMAZ ("Müvekkil eşleşti"). */
export function isSelectedClientParty(party: { name: string; identityNo?: string }, clients: ClientRef[]): boolean {
  const m = matchClientToParty(party, clients);
  return !!m && isReliableMatch(m.matchType);
}

/**
 * A1-a uyarı (NON-BLOCKING): seçili müvekkil(ler) VAR ama ne party'lerde ne de enstrüman alanlarında
 * (drawer/payee/endorsement) GÜVENİLİR eşleşme yok → "müvekkil güvenilir eşleşmedi". Takip BLOKLANMAZ.
 * Müvekkil yoksa null. Enstrüman eşleşmesi (computeClientMatch) ciro/keşideci dahil tüm alanları kapsar →
 * müvekkil CİRODA bulunursa (Gorka senaryosu) UYARI ÇIKMAZ (anchored). payee yanlışsa zaten match olmaz.
 */
export function clientAnchorWarning(
  partyDrafts: { name: string; identityNo?: string }[],
  instrumentMatches: (ClientMatchResult | null)[],
  clients: ClientRef[],
): string | null {
  if (!clients || clients.length === 0) return null;
  const partyReliable = (partyDrafts || []).some((p) => isSelectedClientParty(p, clients));
  const instrReliable = (instrumentMatches || []).some(
    (m) => !!m?.primaryMatch && isReliableMatch(m.primaryMatch.matchType),
  );
  if (partyReliable || instrReliable) return null;
  return "Seçili müvekkil OCR taraflarında güvenilir şekilde eşleşmedi. Lütfen lehtar/ciro alanını manuel kontrol edin.";
}
