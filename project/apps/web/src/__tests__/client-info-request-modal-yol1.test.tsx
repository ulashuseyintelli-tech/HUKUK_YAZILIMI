/**
 * YOL1 ARAYUZ SECENEGI (owner GO 2026-09-06, Faz 2) — "Guvenli form baglantisi ekle".
 *
 * Backend yetenegi #2521 ile geldi ama arayuzde SECENEK YOKTU: kullanici akisi Yol1'i
 * kullanamiyordu. Bu suite secenegin sozlesmesini kilitler:
 *   - VARSAYILAN KAPALI; kapali iken istek govdesinde `attachIntakeLink` alani HIC YOK
 *     (mevcut davranis bit-bit ayni kalir).
 *   - Isaretlendiginde yalniz `attachIntakeLink: true` eklenir; arayuz kapsam/sure/kullanim
 *     ONERMEZ — o sozlesme backend'dedir.
 *   - Kullaniciya tek kullanim, 7 gun ve "inceleme kuyruguna duser, otomatik islenmez"
 *     bilgisi gosterilir (inceleme ≠ terfi ayrimi korunur).
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ClientInfoRequestModal } from '@/components/address-discovery/modals/ClientInfoRequestModal';
import { api } from '@/lib/api';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    api: { createClientInfoRequest: vi.fn() },
  };
});

const apiMock = api as unknown as { createClientInfoRequest: ReturnType<typeof vi.fn> };

function renderModal() {
  const onSuccess = vi.fn();
  const onClose = vi.fn();
  render(
    <ClientInfoRequestModal
      open
      onClose={onClose}
      caseId="case-1"
      clientId="client-1"
      clientEmail="muvekkil@test.invalid"
      debtorId="debtor-1"
      debtorName="Borclu Probe"
      onSuccess={onSuccess}
    />,
  );
  return { onSuccess, onClose };
}

describe('YOL1 — guvenli form baglantisi secenegi', () => {
  beforeEach(() => {
    apiMock.createClientInfoRequest.mockReset();
    apiMock.createClientInfoRequest.mockResolvedValue({ id: 'ir-1' });
  });

  it('secenek VARSAYILAN OLARAK KAPALIDIR', () => {
    renderModal();
    const box = screen.getByTestId('attach-intake-link') as HTMLInputElement;
    expect(box.checked).toBe(false);
  });

  it('KAPALI iken govdede `attachIntakeLink` alani HIC GONDERILMEZ', async () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /Gönder/i }));

    await waitFor(() => expect(apiMock.createClientInfoRequest).toHaveBeenCalledTimes(1));
    const payload = apiMock.createClientInfoRequest.mock.calls[0][0];
    expect('attachIntakeLink' in payload).toBe(false);
    expect(payload.caseId).toBe('case-1');
    expect(payload.clientId).toBe('client-1');
    expect(payload.emailTo).toBe('muvekkil@test.invalid');
  });

  it('ISARETLENINCE yalniz `attachIntakeLink: true` eklenir (kapsam/sure arayuzden GELMEZ)', async () => {
    renderModal();
    fireEvent.click(screen.getByTestId('attach-intake-link'));
    fireEvent.click(screen.getByRole('button', { name: /Gönder/i }));

    await waitFor(() => expect(apiMock.createClientInfoRequest).toHaveBeenCalledTimes(1));
    const payload = apiMock.createClientInfoRequest.mock.calls[0][0];
    expect(payload.attachIntakeLink).toBe(true);
    expect(payload.intakeScope).toBeUndefined();
    expect(payload.intakeExpiresAt).toBeUndefined();
    expect(payload.intakeMaxUses).toBeUndefined();
    // Kullanicinin yazdigi mesaj KORUNUR (baglanti eklemesini backend yapar).
    expect(typeof payload.emailBody).toBe('string');
    expect(payload.emailBody.length).toBeGreaterThan(0);
  });

  it('kullaniciya tek kullanim, 7 gun ve INCELEME KUYRUGU bilgisi gosterilir', () => {
    renderModal();
    expect(screen.getByText(/Güvenli form bağlantısı ekle/)).toBeTruthy();
    expect(screen.getByText(/tek kullanımlıktır/)).toBeTruthy();
    expect(screen.getByText(/7 gün/)).toBeTruthy();
    expect(screen.getByText(/otomatik işlenmez/)).toBeTruthy();
  });

  it('secenek isaretli olsa da gonderim hatasi kullaniciya bildirilir (sessiz basari YOK)', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    apiMock.createClientInfoRequest.mockRejectedValue(new Error('Gonderim basarisiz'));
    const { onSuccess } = renderModal();

    fireEvent.click(screen.getByTestId('attach-intake-link'));
    fireEvent.click(screen.getByRole('button', { name: /Gönder/i }));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Gonderim basarisiz'));
    expect(onSuccess).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});
