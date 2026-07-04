/**
 * TM3 Muhasebe UX-v2a — Finans Durum Rozeti (DASH-5) + AccountingTable (DASH-8) davranış kanıtı.
 * UX-only: rozet eligibility'den türetilir; backend enforcement DEĞİŞMEZ.
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { OffsetStatusBadge } from '@/components/client-accounting/ClientCariView';
import { AccountingTable } from '@/components/client-accounting/AccountingTable';

const ELIG = (over: any = {}) => ({
  clientId: 'cl-1',
  currency: 'TRY',
  canApply: true,
  eligiblePayableBuckets: [],
  eligibleExpenseRequests: [],
  ...over,
});

describe('OffsetStatusBadge — DASH-5 4-state (UX flag)', () => {
  it('loading → "Kontrol ediliyor…"', () => {
    render(<OffsetStatusBadge loading={true} />);
    expect(screen.getByText(/Kontrol ediliyor/)).toBeTruthy();
  });

  it('canApply=false → "Yetki Yok"', () => {
    render(<OffsetStatusBadge loading={false} elig={ELIG({ canApply: false })} />);
    expect(screen.getByText('Yetki Yok')).toBeTruthy();
  });

  it('canApply + payable + expense → "Mahsup Yapılabilir"', () => {
    render(<OffsetStatusBadge loading={false} elig={ELIG({ eligiblePayableBuckets: [{}], eligibleExpenseRequests: [{}] })} />);
    expect(screen.getByText('Mahsup Yapılabilir')).toBeTruthy();
  });

  it('canApply + expense ama payable YOK → "Alacak Kaynağı Yok"', () => {
    render(<OffsetStatusBadge loading={false} elig={ELIG({ eligiblePayableBuckets: [], eligibleExpenseRequests: [{}] })} />);
    expect(screen.getByText('Alacak Kaynağı Yok')).toBeTruthy();
  });

  it('canApply + payable ama expense YOK → "Masraf Borcu Yok"', () => {
    render(<OffsetStatusBadge loading={false} elig={ELIG({ eligiblePayableBuckets: [{}], eligibleExpenseRequests: [] })} />);
    expect(screen.getByText('Masraf Borcu Yok')).toBeTruthy();
  });

  it('canApply + ikisi de YOK → "Uygun Kalem Yok"', () => {
    render(<OffsetStatusBadge loading={false} elig={ELIG({ eligiblePayableBuckets: [], eligibleExpenseRequests: [] })} />);
    expect(screen.getByText('Uygun Kalem Yok')).toBeTruthy();
  });

  it('tooltip (title) mevcut — eğitim maliyetini düşürür', () => {
    render(<OffsetStatusBadge loading={false} elig={ELIG({ eligiblePayableBuckets: [], eligibleExpenseRequests: [{}] })} />);
    expect(screen.getByText('Alacak Kaynağı Yok').getAttribute('title')).toMatch(/alacak/i);
  });
});

describe('AccountingTable — DASH-8 paylaşılan kabuk', () => {
  it('head + satırları sticky thead + tbody içinde render eder', () => {
    render(
      <AccountingTable head={<th>Kolon</th>}>
        <tr><td>hücre</td></tr>
      </AccountingTable>,
    );
    expect(screen.getByText('Kolon')).toBeTruthy();
    expect(screen.getByText('hücre')).toBeTruthy();
    // sticky thead sınıfı
    const thead = document.querySelector('thead');
    expect(thead?.className).toMatch(/sticky/);
    expect(thead?.className).toMatch(/top-0/);
  });
});
