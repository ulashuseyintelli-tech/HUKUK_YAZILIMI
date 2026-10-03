import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { useHydrated } from '@/lib/use-hydrated';

/**
 * `useHydrated` — "DOM'da form var ama React işleyicisi yok" aralığının göstergesi.
 *
 * Değerin HANGİ çizimde ne olduğu önemlidir: sunucu çıktısında `false` olmalı (düğme kapalı gelsin),
 * hidrasyon biter bitmez `true` olmalı, sunucu HTML'i hiç yokken (yalnız istemcide çizim) ise ilk
 * çizimde `true` olmalı — aksi halde her sayfa açılışında düğme bir an kapalı görünürdü.
 */
describe('useHydrated', () => {
  const seen: boolean[] = [];
  function Probe() {
    const hydrated = useHydrated();
    seen.push(hydrated);
    return <button disabled={!hydrated}>gönder</button>;
  }

  afterEach(() => {
    cleanup();
    seen.length = 0;
    document.body.innerHTML = '';
  });

  it('sunucu çıktısında false → düğme kapalı gelir', () => {
    const html = renderToString(<Probe />);
    expect(seen).toEqual([false]);
    expect(html).toContain('disabled=""');
  });

  it('hidrasyonda önce false (sunucu HTML\'iyle aynı), biter bitmez true', () => {
    const host = document.createElement('div');
    host.innerHTML = renderToString(<Probe />);
    document.body.appendChild(host);
    const button = host.querySelector('button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    seen.length = 0;

    render(<Probe />, { container: host, hydrate: true });

    expect(seen).toEqual([false, true]);
    expect(host.querySelector('button')).toBe(button);
    expect(button.disabled).toBe(false);
  });

  it('yalnız istemcide çizimde İLK çizimden itibaren true (kapalı ara durum yok)', () => {
    const { container } = render(<Probe />);
    expect(seen).toEqual([true]);
    expect((container.querySelector('button') as HTMLButtonElement).disabled).toBe(false);
  });
});
