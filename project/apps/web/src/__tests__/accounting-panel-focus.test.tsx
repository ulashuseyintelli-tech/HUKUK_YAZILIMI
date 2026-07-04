/**
 * B-2.3 — AccountingPanel `focusable` + FocusDrawer davranış kanıtı.
 *  - focusable yoksa "Büyüt" butonu render EDİLMEZ.
 *  - focusable → "Büyüt" var; tıklayınca FocusDrawer (role=dialog) açılır ve AYNI içerik görünür.
 *  - Kapat butonu / Esc kapatır.
 *  - ⚠️ Panel gövdesine tıklamak drawer AÇMAZ (yalnız "Büyüt" açar) — satır/scroll/filtre davranışı korunur.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AccountingPanel } from '@/components/client-accounting/AccountingPanel';

function renderPanel(focusable: boolean) {
  return render(
    <AccountingPanel ariaLabel="Test tablosu" focusable={focusable} title={<h2>Test Paneli</h2>}>
      <div data-testid="panel-body">İçerik satırı</div>
    </AccountingPanel>,
  );
}

describe('AccountingPanel — B-2.3 focusable / FocusDrawer', () => {
  it('focusable=false → "Büyüt" butonu ve dialog YOK', () => {
    renderPanel(false);
    expect(screen.queryByRole('button', { name: 'Büyüt' })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getAllByTestId('panel-body').length).toBe(1);
  });

  it('focusable → "Büyüt" var; tıklayınca FocusDrawer açılır (dialog + aynı içerik)', () => {
    renderPanel(true);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Büyüt' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    // içerik hem inline hem drawer'da render edilir (≥2 kopya); başlık da drawer'da görünür
    expect(screen.getAllByTestId('panel-body').length).toBeGreaterThan(1);
    expect(screen.getAllByText('Test Paneli').length).toBeGreaterThan(1);
  });

  it('Kapat butonu drawer\'ı kapatır', () => {
    renderPanel(true);
    fireEvent.click(screen.getByRole('button', { name: 'Büyüt' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Kapat' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Esc drawer\'ı kapatır', () => {
    renderPanel(true);
    fireEvent.click(screen.getByRole('button', { name: 'Büyüt' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('⚠️ panel gövdesine tıklamak drawer AÇMAZ (yalnız "Büyüt" açar)', () => {
    renderPanel(true);
    fireEvent.click(screen.getByTestId('panel-body'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
