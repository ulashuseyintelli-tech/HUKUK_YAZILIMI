# RECEIVABLE-LEGAL-BASIS-REGISTRY-CONTENT-RATIFICATION-R01 — HANDOFF PAKETİ — v1.0

| Alan | Değer |
| --- | --- |
| Devreden program | `UYAP-MODULE-FULL-GAP-CLOSURE-R02` |
| Devralan program | **RECEIVABLE / ALACAK KALEMLERİ** (owner mimari kararı, 2026-07-29) |
| Devredilen görev | `RECEIVABLE-LEGAL-BASIS-REGISTRY-CONTENT-RATIFICATION-R01` |
| Handoff kaydı | `UYAP-M01-RECEIVABLE-LEGAL-BASIS-HANDOFF-R01` |
| Tarih | 2026-07-29 |

Bu belge **self-contained**'dır: Alacak Kalemleri sayfasının, UYAP oturumunun bağlamı
olmadan yürütebilmesi için gereken bütün ölçülmüş gerçekleri taşır.

## 0. Owner mimari kararı (bağlayıcı)

```text
RECEIVABLE / ALACAK KALEMLERİ  →  legal-basis model + registry SAHİBİ
                                  NAFAKA içeriği · ClaimItemFormationIntent ·
                                  ClaimFormationSnapshot · exact-version resolver ·
                                  registry release/checksum

UYAP                           →  CONSUMER ONLY
                                  legal basis'i YENİDEN ÜRETMEZ
                                  ikinci registry/resolver KURMAZ
                                  yalnız canonical RECEIVABLE sonucunu resmî UYAP
                                  koduna bağlar
```

Gerekçe: aksi hâlde aynı alacak için iki semantic owner, çift hukuki sınıflandırma,
versiyon/effective-date çakışması, ClaimItem↔XML divergence ve UYAP'ın domain
owner'a dönüşmesi oluşur.

## 1. Devredilen soru

```text
Bir alacak kaleminin hukuki dayanağı nedir?
Nafaka hangi claim-level legal-basis sınıfına girer?
Registry girdisinin hukuki anlamı, versiyonu ve evidence şartları nedir?
```

Bu UYAP XML serileştirme sorusu DEĞİLDİR; alacağın kanonik hukuki niteliğinin
sahipliği sorusudur.

## 2. Baseline gerçekler (UYAP tarafında ölçüldü — yeniden türetme gerekmez)

### 2.1 Registry v1

```text
Dosyalar:   project/docs/governance/receivable-legal-subtype-registry-v1.json
            …-v1.schema.json · …-v1.checksum.json · …-v1.md (ratification record)
Kimlik:     RCV-CLAIM-LEGAL-SUBTYPE-REGISTRY · registryVersion 1
Durum:      registryStatus RATIFIED · runtimeStatus DORMANT
İçerik:     7 girdi — COMMERCIAL_COLLECTION_COST, COMMERCIAL_DEFAULT_INTEREST,
            CONTRACTUAL_DEFAULT_INTEREST, DEFAULT_INTEREST, DELAY_DAMAGE,
            STATUTORY_DEFAULT_INTEREST, STATUTORY_INTEREST
Checksum:   320f671ed2262314a560703bc8f15f9cd8b5e0743d8dfa4e5ce49b1e62c26e64
            (kanonik serileştirme RCV-LEGAL-SUBTYPE-REGISTRY-CANONICAL-JSON-V1
             üzerinden — ham dosya hash'i DEĞİL)
Validator:  project/scripts/governance/validate-receivable-legal-subtype-registry.cjs
            (çalıştırıldı: LEGAL_SUBTYPE_REGISTRY_VALID entryCount=7)
NAFAKA:     registry'de ve repo governance'ında HİÇ YOK ("TMK" 0 eşleşme)
```

### 2.2 Validator = ratifiye crosswalk'un zorlayıcısı (kritik)

Validator şunları SABİTLER — 8. girdi eklemek bunların ratifikasyonla
güncellenmesini gerektirir:

```text
EXPECTED_CODES         7 kod (frozen) — başka subtypeCode "not ratified" FAIL
EXPECTED_BINDINGS      subtype→kategori→legal-basis crosswalk (frozen)
LEGAL_BASIS_CODES      [KANUN_3095_1, KANUN_3095_2, TBK_117, TBK_118, TBK_120,
                        TTK_1530] — TÜMÜ faiz/ticari dayanak; NAFAKA dayanağı YOK
"exactly seven entries" + checksum manifest "entryCount must equal 7"
"registryVersion must equal 1" + "supersededBy must be null for registry version 1"
schema subtypeCode enum === EXPECTED_CODES (birebir)
her girdi status === 'RATIFIED' (taslak/pending durumu SÖZLEŞMEDE YOK)
her girdi liabilityCompatibility.allowedLiabilityTypes === [KISMI, SINIRLI, TAM]
```

### 2.3 Sözleşme (girdi başına 26 alan)

`admissionRequirements · allowedFormationPaths · amountSemantics ·
calculationSemantics · canonicalComponentCategory · currencySemantics ·
displayName · effectiveFrom · effectiveUntil · finalizationRequirements ·
forbiddenFormationPaths · interestEligibility · legalBasisBindings ·
legalCharacter · legalMeaning · liabilityCompatibility · lifecycle · notes ·
requiredEvidenceTypes · requiredSourceTypes · snapshotRequirements · status ·
subtypeCode · subtypeVersion · supersededBy · supersedes`

### 2.4 Resolver ve zincir durumu

```text
LegalBasisExactVersionResolverPort  MEVCUT (main; D01B owner-ratified D4,
                                    pure/deterministic sözleşme)
Somut resolver implementasyonu      YOK — #1887 yalnız coordination/plan artefaktı
                                    olarak merge oldu (7e9e8da8; 3 governance dosyası);
                                    execution görevi RECEIVABLE-LEGAL-BASIS-RESOLVER-
                                    CONTROLLED-DEFAULT-OFF-R01 coordination zincirinde
                                    PENDING
Formation zinciri                   DORMANT (bilinçli; dormancy static spec kilitli)
Claim-level ilişki                  PROVEN — ClaimFormationSnapshot → ClaimItem
                                    composite tenant-safe FK [tenantId, caseId,
                                    claimItemId], @@unique([tenantId, claimItemId,
                                    snapshotVersion])
```

## 3. Karar bekleyen exact blocker'lar (UYAP tarafında tespit edildi)

```text
BLOCKER-1  NAFAKA Legal Basis kodu ratifiye değil (kök blocker)
           LEGAL_BASIS_CODES kümesinde nafaka yükümlülüğünün kanuni dayanağı yok.
           Hangi kanun hükümlerinin (ör. TMK ailesi) hangi kod adıyla ve hangi
           bindingMode ile ratifiye edileceği owner/LDO hukuki kararıdır.

BLOCKER-2  Evidence provenance taksonomisi sözleşmede yok
           requiredSourceTypes/requiredEvidenceTypes sözlüğü mekanizma-pinleridir
           (EXACT_LEGAL_BASIS_RELEASE_ENTRY, EXACT_LIABILITY_CONTEXT,
           LIABILITY_CONTEXT_HASH…); İLAM / ANLAŞMA-PROTOKOL / TEDBİR KARARI /
           DİĞER ayrımı İFADE EDİLEMİYOR. Serbest metinle telafi YASAK —
           sözleşme genişletmesi owner/LDO kararı.

BLOCKER-3  Liability modeli generic sete kilitli
           Validator her girdiye [KISMI, SINIRLI, TAM] kümesini zorunlu kılar;
           nafaka borçlusu/alacaklısına özgü liability ifade edilemez.
           Genişletme owner/LDO kararı.

BLOCKER-4  Yeni release = crosswalk/validator ratifikasyonu
           8. girdi; EXPECTED_CODES + EXPECTED_BINDINGS + entry-count pinleri +
           schema enum + checksum manifest + ratification .md'nin BİRLİKTE
           güncellenmesini gerektirir. Bunlar ratifiye crosswalk'u değiştirme
           eylemidir. Taslak durumu olmadığından owner onayı olmadan yazılan her
           girdi SAHTE ratifikasyon iddiası olur.
```

## 4. Yapısal olarak belirlenmiş alanlar (RECEIVABLE yürütmesine hazır girdi)

| Alan | Değer | Dayanak |
| --- | --- | --- |
| `subtypeVersion` | `1` | validator |
| `canonicalComponentCategory` | `PRINCIPAL` (formation contract'ta mevcut; registry'de ilk kullanım — ratifikasyon owner/LDO'da) | `CLAIM_ITEM_FORMATION_COMPONENT_CATEGORIES` |
| `amountSemantics` | `fixedAtFormation:true · POSITIVE_INTEGER_STRING · roundingFallback:PROHIBITED` | validator |
| `currencySemantics` | `conversion:PROHIBITED · ISO_CURRENCY_MINOR_UNIT`; nafaka TL kısıtı `currencyAuthority` metnine (repo kanıtı: `case.service` Kural 1 "Nafaka alacağı sadece TL") | validator + repo |
| `interestEligibility.componentAccruesFurtherInterest` | `false` | validator |
| `allowedFormationPaths` | `['CLAIM_ITEM_FORMATION_INTENT_V1_APPROVED_FINALIZATION']` | validator |
| `forbiddenFormationPaths` | 4 zorunlu guard + öneri: `CASE_SUBCATEGORY_ONLY_INFERENCE`, `DUE_SCHEDULE_INFERENCE` | validator + M-01 yasak zinciri |
| `lifecycle` | `RATIFIED_BUT_RUNTIME_DORMANT / FAIL_CLOSED_FOR_NEW_FORMATION / EXPLICIT_NEW_VERSION_ONLY` | validator |
| `subtypeCode` | öneri: `NAFAKA_RECEIVABLE` — **owner/LDO onayı şart** | stil tutarlılığı |

## 5. Bağlayıcı yasaklar (devirle birlikte geçer)

- `CaseSubCategory.NAFAKA → doğrudan registry sonucu` zinciri YASAK (canonical
  formation intent + source/evidence + claim-level ilişki zorunlu).
- `Due.type=NAFAKA` authority DEĞİL (owner ruling; tbk100 ledger R1/R2
  `DueType.NAFAKA → null` PRESERVE).
- `ClaimItem`'ın hemen genişletilmesi NOT AUTHORIZED; tbk100 kararının geri
  alınması NOT AUTHORIZED.
- Runtime aktivasyon bu devirle YETKİLENDİRİLMEZ (`runtimeStatus DORMANT` kalır).
- UYAP kodu (`9009` vb.) bu görevde ÜRETİLMEZ — o, dönüş sonrası UYAP binding işidir.
- `5045` her yerde dışlanmış kalır.

## 6. Yürütme sırası (owner)

```text
1. RECEIVABLE  RECEIVABLE-LEGAL-BASIS-REGISTRY-CONTENT-RATIFICATION-R01 (bu paket)
2. RECEIVABLE  Immutable registry release + checksum
3. RECEIVABLE  Existing resolver execution — controlled default-OFF
4. UYAP        UYAP-M01-LEGAL-BASIS-RESOLVER-BINDING-I01
5. UYAP        alacakKalemi structured emission
6. UYAP        serializer bypass hardening
7. UYAP        Final CI eligibility
8. UYAP        Canary R02
```

## 7. UYAP tarafında açık kalan dependency kaydı

```text
UYAP M-01 STATUS:  BLOCKED_BY_RECEIVABLE_LEGAL_BASIS_AUTHORITY
CANONICAL OWNER:   RECEIVABLE / ALACAK KALEMLERİ
UYAP ROLE:         CONSUMER ONLY
NEXT UYAP TASK:    NOT ELIGIBLE UNTIL RECEIVABLE HANDOFF RETURNS
DÖNÜŞ KOŞULU:      registry release CANONICAL + resolver execution CLOSED
                   → UYAP-M01-LEGAL-BASIS-RESOLVER-BINDING-I01 eligible olur
```
