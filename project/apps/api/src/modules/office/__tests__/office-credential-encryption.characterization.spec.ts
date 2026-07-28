import {
  decryptCredential,
  encryptCredential,
  isCredentialEncryptionConfigured,
  isEncryptedCredential,
} from "../office-credential-encryption.util";

const ORIGINAL_KEY = process.env.CREDENTIAL_ENCRYPTION_KEY;
const TEST_KEY = "characterization-test-key-not-a-real-secret";
const TEST_VALUE = "characterization-placeholder-value";

describe("office credential encryption characterization", () => {
  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.CREDENTIAL_ENCRYPTION_KEY;
    else process.env.CREDENTIAL_ENCRYPTION_KEY = ORIGINAL_KEY;
  });

  it("anahtar yoksa veya boşsa yapılandırılmamış, değer varsa yapılandırılmış kabul eder", () => {
    delete process.env.CREDENTIAL_ENCRYPTION_KEY;
    expect(isCredentialEncryptionConfigured()).toBe(false);

    process.env.CREDENTIAL_ENCRYPTION_KEY = "";
    expect(isCredentialEncryptionConfigured()).toBe(false);

    process.env.CREDENTIAL_ENCRYPTION_KEY = TEST_KEY;
    expect(isCredentialEncryptionConfigured()).toBe(true);
  });

  it("şifreleme ve çözme round-trip'i orijinal değeri geri verir", () => {
    process.env.CREDENTIAL_ENCRYPTION_KEY = TEST_KEY;

    const encrypted = encryptCredential(TEST_VALUE);

    expect(decryptCredential(encrypted)).toBe(TEST_VALUE);
  });

  it("şifreli çıktıyı enc:v1: format işaretiyle üretir", () => {
    process.env.CREDENTIAL_ENCRYPTION_KEY = TEST_KEY;

    const encrypted = encryptCredential(TEST_VALUE);

    expect(encrypted).toMatch(/^enc:v1:/);
    expect(isEncryptedCredential(encrypted)).toBe(true);
    expect(encrypted).not.toContain(TEST_VALUE);
  });

  it("anahtar yokken şifrelemeyi ve enc:v1: değer çözmeyi reddeder; legacy düz metni korur", () => {
    process.env.CREDENTIAL_ENCRYPTION_KEY = TEST_KEY;
    const encrypted = encryptCredential(TEST_VALUE);
    delete process.env.CREDENTIAL_ENCRYPTION_KEY;

    expect(() => encryptCredential(TEST_VALUE)).toThrow(/CREDENTIAL_ENCRYPTION_KEY/);
    expect(() => decryptCredential(encrypted)).toThrow(/CREDENTIAL_ENCRYPTION_KEY/);
    expect(decryptCredential(TEST_VALUE)).toBe(TEST_VALUE);
  });
});
