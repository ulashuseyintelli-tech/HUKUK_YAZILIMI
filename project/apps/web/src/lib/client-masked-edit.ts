/** A displayed identity mask is a read projection, never an update value. */
export function isUnchangedClientIdentityMask(value: unknown, original: unknown): boolean {
  return typeof value === 'string' && value === original && /^(?:[\s\S]{3}\*{4}[\s\S]{2}|\*{4})$/.test(value);
}

/** Called by the native edit payload builder and settings ClientModal save path. */
export function preserveMaskedClientFields<T extends Record<string, unknown>>(payload: T, original?: Record<string, any> | null): T {
  if (!original) return payload;
  const next = { ...payload };
  for (const key of ['tckn', 'vkn', 'identityNo'] as const) {
    const baseline = original[key] || ((key === 'tckn' || key === 'vkn') ? original.identityNo : undefined);
    if (isUnchangedClientIdentityMask(next[key], baseline)) delete next[key];
  }
  // Free notes are intentionally omitted from reads. An untouched empty control
  // must not clear that hidden source value; explicit new text still uses the existing write gate.
  if (!Object.prototype.hasOwnProperty.call(original, 'notes') && !next.notes) delete next.notes;
  return next;
}
