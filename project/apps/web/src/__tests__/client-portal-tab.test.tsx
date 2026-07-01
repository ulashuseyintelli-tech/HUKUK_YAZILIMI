import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ClientPortalTab } from '@/components/client/client-portal-tab';

describe('ClientPortalTab', () => {
  it('hasPortalAccess=true → "Aktif" rozeti gösterir', () => {
    render(<ClientPortalTab clientId="c1" hasPortalAccess={true} />);
    expect(screen.getByText('Portal Erişimi: Aktif')).toBeTruthy();
    expect(screen.getByText('Bu müvekkil portala giriş yapabilir.')).toBeTruthy();
  });

  it('hasPortalAccess=false → "Pasif" rozeti gösterir', () => {
    render(<ClientPortalTab clientId="c1" hasPortalAccess={false} />);
    expect(screen.getByText('Portal Erişimi: Pasif')).toBeTruthy();
    expect(screen.getByText('Bu müvekkil için portal erişimi henüz açılmamış.')).toBeTruthy();
  });

  it('hasPortalAccess undefined → "Pasif" olarak ele alınır (güvenli varsayılan)', () => {
    render(<ClientPortalTab clientId="c1" />);
    expect(screen.getByText('Portal Erişimi: Pasif')).toBeTruthy();
  });

  it('açıklama metni ve settings/clients linki gösterilir', () => {
    render(<ClientPortalTab clientId="c1" hasPortalAccess={true} />);
    expect(
      screen.getByText('Portal erişimi mevcut settings/clients yönetim ekranından açılır veya kapatılır.'),
    ).toBeTruthy();
    const link = screen.getByText('Portal erişimini yönet').closest('a');
    expect(link?.getAttribute('href')).toBe('/settings/clients?edit=c1');
  });

  it('read-only: hiç mutasyon butonu yok (create/disable yalnız PortalAccessModal\'da)', () => {
    render(<ClientPortalTab clientId="c1" hasPortalAccess={true} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
