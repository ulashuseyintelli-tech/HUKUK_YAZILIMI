import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * CASEDETAILTABS-MIGRATION-C2b-manuel — GUARDRAIL (kaynak taraması).
 *
 * Canlı tebligat UI yüzeyi (TebligatCard + zengin tebligat/TebligatPanel) STUB elektronik uçları
 * — UETS/KEP gönderim, mock PTT takip, elektronik teslim-durum/kayıt sorgu — ASLA çağırmaz/import etmez.
 * Backend bu uçlar için sahte başarı/teslim üretir (yorum-satırı gerçek fetch'ler, sabit "TESLIM_EDILDI",
 * UETS/KEP${Date.now()} ref'leri); bunları canlı kullanıcıya bağlamak "tebliğ edildi" yanılgısı doğurur.
 *
 * Gerçek UYAP/UETS/KEP/PTT entegrasyonu + hukuki onay gelene kadar bu test KIRMIZI tutar: yasaklı
 * method/route adı canlı UI kaynağına sızarsa "Web Tests (vitest)" CI job'ı kırılır.
 */
const here = dirname(fileURLToPath(import.meta.url));

// Yalnızca CANLI tebligat UI yüzeyi taranır. (Ölü case/TebligatPanel + ölü CaseDetailTabs taranmaz;
// api-client tanımları [lib/api*] silinmez — backend LIVE olunca kullanılacak — yalnız UI çağrısı yasak.)
const LIVE_TEBLIGAT_UI_FILES = [
  "../components/tebligat/TebligatPanel.tsx",
  "../components/case/TebligatCard.tsx",
];

// Yasaklı: api-client method adları + backend route parçaları (Tebligat send forensic, BÖLÜM B).
const FORBIDDEN_TOKENS = [
  // api-client method adları
  "sendViaUets",
  "sendViaKep",
  "recordElectronicResult",
  "checkUetsDeliveryStatus",
  "checkUetsRegistration",
  "determineElectronicChannel",
  "trackPttBarcode",
  "trackPttBarcodesBulk",
  // backend route parçaları
  "send-uets",
  "send-kep",
  "electronic-result",
  "uets-status",
  "ptt-track",
  "uets-check",
  "electronic-channel",
];

describe("C2b-manuel guardrail — canlı tebligat UI elektronik stub uçları çağırmaz", () => {
  for (const rel of LIVE_TEBLIGAT_UI_FILES) {
    it(`${rel} → yasaklı elektronik method/route içermez`, () => {
      const src = readFileSync(resolve(here, rel), "utf8");
      const hits = FORBIDDEN_TOKENS.filter((token) => src.includes(token));
      expect(
        hits,
        `Canlı tebligat UI'da yasaklı elektronik uç bulundu: ${hits.join(", ")}. ` +
          "UETS/KEP/elektronik gönderim ve mock sorgu uçları gerçek entegrasyon + hukuki onay gelene " +
          "kadar canlı kullanıcıya bağlanmaz (sahte başarı/teslim riski).",
      ).toEqual([]);
    });
  }
});
