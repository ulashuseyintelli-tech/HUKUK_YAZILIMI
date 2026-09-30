/**
 * K3-L Faz 2b — dosya açılışındaki çek tazminatı K3 talebinin ret nedenini kullanıcıya anlaşılır biçimde raporlar.
 *
 * K3 talebi, `POST /claim-items` ile AYNI insan ClaimItem yazma kapısından geçer (K2/K3, owner kararı 2026-09-28):
 * dosyada mali düzenleme nesne yetkisi (`CaseLawyer.casePermissions.canEditFinance` ya da personel `canSeeFinance` +
 * `canEdit`) yoksa talep reddedilir. Dosya açılışında avukat atamasına yalnız ofis yönetimince AÇIKÇA belirlenmiş
 * varsayılan yetki kopyalanır (K3 kararı A, owner GO 2026-09-30; bkz. case-lawyer-default-permissions.ts); böyle bir
 * varsayılan yoksa ya da mali izni false ise bu ret BEKLENEN bir durumdur; kapı burada ATLANMAZ, yalnız neden söylenir.
 *
 * Ham ret metni (`ClaimItem write denied: <REASON>`) iç ayrıntıdır; kullanıcıya kararlı bir kod + Türkçe açıklama
 * döner. Tanınmayan hata kodu/mesajı olduğu gibi korunur (bilgi kaybı yok).
 *
 * /// <remarks>
 * /// Çağrıldığı yerler:
 * ///  - CaseService.requestCheckPenaltyFormationAfterCommit() → çek başına REJECTED sonucu
 * /// </remarks>
 */
export interface CheckPenaltyFormationRejection {
  readonly errorCode: string;
  readonly message: string;
}

const CLAIM_ITEM_WRITE_DENIED = /ClaimItem write denied:\s*([A-Z0-9_]+)/;

const WRITE_DENIED_MESSAGES: Readonly<Record<string, { code: string; message: string }>> = Object.freeze({
  OBJECT_PERMISSION_DENIED: {
    code: 'CASE_FINANCE_PERMISSION_REQUIRED',
    message:
      'Dosyada mali düzenleme yetkiniz yok (dosya yetkileri ofis yönetimince verilir); çek tazminatı onay talebi açılmadı.',
  },
  HUMAN_ACTOR_NOT_ACTIVE_IN_TENANT: {
    code: 'ACTOR_NOT_ACTIVE',
    message: 'Kullanıcı bu büroda etkin değil; çek tazminatı onay talebi açılmadı.',
  },
  HUMAN_ACTOR_PROFILE_INVALID: {
    code: 'ACTOR_PROFILE_INVALID',
    message: 'Kullanıcının avukat/personel profili geçersiz; çek tazminatı onay talebi açılmadı.',
  },
});

/** Kodu kararlı, iç metni kullanıcıya uygun olmayan retler (ör. İngilizce iç metin) */
const CODE_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  FORMATION_CONTEXT_REQUIRED: 'Çek tazminatı onay akışı bu ortamda kapalı; çek tazminatı onay talebi açılmadı.',
});

export function describeCheckPenaltyFormationRejection(error: unknown): CheckPenaltyFormationRejection {
  const err = error as { getResponse?: () => unknown; response?: unknown; code?: unknown; message?: unknown } | null;
  const response = (typeof err?.getResponse === 'function' ? err.getResponse() : err?.response) as
    | { code?: unknown; errorCode?: unknown; message?: unknown }
    | string
    | undefined;
  const responseObject = typeof response === 'object' && response !== null ? response : undefined;
  const rawMessage = String(
    responseObject?.message ?? (typeof response === 'string' ? response : undefined) ?? err?.message ?? '',
  );
  const denied = CLAIM_ITEM_WRITE_DENIED.exec(rawMessage);
  if (denied) {
    const known = WRITE_DENIED_MESSAGES[denied[1]];
    if (known) return { errorCode: known.code, message: known.message };
    return {
      errorCode: `CLAIM_ITEM_WRITE_DENIED:${denied[1]}`,
      message: `Alacak kalemi yazma kapısı talebi reddetti (${denied[1]}); çek tazminatı onay talebi açılmadı.`,
    };
  }
  const errorCode = String(responseObject?.code ?? responseObject?.errorCode ?? err?.code ?? 'FORMATION_REQUEST_FAILED');
  const knownByCode = CODE_MESSAGES[errorCode];
  if (knownByCode) return { errorCode, message: knownByCode };
  return { errorCode, message: rawMessage || errorCode };
}
