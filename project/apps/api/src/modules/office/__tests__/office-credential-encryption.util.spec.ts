// ACT-02: office-credential-encryption.util.ts testleri (saf, IO yok, env üzerinden anahtar).
import {
  encryptCredential,
  decryptCredential,
  isEncryptedCredential,
  isCredentialEncryptionConfigured,
} from "../office-credential-encryption.util";

const ORIGINAL_KEY = process.env.CREDENTIAL_ENCRYPTION_KEY;

describe("office-credential-encryption.util", () => {
  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.CREDENTIAL_ENCRYPTION_KEY;
    else process.env.CREDENTIAL_ENCRYPTION_KEY = ORIGINAL_KEY;
  });

  describe("anahtar yokken (CREDENTIAL_ENCRYPTION_KEY unset)", () => {
    beforeEach(() => {
      delete process.env.CREDENTIAL_ENCRYPTION_KEY;
    });

    it("isCredentialEncryptionConfigured() → false", () => {
      expect(isCredentialEncryptionConfigured()).toBe(false);
    });

    it("encryptCredential() → THROW (sessiz düz-metin fallback YOK)", () => {
      expect(() => encryptCredential("gizli-parola")).toThrow(/CREDENTIAL_ENCRYPTION_KEY/);
    });

    it("decryptCredential() legacy düz-metin (enc:v1: öneki YOK) → anahtarsız da OLDUĞU GİBİ döner", () => {
      expect(decryptCredential("eski-duz-metin-parola")).toBe("eski-duz-metin-parola");
    });

    it("decryptCredential() şifreli-görünümlü ama anahtar yoksa → THROW (sessizce bozuk değer dönmez)", () => {
      process.env.CREDENTIAL_ENCRYPTION_KEY = "gecici-key-1";
      const enc = encryptCredential("test-deger");
      delete process.env.CREDENTIAL_ENCRYPTION_KEY;
      expect(() => decryptCredential(enc)).toThrow(/CREDENTIAL_ENCRYPTION_KEY/);
    });
  });

  describe("anahtar varken (CREDENTIAL_ENCRYPTION_KEY set)", () => {
    beforeEach(() => {
      process.env.CREDENTIAL_ENCRYPTION_KEY = "test-encryption-key-1234567890";
    });

    it("isCredentialEncryptionConfigured() → true", () => {
      expect(isCredentialEncryptionConfigured()).toBe(true);
    });

    it("encrypt→decrypt round-trip: orijinal metni tam olarak geri verir", () => {
      const plaintext = "Uygulama-Şifresi-Ç123!";
      const enc = encryptCredential(plaintext);
      expect(decryptCredential(enc)).toBe(plaintext);
    });

    it("şifreli çıktı düz-metni İÇERMEZ ve enc:v1: öneki taşır", () => {
      const plaintext = "TOP-SECRET-VALUE";
      const enc = encryptCredential(plaintext);
      expect(enc.startsWith("enc:v1:")).toBe(true);
      expect(enc).not.toContain(plaintext);
      expect(isEncryptedCredential(enc)).toBe(true);
    });

    it("aynı düz-metin İKİ KEZ şifrelenince FARKLI ciphertext üretir (rastgele IV, deterministik değil)", () => {
      const a = encryptCredential("aynı-değer");
      const b = encryptCredential("aynı-değer");
      expect(a).not.toBe(b);
      expect(decryptCredential(a)).toBe("aynı-değer");
      expect(decryptCredential(b)).toBe("aynı-değer");
    });

    it("legacy düz-metin (enc:v1: öneki yok) → anahtar varken de OLDUĞU GİBİ döner (backfill yok)", () => {
      expect(decryptCredential("eski-plaintext-sms-key")).toBe("eski-plaintext-sms-key");
      expect(isEncryptedCredential("eski-plaintext-sms-key")).toBe(false);
    });

    it("bozulmuş/tahrif edilmiş ciphertext → decrypt THROW (GCM auth-tag doğrulaması)", () => {
      const enc = encryptCredential("orijinal-değer-yeterince-uzun-metin");
      const prefixMatch = enc.match(/^enc:v1:/)![0];
      const payload = Buffer.from(enc.slice(prefixMatch.length), "base64");
      // Ortadaki (ciphertext bölgesi) bir baytı bit-flip et — base64 son-karakter kuyruk-bit
      // sorunundan kaçınmak için DECODE EDİLMİŞ buffer üzerinde doğrudan çalış.
      const mutated = Buffer.from(payload);
      const flipIndex = Math.floor(mutated.length / 2);
      mutated[flipIndex] = mutated[flipIndex] ^ 0xff;
      const tampered = prefixMatch + mutated.toString("base64");
      expect(() => decryptCredential(tampered)).toThrow();
    });

    it("farklı anahtarla şifrelenmiş değer başka anahtarla ÇÖZÜLEMEZ", () => {
      const enc = encryptCredential("gizli");
      process.env.CREDENTIAL_ENCRYPTION_KEY = "farklı-bir-anahtar-999";
      expect(() => decryptCredential(enc)).toThrow();
    });

    it("boş string şifreleme/çözme round-trip çalışır", () => {
      const enc = encryptCredential("");
      expect(decryptCredential(enc)).toBe("");
    });

    it("Türkçe karakter + uzun metin round-trip çalışır", () => {
      const plaintext = "ŞifreÇÖĞİÜşçöğiü-".repeat(10) + "!@#$%^&*()";
      const enc = encryptCredential(plaintext);
      expect(decryptCredential(enc)).toBe(plaintext);
    });
  });
});
