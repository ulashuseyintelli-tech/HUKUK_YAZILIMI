/**
 * PR-D3: Borçlu listesi server-side sorgu parametresi üretici (saf fonksiyon, test edilebilir).
 * Backend findAll: page/limit/search/type destekler. type "ALL" ise gönderilmez (tüm türler).
 */
export function buildDebtorQuery(p: {
  page: number;
  limit: number;
  search?: string;
  type?: string;
}): string {
  const params = new URLSearchParams();
  params.set("page", String(p.page));
  params.set("limit", String(p.limit));
  const s = p.search?.trim();
  if (s) params.set("search", s);
  if (p.type && p.type !== "ALL") params.set("type", p.type);
  return params.toString();
}
