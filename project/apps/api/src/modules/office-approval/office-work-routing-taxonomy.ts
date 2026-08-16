import { ActionCode } from '../policy-engine/types/action-code.enum';

/**
 * OFFICE-WR01-B01 — WORK ROUTING TAXONOMY (D-WR-4 actionCode siniflandirmasi).
 *
 * KAPSAM: saf siniflandirma verisi/sozlesmesi. Sifir runtime davranisi, sifir schema.
 * Bu dosya routing/atama/onay karari CALISTIRMAZ; yalniz her `ActionCode`'un hangi
 * konu alanina ait oldugunu derleme zamani guvenli bicimde bildirir.
 *
 * SINIFLANDIRMA OTORITESI: owner kanonik karari (PAGE-O0 / OWNER TAXONOMY KARARI,
 * 2026-08-16). Kategori tanimlari ve cakisma onceligi owner tarafindan verilmistir:
 *
 *  - FINANCIAL : para, alacak, borc, odeme, tahsilat, masraf, mahsup, muhasebe kaydi
 *                veya parasal yukumluluk uzerinde dogrudan etki kuran ya da bu alanin
 *                verisini gosteren islemler.
 *  - JUDICIAL  : yargisal/icra surecini, UYAP islemini, hukuki belgeyi, tarafla hukuki
 *                iletisimi veya dosyanin usuli yasam dongusunu dogrudan ilgilendiren
 *                islemler.
 *  - ADMIN     : finansal veya yargisal sonuc uretmeyen ic kayit, metadata,
 *                yetkilendirme, sorumlu atama, erisim ve buro operasyonu islemleri.
 *
 * CAKISMADA BAGLAYICI ONCELIK (owner):
 *   1) dogrudan parasal kayit/bakiye/alacak/odeme etkisi varsa → FINANCIAL
 *   2) yoksa dogrudan hukuki/usuli surec veya dosya yasam dongusu etkisi varsa → JUDICIAL
 *   3) ikisi de yoksa → ADMIN
 *
 * Salt-okuma olmak tek basina kategori DEGISTIRMEZ; kategori konu alanindan gelir.
 *
 * BAGIMSIZ EKSENLER: `RiskLevel`, `ActionClass` (L0-L4) ve bu kategori birbirinden
 * bagimsizdir. Bir kodun FINANCIAL olmasi tek basina `ALL` politikasi DOGURMAZ;
 * D-WR-7 (yuksek etkili finansal islemlerde `ALL` override) OPEN'dir ve B01 tarafindan
 * CEVAPLANMAZ.
 *
 * @see office-work-routing.contract.ts (D-WR-3 politika sozlugu)
 * @see project/docs/governance/office-wr01-decomposition-r01/wr01-decomposition-brief-r01.md
 */

/** D-WR-4 kanonik kategori kumesi. Kapalidir; dorduncu kategori uretilemez. */
export const OFFICE_WORK_ACTION_CATEGORIES = ['FINANCIAL', 'JUDICIAL', 'ADMIN'] as const;

/** D-WR-4 kategori kimligi. Serbest string DEGILDIR. */
export type OfficeWorkActionCategory = (typeof OFFICE_WORK_ACTION_CATEGORIES)[number];

/**
 * Her `ActionCode` → tam bir kategori.
 *
 * EKSIKSIZLIK KILIDI: tip `Record<ActionCode, ...>` oldugu icin `ActionCode` enum'una
 * yeni bir uye eklenip bu tablo guncellenmezse **typecheck kirilir**. Ortulu fallback,
 * `default: ADMIN`, string coercion ve permissive index signature BILEREK kullanilmadi.
 * Ayni desenin repodaki emsali: `ACTION_RISK_LEVELS` (action-code.enum.ts).
 *
 * Record yapisi geregi bir kod birden fazla kategoriye baglanamaz ve duplicate anahtar
 * tanimlanamaz.
 */
export const OFFICE_WORK_ACTION_CATEGORY: Record<ActionCode, OfficeWorkActionCategory> = {
  // ============================================
  // FINANCIAL — parasal kayit / bakiye / alacak / odeme etkisi
  // ============================================
  [ActionCode.REQUEST_EXPENSE]: 'FINANCIAL',
  [ActionCode.APPROVE_EXPENSE]: 'FINANCIAL',
  [ActionCode.RECORD_EXPENSE_PAYMENT]: 'FINANCIAL',
  [ActionCode.RECORD_COLLECTION]: 'FINANCIAL',
  [ActionCode.RECORD_PAYMENT]: 'FINANCIAL',
  [ActionCode.UPDATE_EXCHANGE_RATE]: 'FINANCIAL',
  [ActionCode.EDIT_FINANCE]: 'FINANCIAL',
  [ActionCode.BANK_TRANSFER]: 'FINANCIAL',
  [ActionCode.CLIENT_OFFSET_APPLY]: 'FINANCIAL',
  [ActionCode.CLIENT_OFFSET_REVERSE]: 'FINANCIAL',
  [ActionCode.ACCOUNTING_JOURNAL_REVERSE]: 'FINANCIAL',
  [ActionCode.ACCOUNTING_JOURNAL_MANUAL_ADJUSTMENT]: 'FINANCIAL',
  [ActionCode.MANAGE_FEE_AGREEMENT]: 'FINANCIAL',
  [ActionCode.POST_COLLECTION_DISPOSITION]: 'FINANCIAL',
  [ActionCode.CLIENT_PAYOUT_POST]: 'FINANCIAL',
  [ActionCode.CLIENT_FINANCIAL_DISCLOSURE_APPROVE]: 'FINANCIAL',
  [ActionCode.CLAIM_ITEM_HIGH_IMPACT_CHANGE]: 'FINANCIAL',
  [ActionCode.FINANCIAL_CASE_CLOSE]: 'FINANCIAL',
  /** Owner: finansal verinin goruntulenmesidir; salt-okuma olmasi konu alanini degistirmez. */
  [ActionCode.VIEW_FINANCE]: 'FINANCIAL',
  /** Owner: mevcut tanimi "tahsil edildi" sonucuna bagli oldugundan baskin etki finansaldir. */
  [ActionCode.FINALIZE_CASE]: 'FINANCIAL',
  /** Owner: yeni donemsel alacak/parasal yukumluluk olusturur. */
  [ActionCode.ADD_NAFAKA_PERIOD]: 'FINANCIAL',

  // ============================================
  // JUDICIAL — yargisal/icra sureci, UYAP, hukuki belge/iletisim, dosya yasam dongusu
  // ============================================
  [ActionCode.UYAP_SEND]: 'JUDICIAL',
  [ActionCode.SEND_NOTIFICATION]: 'JUDICIAL',
  [ActionCode.SEND_PAYMENT_ORDER]: 'JUDICIAL',
  [ActionCode.NOTIFICATION_DELIVERED]: 'JUDICIAL',
  [ActionCode.TRIGGER_HACIZ]: 'JUDICIAL',
  [ActionCode.REQUEST_SALE]: 'JUDICIAL',
  [ActionCode.REQUEST_ENFORCEMENT]: 'JUDICIAL',
  [ActionCode.PROCEED_TO_ENFORCEMENT]: 'JUDICIAL',
  [ActionCode.EVICTION_REQUEST]: 'JUDICIAL',
  [ActionCode.CLOSE_CASE]: 'JUDICIAL',
  [ActionCode.CONVERT_FROM_MTS]: 'JUDICIAL',
  [ActionCode.CHANGE_STATUS]: 'JUDICIAL',
  [ActionCode.SIGN]: 'JUDICIAL',
  /** Owner: icra/UYAP kapsaminda arastirma ve cebri icra hazirligidir (salt-okuma olsa da). */
  [ActionCode.UYAP_QUERY]: 'JUDICIAL',
  [ActionCode.SYNC_UYAP]: 'JUDICIAL',
  [ActionCode.QUERY_ASSETS]: 'JUDICIAL',
  [ActionCode.QUERY_BANK_ACCOUNTS]: 'JUDICIAL',
  [ActionCode.QUERY_VEHICLES]: 'JUDICIAL',
  /** Owner: dosyanin usuli yasam dongusunu yeniden acar. */
  [ActionCode.REOPEN_CASE]: 'JUDICIAL',
  /** Owner: hukuki surecte kullanilacak belgeyi uretir; gonderimden ayri olsa da baskin alan yargisaldir. */
  [ActionCode.GENERATE_DOC]: 'JUDICIAL',
  /** Owner: borcluya dosya/alacak baglaminda hukuki iletisimdir; resmi tebligatla ESITLENMEZ. */
  [ActionCode.SEND_DEBTOR_MSG]: 'JUDICIAL',

  // ============================================
  // ADMIN — finansal veya yargisal sonuc uretmeyen ic kayit / yetki / buro operasyonu
  // ============================================
  [ActionCode.ARCHIVE_CASE]: 'ADMIN',
  [ActionCode.EDIT_PARTIES]: 'ADMIN',
  [ActionCode.DELETE_CASE]: 'ADMIN',
  [ActionCode.ASSIGN_LEGAL_RESPONSIBLE]: 'ADMIN',
  [ActionCode.MANAGE_OFFICE_CREDENTIALS]: 'ADMIN',
  /** Owner: genel dosya metadata duzenlemesidir; statu degisikligi ayri `CHANGE_STATUS` kodudur. */
  [ActionCode.EDIT_CASE]: 'ADMIN',
};

/**
 * Bir `ActionCode`'un D-WR-4 kategorisini dondurur.
 *
 * Fallback YOKTUR: girdi tipi `ActionCode` oldugu icin bilinmeyen kod derleme
 * zamaninda elenir. Bilinmeyen string'i "kategoriye sokan" permissive bir yol
 * bilerek saglanmamistir.
 */
export function getOfficeWorkActionCategory(actionCode: ActionCode): OfficeWorkActionCategory {
  return OFFICE_WORK_ACTION_CATEGORY[actionCode];
}
