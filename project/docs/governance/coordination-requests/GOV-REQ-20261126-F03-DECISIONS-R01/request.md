# GOV-REQ-20261126-F03-DECISIONS-R01

LOCAL PREPARATION / NOT SUBMITTED / NOT APPLIED.

Owner directly authorized local F03 record preparation; existing choices were checked against original owner messages. The procedural semantic reference is the existing coordination authority; it does not ratify a new migration exception or grant live authority. Original owner UUID and SHA256 evidence accompanies this package.

Each request is a separate REQUEST_ONLY publication unit with its deterministic register regeneration. No execution/result is claimed. Request-first publication and fresh digest binding are required before protected target edits. Main drift requires a fresh revision, never editing this immutable request.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20261126-F03-DECISIONS-R01",
  "requestFingerprint": "2f4eb2014d37c12e6961601295aa941f200a28cbeb370e1e69002c933a541b9c",
  "requestedBy": "OWNER",
  "createdAt": "2026-11-26T19:40:09Z",
  "baseMainSha": "9ca1e00862f23bc321d349e73738ff21f627cd86",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "GOV-COORD-V2-T1-RATIFICATION",
    "evidenceSha": "9ca1e00862f23bc321d349e73738ff21f627cd86"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "9ca1e00862f23bc321d349e73738ff21f627cd86"
  },
  "operation": {
    "type": "EXACT_APPEND_AT_DECLARED_ANCHOR",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/decision-log.md",
    "recordIdentity": "# Decision Log",
    "anchor": " kutusuna teslim OLCULMEDI**; bu kayit hizmet kabulu DEGILDIR, H1-H8 0/8 DEGISMEDI. Sentetik tenant `inv-aa89937b` canlida KALIR (silme yok, erisim kapali). |\r\n",
    "expectedOldValue": " kutusuna teslim OLCULMEDI**; bu kayit hizmet kabulu DEGILDIR, H1-H8 0/8 DEGISMEDI. Sentetik tenant `inv-aa89937b` canlida KALIR (silme yok, erisim kapali). |\r\n",
    "newValue": "\n\n## F03-OWNER-DECISIONS-20261125-R01 — mevcut owner kararlarinin kaydi\n\nBu ek mevcut owner kararlarini kaydeder; yeni authority marker, istisna veya canli yetki olusturmaz.\nKaynak oturum: 68e4bef5-69f2-41b6-8cb0-20df2a699a83; ilk soru ve gercek owner cevabi 25.11.2026 09:35:18 TSI.\n- Ham owner kaydi: db1bc2b7-76ab-4fda-bd60-81a472d8729f, 2026-11-25T06:35:18.434Z, satir 248, SHA256 1d40065d7cf651a481d24ce3d97f5401d0a7688ad286991c0cb70d579ae255cb.\n- Ham owner kaydi: 57216506-793a-42e9-9f16-990d14c05f75, 2026-11-25T21:49:07.558Z, satir 6540, SHA256 afe5f6d129ac103ef9a93f5a8fb3b5795938ccec0446fdc4207d9f6a14e41fea.\n- Ham owner kaydi: 59064fd9-969b-4c3b-bec1-c31206d41658, 2026-11-25T23:19:43.547Z, satir 9581, SHA256 efd7047b46adcb4425e87468a96a4a7cafe9367b12fdb3798de9b10c89feaed9.\n\n| Kimlik | Gercek owner secimi | Kaynak |\n|---|---|---|\n| K2 | Dosyadan Manuel Gorev Ekle gercek gorev olusturur (a). | R02 EK D + ham cevap satir 248 |\n| K3 | Kontrol tasiyicisi gorevin kendi durum makinesidir (a); ADR-009 motoru kullanilmaz. | ayni |\n| K4 | Yalniz olusturanin kontrol gerekli isaretledigi MANUAL gorev; varsayilan kapali (b). | ayni |\n| K5 | Kontrolor yoksa isaret konamaz, neden ekranda soylenir (b). | ayni |\n| K5b | Ayni kiraci ADMIN + olusturan; isi yapan kisi haric (a). | ayni |\n| K6 | IIK-78 ayari yalniz saklama/uyari etiketli; pasiflik hesabi mevcut 1 yil sabitinde kalir (b). | ayni |\n| K7 | WR01 ertelemesi yalniz B05 ve gerekli ortak iz blogu icin kalkar; kalani kapali. | ayni |\n| K8 | Tamamlanirken farkli yetkili kontrolor yoksa tamamlama reddedilir; olusturan/ADMIN gerekceyle isareti kaldirabilir, gecmise yazilir. | ilk sorunun secenek metni + ham cevap satir 248 |\n| K9 | Revizyon kisiye, ret havuza: revizyonda isi yapanda devam ediyor; rette bekliyor, is yapilmamis, baska birine atanabilir. Iki gerekce zorunlu. | ilk soru secenek metni + ham cevap satir 248; C-K9 kaynak |\n| K10 | Gorev ekrani ve dosyadan degisiklikler + muvekkil eksik-bilgi gorevinin yeniden dogusu; diger sistem ureticileri gecmis kapsaminda degil, ekran bunu soyler. | ilk soru secenek metni + ham cevap satir 248 |\n| Aday hazirligi | Mevcut yayin hattina uyarlama; main'den dogrudan aday kesmeme; canli yok. | ham owner satir 6540 |\n| Migration karari | Yalniz F03 ikilisi; F03 disi iki migration eklenmez; canli uygulama yetkisi yok. | ham owner satir 9581 ve bu dar devir |\n\nK9 ilk uygulamasinda atanan korunuyordu; #3350 ile havuza (atanmamis) donus duzeltildi.\n#3351, kontrol durumu bos IN_PROGRESS gorevlerin Devam Eden listesinden dusmesini duzeltti.\nBu kararlarin kaydi F03 gelistirmesini yeniden acmaz ve yayin/kullanici kabulu sayilmaz.\nGorevi goremeyen yoneticinin kontrolor sayilmamasi, masrafa bagli gorevin kontrol disi olmasi ve ilk kontrolun nihai avukat onayi olmamasi uygulama yorumlari/kapsam sinirlaridir; yeni owner secimi diye kaydedilmez.\nKisi bagimsizligi yalniz kisi kimligi iliskilendirilmis hesaplarda dogrulandi. Kartsiz ikinci hesap siniri F02 K-A1'den devam eder.\n",
    "evidenceSha": "9ca1e00862f23bc321d349e73738ff21f627cd86",
    "expectedResultSha256": "48625982f7a0bbd057a3472156aa1875a9223996e51f337711b3166055c9b9eb"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/decision-log.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
