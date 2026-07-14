# 10 — PROJECT MEMORY (Navigation)

```text
Status                        : CANONICAL HANDOFF (navigation layer)
Version                       : v1.0
Generated From Canonical Main : c7f55da4 (origin/main @ 2026-07-15)
Purpose                       : Tekrarlayan metodolojik dersleri kalıcılaştırmak
Scope                         : Ders/prensip özeti; yeni karar/kural üretmez
Authority                     : NONE (navigation). Dersler mevcut kanonik kaynaklardan türetilmiştir.
Source Documents              : SYSTEM-CONSTITUTION.md, DEBTOR-GOVERNANCE.md, DEBTOR-PHASE-0-COMPLETION-ROADMAP.md, GOVERNANCE-INDEX.md, decision-log.md, AGENTS.md
Supersedes                    : NONE
Update Policy                 : Yeni ders yalnız kanonik kaynağa dayanınca eklenir.
```

> **Layer:** CANONICAL NAVIGATION / HANDOFF LAYER — yeni kural üretmez; dersleri özetler.

## Metodolojik dersler (tekrarlayan)

- **Pattern ≠ Binding Rule.** Tek örnek repo-genel invariant değildir; açık yazılı + repo-geneli + ihlalde fail-closed olan bağlayıcıdır.
- **Capability Status ≠ Gap.** Eksik alt-belge (ör. CLIENT-GOVERNANCE) SYS-GOV-010 gereği capability status'tur, otomatik governance gap değildir.
- **Ratification ≠ Merge** (SYS-DEC-002). **Merge ≠ Implementation** (SYS-DEC-003). main'de olmak tek başına authority üretmez.
- **Operational Gate ≠ Workstream.** Operational Gate bir kanıt/karar kapısıdır; iş hattı değildir.
- **Wave Gate ≠ Operational Gate.** Wave Gate bir Wave'in bütününün kapanış koşuludur.
- **Roadmap Blueprint'ten önce gelir.** Blueprint mevcut kararları yeniden üretmez; normalize/consolidate eder.
- **Active task kapanmadan sonraki task açılmaz. Ajan sonraki workstream'i seçmez** (owner seçer).
- **Representative Evidence gerçek kişi verisi gerektirmez.** Sentetik ama hukuken temsilî veri geçerlidir; disposable-DB'de doğrulanır.
- **Shadow result hukuki hüküm değildir** (SHADOW_ONLY sonuç üretir, production write/decision authority değildir).
- **Legal time ≠ objection fact ≠ enforcement capability ≠ UYAP idari teyit.** Finalization / eligibility / administrative confirmation ayrı kavramlardır; birbirinden türetilmez.
- **NotificationQueue hukuki authority değildir** (DEBTOR-GOVERNANCE INV-04; SYS-LEGAL-004). Kanonik hukuki süre `LegalServiceDate` üzerinden yürür (INV-05).
- **AI hukuki/finansal eşik veya kategori İCAT ETMEZ;** fact tahmin etmez; owner yerine karar vermez.
- **Unresolved fact fail-closed kalır.** Gerçek fact yoksa işlem bloke; tahminle doldurulmaz.
- **Küçük ve güvenli patch, büyük refactor'dan önce gelir** (additive-first, en küçük güvenli patch).
- **Canonical main + governance kayıtları sohbet hafızasından ÜSTÜNDÜR.** Bayat working-tree kopyası authority değildir; her görevde yeniden doğrula (AGENTS.md ground-truth kuralı).

## Bu ortamda yaşanan somut dersler (non-canonical historical context)

> Aşağısı bu çalışma ortamının deneyim kaydıdır; **authority değildir**, yalnız navigasyon/uyarı amaçlıdır.

- Dış governance kiti (R0.2), origin/main'in GERÇEK governance'ı okunmadan bayat working-tree kopyasından kuruldu → çakıştı → **NO-GO**. Ders: origin/main'i önce oku.
- Bir CCB-001 ADR referansı eski branch'lerde "ADR-012" numarasıyla anılıyordu; main'de **ADR-012 = WAITING-PROGRESS-POLICY**, CCB-001 = **ADR-014**. Ders: numara/isim referanslarını main'de spot-check et.
- CI watch geçici ağ hatasıyla düşebilir; **ground-truth'tan yeniden doğrula, bypass etme.** 4. required check geç kaydolabilir → mergeState CLEAN olana kadar merge etme.
