import {
  CEK_AUTO_GENERATE_FORMATION_ENABLED_ENV,
  CEK_R2_DRAFT_LEGAL_CONTENT_ALLOWED_ENV,
  cekAutoGenerateFormationOptionsFromEnv,
} from '../formation-cek/cek-auto-generate-formation.service';

describe('K3 PR-3 çek formation bayrakları — varsayılan KAPALI', () => {
  it('ortam değişkeni yoksa iki bayrak da kapalı', () => {
    expect(cekAutoGenerateFormationOptionsFromEnv({})).toEqual({ enabled: false, allowDraftLegalContent: false });
  });

  it.each(['TRUE', '1', 'yes', ' true', 'true ', ''])('yalnız tam "true" açar ("%s" açmaz)', (value) => {
    expect(
      cekAutoGenerateFormationOptionsFromEnv({
        [CEK_AUTO_GENERATE_FORMATION_ENABLED_ENV]: value,
        [CEK_R2_DRAFT_LEGAL_CONTENT_ALLOWED_ENV]: value,
      }),
    ).toEqual({ enabled: false, allowDraftLegalContent: false });
  });

  it('bayraklar birbirinden bağımsızdır', () => {
    expect(cekAutoGenerateFormationOptionsFromEnv({ [CEK_AUTO_GENERATE_FORMATION_ENABLED_ENV]: 'true' })).toEqual({
      enabled: true,
      allowDraftLegalContent: false,
    });
  });
});
