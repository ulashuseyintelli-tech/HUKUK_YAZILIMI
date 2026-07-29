Gorev kimligi bu dosyada YAZILI DEGILDIR. Calisma aninda plan/grant/kuyruk
kaydindan turetilip prompt'un basina eklenir.

OWNER KARARI (baglayici, degistirilemez):
FOUR-PROGRAM-ACTIVATION-DECISION-PACK-R01.md, RECEIVABLE-A: "registry/resolver
technical binding: CONTROLLED DEFAULT-OFF olarak onayla." Bu, resolver'in
YAZILMASINI onayliyor; module'e BAGLANMASINI (I02B/I03/I04 aktivasyonunu)
DEGIL. Asagidaki sinir bu ayrimi uygular.

GOREV

`LegalBasisExactVersionResolverPort` (bkz.
`project/apps/api/src/modules/claim-item/formation-intent/claim-item-formation-resolver.ports.ts`,
satir ~237-241) icin SOMUT, saf ve deterministik bir implementasyon yaz.
Resolver, ratifiye edilmis registry'yi okur:

  project/docs/governance/receivable-legal-subtype-registry-v1.json
  project/docs/governance/receivable-legal-subtype-registry-v1.checksum.json

Validator zaten var (`project/scripts/governance/validate-receivable-legal-subtype-registry.cjs
--self-test`); onu kullanabilirsin, yeniden yazma.

TAM OLARAK UC DOSYA:

  1. project/apps/api/src/modules/claim-item/formation-intent/legal-basis-registry-resolver.service.ts
     (concrete resolver — YENI DOSYA)
  2. project/apps/api/src/modules/claim-item/formation-intent/legal-basis-resolver-activation.ts
     (feature flag tanimi — YENI DOSYA)
  3. project/apps/api/src/modules/claim-item/__tests__/legal-basis-registry-resolver.spec.ts
     (resolver'in KENDI birim testleri — YENI DOSYA)

BASKA HICBIR DOSYAYI degistirme veya olusturma. Ozellikle:

  - claim-item.module.ts'e DOKUNMA. Resolver'i module'e BAGLAMA, hicbir
    provider olarak KAYDETME. Bu ayri, daha sonraki bir aktivasyon karari
    (I02B/I03/I04) icindir, bu gorevin kapsami DISINDA.
  - claim-item-formation-intent-dormancy.static.spec.ts'e DOKUNMA. O test
    module.ts'in formation-intent/LegalSubtypeRegistry icermedigini
    dogruluyor; bu gorev module.ts'e hic dokunmadigi icin o test zaten
    degismeden gecer.
  - Registry JSON dosyasini DEGISTIRME. Ratifiye veri; okunur, yazilmaz.
  - Imza/sertifika/anahtar dogrulamasi YAPMA. Port'un kendi JSDoc'u (satir
    230-236) bunu acikca yasakliyor: "Implementations resolve an already-
    adapter-verified registry release... they do not perform signature/
    certificate/key verification themselves."
  - Yeni bir hukuk kurali icat etme. Hangi legal basis code'un hangi
    subtype'a bagli oldugu, interest eligibility, liability compatibility
    vb. TAMAMEN registry'nin kendi alanlarindan gelir (crosswalk belgesine
    bak: project/docs/governance/receivable-legal-subtype-registry-v1-crosswalk.md).
    Resolver YALNIZCA registry'yi okuyup port'un bekledigi sekle projekte
    eder; hicbir alani kendi basina tahmin etmez veya doldurmaz.

RESOLVER DAVRANISI

  - Input: tenantId, caseId, legalBasisCode, requestedVersion, effectiveAt,
    componentCategory, componentSubtypeCode, documentType, evidenceClasses,
    liabilityContext (bkz. ResolveExactLegalBasisInput).
  - Registry entries icinde componentSubtypeCode'a (`subtypeCode` alani)
    esit VE legalBasisBindings.allowedLegalBasisCodes icinde legalBasisCode'u
    iceren kaydi bul.
  - effectiveAt, entry'nin effectiveFrom/effectiveUntil araligina
    dusmuyorsa VERSION_NOT_FOUND don.
  - Kayit bulunamazsa VERSION_NOT_FOUND; entry.status REVOKED ise REVOKED;
    SUPERSEDED ise SUPERSEDED don (EXACT_LEGAL_BASIS_RESOLUTION_FAILURE_CODES
    listesindeki kodlarin disinda bir kod UYDURMA).
  - Bulunursa ExactLegalBasisBindingV1 sekline projekte et — registry
    alanlari (legalCharacter, legalBasisBindings, requiredSourceTypes/
    requiredEvidenceTypes, liabilityCompatibility, interestEligibility,
    amountSemantics, currencySemantics, calculationSemantics,
    allowedFormationPaths, forbiddenFormationPaths, admissionRequirements,
    finalizationRequirements, snapshotRequirements) port alanlarina
    NEREDEYSE BIREBIR eslenir; farkli isimlendirilenleri crosswalk
    belgesinden dogrula.
  - `claimItemProjection` (itemType, interestAccrualStatus vb. Prisma enum
    degerleri): eger registry'de bu eslemeyi turetecek acik bir alan yoksa
    (`canonicalComponentCategory` disinda), bu alani TAHMIN ETME — resolver
    bu durumda VERSION_NOT_FOUND ile basarisiz olsun ve neden basarisiz
    oldugunu bir yorumda acikla. Icat etmek, yeni hukuk kurali uretmek
    olur.
  - Deterministik: ayni input + ayni registry dosyasi HER ZAMAN ayni
    sonucu uretir. Date.now(), Math.random(), dosya sistemi disinda hicbir
    disaridan durum okuma yok.
  - registryChecksum, checksum dosyasindaki degerle uyusmuyorsa
    AUTHORITY_UNAVAILABLE don (retryable tek kod, port'un JSDoc'u geregi).

FEATURE FLAG

  export const RECEIVABLE_LEGAL_BASIS_RESOLVER_FLAG =
    'RECEIVABLE_LEGAL_BASIS_RESOLVER_ENABLED';
  export function isLegalBasisResolverEnabled(env = process.env): boolean {
    return env[RECEIVABLE_LEGAL_BASIS_RESOLVER_FLAG] === 'true';
  }

  Varsayilan KAPALI. Bu gorevde flag HICBIR YERDE runtime davranisini
  kontrol etmiyor (cunku resolver hicbir yere baglanmadi) — yalnizca
  gelecekteki I02B/I03/I04 aktivasyon karari icin hazir bir kontrol
  noktasi olarak var. Kendi testinde varsayilan false oldugunu dogrula.

TESTLER

  - Yeni spec dosyasinda: her registry entry icin (7 tane) resolver'in
    dogru sonucu urettigini dogrula (characterization — registry'nin
    KENDI verisine karsi).
  - Bilinmeyen legalBasisCode/subtypeCode -> VERSION_NOT_FOUND.
  - effectiveAt araligin disinda -> VERSION_NOT_FOUND.
  - status REVOKED/SUPERSEDED olan bir kayit varsa (yoksa bu durumu mock
    bir registry ile test et) -> ilgili kod.
  - Ayni input iki kez cagrilinca ayni sonuc (determinizm).
  - isLegalBasisResolverEnabled() varsayilan false.
  - checksum kasitli bozulursa AUTHORITY_UNAVAILABLE.

BITIRME

Tam olarak 3 dosya olustur, hicbirini degistirme, dur. Commit/push/PR/merge
orkestra tarafindan yapilir.
