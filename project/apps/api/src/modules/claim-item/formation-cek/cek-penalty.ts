/**
 * K3 AUTO-GENERATE FORMATION (owner kararı 2026-09-28) — karşılıksız çek tazminatı tutarı, SUNUCUDA, çek kaydındaki
 * bedelden hesaplanır (istemci tutarı/oranı kullanılmaz). Oran taslak hukuki içerikten gelir (RCV-LB-R2-CEK,
 * `percentOfPrincipalBasisPoints`); yuvarlama para biriminin alt birimine YARIDAN YUKARI (taslak §4, owner onayı
 * bekler). Tam sayı aritmetiği (bigint) — kayan nokta YOK.
 */
export function computeCheckPenaltyMinor(principalMinor: bigint, basisPoints: number): bigint {
  if (principalMinor <= 0n) throw new RangeError('check principal must be positive');
  if (!Number.isSafeInteger(basisPoints) || basisPoints <= 0 || basisPoints > 10000) {
    throw new RangeError('check penalty basis points must be within 1..10000');
  }
  const numerator = principalMinor * BigInt(basisPoints);
  const quotient = numerator / 10000n;
  const remainder = numerator % 10000n;
  const rounded = remainder * 2n >= 10000n ? quotient + 1n : quotient;
  if (rounded <= 0n) throw new RangeError('check penalty rounds to zero');
  return rounded;
}
