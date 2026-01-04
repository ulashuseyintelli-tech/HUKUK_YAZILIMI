# Kod İnceleme ve Mimari Analiz Raporu

**Tarih:** 5 Ocak 2026 (Güncellendi)  
**Kapsam:** Hukuk Platform - İcra Takip Sistemi

---

## 🔴 KRİTİK MANTIK HATALARI

### 1. Vekalet Kontrolü - Mevcut Durum ✅
**Takip Açılırken:** Sadece uyarı (doğru davranış)
- `apps/api/src/modules/case/case.service.ts` - `create()`
- Vekalet eksikse `poaWarnings` array'i döner, dosya oluşturulur

**UYAP Gönderiminde:** Zorunlu kontrol ✅
- `apps/api/src/modules/uyap/uyap.service.ts`
- Tüm UYAP işlemlerinde (`sendPaymentOrder`, `pushHacizRequest`, `submitDocument`, `submitCriminalComplaint`, `submitCivilLawsuit`) vekalet kontrolü yapılıyor
- Geçersiz vekalet → `BadRequestException` fırlatılıyor

```typescript
// UYAP servisinde mevcut kontrol
if (!poaValidation.isValid) {
  throw new BadRequestException({
    code: 'POA_VALIDATION_FAILED',
    message: `UYAP işlemi yapılamaz: ${poaValidation.message}`,
  });
}
```

**Durum:** İstenen davranış zaten implement edilmiş.

---

### 2. Audit Log Transaction Dışında ✅ DÜZELTILDI
**Dosya:** `apps/api/src/modules/case/case.service.ts` - `delete()`

```typescript
// Düzeltme: Transaction içinde silme ve audit log
await this.prisma.$transaction(async (tx) => {
  await tx.case.delete({ where: { id } });
  await this.auditService.log({ ... });
});
```

**Durum:** Transaction içine alındı, veri bütünlüğü sağlandı.

---

### 3. Not Silme Yetki Açığı ✅ DÜZELTILDI
**Dosya:** `apps/api/src/modules/case/case.service.ts` - `deleteNote()`

```typescript
// Düzeltme: Notun bu dosyaya ait olduğu kontrol ediliyor
const note = await this.prisma.caseLifecycle.findFirst({
  where: { id: noteId, caseId, action: "NOTE_ADDED" },
});
if (!note) throw new NotFoundException("Not bulunamadı");
```

**Durum:** Güvenlik açığı kapatıldı.

---

## 🟠 ORTA SEVİYE SORUNLAR

### 4. Dev Dosyalar - Bakım Zorluğu ⚠️ KISMEN DÜZELTILDI
| Dosya | Satır | Durum |
|-------|-------|-------|
| `apps/web/src/app/(dashboard)/cases/[id]/page.tsx` | 2471 | ⏳ Bileşenler hazır, entegrasyon bekliyor |
| `apps/web/src/lib/api.ts` | 2700+ | ✅ 13 modüle bölündü |
| `apps/api/prisma/schema.prisma` | 4149 | ⏳ Tek dosyada (Prisma kısıtı) |

**Yapılan:**
- `api.ts` → `apps/web/src/lib/api/` klasörüne 13 modül olarak bölündü:
  - `client.ts`, `auth.ts`, `cases.ts`, `clients.ts`, `debtors.ts`, `lawyers.ts`
  - `documents.ts`, `tebligat.ts`, `finance.ts`, `uyap.ts`, `validation.ts`
  - `automation.ts`, `address-discovery.ts`, `asset-query.ts`
  - `types.ts` - tüm type tanımları
  - `index.ts` - legacy uyumluluk (eski `api.getCases()` çağrıları çalışır)

**Bekleyen:**
- Page.tsx → Bileşenler hazır (`components/case-detail/`), entegrasyon gerekli
- schema.prisma → Prisma'nın multi-file desteği yok, yorum blokları ile bölümlenebilir

---

### 5. Kullanılmayan Parametre ✅ DÜZELTILDI
**Dosya:** `apps/api/src/modules/case/case.service.ts`

```typescript
private generateInterestDescription(subCategory: CaseSubCategory, currency?: Currency): string {
  // currency parametresi artık DOVIZ case'inde kullanılıyor
  case CaseSubCategory.DOVIZ:
    const currencyName = currency ? this.getCurrencyName(currency) : 'döviz';
    return `fiili ödeme tarihindeki T.C. Merkez Bankası ${currencyName} efektif satış kuru...`;
}
```

**Durum:** Currency parametresi artık döviz alacaklarında para birimi adını gösteriyor (ABD Doları, Euro, vb.)

---

### 6. Runtime Model Kontrolü
**Dosya:** `apps/api/src/modules/validation-gate/validation-gate.service.ts`

```typescript
try {
  instrument = await (this.prisma as any).caseInstrument?.findFirst({ where: { caseId } });
} catch { /* Model henuz yok */ }
```

**Sorun:** Type safety kaybı, migration sonrası temizlenmeli.

---

### 7. TCMB Service Placeholder ✅ DÜZELTILDI
**Dosya:** `apps/api/src/modules/rule-engine/tcmb.service.ts`

**Düzeltme:** TCMB XML API entegrasyonu tamamlandı:
- `https://www.tcmb.gov.tr/kurlar/today.xml` endpoint'i kullanılıyor
- 5 dakikalık cache mekanizması
- Geçmiş tarih kurları için arşiv desteği (`/YYMM/DDMMYY.xml`)
- Birim düzeltmesi (JPY için 100 birim = X TL)
- Hafta sonu/tatil günleri için fallback mekanizması

**Durum:** Döviz alacağı dosyaları için kur hesaplaması çalışıyor.

---

### 8. Lookup Tenant Kontrolü Eksik ✅ DÜZELTILDI
**Sorun:** ~~Lookup tabloları (`LookupTakipTuru`, `LookupAsama`, etc.) tenant bazlı ama case oluştururken lookup ID'lerinin doğru tenant'a ait olduğu kontrol edilmiyordu.~~

**Düzeltme:** `validateLookupIds()` helper fonksiyonu eklendi:
- `batchUpdate()` fonksiyonunda lookup ID'leri güncellenmeden önce tenant kontrolü yapılıyor
- Başka tenant'ın lookup değerleri kullanılamaz
- `BadRequestException` fırlatılıyor: "Geçersiz lookup ID: Belirtilen değer bu büroya ait değil"

---

## 🟡 İYİLEŞTİRME ÖNERİLERİ

### 9. Duplicate Interface ✅ DÜZELTILDI
**Dosya:** `apps/web/src/app/(dashboard)/cases/[id]/page.tsx`
- ~~`BlockFieldProps` interface'i iki kez tanımlanmış~~
- Duplicate interface kaldırıldı

### 10. Hardcoded Değerler
```typescript
const INACTIVITY_THRESHOLD_DAYS = 365; // Büro ayarından alınabilir
```
**Öneri:** Tenant settings'e taşı.

### 11. Error Handling Tutarsızlığı ⚠️ KISMEN DÜZELTILDI
- NestJS: `NotFoundException`, `BadRequestException`
- ~~Bazı yerlerde: `throw new Error('...')`~~

**Düzeltilen servisler:**
- `staff.service.ts` → `NotFoundException`
- `notification.service.ts` → `NotFoundException`
- `risk.service.ts` → `NotFoundException`
- `greeting.service.ts` → `NotFoundException`

**Bekleyen:** OCR, template-engine, summary-engine servislerinde hala `throw new Error` kullanımı var (kullanıcı dostu hata mesajları için kabul edilebilir).

---

## 📊 VERİTABANI MİMARİSİ ANALİZİ

### ✅ Güçlü Yönler

1. **Multi-Tenant İzolasyonu**
   - Tüm ana tablolarda `tenantId` mevcut
   - Index'ler tenant bazlı optimize edilmiş

2. **Kapsamlı Lookup Sistemi**
   - `LookupTakipTuru`, `LookupAsama`, `LookupRisk`, `LookupMahiyetTipi`
   - Tenant bazlı özelleştirilebilir

3. **Esnek Gruplama**
   - `GroupDefinition` + `CaseGroup` ile dinamik dosya grupları
   - Müvekkil bazlı veya global gruplar

4. **Detaylı Audit Trail**
   - `CaseLifecycle`, `CaseStatusHistory`, `CaseStageHistory`
   - Tüm değişiklikler izlenebilir

5. **Hiyerarşik Yetki Sistemi**
   - `LawyerRank` enum (PARTNER → INTERN)
   - Dosya bazlı yetki override (`CaseLawyer.casePermissions`)

6. **Tebligat Sistemi**
   - TK 21/1, 21/2 desteği
   - PTT sonuç şerhleri enum olarak

7. **Borçlu Çeşitliliği**
   - `DebtorType`: INDIVIDUAL, COMPANY, PUBLIC_INSTITUTION, ESTATE (Tereke)
   - `EstateHeir` modeli ile mirasçı takibi

### ⚠️ Potansiyel Sorunlar

1. **Schema Boyutu**
   - 4149 satır tek dosyada
   - Bakım zorluğu, merge conflict riski

2. **JSON Alanları**
   - `metadata`, `automationConfig`, `casePermissions` gibi alanlar JSON
   - Type safety yok, query zorluğu

3. **Geriye Uyumluluk Alanları**
   - `@deprecated` yorumlu alanlar hala mevcut
   - Migration planı gerekli

4. **Eksik Index'ler** ✅ DÜZELTILDI
   - `Case.clientId` index eklendi
   - `Collection.type` index eklendi

5. **Cascade Delete Riski**
   - `Case` silindiğinde 20+ ilişkili tablo cascade ile siliniyor
   - Soft delete düşünülmeli

### 🔧 Genişletilebilirlik Değerlendirmesi

| Alan | Durum | Not |
|------|-------|-----|
| Yeni Takip Türü | ✅ İyi | Lookup tabloları ile dinamik |
| Yeni Belge Türü | ✅ İyi | `DocumentType` enum genişletilebilir |
| Yeni Para Birimi | ✅ İyi | `Currency` enum'a eklenebilir |
| Yeni Borçlu Türü | ⚠️ Orta | `DebtorType` enum değişikliği gerekir |
| Yeni Workflow | ✅ İyi | `WorkflowTemplate` JSON tabanlı |
| Çoklu Dil | ❌ Zayıf | i18n altyapısı yok |
| Çoklu Ülke | ❌ Zayıf | Türkiye'ye özel (TCKN, UYAP, İİK) |

---

## 🏗️ MİMARİ ÖNERİLER

### Kısa Vadeli (1-2 Sprint)
1. ~~Vekalet kontrolünü zorunlu yap~~ ✅ UYAP'ta zaten zorunlu
2. ~~Audit log'u transaction içine al~~ ✅ Düzeltildi
3. ~~Not silme yetki açığını kapat~~ ✅ Düzeltildi
4. ~~Eksik index'leri ekle~~ ✅ Düzeltildi

### Orta Vadeli (1-2 Ay)
1. ~~Dev dosyaları modüler yapıya böl~~ ⚠️ KISMEN (api.ts ✅, page.tsx bileşenler hazır)
2. JSON alanları için Zod schema'ları oluştur
3. Soft delete implementasyonu
4. ~~TCMB API entegrasyonu~~ ✅ DÜZELTILDI

### Uzun Vadeli (3-6 Ay)
1. Event sourcing düşün (audit için)
2. CQRS pattern (read/write ayrımı)
3. Microservice'e geçiş hazırlığı (modül bazlı)
4. i18n altyapısı

---

## ✅ İYİ UYGULAMALAR

- Multi-tenant izolasyonu tutarlı
- Audit logging mevcut
- Vekalet süresi uyarı sistemi
- UYAP kodu eksik uyarısı (`hasUyapWarning`)
- Validation gate sistemi kapsamlı
- Enum kullanımı tutarlı
- Index stratejisi genel olarak iyi
