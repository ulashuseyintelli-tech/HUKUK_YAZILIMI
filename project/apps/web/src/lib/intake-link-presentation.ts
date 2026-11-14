'use client';

import { useEffect, useState } from 'react';
import type { CreateIntakeLinkResult, IntakeLink, IntakeLinkStatus } from '@/lib/api';

type LinkValidity = Pick<IntakeLink, 'status' | 'expiresAt'>;

/** Presentation only. Public-token admission and stored lifecycle remain server-owned. */
export function intakeLinkDisplayStatus(link: LinkValidity, now: number): IntakeLinkStatus {
  if (link.status !== 'ACTIVE' || !link.expiresAt) return link.status;
  const expiry = Date.parse(link.expiresAt);
  return Number.isFinite(expiry) && expiry <= now ? 'EXPIRED' : link.status;
}

/** Wake at the next expiry, without polling the API or changing link records. */
export function useIntakeLinkDisplayClock(links: readonly LinkValidity[] | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      if (timer !== undefined) clearTimeout(timer);
      const current = Date.now();
      setNow(current);
      const next = Math.min(...(links ?? []).filter(link => link.status === 'ACTIVE' && link.expiresAt)
        .map(link => Date.parse(link.expiresAt!)).filter(expiry => Number.isFinite(expiry) && expiry > current));
      if (Number.isFinite(next)) timer = setTimeout(refresh, Math.min(next - current, 2_147_000_000));
    };
    refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      if (timer !== undefined) clearTimeout(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [links]);
  return Math.max(now, Date.now());
}

export function intakeLinkEmailMessage(status: CreateIntakeLinkResult['emailDispatchStatus']): string {
  if (status === 'sent') return 'E-posta gönderimi sağlayıcı tarafından kabul edildi. Posta kutusuna teslim doğrulanmadı.';
  if (status === 'failed') return 'E-posta gönderimi doğrulanamadı. Yeniden göndermeden önce mevcut kaydı kontrol edin.';
  if (status === 'skipped') return 'Bu işlemde yeni e-posta gönderilmedi; önceki teslim sonucu burada doğrulanmıyor.';
  return 'E-posta gönderim sonucu doğrulanamadı.';
}
