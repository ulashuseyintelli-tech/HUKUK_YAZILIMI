// Decimal-as-string tutarları SALT GÖRÜNTÜ için biçimlendirir.
// Number()'a ÇEVİRMEZ (round-trip/hassasiyet riski yok) — yalnız binlik ayraç (".") ekler,
// ondalık kısmı OLDUĞU GİBİ bırakır (payload'da yoksa uydurulmaz/eklenmez, yuvarlama YOK).
export function formatDecimalString(raw: string): string | null {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(raw.trim());
  if (!match) return null;
  const [, sign, integerPart, fractionPart] = match;

  let grouped = "";
  for (let i = 0; i < integerPart.length; i++) {
    const posFromEnd = integerPart.length - i;
    grouped += integerPart[i];
    if (posFromEnd > 1 && posFromEnd % 3 === 1) grouped += ".";
  }

  return fractionPart ? `${sign}${grouped},${fractionPart}` : `${sign}${grouped}`;
}

/** Formatlanamazsa (beklenmeyen şekil) ham string'i currency ile birlikte döner — asla atmaz/gizlemez. */
export function formatAmountWithCurrency(amount: string, currency: string): string {
  const formatted = formatDecimalString(amount);
  return `${formatted ?? amount} ${currency}`.trim();
}
