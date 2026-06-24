# WP-4a — Permission Tree / Office Role Model: Tasarım (Design Doc)

> **Durum:** Tasarım dökümanı (docs-first). Kod YOK, guard YOK, migration YOK, davranış değişikliği YOK.
> **Amaç:** Mevcut (parçalı) yetkilendirme modelini haritalamak; birleşik bir **Office Role Model + Permission
> Tree** mimarisi önermek; **gated** bir yol haritası çıkarmak. Uygulama yalnız ayrı, onaya-tabi gate'lerde.
> **Yöntem:** 4-boyutlu read-only kod taraması (global-auth · case-level · capability-policy · office-staff),
> 44 varlık + boşluk envanteri. **Ön sürüm:** origin/main `c16dec0`.
> **Anchor:** [`case-responsibility-canonical-model-design.md`](./case-responsibility-canonical-model-design.md).

---

## 1. Kısa hüküm

- **Bugün gerçekte iki yetkilendirme katmanı var:**
  1. **Tenant-scoping** (`JwtAuthGuard` + her sorguya `tenantId` filtresi) — kaba: "giriş yapan kullanıcı kendi
     tenant'ının verisini görür/yazar". Ana ve fiilen TEK genel erişim mekanizması.
  2. **CPE (Case Policy Engine)** — `CpeRequiredGuard` ile belirli yüksek-riskli **aksiyonları** (APPROVE_EXPENSE,
     UYAP_SEND, TRIGGER_HACIZ…) **fact + state + stage** temelli kapılar. **Capability/action-based** (NE yapılabilir),
     **role-based DEĞİL** (KİM yapabilir).
- **Üçüncü bir katman "dekoratif":** `UserRole` (ADMIN/USER/VIEWER), `LawyerRank`, `StaffMember` 8 izin bool'u,
  `CaseLawyer.casePermissions`/`permissionSource`, `CaseStaff.canEdit/canApprove/canView` alanları **saklanıyor ama
  HİÇBİR guard/servis tarafından OKUNMUYOR/UYGULANMIYOR.** Yazılır (UI), ama erişimde tüketilmez.
- **Güvenlik-ilgili sonuç (en kritik bulgu):** Kimliği doğrulanmış herhangi bir tenant kullanıcısı, kendi
  tenant'ındaki **herhangi bir dosyada** personel/avukat atayabilir/çıkarabilir ve CRUD yapabilir; rol/izin alanları
  bunu engellemez. "İmza yetkisi", "finans görebilir", "sadece sorumlu düzenleyebilir" gibi kurallar **enforce edilmiyor.**
- **Tasarım tezi:** CPE'yi YENİDEN İNŞA ETME. Bunun yerine **rol → capability** eşlemesi tanımla (Office Role Model),
  enforcement'ı **mevcut CPE'ye köprüleyen** ince bir guard katmanıyla uygula, ve dekoratif alanların kaderini
  (enforce et / kaldır) açık karara bağla. Her adım küçük + güvenlik/hukuk-gated.

---

## 2. Mevcut durum haritası (current-state)

### 2.1 Katman 1 — Tenant-scoping (gerçek, kaba)
| Varlık | Dosya | Rol | Enforcement |
|---|---|---|---|
| `JwtAuthGuard` | `auth/guards/jwt-auth.guard.ts` | Token doğrula; `request.user`={id,tenantId,email,role} | `@UseGuards(JwtAuthGuard)`; rol KONTROLÜ YOK |
| JWT payload | `auth/strategies/jwt.strategy.ts` | sub/tenantId/email/role taşır | imzalı |
| Tenant scoping (implicit) | tüm controller/service | her `where` + `tenantId` | runtime sorgu filtresi; endpoint'te rol kapısı yok |

### 2.2 Katman 2 — CPE / capability (gerçek, ince, aksiyon-bazlı)
| Varlık | Rol | Enforcement |
|---|---|---|
| `CasePolicyEngine` + `CpeRequiredGuard` | aksiyon (APPROVE_EXPENSE, UYAP_SEND, TRIGGER_HACIZ…) × fact × state × stage kapısı | guard endpoint'i kapar; **gerçek enforcement burada** |
| action-matrix / state-flows | aksiyon → izinli stage + risk + resolverFailureMode | derlenmiş config |
| **Bilinen açıklar** | Lock service TODO (yüksek-risk eşzamanlılık); ClientApproval CPE'ye bağlı değil; ExpenseBlockReason kayıtsız/advisory; APPROVE_EXPENSE state-flow P1 şüphesi | — |

### 2.3 Katman 3 — Rol/izin alanları (DEKORATİF: saklanır, uygulanmaz)
| Varlık | Değerler | Enforcement |
|---|---|---|
| `UserRole` | ADMIN / USER / VIEWER | **YOK** (JWT'de var, guard yok; kayıtta ilk kullanıcı ADMIN hardcode) |
| `LawyerRank` | PARTNER / MANAGER / AUTHORIZED / LAWYER / INTERN | **YOK** (default izinleri "sürer" ama guard yok) |
| `LawyerRole` (legacy) | OWNER / PARTNER / EMPLOYEE / INTERN | deprecated; `lawyerRank` tercih |
| `CaseLawyerRole` | RESPONSIBLE / ASSIGNED / ASSISTANT / INTERN | alan var; erişim kontrolünde kullanılmaz |
| `CaseLawyer.casePermissions` (JSON) + `permissionSource` (DEFAULT/CUSTOM/LOCKED) | serbest JSON | **YOK** (LOCKED bile override'ı engellemez) |
| `StaffType` | YONETICI / YETKILI_AVUKAT / STAJYER_AVUKAT / OFIS_KATIBI / ADLI_KATIP / SEKRETER / MUHASEBE / ARSIV / DIGER | sınıflandırma |
| `StaffMember` izinleri (8 bool) | canCreateCase, canEditCase, canGenerateDocuments, canApproveDocuments, canSeeFinance, canApproveFinance, canSendNotifications, isDefaultForNewCases | **YOK** (hepsi default false; okunmaz) |
| `Lawyer` izinleri | defaultPermissions(JSON) + canSign/canAppearInUyap/canBeResponsible/permissionsLocked/canModifyOtherPermissions | **YOK** (permissionsLocked yalnız UI niyeti) |
| `CaseStaff` izinleri | canEdit / canApprove / canView + `roleOnCase` (serbest string; WP-2c kanonikleştirildi) | **YOK** (yazılır, okunmaz) |

### 2.4 İstisna — gerçek rol-guard'ları (yalnız break-glass/diagnostics)
`InternalOpsGuard`, `DiagnosticsRBACGuard`, `BreakGlassApproverGuard` rol kontrolü YAPAR — ama **yalnız** internal-ops/
diagnostics/break-glass uçlarında, ve rol kaynakları tutarsız (`tenantContext.scopes` vs `user.roles` vs header). Ana
API (case/debtor/client) bunları kullanmaz.

---

## 3. Kritik bulgular (tasarımı yönlendiren)

1. **Enforcement boşluğu (güvenlik):** Katman-3 alanlarının hiçbiri enforce edilmiyor. Tenant içinde yetki ayrımı YOK.
   Bu kasıtlı bir "güven-temelli küçük ofis" modeli olabilir (meşru) — ama **açık karar** gerekiyor, kaza değil.
2. **İki ayrı izin modeli paraleldir:** Lawyer (JSON defaultPermissions + bool'lar) vs StaffMember (ayrı bool'lar) →
   birleşik RBAC deseni yok. CaseLawyer JSON override vs CaseStaff bool override → tutarsız şekil.
3. **CPE doğru ama dar:** Yalnız belirli yüksek-riskli aksiyonları kapsar; genel CRUD (dosya düzenle, taraf ekle) CPE
   dışı ve guard'sız. Permission Tree, CPE'yi GENEL CRUD'a genişletmemeli (patlar) — onun yerine rol→capability köprüsü.
4. **Tek-otorite eksikliği:** `User.role` (global) ile atama-rolleri (CaseLawyer/CaseStaff) ayrı; senkron değil →
   "etkin yetki" hesaplanmıyor.
5. **Temporal kapsam yok:** CaseStaff/CaseLawyer ataması süresiz; start/end tarihi yok (WP-1d temporal çizgisiyle çelişir).
6. **Çözüldü (kod-doğrulaması yapıldı):** `Case.responsibleLawyerId`/`responsibleStaffId` için **DB CHECK VARDIR** —
   migration `20260621020000_m2g1_responsible_person_fks/migration.sql:25`:
   `CHECK (NOT ("responsibleLawyerId" IS NOT NULL AND "responsibleStaffId" IS NOT NULL))` (ikisi birden dolu olamaz;
   ikisi de NULL olabilir). Haritalama ajanının "CHECK yok" bulgusu **YANLIŞ**tı; önceki notlar doğruydu. (Ders:
   ajan iddiası migration SQL'den doğrulanmadan kesin kabul edilmez — [[verify-live-not-just-code]].)

---

## 4. Tasarım ilkeleri

1. **CPE'yi yeniden inşa etme; köprüle.** Rol → capability eşlemesi, aksiyon enforcement'ı için CPE'yi besler.
2. **Tek "etkin yetki" otoritesi.** Office Role (kişi düzeyi) + Case assignment (dosya düzeyi override) → tek
   `resolveEffectivePermissions(user, case)` read-model. Çift-otorite yok.
3. **Önce read-model, sonra enforcement.** Etkin yetkiyi HESAPLA + GÖSTER (read-only) → sonra warn → sonra block
   (WP-3a deseniyle uyumlu: warn-first → block-later).
4. **Dekoratif alanlar: enforce ET ya da KALDIR.** Saklanan-ama-okunmayan alanlar yanıltıcı; her biri için açık karar.
5. **Tenant-scoping korunur** (taban). Permission Tree onun ÜSTÜNE incelik ekler, onu değiştirmez.
6. **Temporal-uyumlu.** Atamalara opsiyonel geçerlilik aralığı (WP-1d temporal sorumlulukla hizalı) — ayrı karar.
7. **K1 köprüsü zorunlu değil ama gerekli.** Enforcement, User↔Lawyer/StaffMember bağını gerektirir; eksikse
   davranış (fail-open mu, deny mi) açık tanımlanır.

---

## 5. Önerilen model (Office Role Model + Permission Tree)

- **Capability (yaprak):** atomik yetki (ör. `CASE_EDIT`, `PARTY_ASSIGN`, `FINANCE_VIEW`, `DOCUMENT_APPROVE`,
  `EXPENSE_APPROVE`). CPE aksiyonlarıyla eşlenir.
- **Office Role (düğüm):** capability kümesi (PARTNER → tümü; MANAGER → geniş; AUTHORIZED/LAWYER → ofis-default;
  INTERN → kısıtlı; staff tipleri → muhasebe/katip/sekreter capability alt-kümeleri). `LawyerRank` + `StaffType`
  bunun girdisi; çıktı tek capability seti.
- **Case override (dal):** `CaseLawyerRole`/`CaseStaff` belirli dosyada capability ekler/kısar (CUSTOM); `LOCKED`
  override'ı gerçekten engeller (bugün engellemiyor).
- **Effective = OfficeRole(caps) ∘ CaseOverride ∘ (gelecekte) temporal-aralık.** Tek read-model.
- **Enforcement köprüsü:** genel CRUD için ince guard `effective.has(CAPABILITY)`; yüksek-riskli aksiyonlar zaten
  CPE'de → guard CPE'yi tetikler, capability'yi fact olarak besler.

---

## 6. Gated yol haritası (her biri ayrı, onaya-tabi)

- **WP-4a (bu doc):** tasarım + current-state + kararlar. **Kod yok.**
- **WP-4b — Enforcement kararı (ürün/güvenlik-gated):** "Tenant içinde yetki ayrımı istiyor muyuz, yoksa güven-temelli
  düz model mi?" Bu cevap olmadan kod başlamaz.
- **WP-4c — Effective-permission read-model (read-only):** `resolveEffectivePermissions` + salt-okuma "Bu kullanıcı bu
  dosyada ne yapabilir?" görünümü. Enforcement YOK (sadece hesapla+göster).
- **WP-4d — Warn-first guard:** ince guard capability eksikse UYARIR + audit (block etmez).
- **WP-4e — Block-later guard:** seçili capability'lerde gerçek 403 (CPE'ye köprülü).
- **WP-4f — Dekoratif alan temizliği:** enforce edilmeyecek alanları kaldır/migrate; legacy `LawyerRole`/çift-izin-modeli
  birleştir.
- **(paralel/bağımsız) Temporal kapsam:** atama geçerlilik aralığı — WP-1d temporal hattıyla hizalı, ayrı karar.

---

## 7. Açık kararlar (kullanıcının/Av.'nin vereceği)

1. **Enforcement felsefesi:** tenant-içi yetki ayrımı (RBAC) mı, yoksa kasıtlı güven-temelli düz model mi? (WP-4b ön-koşulu)
2. **Dekoratif alanlar:** enforce mi, kaldır mı? (her biri: UserRole, StaffMember 8 bool, Lawyer/CaseLawyer JSON, CaseStaff bool)
3. **"Sadece sorumlu düzenleyebilir" kuralı** isteniyor mu? (`CaseLawyer.isResponsible` / operasyon owner enforce edilsin mi?)
4. **Temporal kapsam:** atamalara geçerlilik aralığı eklensin mi?
5. **Plan-based limit:** `Tenant.plan` (FREE/PRO/ENTERPRISE) endpoint kısıtına bağlansın mı? (bugün bağlı değil)
6. **Rol kaynağı tutarlılığı:** break-glass/diagnostics guard'larının farklı rol kaynaklarını birleştirelim mi?

---

## 8. Kapsam dışı (non-goals)

- Kod / guard / migration / schema / davranış değişikliği (bu PR yalnız tasarım dökümanı).
- CPE'nin yeniden yazımı (köprülenir, değiştirilmez).
- Temporal sorumluluk UI (WP-1d) ve reports/task/staff terminolojisi.
- Break-glass/diagnostics guard mimarisi (yalnız tutarlılık notu).

## 9. Kod-doğrulaması (çözüldü)

- `Case.responsibleLawyerId XOR responsibleStaffId` DB CHECK'i **VAR** (migration `20260621020000:25`). §3.6'ya bakınız.
  Yani "ikisi birden dolu" şema düzeyinde zaten engelli; enforcement tasarımı bunu güvenle varsayabilir.
