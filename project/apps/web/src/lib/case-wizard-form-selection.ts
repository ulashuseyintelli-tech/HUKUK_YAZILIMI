import type { FormMetadata, SubFormMetadata } from "@/types/form-metadata";

/**
 * Yeni takip sihirbazı — seçilen takip formu (form + alt form) taslakta saklanır ve yeniden açılışta AYNEN yüklenir.
 *
 * Kusur (#2847 bulgusu): taslak `selectedForm` / `selectedSubForm`'u saklamıyordu; sayfa yenilenince form boş kalıyor,
 * gönderimde `mapCategoryToCaseType(undefined)` SESSİZCE `GENERAL_EXECUTION` seçiyor, alt tür (form kodu) gönderilmiyordu.
 *
 * Kurallar:
 *  - Taslağa yalnız KODLAR yazılır (katalog nesnesi değil); geri yüklemede katalogdan birebir çözülür.
 *  - Seçim BİLİNEMİYORSA (alan taşımayan eski taslak, katalogda artık olmayan kod) form TAHMİN EDİLMEZ ve varsayılan
 *    atanmaz: seçim eksik kalır, kullanıcı dosya oluşturma / belge üretiminden önce tamamlar. Diğer taslak verisi korunur.
 *  - Alt form seçilmemiş kayıt (ör. Kambiyo sihirbazı yalnız ana formu seçer) olduğu gibi geri yüklenir; yeni bir
 *    zorunluluk getirilmez.
 */

export interface CaseWizardFormSelectionDraft {
  formCode: string | null;
  subFormCode: string | null;
}

/** Taslak durumunda seçimin saklandığı anahtar (yoksa taslak bu düzeltmeden ÖNCE kaydedilmiştir). */
export const CASE_WIZARD_FORM_SELECTION_KEY = "formSelection";

export const CASE_FORM_SELECTION_MISSING_MESSAGE =
  "Takip türü (form) seçimi bu taslakta kayıtlı değil. Dosya oluşturmadan ve belge üretmeden önce takip türünü seçin; girdiğiniz diğer bilgiler korunur.";

export const CASE_FORM_SELECTION_REQUIRED_FOR_DOCUMENT_MESSAGE =
  "Takip türü (form) seçilmeden belge üretilemez. Önce takip türünü seçin; girdiğiniz bilgiler korunur.";

/// <remarks>
/// Çağrıldığı yerler:
/// - cases/new/page.tsx → taslak kaydetme efekti (stateToSave.formSelection)
/// </remarks>
export function serializeCaseWizardFormSelection(
  form: Pick<FormMetadata, "code"> | null | undefined,
  subForm: Pick<SubFormMetadata, "code"> | null | undefined,
): CaseWizardFormSelectionDraft {
  return { formCode: form?.code ?? null, subFormCode: form ? subForm?.code ?? null : null };
}

export type RestoredCaseWizardFormSelection =
  | { status: "RESTORED"; form: FormMetadata; subForm: SubFormMetadata | null }
  /** Taslakta seçim yok ve kullanıcı henüz form adımında (normal akış seçimi zaten ister) */
  | { status: "NOT_SELECTED" }
  /** Seçim yapılmıştı ama bilinemiyor → tahmin yok, kullanıcıdan tamamlaması istenir */
  | { status: "MISSING"; reason: "LEGACY_DRAFT" | "UNKNOWN_FORM" | "UNKNOWN_SUB_FORM" };

/// <remarks>
/// Çağrıldığı yerler:
/// - cases/new/page.tsx → taslak yükleme efekti
/// </remarks>
export function restoreCaseWizardFormSelection(
  savedState: Record<string, unknown> | null | undefined,
  catalog: readonly FormMetadata[],
): RestoredCaseWizardFormSelection {
  const stepPassedFormSelection = typeof savedState?.currentStep === "number" && savedState.currentStep >= 1;
  const raw = savedState?.[CASE_WIZARD_FORM_SELECTION_KEY] as Partial<CaseWizardFormSelectionDraft> | undefined;
  if (!raw || typeof raw !== "object") {
    return stepPassedFormSelection ? { status: "MISSING", reason: "LEGACY_DRAFT" } : { status: "NOT_SELECTED" };
  }
  const formCode = typeof raw.formCode === "string" && raw.formCode ? raw.formCode : null;
  if (!formCode) return { status: "NOT_SELECTED" };
  const form = catalog.find((f) => f.code === formCode);
  if (!form) return { status: "MISSING", reason: "UNKNOWN_FORM" };
  const subFormCode = typeof raw.subFormCode === "string" && raw.subFormCode ? raw.subFormCode : null;
  if (!subFormCode) return { status: "RESTORED", form, subForm: null };
  const subForm = form.subForms?.find((s) => s.code === subFormCode);
  // Kayıtlı alt tür çözülemiyorsa ana forma DÜŞÜLMEZ (alt tür sessizce değişirdi) → kullanıcı yeniden seçer
  if (!subForm) return { status: "MISSING", reason: "UNKNOWN_SUB_FORM" };
  return { status: "RESTORED", form, subForm };
}
