# Yetki, Görevlendirme, Sorumluluk ve Audit Modeli — Kanonik Tasarım

> **Teknik ad:** Authorization · Assignment · Responsibility · Audit Framework
> **Tür:** docs-only mimari/karar sayfası (P0). **Kod yok; her uygulama fazı ayrı gate + açık onay.**
> **Tarih:** 2026-06-25 · **Yöntem:** 9-altsistem grounded map (gerçek koda karşı, kanıtlı) + hibrit uzlaşma.
> **Hibrit uzlaşma:** *Kavram sözlüğü/çerçeve* ürün analizinden; *uygulama stratejisi* kod gerçekliğinden.
>
> **🔁 NİHAİLEŞTİRME (2026-06-26):** Bu P0 sayfası gerçek-durum haritası + 9-altsistem forensic'i için
> referanstır; ancak **nihai uygulama stratejisi** (özellikle §1 "Case-Scoped Permission Enforcement v1 /
> warn-only→hard-enforce") [`yetki-agaci-guided-open-final.md`](./yetki-agaci-guided-open-final.md) ile
> **revize edilmiştir.** Çelişki halinde **son kaynak = guided-open-final** (Guided-Open + Guarded Edges).

---

## §0. Bu sayfa nedir + kapsam

- Legal Responsibility (kurulu altyapı) + bilinçli ertelenmiş WP-4 (full RBAC) çizgilerini **tek kanonik omurgada** birleştirir.
- **Greenfield değiliz:** omurganın embriyosu kurulu. Bu sayfa "yeni framework kur" değil, **"mevcut dağınık modeli tek karar noktasında topla ve enforce et"** sayfasıdır.
- **WP-4z closure ilkesi korunur:** "operasyonel yetki devredilebilir; hukuki sıfat devredilemez." Bu sayfa onu **uygular**, ezmez.
- **K1 = EVET:** Sistem **15 gerçek kullanıcı** ile çalışıyor (+7 test hesabı). Çok-kullanıcılı yetki ihtiyacı **kanıtlandı** → WP-4z'nin P1 (enforcement) üzerindeki "ihtiyaç-gated" kilidi **açıldı.** Ama bu, **big-bang Full RBAC** demek değil; **forensic-first, dar enforcement** demek.

---

## §1. Final karar (hibrit) + isimlendirme

**İlk uygulanacak ürün Full RBAC v1 DEĞİL.** İlk gerçek teslimat:

```
Case-Scoped Permission Enforcement v1  +  Capacity Hard-Limit  +  Audit-backed Responsibility Model
```

Tek cümle: **Önce mevcut yetki kutularını gerçekten enforce edilen yetkiye çeviririz; sonra katalog büyütürüz.**

- **Modül adı:** Kanonik Yetki–Sorumluluk–Audit Omurgası (≠ "Full RBAC").
- **İlk teslimat adı:** `P1 — Case-Scoped Permission Enforcement Forensic` (read-only).

---

## §2. Kavram sözlüğü (6 kavram → gerçek model)

| Kavram | Soru | Gerçek kod karşılığı (VAR) |
|---|---|---|
| Mesleki sıfat | Kişi mesleken ne? | `Lawyer` (avukat) / `StaffMember.staffType` (personel) |
| Büro rolü | Büroda genel konumu? | `Lawyer.lawyerRank` + `Office.escalation*LawyerIds[]` |
| Dosya rolü | Bu dosyada pozisyonu? | `CaseLawyer.role` / `CaseStaff.roleOnCase` |
| Yetki | Ne **yapabilir**? | `CaseLawyer.casePermissions` / `CaseStaff.can*` |
| Sorumluluk | Sonuçtan kim hesap verir? | `Case.responsible*` (operasyon) + `CaseLawyer.isResponsible` (hukuki) |
| Bildirim | Kim haber alır? (**≠yetki**) | `CaseLawyer/CaseStaff.receiveNotifications` |
| Audit | Kim/ne zaman/ne yaptı? | `AuditLog` + ResponsibilityHistory/Temporal servisleri |

**Kural:** Bunlar aynı eksen değil; tek modelin ayrı projeksiyonları. Karıştırma = çamur.

---

## §3. Mevcut durum haritası (kanıtlı; var / kısmi / eksik)

**Kimlik & taksonomi:** `User` (UserRole ADMIN/USER/VIEWER) + K1 `@unique` köprü → `Lawyer.userId` / `StaffMember.userId`. `Lawyer.lawyerRank` (PARTNER/MANAGER/AUTHORIZED/LAWYER/INTERN). `StaffMember.staffType` (STAJYER_AVUKAT/OFIS_KATIBI/ADLI_KATIP/SEKRETER/MUHASEBE/ARSIV/DIGER). → User+Lawyer+StaffMember zaten Person/OfficeMember/ProfessionalCapacity'yi karşılıyor; **ayrı Person modeli açma.**

**Sorumluluk (2 eksen — en güçlü kısım, KORU):**
- Operasyon: `Case.responsibleLawyerId` XOR `responsibleStaffId`. DB CHECK = "ikisi-birden-yasak" (migration `20260621020000`); exactly-one app-katmanı; ikisi-de-null meşru (sahipsiz dosya). Kanonik yazı: `PATCH /cases/:id/responsible-person` → `OPERATION_OWNER` audit.
- Hukuki: `CaseLawyer.isResponsible ⇔ role==='RESPONSIBLE'`. DB **partial-UNIQUE** index (migration `20260619000000`, raw SQL — Prisma ifade edemediği için schema.prisma'da yok ama DB'de **var**) = en-fazla-1. Kanonik yazı: `PATCH /cases/:id/legal-responsible-lawyer` (ADMIN hard-guard + reason + 409 + clear-before-set `$tx` + `LEGAL_RESPONSIBLE_LAWYER_CHANGED` audit). Lifecycle guard L3/L4/L5 + touchesResponsibleAxis = sessiz değişim yasak.
- **Borç:** `Case.sorumluPersonelId` (legacy User) history'de izlenmiyor → deprecate + UI'dan çıkar.

**Yetki (embriyo var, ASİMETRİK):**
- Avukat: `Lawyer.defaultPermissions` (Json, büro default) + `permissionsLocked/By/At` + `CaseLawyer.casePermissions` (Json 7 anahtar) + `permissionSource` (DEFAULT/CUSTOM/LOCKED) + `hasSignatureAuthority` + `receiveNotifications`.
- Personel: `StaffMember` 9 büro-boolean + `CaseStaff` 4 boolean (canEdit/canApprove/canView/receiveNotifications).
- **Asimetri:** Staff'ta casePermissions Json yok · permissionSource yok · lock yok · rank yok · roleOnCase serbest String.
- **Orphan:** `Lawyer.defaultPermissions` case-create'te uygulanmıyor; lock alanları enforce edilmiyor.

**Drawer:** Lawyer drawer tam (rol seçici + 7 checkbox + imza + bildirim → `PATCH .../lawyers/:id`, permissionSource=CUSTOM). Effective-permission önceliği **yalnız frontend'de** (casePermissions > defaultPermissions > hepsi-true); backend resolver yok. Staff drawer 3 checkbox; UI'da "permissionSource" başlığı geçiyor ama model alanı yok = hayalet.

**Büro Ayarları:** `Office` modeli (escalation*LawyerIds[] + opStaffTypes[] + op*Days + kanallar) + CRUD `GET/PUT /office/escalation-settings` = backend **var.** ⚠️ Web `SettingsPage.tsx` localStorage-only, `/office`'e bağlı **değil** = wiring gap (kullanıcı kaydettiğini sanıyor, DB'ye gitmiyor). ⚠️ `opStaffTypes` case-open default'unda yok sayılıyor.

**Task/escalation:** 2 disjoint motor (operasyonel always-on; case-task `CASE_TASK_ESCALATION_ENABLED` flag'li) + append-only event tabloları + retry-safe. Mimari doğru, KORU.

**Enforcement (gerçek açık):** Gerçek enforce edilen = PermissionHardGuardService bridge (cases.delete + legal-responsible ADMIN-only) · credential ADMIN (SMTP/SMS) · CpeRequiredGuard + `@CpeRequired` (APPROVE_EXPENSE, RECORD_COLLECTION = 2 finans op) · warn-only diagnostics (3 read). **170 endpoint'in 140'ı TENANT_ONLY (per-user enforcement yok); casePermissions/CaseStaff.can*/defaultPermissions/permissionsLocked DB'de saklanıyor ama erişimde kontrol EDİLMİYOR = dekoratif.** → Drawer checkbox'ları bugün büyük ölçüde tiyatro.

---

## §4. Yapıcı eleştiri uzlaşması (kim ne kadar haklı)

| Konu | Çerçeve (ürün analizi) | Strateji (kod) | Final |
|---|---|---|---|
| 3 ekran tek omurga | önerdi | gerçeğe bağladı | **Benimse** |
| Kavram ayrımı (6) | önerdi | model eşlemesiyle doğruladı | **Benimse** |
| Full RBAC / ReBAC / ABAC | geniş önerdi | "şimdi fazla" | **Dar başla** |
| Geniş A–K katalog | önerdi | "50+ yaprak tiyatro" | **v1'de reddet** |
| Asıl açık | kavramsal model | **enforcement** | **Enforcement** |
| Hard-limit | kavramsal | kodda `capacity hard-deny` | **Benimse** |
| Audit | geniş yeni event-store | mevcut AuditLog'u genişlet | **AuditLog genişlet** |
| Frontend otoritesi | drawer/accordion | **otorite backend resolver** | **Backend resolver** |

> Özet: çerçeve "olması gereken ideal domain"; strateji "bu kod tabanında en az kırarak nasıl". Final = stratejinin minimal enforcement'ı üzerine çerçevenin kavram ayrımı.

---

## §5. Kanonik omurga (mevcut modellere eşlenmiş — yeni icat yok)

```
Office Policy → Case Team → Case Role → Effective Permission → Action → Audit Log → Responsibility History
(Büro politikası → Dosya ekibi → Dosya içi rol → Efektif yetki → İşlem → Audit log → Sorumluluk geçmişi)
```

| Analiz kavramı | Kanonik gerçek (kullan) | Yeni aç? |
|---|---|---|
| Person/OfficeMember | User + K1 → Lawyer/StaffMember | Hayır |
| ProfessionalCapacity | Lawyer · StaffMember.staffType | Hayır |
| OfficeRole | Lawyer.lawyerRank + Office.*LawyerIds[] | Sonra normalize (gate) |
| CaseTeamMember+CaseRole | CaseLawyer.role · CaseStaff.roleOnCase | Hayır |
| CasePermissionGrant | CaseLawyer.casePermissions | Hayır (staff'a P5) |
| ResponsibilityAssignment | Case.responsible* + CaseLawyer.isResponsible (state) + AuditLog (zaman) | Hayır |
| PermissionCatalog/Template | yok | Hayır (ihtiyaç-gated P7) |
| EscalationPolicy | Office config + Task state + 2 event tablo | Hayır |
| NotificationSubscription | receiveNotifications + opStaffTypes | Hayır |
| Audit Event Stream | AuditLog + History/Temporal servisleri | Hayır |
| Effective-Permission Engine | (frontend 3-katman var; backend P2) | Küçük, gerçek-set |

---

## §6. 3 ekran = tek modelin projeksiyonu

| Ekran | Kanonik kaynak | Yazar mı? |
|---|---|---|
| Büro Ayarları | Office (policy: assignment/escalation/notif) | policy (web WIRING eksik) |
| Dosya Ekibi + Sorumluluk Geçmişi | CaseLawyer/CaseStaff + Case.responsible* + AuditLog | üyelik + audit-OKUMA (salt-okuma geçmiş) |
| Dosya Yetkileri Drawer | CaseLawyer.casePermissions (+staff P5) | case-grant yazar; **efektif yetkiyi resolver'dan GÖSTERİR** |

**Kural:** Hiçbir ekran kendi ayrı verisini tutmaz. Drawer artık "ham checkbox" değil; resolver sonucunu + kaynağı (hard-limit/grant/default) gösterir, capacity-deny ise kutu disabled + "mesleki kısıt nedeniyle bu yetki verilemez" açıklaması.

---

## §7. Yönetici ilke + 10 kural

**Yönetici ilke:** *Efektif yetki = (mesleki sıfatın izin verdiği) ∩ (dosya rolü/grant'in verdiği), mesleki/hukuki HARD-LIMIT ile tavanlanır — bu tavanı admin bile aşamaz.*

1. Büro Ayarları policy üretir; dosya yetkisi değildir.
2. Dosya Ekibi membership + responsibility gösterir; permission kararı değildir.
3. Drawer case-grant yazar; effective permission kararını **backend resolver** verir.
4. Frontend hiçbir zaman yetki otoritesi değildir.
5. Hard-limit admin tarafından ezilemez.
6. Case-grant yalnız hard-limit tavanının altında çalışır (Grant > Capacity olamaz).
7. Sorumluluk ve yetki ayrı eksendir.
8. Bildirim yetki değildir.
9. Permission değişimi de AuditLog'a yazılır.
10. Katalog büyütme, enforcement'tan sonra gelir.

---

## §8. Effective-Permission Resolver (kalp)

**Yeni engine icat etme;** mevcut `CasePolicyEngine / ActionCode / CpeRequiredGuard` omurgasını genişlet. `casePermissions` anahtarları `ActionCode` yapraklarına eşlenir (bkz §10). Tek karar noktası:

```
resolve(person, caseId, action) -> ALLOW | DENY(reason):
  1. cap := capacityOf(person)                       # lawyerRank | staffType
  2. if CAPACITY_HARD_DENY[cap] ∋ action: DENY("capacity")        # admin EZEMEZ
  3. member := caseMemberOf(person, caseId)           # CaseLawyer | CaseStaff | yok
     if yok: if action ∈ OFFICE_WIDE_OK: devam ; else DENY("dosyada değil")
  4. grant := member.casePermissions[action] (avukat) | member.can*[action] (staff)
     if grant explicit: return grant ? ALLOW : DENY("case-grant")
  5. officeDefault := defaultPermissionsOf(person)[action]
     if explicit: return officeDefault ? ALLOW : DENY("office-default")
  6. return SYSTEM_DEFAULT(action)   # high-risk=DENY · low-risk-read=allow-within-tenant
```

**Precedence = 3 katman** (Hard-Limit > Case-Grant > Office-Default > System-Default). Analizdeki 6-katman **reddedildi** ("deny" ve "case-role→permission" tier'larının şemada dayanağı yok). **Otorite backend'dir;** frontend'deki mevcut 3-katman yalnız görünüm kalır.

---

## §9. Capacity Hard-Limit (kod-invariant) + matris v1

Hard-limit'ler **kodda** `const CAPACITY_HARD_DENY: Record<Capacity, ActionCode[]>` olarak tutulur, **DB'de yapılandırılamaz** — çünkü bunlar büro tercihi değil, mesleki/hukuki invariant. (Mevcut `permissionsLocked` bunun dar halidir.) **Admin olmak mesleki sıfatı değiştirmez.**

**Matris v1 (taslak — hukuki nihai onay senden):**

| Capacity | Asla yapamaz (efektif DENY, grant açsa bile) |
|---|---|
| **Stajyer Avukat / INTERN** | İmza · nihai evrak onayı · hukuki sorumlu olma · resmî gönderim onayı · finans onayı · nihai statü değiştirme · yetki ver/kaldır |
| **Sekreter / Ofis Kâtibi** | Hukuki statü değiştirme · hukuki sorumlu atama · imza · UYAP resmî gönderim · finans onayı · toplu export · dosya silme/imha |
| **Adli Kâtip / Takip Personeli** | Hukuki sorumlu olma · imza · nihai hukuki onay · finans onayı · yetki yönetimi · sorumluluk atama |
| **Muhasebe** | Hukuki statü değiştirme · taraf/hukuki veri değiştirme · UYAP resmî işlem · hukuki sorumlu olma · imza · sorumluluk atama |
| **Arşiv** | Aktif dosya statüsü değiştirme · hukuki işlem · finans işlem · imza · export · silme/imha onayı |
| **Avukat (LAWYER+)** | Dosya grant'i yoksa high-risk yapamaz; hukuki sorumlu olmak için `canBeResponsible` (alan zaten var) gerekir |
| **Yönetici / Ortak / Kurucu** | Hard-limit'i aşamaz; avukat capacity'si içinde override/onay yetkisi olabilir |

---

## §10. Yetki yaprakları v1 (ActionCode) + v2 adayları (gated)

**v1 avukat** (mevcut casePermissions → ActionCode): `EDIT_CASE` · `GENERATE_DOC` · `SYNC_UYAP` · `VIEW_FINANCE` · `EDIT_FINANCE` · `CHANGE_STATUS` · `EDIT_PARTIES` · `SIGN` (+ `RECEIVE_NOTIFICATION`, ayrı eksen).

**v1 personel** (mevcut CaseStaff): `VIEW_CASE` · `EDIT_CASE_LIMITED` · `APPROVE_TASK_OR_STEP` (+ `RECEIVE_NOTIFICATION`). (Asimetri P5'te kapatılır.)

**v2 adayları (hemen açma — enforce edilen ihtiyaç çıkınca):** `UYAP_SEND` · `APPROVE_FINAL_DOCUMENT` · `APPROVE_CLIENT_SEND` · `APPROVE_OFFICIAL_SEND` · `EXPORT_CASE` · `EXPORT_BULK` · `ASSIGN_TASK` · `ASSIGN_LEGAL_RESPONSIBLE` · `ASSIGN_OPERATION_RESPONSIBLE` · `CLOSE_CASE` · `ARCHIVE_CASE` · `REQUEST_DELETE_DOCUMENT` · `APPROVE_DELETE_DOCUMENT`.

**Anti-desen:** 50+ maddelik katalogu önceden açma. Yaprak = gerçek bir enforce-edilen ihtiyaç doğunca eklenir.

---

## §11. Sorumluluk mimarisi (koru + 1 borç kapat)

İki eksen + audit + temporal(asOf) + DB garantileri **zaten doğru**, koru. Tek borç: `Case.sorumluPersonelId` legacy alanını resmen deprecate et + UI'dan çıkar. Yetki değişimlerini de aynı event-stream desenine bağla (§13).

---

## §12. Atama & escalation

Mevcut mimari (Office policy → 2 disjoint motor → append-only event + retry-safe) **doğru, koru.** Borçlar: (a) web Büro Ayarları'nı `/office`'e bağla [R3], (b) `opStaffTypes`'ı case-open default'una uygula [R7], (c) case-task motor flag garantisi [R5], (d) "ilk sahip" default-assignee politikası.

---

## §13. Audit (mevcut AuditLog genişletme — yeni store yok)

Zorunlu event tipleri (mevcut `AuditLog`'a eklenir): `CASE_PERMISSION_GRANTED` · `CASE_PERMISSION_REVOKED` · `CASE_PERMISSION_LOCKED/UNLOCKED` · `SIGNATURE_AUTHORITY_GRANTED/REVOKED` · `LEGAL_RESPONSIBLE_CHANGED` (var) · `OPERATION_RESPONSIBLE_CHANGED` · `CASE_TEAM_MEMBER_ADDED/REMOVED` · `CASE_ROLE_CHANGED` · `PERMISSION_WOULD_DENY` (var) · `PERMISSION_DENIED` (var).

Her event min. alan: `event_id, actor_user_id, target_user_id, case_id, action_code, old_value, new_value, decision_source, reason_code, work_note_id?, created_at, ip/session`. **`decision_source` ∈ {HARD_LIMIT, CASE_GRANT, OFFICE_DEFAULT, SYSTEM_DEFAULT, ADMIN_OVERRIDE}.**

---

## §14. Enforcement mimarisi (15 kullanıcı gerçeği)

140 ucu birden deny-by-default yapmak büroyu kırar. Pragmatik mimari:
1. **HIGH-RISK ActionCode seti** tanımla.
2. Bu set için **önce warn-only** (`PERMISSION_WOULD_DENY` — zaten var, wp4d) → kimin reddedileceğini **canlı ölç**, akışı kırmadan.
3. Ölçüm temiz → **hard-enforce** (gerçek 403, wp4e).
4. Low-risk (görüntüle/taslak): başta allow-within-tenant; zamanla daralt.

Tenant-izolasyonu (bürolar arası) zaten güvenli; eklenen = büro-içi per-kullanıcı otorite.

---

## §15. Test kullanıcıları

7 test + 15 gerçek karışık. Enforcement/bildirim açılınca test hesapları gürültü. `isTest`/`isSeed` (veya `isActive`) bayrağıyla: enforcement impact + escalation + bildirim **kapsamından dışla**, audit'te test işaretle. (SB-009 ile birleşir; P6 civarı.)

---

## §16. Faz planı (locked — her faz ayrı gate + onay + test)

| Faz | İçerik | Kod? |
|---|---|---|
| **P0** | Bu sayfa (K1=EVET + hibrit uzlaşma) | docs-only ✅ bu PR |
| **P1** | **Forensic-first enforcement planı** (8 çıktı, §17) | read-only, kod yok |
| **P2** | `EffectivePermissionResolver` + ActionCode mapping + `PERMISSION_WOULD_DENY` + drawer'da efektif-yetki kaynağı gösterimi | kod, **enforce yok** (gözlem) |
| **P3** | Hard-limit hard-enforce (ilk gerçek 403): SIGN · APPROVE_FINAL_DOCUMENT · UYAP_SEND · ASSIGN_LEGAL/OPERATION_RESPONSIBLE · APPROVE_FINANCE · DELETE_CASE · EXPORT_BULK | kod |
| **P4** | High-risk hard-enforce (warn-only temiz sonra): CHANGE_STATUS · EDIT_PARTIES · EDIT_FINANCE · EXPORT_CASE · DELETE_DOCUMENT · CLOSE_CASE · ARCHIVE_CASE | kod |
| **P5** | Staff simetrisi: CaseStaff.casePermissions/permissionSource/lock + roleOnCase enum | kod |
| **P6** | Office Settings wiring (localStorage→/office) + opStaffTypes default + sorumluPersonelId deprecate + test-user ayıklama | kod |
| **P7** | (ihtiyaç-gated) geniş katalog · PermissionCatalog/Template · role-template UI · ReBAC/ABAC normalize | gate |

**Sıra mantığı:** önce KARAR motoru (gözlem) → yüksek-risk enforce → genişle. "Önce katalog" anti-deseninin tersi.

---

## §17. İlk iş: P1 — Case-Scoped Permission Enforcement Forensic (read-only)

**Kod yok. Çıktı 8 başlık:**
1. TENANT_ONLY endpoint listesi (140) — kanıtlı.
2. Endpoint → ActionCode eşleme önerisi.
3. High-risk endpoint sıralaması (15 kullanıcı kötüye-kullanım senaryosu).
4. Hangi endpoint hangi permission yaprağına bağlanacak.
5. Hangi capacity hard-limit hangi endpoint'i kapatacak (§9 matrisine bağlı).
6. Mevcut 15 kullanıcıda **would-deny** etkisi (kim, nerede kırılır).
7. Test kullanıcılarının ayıklanması gereken yerler.
8. İlk hard-enforce adayları (P3 girdisi).

---

## §18. Kararlar (senin — mimariyi kilitler)

- **D1:** §9 hard-limit matrisinin hukuki nihai onayı (hangi sıfat → hangi aksiyon yasak).
- **D2:** P3 ilk hard-enforce seti (gerçek 403 üretecek ilk aksiyonlar).
- **D3:** Low-risk default — başta allow-within-tenant mı, daha sıkı mı?
- **D4:** Sıra — önce P2 resolver çekirdeği mi, yoksa P6 Settings wiring (görünür/küçük kazanım) mı? (İkisi de meşru ilk-kod-adım.)

---

## §19. Non-goals (açılmayacaklar — korunur)

Full RBAC/permission-store/role-template-UI (ihtiyaç-gated P7) · ReBAC/ABAC engine · yeni Person/Catalog/Template/Grant/Subscription/EventStore tabloları · Codex domain (NAFAKA/scheduler/DueType/balance/tahsil/allocation) · açık PR alanları.

---

> **Hüküm:** Eksik olan "yeni model" değil, **tek karar motoru + onu zorlayan kapı**. Motoru CPE/ActionCode üzerine kur, capacity hard-limit'i kodda tut, casePermissions'ı ActionCode'a bağlayıp tiyatroyu gerçek yetkiye çevir, warn-only→hard fazlamasıyla 15 kullanıcıyı kırmadan geç. Analizin ~%70'i zaten kurulu; kalan ~%30 = enforcement çekirdeği + staff simetri + hard-limit. **İlk iş: P1 forensic (read-only).**
