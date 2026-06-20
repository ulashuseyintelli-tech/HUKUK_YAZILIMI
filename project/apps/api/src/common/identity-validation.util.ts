/**
 * BUG-1A — Türk TCKN/VKN matematiksel doğrulama (checksum). SAF, yan-etkisiz.
 *
 * OCR'a özgü DEĞİL: OCR çıktısı + ileride UYAP/XML/Excel import, Party Registry, toplu aktarım
 * aynı validator'ı kullanır → tek-kaynak (kod tekrarından kaçın). Bilerek dependency YOK (pure).
 *
 * NOT: yalnız MATEMATİKSEL geçerlilik (uydurma/misread rakamı eler). "Bu kişi gerçekten o mu"
 * sorusu KAPSAM DIŞI (hukuki bağlam).
 */

/**
 * TCKN geçerli mi? Kurallar: 11 hane, ilk hane ≠ 0,
 *  - 10. hane = ((Σ tek-indeksli[1,3,5,7,9] × 7) − (Σ çift-indeksli[2,4,6,8])) mod 10
 *  - 11. hane = (ilk 10 hanenin toplamı) mod 10
 */
export function isValidTckn(value: string | null | undefined): boolean {
  if (!value) return false;
  const s = String(value).replace(/\D/g, "");
  if (s.length !== 11) return false;
  if (s[0] === "0") return false;
  const d = s.split("").map(Number);
  const sumOdd = d[0] + d[2] + d[4] + d[6] + d[8];
  const sumEven = d[1] + d[3] + d[5] + d[7];
  const digit10 = (((sumOdd * 7 - sumEven) % 10) + 10) % 10;
  if (d[9] !== digit10) return false;
  const sumFirst10 = d.slice(0, 10).reduce((a, b) => a + b, 0);
  if (d[10] !== sumFirst10 % 10) return false;
  return true;
}

/**
 * VKN (Vergi Kimlik No) geçerli mi? 10 hane + resmi checksum algoritması.
 */
export function isValidVkn(value: string | null | undefined): boolean {
  if (!value) return false;
  const s = String(value).replace(/\D/g, "");
  if (s.length !== 10) return false;
  const v = s.split("").map(Number);
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const tmp = (v[i] + 9 - i) % 10;
    const contrib = tmp === 9 ? tmp : (tmp * Math.pow(2, 9 - i)) % 9;
    sum = (sum + contrib) % 10;
  }
  const last = sum === 0 ? 0 : 10 - sum;
  return v[9] === last;
}

/**
 * BUG-1A — OCR'dan gelen identityNo'yu TİP-KATI doğrular (karar: ulas):
 *   INDIVIDUAL → geçerli TCKN değilse DÜŞ · COMPANY → geçerli VKN değilse DÜŞ.
 *   Geçerliyse temiz rakam dizisi, değilse undefined (uydurma kimlik yayılmaz; ad akışta kalır).
 *   Diğer tipler (PUBLIC_INSTITUTION vb.): kural yok → DOKUNMA (pass-through; downstream zaten kullanmaz).
 */
export function sanitizeOcrIdentityNo(
  identityNo: string | null | undefined,
  type: string | null | undefined,
): string | undefined {
  if (!identityNo) return undefined;
  const digits = String(identityNo).replace(/\D/g, "");
  if (type === "INDIVIDUAL") return isValidTckn(digits) ? digits : undefined;
  if (type === "COMPANY") return isValidVkn(digits) ? digits : undefined;
  return identityNo;
}
