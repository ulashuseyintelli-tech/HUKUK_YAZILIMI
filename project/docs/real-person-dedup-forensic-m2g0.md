# M2-G0 — Gerçek Kişi Dedup Forensic + Plan

> Durum: **FORENSIC TAMAM — execution (silme/merge) ONAY BEKLİYOR.** Kod yok, veri-mutasyonu yok.
> Tarih: 2026-06-21 · Repo HEAD: `d709177` · Tenant: `cmm61v99600007a6smfkarha9` (admin@hukuk.com, gerçek çalışan tenant)
> Hazırlayan: agent (canlı DB read-only) · Üst tasarım: [`real-person-case-responsibility-design.md`](./real-person-case-responsibility-design.md)

---

## 0. Özet

Model-2 picker'ı gerçek kişileri listeleyecek; ama `Lawyer`/`StaffMember` verisi
**kirli** (duplikasyon + QA/test kayıtları). Bu forensic, picker açılmadan önce
yapılacak temizliğin **planını** çıkarır. **İyi haber: tüm duplikatların FK
referansı = 0**, referanslı kayıtlar zaten canonical → silme **düşük riskli**,
FK repoint **gerekmiyor**.

**Kapsam:** Tüm `Lawyer` (9) ve `StaffMember` (10) kayıtlarının **tamamı** bu tek
tenant'ta. Başka tenant'larda gerçek kişi yok.

**Referans yüzeyi (merge-risk boyutu):**
`Lawyer` ← `CaseLawyer.lawyerId`, `PowerOfAttorney.lawyerId`, `PoaLawyer.lawyerId` ·
`StaffMember` ← `CaseStaff.staffMemberId`.
**Yumuşak referans (FK değil, silmeden önce KONTROL):** `Office.escalationTeamLeadLawyerIds`,
`escalationManagerLawyerIds`, `escalationFounderLawyerIds` (String[] lawyer-id dizileri).

---

## 1. LAWYER — kümeler, canonical öneri, risk

| Küme | Kayıt (id son-6) | staffType/title | createdAt | FK ref | Sınıf | Öneri |
|------|------------------|-----------------|-----------|--------|-------|-------|
| **Ulaş Hüseyin Telli** | `j5qm45` ULAŞ HÜSEYİN TELLİ | (no-title) | 06-14 | **PoaL=1** | gerçek | ✅ **CANONICAL** (en eski + referanslı) |
| | `45a3n6` Ulaş hüseyin telli | (no-title) | 06-16 | 0 | gerçek-dup | 🗑 sil |
| | `eu3fy0` ulaş hüseyin telli | (no-title) | 06-16 | 0 | gerçek-dup | 🗑 sil |
| | `w76uq2` ulaş hüseyin telli | (no-title) | 06-16 | 0 | gerçek-dup | 🗑 sil |
| | `a51k09` ulaş  telli | (no-title) | 06-16 | 0 | gerçek-dup (kısa varyant) | 🗑 sil |
| **Ege Durusoy** | `mmg48u` EGE DURUSOY | (no-title) | 06-15 | 0 | gerçek | ✅ **CANONICAL** (düzgün-yazım, en eski) |
| | `bqg59w` ege  durusoy | (no-title) | 06-16 | 0 | gerçek-dup | 🗑 sil |
| **Fatma Uluca Telli** | `6us1xi` FATMA ULUCA TELLİ | (no-title) | 06-14 | **PoaL=1** | gerçek | ✅ **CANONICAL** (tekil + referanslı) |
| **Şakir Fettahoğlu** | `zckcui` Şakir Fettahoğlu | (no-title) | 06-15 | 0 | gerçek | ✅ **CANONICAL** (tekil) |

**Lawyer sonucu:** 4 canonical (Ulaş `j5qm45`, Fatma `6us1xi`, Ege `mmg48u`, Şakir `zckcui`) · 5 silinecek dup (hepsi ref=0).

---

## 2. STAFF — kümeler, canonical öneri, risk

| Küme | Kayıt (id son-6) | staffType | createdAt | FK ref | Sınıf | Öneri |
|------|------------------|-----------|-----------|--------|-------|-------|
| **Fatih Engin** | `mm0cgb` Fatih  engin | MUHASEBE | 06-14 | 0 | gerçek | ✅ **CANONICAL** (doğru tip + en eski) |
| | `k5z3p9` fatih engin | DIGER | 06-16 | 0 | gerçek-dup (tip yanlış) | 🗑 sil |
| | `t4d71l` fatih  engir | DIGER | 06-16 | 0 | gerçek-dup (**"engir" yazım hatası**) | 🗑 sil |
| | `immg61` Fatih Engin QA1781636570015 | DIGER | 06-16 | 0 | **QA/test** | 🗑 sil |
| | `5r6euy` Fatih Engin QA1781636570015 | DIGER | 06-16 | 0 | **QA/test** | 🗑 sil |
| **Büşra Atmaca** | `b6gpfw` Büşra Atmaca | SEKRETER | 06-15 | 0 | gerçek | ✅ **CANONICAL** (doğru tip + düzgün-yazım) |
| | `c4di80` büşra  atmaca | DIGER | 06-16 | 0 | gerçek-dup (tip yanlış) | 🗑 sil |
| **Aysu Aktay** | `wm7y84` Aysu Aktay | STAJYER_AVUKAT | 06-15 | 0 | gerçek | ✅ **CANONICAL** (tekil) |
| **(QA/test)** | `9gy5zq` KesinS Test QA1781636570015 | DIGER | 06-16 | 0 | **QA/test** | 🗑 sil |
| | `27yvrz` RFA010S Stf | DIGER | 06-17 | 0 | **QA/test** | 🗑 sil |

**Staff sonucu:** 3 canonical (Fatih `mm0cgb`, Büşra `b6gpfw`, Aysu `wm7y84`) · 3 gerçek-dup + 4 QA/test silinecek.

---

## 3. Picker'a girebilecek aktif kişiler (dedup sonrası)

Toplam **7 gerçek kişi** (4 avukat + 3 personel):

```text
AVUKAT (Lawyer):
  Ulaş Hüseyin Telli   (id …j5qm45)   title YOK → M2-G3'te "Av." atanmalı
  Fatma Uluca Telli    (id …6us1xi)   title YOK → "Av."
  Ege Durusoy          (id …mmg48u)   title YOK → "Av." (?)
  Şakir Fettahoğlu     (id …zckcui)   title YOK → "Av." (?)
PERSONEL (StaffMember):
  Fatih Engin          (id …mm0cgb)   MUHASEBE
  Büşra Atmaca         (id …b6gpfw)   SEKRETER
  Aysu Aktay           (id …wm7y84)   STAJYER_AVUKAT
```

⚠️ **Tüm 19 kaydın `userId`'si NULL** (K1 köprüsü %0). Yani Model-2'de bu kişiler
login'siz sahip olur; Task.assignee dual-path'in **"User yok"** kolunu kullanır.
⚠️ Avukatların hiçbirinde `title` yok → picker etiketi ("Av. …") M2-G3'te title
atama / role-türev mantığı gerektirir.

---

## 4. Merge-risk değerlendirmesi

- **Düşük risk.** Silinecek 12 kaydın **hepsi FK ref = 0** → repoint gerekmez, doğrudan silinebilir.
- Referanslı tek kayıtlar (Ulaş `j5qm45` PoaL=1, Fatma `6us1xi` PoaL=1) **zaten canonical** → silinmez, dokunulmaz.
- **Silmeden önce ZORUNLU kontrol (yumuşak referans):** silinecek lawyer id'leri
  `Office.escalationTeamLeadLawyerIds` / `escalationManagerLawyerIds` /
  `escalationFounderLawyerIds` dizilerinde **geçmemeli**. Geçiyorsa önce diziden çıkar.
  (FK olmadığı için cascade yok; dangling id riski.)
- Soft-delete vs hard-delete: `Lawyer`/`StaffMember`'da `deletedAt`/`isActive` var mı
  → execution gate'inde netleştir (tercih: soft-delete + picker'da gizle, audit izi kalır).

---

## 5. Önerilen execution planı (AYRI gate, ONAY + kod/veri-op gerektirir)

> M2-G0 yalnız forensic + plandır. Aşağısı **henüz yapılmaz**; ayrı onaylı adım.

1. **Pre-check:** silinecek lawyer id'lerini Office String[] dizilerinde ara; varsa çıkar.
2. **Canonical doğrula:** 7 canonical kaydın isim/tip/title'ını düzelt (örn. büyük-küçük harf normalize).
3. **Sil/merge:** 12 gürültü kaydını sil (soft tercih). FK repoint yok (hepsi ref=0).
4. **Doğrula:** tenant'ta 4 lawyer + 3 staff kalmalı; canonical referanslar (PoaLawyer) bozulmamalı.
5. Ardından M2-G1 (şema) güvenle açılır.

---

## 6. Kilitli bulgular özeti

```text
- Kapsam: tüm gerçek kişiler tek tenant'ta (9 lawyer + 10 staff)
- Canonical: 4 avukat + 3 personel = 7 kişi (picker-uygun)
- Silinecek: 5 lawyer-dup + 3 staff-dup + 4 QA/test = 12 kayıt
- Merge-risk: DÜŞÜK — silineceklerin hepsi FK ref=0; referanslılar zaten canonical
- Yumuşak referans kontrolü: Office.escalation*LawyerIds dizileri (silme öncesi)
- K1 köprüsü: %0 (hepsi userId=NULL) → Task.assignee dual-path "User yok" kolu
- Title: avukatlarda yok → M2-G3'te atama gerekir
- Execution (silme) = AYRI onaylı gate, M2-G0 değil
```

---

> İlgili: [`real-person-case-responsibility-design.md`](./real-person-case-responsibility-design.md) (Model-2 tasarım).
