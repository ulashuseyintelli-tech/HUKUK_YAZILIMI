export interface PublicIntakeIpRequest {
  ip?: string | null;
  socket?: { remoteAddress?: string | null } | null;
}

/** IPv4-mapped IPv6 adreslerini tek biçime indirger; ham header parse etmez. */
export function normalizePublicIntakeIp(value?: string | null): string {
  const normalized = String(value ?? '').trim();
  if (!normalized) return '';
  if (normalized.startsWith('::ffff:')) return normalized.slice('::ffff:'.length);
  return normalized;
}

function trustedProxyPeers(raw?: string): Set<string> {
  return new Set(
    String(raw ?? '')
      .split(',')
      .map((value) => normalizePublicIntakeIp(value))
      .filter(Boolean),
  );
}

/**
 * X3-B03 — public intake için XFF güven sınırı.
 *
 * Repository deployment topolojisi API portunu doğrudan yayımlar; bu nedenle varsayılan
 * davranış socket peer adresidir ve global `trust proxy=1` sonucu tek başına güvenilir
 * sayılmaz. Yalnız doğrudan peer `PUBLIC_INTAKE_TRUSTED_PROXY_IPS` exact allowlist'inde
 * ise Express'in doğruladığı `req.ip` kabul edilir. Header değeri burada doğrudan okunmaz.
 */
export function resolvePublicIntakeClientIp(
  request: PublicIntakeIpRequest,
  trustedProxyIps = process.env.PUBLIC_INTAKE_TRUSTED_PROXY_IPS,
): string {
  const peer = normalizePublicIntakeIp(request.socket?.remoteAddress);
  if (!peer) return 'unknown';

  if (!trustedProxyPeers(trustedProxyIps).has(peer)) return peer;
  return normalizePublicIntakeIp(request.ip) || peer;
}
