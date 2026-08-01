/**
 * CLIENT-OWN-13-MUTATION-AUTHORIZATION-I01 — UI capability görünürlüğü (owner matris #16).
 *
 * Owner kuralı (implementation requirement 11):
 * - VIEWER için create/edit kontrolleri GÖRÜNÜR fakat disabled olabilir; GEREKÇE gösterilmeli.
 * - USER hassas alanları değiştiremiyorsa o alanlar disabled + gerekçeli; STANDART alanlar
 *   kullanılabilir KALMALI.
 * - Frontend policy'yi KENDİ BAŞINA yeniden hesaplamamalı; backend-derived sinyal tüketmeli.
 * - API enforcement authority olarak KALIR (bu testler UI'nın API'yi ikame ettiğini İDDİA ETMEZ;
 *   API tarafı `client-mutation-authorization-own13.spec.ts` ile kanıtlanır).
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ClientForm } from '@/components/client/client-form';
import { emptyClientFormValues } from '@/lib/client-write';
import {
  CLIENT_CAPABILITIES_DENIED,
  normalizeClientCapabilities,
  SENSITIVE_FIELD_LOCK_REASON,
  VIEWER_MUTATION_LOCK_REASON,
  type ClientMutationCapabilities,
} from '@/lib/client-mutation-capabilities';

const caps = (over: Partial<ClientMutationCapabilities> = {}): ClientMutationCapabilities => ({
  ...CLIENT_CAPABILITIES_DENIED,
  ...over,
});

const editValues = () => ({
  ...emptyClientFormValues(),
  firstName: 'Ali',
  lastName: 'Veli',
  tckn: '10000000146',
});

const renderEdit = (capabilities?: ClientMutationCapabilities) =>
  render(
    <ClientForm
      mode="edit"
      initialValues={editValues()}
      readOnlyContact={{ phone: '0532', email: 'a@b.com', address: null }}
      capabilities={capabilities}
      saving={false}
      onSubmit={vi.fn()}
      onCancel={vi.fn()}
    />,
  );

// =========================================================================================
// Backend-derived sinyalin normalizasyonu — FE politika HESAPLAMAZ
// =========================================================================================
describe('OWN-13 UI — capability sinyali backend-derived', () => {
  it('sinyal YOKSA sonuç undefined olur — "bilinmiyor" ile "hayır" AYNI DEĞİLDİR', () => {
    // Owner req. 12 (backward compatibility): `capabilities` alanını hiç döndürmeyen bir API
    // sürümüne veya tek bir ağ hatasına karşı UI kilitlenmez; yetkiyi API uygular.
    expect(normalizeClientCapabilities(undefined)).toBeUndefined();
    expect(normalizeClientCapabilities(null)).toBeUndefined();
    expect(normalizeClientCapabilities('nope')).toBeUndefined();
  });

  it('boş nesne DÖNDÜYSE bu açık bir "hayır"dır (hepsi false)', () => {
    expect(normalizeClientCapabilities({})).toEqual(CLIENT_CAPABILITIES_DENIED);
  });

  it('yalnız gerçek boolean true kabul edilir (truthy string/1 yükseltme YAPMAZ)', () => {
    expect(
      normalizeClientCapabilities({ canCreate: 'true', canUpdateSensitive: 1, canUpdateStandard: true }),
    ).toEqual({
      canCreate: false,
      canUpdateStandard: true,
      canUpdateSensitive: false,
      canManageLifecycle: false,
    });
  });

  it('bilinmeyen ek alanlar sinyale sızmaz (yalnız 4 kanonik anahtar)', () => {
    const out = normalizeClientCapabilities({ canCreate: true, canDeleteEverything: true } as any)!;
    expect(Object.keys(out).sort()).toEqual([
      'canCreate',
      'canManageLifecycle',
      'canUpdateSensitive',
      'canUpdateStandard',
    ]);
  });
});

// =========================================================================================
// VIEWER — kontroller GÖRÜNÜR ama disabled + gerekçeli
// =========================================================================================
describe('OWN-13 UI — VIEWER', () => {
  it('create formunda Kaydet GÖRÜNÜR fakat disabled ve gerekçe basılır', () => {
    render(
      <ClientForm
        mode="create"
        capabilities={caps()}
        saving={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const save = screen.getByText('Kaydet') as HTMLButtonElement;
    expect(save).toBeTruthy(); // GİZLENMEZ
    expect(save.disabled).toBe(true);
    expect(screen.getByTestId('client-form-mutation-blocked').textContent).toContain(
      VIEWER_MUTATION_LOCK_REASON,
    );
  });

  it('create formunda standart alanlar da disabled (VIEWER hiçbir mutasyon yapamaz)', () => {
    render(
      <ClientForm mode="create" capabilities={caps()} saving={false} onSubmit={vi.fn()} onCancel={vi.fn()} />,
    );

    expect((screen.getByPlaceholderText('05XX XXX XX XX') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByPlaceholderText('ornek@email.com') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText(/^Ad/) as HTMLInputElement).disabled).toBe(true);
  });

  it('edit formunda tüm alanlar disabled ve VIEWER gerekçesi gösterilir', () => {
    renderEdit(caps());

    expect((screen.getByLabelText(/^Ad/) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText('TCKN *') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByText('Kaydet') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('client-form-mutation-blocked')).toBeTruthy();
    expect(screen.queryByTestId('client-form-sensitive-locked')).toBeNull();
  });
});

// =========================================================================================
// USER (hassas yetkisi YOK) — hassas alanlar kilitli, standart alanlar AÇIK
// =========================================================================================
describe('OWN-13 UI — USER, hassas yetkisi olmayan', () => {
  it('hassas alanlar disabled + gerekçeli, Kaydet AÇIK kalır', () => {
    renderEdit(caps({ canCreate: true, canUpdateStandard: true }));

    expect((screen.getByLabelText(/^Ad/) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText('TCKN *') as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByTestId('client-form-sensitive-locked').textContent).toContain(
      SENSITIVE_FIELD_LOCK_REASON,
    );
    // Standart alanlar kullanılabilir kalmalı → kaydetme yolu kapanmaz.
    expect((screen.getByText('Kaydet') as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByTestId('client-form-mutation-blocked')).toBeNull();
  });

  it('standart alanlar (adres + notlar) düzenlenebilir kalır', () => {
    const { container } = renderEdit(caps({ canCreate: true, canUpdateStandard: true }));

    const textareas = [...container.querySelectorAll('textarea')] as HTMLTextAreaElement[];
    expect(textareas.length).toBeGreaterThanOrEqual(2); // adres + notlar
    for (const t of textareas) expect(t.disabled).toBe(false);
  });

  it('vekaletname yetkileri (temsil yetkisi) hassas sayılır → disabled + gerekçe', () => {
    renderEdit(caps({ canCreate: true, canUpdateStandard: true }));

    const poaCheckbox = screen.getByLabelText('Ahzu Kabza') as HTMLInputElement;
    expect(poaCheckbox.disabled).toBe(true);
    expect(screen.getByTestId('client-form-poa-lock-reason').textContent).toContain(
      SENSITIVE_FIELD_LOCK_REASON,
    );
  });

  it('CREATE hassas-update ayrımının İSTİSNASIDIR: USER create formunda kimlik alanları AÇIK', () => {
    render(
      <ClientForm
        mode="create"
        capabilities={caps({ canCreate: true, canUpdateStandard: true })}
        saving={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect((screen.getByLabelText(/^Ad/) as HTMLInputElement).disabled).toBe(false);
    expect((screen.getByLabelText('TCKN *') as HTMLInputElement).disabled).toBe(false);
    expect(screen.queryByTestId('client-form-sensitive-locked')).toBeNull();
    expect(screen.queryByTestId('client-form-mutation-blocked')).toBeNull();
  });
});

// =========================================================================================
// Yetkili aktör (ADMIN veya eligible avukat) — kilit YOK
// =========================================================================================
describe('OWN-13 UI — hassas yetkisi olan aktör', () => {
  it('hiçbir alan kilitlenmez ve gerekçe uyarısı basılmaz', () => {
    renderEdit(
      caps({ canCreate: true, canUpdateStandard: true, canUpdateSensitive: true, canManageLifecycle: true }),
    );

    expect((screen.getByLabelText(/^Ad/) as HTMLInputElement).disabled).toBe(false);
    expect((screen.getByLabelText('TCKN *') as HTMLInputElement).disabled).toBe(false);
    expect((screen.getByLabelText('Ahzu Kabza') as HTMLInputElement).disabled).toBe(false);
    expect((screen.getByText('Kaydet') as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByTestId('client-form-sensitive-locked')).toBeNull();
    expect(screen.queryByTestId('client-form-mutation-blocked')).toBeNull();
  });
});

// =========================================================================================
// Geriye uyumluluk — `capabilities` verilmeyen mevcut çağıranlar
// =========================================================================================
describe('OWN-13 UI — geriye uyumluluk', () => {
  it('capabilities verilmemişse davranış değişmez (hiçbir alan kilitlenmez)', () => {
    render(<ClientForm mode="create" saving={false} onSubmit={vi.fn()} onCancel={vi.fn()} />);

    expect((screen.getByLabelText(/^Ad/) as HTMLInputElement).disabled).toBe(false);
    expect((screen.getByText('Kaydet') as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByTestId('client-form-mutation-blocked')).toBeNull();
    expect(screen.queryByTestId('client-form-sensitive-locked')).toBeNull();
  });
});
