# CLIENT İ11 — K-PAR KALINTI DÜZELTMESİ (R06)

```text
BELGE    : I11-D3-KPAR-KALINTI-R06   (R05'in §9 blok hash'inin yerine geçer; T betikleri DEĞİŞMEDİ)
TETİK    : OFFICE 33'ün R05 bağımsız doğrulamasında bildirdiği kalıntı — CLIENT bağımsız ÖLÇTÜ, doğruladı
YETKİ    : owner GO "CLIENT İ11 / ADAYA BAĞLAMA VE SON KABUL HAZIRLIĞI" hazırlık yetkisi (kendi paketi)
ORTAM    : yalnız karalama dizininde zararsız bekleyici süreçler; canlıya, DB'ye, Redis'e, aday köküne DOKUNULMADI
DURUM    : DÜZELTİLDİ + ÇALIŞTIRILARAK KANITLANDI · canlı kabul YAPILMADI
```

## 1. Bulgu — ÖLÇÜLDÜ

| # | Bulgu | Kanıt | Etki |
|---|---|---|---|
| **E5** | R05 K-PAR deseni `smtp-sink\.js`, yakalayıcı kaydının adı `smtp-sink.jsonl`'un **alt dizgisini** de eşleştiriyor | Gerçek süreç: komut satırında `$env:SINK_LOG='…\smtp-sink.jsonl'` taşıyan PowerShell sarmalayıcı → R05 deseni **eşleşti**, önerilen desen **eşleşmedi** (PS 5.1 ve PS 7); metin tablosunda `Get-Content -Wait …smtp-sink.jsonl` izleyicisi de aynı | Yakalayıcı bir sarmalayıcıyla başlatılır ya da kayıt izlenirse §9 canlı pencerede **yanlış-pozitif durur** (fail-closed; zarar vermez ama tek canlı pencereyi harcar) |

## 2. Düzeltme

§9 bloğu, K-PAR: `…|smtp-sink\.js` → `…|smtp-sink\.js\b` + iki satır gerekçe yorumu.
Blok farkı **yalnız bu üç satır** (R05 bloğuyla `diff`); kapı / hash / durdurucu sayıları ve tek `node`
çağrısı DEĞİŞMEDİ. §8 K-PAR satırı güncellendi.

## 3. Yeni ve değişmeyen hash'ler

| Öğe | R05 → R06 |
|---|---|
| İ11 §9 gömülü blok | `9804FEF6…` → **`27E754A721749443F8B3F2F363B7676989FC115BB6B85E6E0982F62644FC6700`** (LF, sonda LF; PS 5.1 + PS 7 ayrıştırma hatası 0) |
| T-PENCERE-AÇ `scripts/t-window-apply.ps1` | **DEĞİŞMEDİ** `CA99E69E278D94C95FDBBBE6CA0C22B1E5C41662BD4EAEC0B79ACC4D957A74F4` |
| T-PENCERE-KAPA `scripts/t-window-close.ps1` | **DEĞİŞMEDİ** `0A80982B7CE35B22D05A7EA08CBDBA9802746EDFB4EF7A8CEF61E8B47882AE05` |

## 4. Kanıt — K-PAR satırları bloktan BİREBİR çıkarılıp gerçek süreçlere karşı koşuldu

Doğrulayıcı (karalama, sha256 `D7A8DF3F…21CBBC`): `$rx` ve `$busy` satırlarını blok dosyasından okur,
her ölçümde canlı sınama süreci sayısını yazdırır (0 ise "ölçüm KÖR" diye durur), süreç ağacını
`taskkill /T` ile kapatır, sonda kalan sınama süreci 0 değilse durur.

| Senaryo | Canlı sınama süreci (bakıldı) | K-PAR eşleşen | Beklenen |
|---|---|---|---|
| A · `node smtp-sink-noauth.js` (SINK_LOG env ile) | 3 | **0** | 0 |
| B · PowerShell sarmalayıcı, komut satırında `smtp-sink.jsonl` | 1 | **0** (R05: 1) | 0 |
| C · izleyici `Get-Content -Wait …smtp-sink.jsonl` | 1 | **0** | 0 |
| D · eski AUTH `node smtp-sink.js` | 3 | **3** (shim + cmd + node) | ≥ 1 |

Sonuç **PASS**, PS 5.1.26100 ve PS 7.6.5'te aynı; kalan sınama süreci 0.

**Ölçüm aracı notları (kusur değil, düzeltildi):** ilk koşumda fonksiyon çıktısı dönüş değerine karıştı ve
Volta `node` shim'i durdurulunca `cmd`/`node` torunları ayakta kaldı (sonraki kabuğun ölçümünü kirletti).
Artıklar temizlendi (6 → 0), araç `Write-Host` + `taskkill /T` ile düzeltilip iki kabukta yeniden koşuldu.

## 5. D3 çağrı sözleşmesi

R05 §5 aynen geçerli. Ek işletim notu (OFFICE 33 ölçümü, CLIENT katılır): D3 süresince komut satırında
§9 desen belirteçlerini (`i11-run`, `ak-live`, `smtp-sink.js` …) taşıyan **başka süreç olmamalı**; K-PAR
bunu tasarım gereği durdurur. OFFICE 33'ün D3-0 ön-kontrolü §9 desenini birebir kullandığı için **R06
desenine** güncellenmelidir (yazıcı: OFFICE 33).

## 6. Açık kalemler (değişmedi)

- `ENV-PREIMAGE.env` sır taşır (korumalı DACL); silme owner kararı.
- CL_TOKENFIX disk kalıntısı ayrı açık kalem.
- İ12 başlatılmadı; İ11 canlı kabulü yapılmadı. Sayaç **10/17**, hizmet kabulü **0/8 tam**.
