import { describe, expect, it } from 'vitest';
import { formMetadata } from '@/config/form-metadata';
import {
  CASE_WIZARD_FORM_SELECTION_KEY,
  restoreCaseWizardFormSelection,
  serializeCaseWizardFormSelection,
} from '@/lib/case-wizard-form-selection';

/**
 * Taslakta takip formu (form + alt form) — #2847 bulgusu: taslak seçimi saklamıyordu, yeniden açılışta form boş kalıp
 * gönderim sessizce GENERAL_EXECUTION seçiyordu. Seçim yalnız kodla saklanır, katalogdan birebir çözülür; bilinemiyorsa
 * TAHMİN/VARSAYILAN YOK.
 */
const kambiyo = formMetadata.find((f) => f.code === 'FORM_10')!;
const cek = kambiyo.subForms!.find((s) => s.code === 'FORM_10_CEK')!;
const ilamsiz = formMetadata.find((f) => f.code === 'FORM_7')!;

describe('serializeCaseWizardFormSelection', () => {
  it('yalnız kodlar yazılır', () => {
    expect(serializeCaseWizardFormSelection(kambiyo, cek)).toEqual({ formCode: 'FORM_10', subFormCode: 'FORM_10_CEK' });
    expect(serializeCaseWizardFormSelection(ilamsiz, null)).toEqual({ formCode: 'FORM_7', subFormCode: null });
    expect(serializeCaseWizardFormSelection(null, null)).toEqual({ formCode: null, subFormCode: null });
  });

  it('form yokken alt form yazılmaz', () => {
    expect(serializeCaseWizardFormSelection(null, cek)).toEqual({ formCode: null, subFormCode: null });
  });
});

describe('restoreCaseWizardFormSelection', () => {
  const draft = (currentStep: number, formSelection?: unknown) =>
    formSelection === undefined ? { currentStep } : { currentStep, [CASE_WIZARD_FORM_SELECTION_KEY]: formSelection };

  it('kaydet → geri yükle: form ve alt form katalogdaki AYNI nesnelerle döner', () => {
    const saved = draft(5, serializeCaseWizardFormSelection(kambiyo, cek));
    const restored = restoreCaseWizardFormSelection(JSON.parse(JSON.stringify(saved)), formMetadata);
    expect(restored).toEqual({ status: 'RESTORED', form: kambiyo, subForm: cek });
  });

  it('alt form seçilmemiş kayıt (Kambiyo sihirbazı yalnız ana formu seçer) aynen döner; yeni zorunluluk yok', () => {
    expect(restoreCaseWizardFormSelection(draft(1, { formCode: 'FORM_10', subFormCode: null }), formMetadata)).toEqual({
      status: 'RESTORED',
      form: kambiyo,
      subForm: null,
    });
  });

  it('ESKİ TASLAK (alan yok) form adımı geçilmişse MISSING — varsayılan form SEÇİLMEZ', () => {
    expect(restoreCaseWizardFormSelection(draft(3), formMetadata)).toEqual({ status: 'MISSING', reason: 'LEGACY_DRAFT' });
  });

  it('eski taslak hâlâ form adımındaysa NOT_SELECTED (normal akış seçimi zaten ister)', () => {
    expect(restoreCaseWizardFormSelection(draft(0), formMetadata)).toEqual({ status: 'NOT_SELECTED' });
    expect(restoreCaseWizardFormSelection(null, formMetadata)).toEqual({ status: 'NOT_SELECTED' });
  });

  it('katalogda olmayan form kodu → MISSING (tahmin yok)', () => {
    expect(restoreCaseWizardFormSelection(draft(2, { formCode: 'FORM_999', subFormCode: null }), formMetadata)).toEqual({
      status: 'MISSING',
      reason: 'UNKNOWN_FORM',
    });
  });

  it('çözülemeyen alt form → ana forma DÜŞÜLMEZ (alt tür sessizce değişirdi) → MISSING', () => {
    expect(restoreCaseWizardFormSelection(draft(2, { formCode: 'FORM_10', subFormCode: 'FORM_10_YOK' }), formMetadata)).toEqual({
      status: 'MISSING',
      reason: 'UNKNOWN_SUB_FORM',
    });
  });

  it('bozuk alan tipleri çökmez', () => {
    expect(restoreCaseWizardFormSelection(draft(2, 'FORM_10'), formMetadata)).toEqual({ status: 'MISSING', reason: 'LEGACY_DRAFT' });
    expect(restoreCaseWizardFormSelection(draft(2, { formCode: 42 }), formMetadata)).toEqual({ status: 'NOT_SELECTED' });
  });
});
