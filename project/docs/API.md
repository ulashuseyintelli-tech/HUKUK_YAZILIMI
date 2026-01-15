# API Dokümantasyonu

Bu belge sistemdeki ana API endpoint'lerini ve kullanımlarını açıklar.

**Son Güncelleme:** 2026-01-14  
**Base URL:** `/api`

---

## 📊 Çekirdek Engine'ler

### Interest Engine (Faiz Hesaplama)

Faiz hesaplama için TEK KAYNAK. UI'da faiz hesabı YAPILMAZ.

| Endpoint | Method | Açıklama |
|----------|--------|----------|
| `/interest-engine/calculate` | POST | Faiz hesaplama |
| `/interest-engine/rates` | GET | Güncel faiz oranları |
| `/interest-engine/rates/history` | GET | Oran geçmişi |
| `/interest-engine/segments/:caseId` | GET | Faiz segmentleri |

#### POST /interest-engine/calculate

```typescript
// Request
{
  caseId: string;
  calculationDate: string; // ISO date
  claims: Array<{
    claimId: string;
    principal: number; // Kuruş cinsinden (bigint)
    interestType: 'YASAL' | 'TICARI_DEGISEN' | 'AVANS' | 'TEMERRUT';
    startDate: string;
  }>;
  options?: {
    includeTBK100Allocation?: boolean;
    includeSegments?: boolean;
  };
}

// Response
{
  success: boolean;
  result: {
    totalInterest: number;
    preEnforcementInterest: number;
    postEnforcementInterest: number;
    segments: Array<{
      startDate: string;
      endDate: string;
      days: number;
      rate: number;
      interest: number;
      period: 'PRE' | 'POST';
    }>;
    allocation?: {
      // TBK m.100 mahsup detayları
    };
  };
  traceId: string;
}
```

---

### Fee Engine (Masraf/Harç Hesaplama)

Masraf ve harç hesaplama için TEK KAYNAK.

| Endpoint | Method | Açıklama |
|----------|--------|----------|
| `/fee-engine/compute` | POST | Masraf hesaplama |
| `/fee-engine/attorney-fee` | POST | Vekalet ücreti hesaplama |
| `/fee-engine/tariffs` | GET | Güncel tarife bilgileri |
| `/fee-engine/tariffs/:year` | GET | Belirli yıl tarifesi |

#### POST /fee-engine/compute

```typescript
// Request
{
  caseId?: string;
  amount: number; // Takip tutarı
  caseType: string;
  debtorCount?: number;
  items?: string[]; // Hesaplanacak kalemler
}

// Response
{
  success: boolean;
  items: Array<{
    code: string;
    name: string;
    amount: number;
    formula?: string;
  }>;
  total: number;
  tariffYear: number;
}
```

#### POST /fee-engine/attorney-fee

```typescript
// Request
{
  amount: number; // Takip tutarı
  caseType?: string;
}

// Response
{
  success: boolean;
  amount: number;
  breakdown: Array<{
    bracket: string;
    rate: number;
    amount: number;
  }>;
  minimumFee: number;
}
```

---

### Policy Engine (Karar Motoru)

Tüm aksiyonlar için gate kontrolü ve karar verme.

| Endpoint | Method | Açıklama |
|----------|--------|----------|
| `/policy-engine/evaluate` | POST | Aksiyon izin kontrolü |
| `/policy-engine/next-actions/:caseId` | GET | Önerilen aksiyonlar |
| `/policy-engine/decision-log/:caseId` | GET | Karar geçmişi |

#### POST /policy-engine/evaluate

```typescript
// Request
{
  caseId: string;
  actionCode: ActionCode;
  context?: {
    debtorId?: string;
    assetId?: string;
    userId?: string;
  };
}

// Response
{
  allowed: boolean;
  reason: string;
  code: DecisionCode;
  traceId: string;
  warnings?: Array<{
    code: string;
    message: string;
    severity: 'INFO' | 'WARNING' | 'ERROR';
  }>;
}
```

**ActionCode Enum:**
- `UYAP_SEND` - UYAP'a gönderim
- `TRIGGER_HACIZ` - Haciz talebi
- `SEND_NOTIFICATION` - Tebligat gönderimi
- `REQUEST_EXPENSE` - Masraf talebi
- `APPROVE_EXPENSE` - Masraf onayı
- `RECORD_PAYMENT` - Tahsilat kaydı
- `CLOSE_CASE` - Dosya kapatma

---

### Limitation Engine (Zamanaşımı)

Zamanaşımı kontrolü ve uyarıları.

| Endpoint | Method | Açıklama |
|----------|--------|----------|
| `/limitation-engine/check` | POST | Zamanaşımı kontrolü |
| `/limitation-engine/recommend` | POST | Takip türü önerisi |
| `/limitation-engine/rules` | GET | Zamanaşımı kuralları |
| `/limitation-engine/warning-levels` | GET | Uyarı seviyeleri |

#### POST /limitation-engine/check

```typescript
// Request
{
  caseType: string;
  claimTypeCode?: string;
  startDate?: string;
  instrumentType?: string;
}

// Response
{
  level: 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN';
  expiryDate: string | null;
  daysLeft: number | null;
  periodYears: number;
  message: string;
  rule?: LimitationRule;
}
```

---

## 📁 Case (Dosya) Yönetimi

| Endpoint | Method | Açıklama |
|----------|--------|----------|
| `/cases` | GET | Dosya listesi |
| `/cases/:id` | GET | Dosya detayı |
| `/cases` | POST | Yeni dosya |
| `/cases/:id` | PUT | Dosya güncelleme |
| `/cases/:id/calculation-summary` | GET | Hesap özeti (computed) |
| `/cases/:id/finance-summary` | GET | Finans özeti |
| `/cases/:id/dues` | GET/POST | Alacak kalemleri |
| `/cases/:id/collections` | GET/POST | Tahsilatlar |
| `/cases/:id/lawyers` | GET/POST | Avukatlar |
| `/cases/:id/timeline` | GET | Zaman çizelgesi |

#### GET /cases/:id/calculation-summary

**TEK KAYNAK:** Bu endpoint tüm hesaplamaları backend engine'lerden alır.

```typescript
// Query params
?date=2026-01-14 // Hesap tarihi (opsiyonel, default: bugün)

// Response
{
  caseId: string;
  hesapTarihi: string;
  takipTarihi: string;
  kalemTuru: string;
  
  // Tutarlar
  asilAlacak: number;
  tazminat: number;
  komisyon: number;
  takipOncesiFaiz: number;
  takipTutari: number;
  
  // Masraflar
  basvurmaHarci: number;
  vekaletHarci: number;
  pesinHarc: number;
  dosyaGideri: number;
  tebligatGideri: number;
  vekaletPulu: number;
  icraMasraflari: number;
  
  // Harçlar
  pesinHarcDahilTahsilHarci: number;
  pesinHarcHaricTahsilHarci: number;
  
  // Vekalet ve faiz
  vekaletUcreti: number;
  takipSonrasiFaiz: number;
  
  // Toplamlar
  toplamBorc: number;
  sonBorc: number;
  toplamTahsilat: number;
  kalanBorc: number;
  
  // Detaylar
  faizSegmentleri: {
    takipOncesi: FaizSegment[];
    takipSonrasi: FaizSegment[];
  };
  tahsilOranlari: Array<{ oran: number; label: string; tutar: number }>;
}
```

---

## 👤 Borçlu (Debtor) Yönetimi

| Endpoint | Method | Açıklama |
|----------|--------|----------|
| `/debtors` | GET | Borçlu listesi |
| `/debtors/:id` | GET | Borçlu detayı |
| `/debtors/search` | GET | Borçlu arama |
| `/debtors/:id/addresses` | GET | Adres listesi |
| `/debtors/:id/assets` | GET | Varlık listesi |

---

## 📄 Belge (Document) Yönetimi

| Endpoint | Method | Açıklama |
|----------|--------|----------|
| `/documents/templates` | GET | Şablon listesi |
| `/documents/generate` | POST | Belge oluştur |
| `/documents/:id` | GET | Belge indir |
| `/form-types` | GET | Form türleri |

---

## 📬 Tebligat Yönetimi

| Endpoint | Method | Açıklama |
|----------|--------|----------|
| `/tebligat` | GET | Tebligat listesi |
| `/tebligat` | POST | Yeni tebligat |
| `/tebligat/:id` | PATCH | Tebligat güncelle |
| `/tebligat/track-ptt` | POST | PTT barkod takibi |
| `/tebligat/check-uets` | POST | UETS kayıt kontrolü |

---

## 🏛️ UYAP Entegrasyonu

| Endpoint | Method | Açıklama |
|----------|--------|----------|
| `/uyap/send-payment-order` | POST | Ödeme emri gönder |
| `/uyap/push-haciz` | POST | Haciz talebi |
| `/uyap/check-status/:caseId` | GET | Durum sorgula |
| `/uyap/query-assets` | POST | Mal varlığı sorgula |
| `/uyap/submit-document` | POST | Evrak gönder |

**Not:** Tüm UYAP işlemleri CPE gate kontrolünden geçer.

---

## 💰 Masraf Talebi (Expense Request)

| Endpoint | Method | Açıklama |
|----------|--------|----------|
| `/expense-requests` | GET | Talep listesi |
| `/expense-requests` | POST | Yeni talep |
| `/expense-requests/:id/approve` | POST | Onayla |
| `/expense-requests/:id/reject` | POST | Reddet |
| `/expense-requests/compute` | POST | Masraf hesapla |

---

## 🔄 Stage Trigger (Aşama Tetikleyici)

| Endpoint | Method | Açıklama |
|----------|--------|----------|
| `/stage-trigger/trigger` | POST | Aşama tetikle |
| `/stage-trigger/recommendations/:caseId` | GET | Öneriler |
| `/stage-trigger/prepare-uyap/:caseId` | POST | UYAP hazırlık |

---

## 🤖 Automation (Otomasyon)

| Endpoint | Method | Açıklama |
|----------|--------|----------|
| `/automation/stats` | GET | İstatistikler |
| `/automation/process/:caseId` | POST | Manuel işle |
| `/automation/toggle/:caseId` | POST | Oto mod aç/kapat |

---

## 🔐 Authentication

| Endpoint | Method | Açıklama |
|----------|--------|----------|
| `/auth/login` | POST | Giriş |
| `/auth/register` | POST | Kayıt |
| `/auth/me` | GET | Kullanıcı bilgisi |
| `/auth/refresh` | POST | Token yenile |

---

## 📊 Shared Types

Tüm API'ler `packages/types` altındaki shared type'ları kullanır:

```typescript
import { 
  Money,           // Para tipi (bigint kuruş)
  CaseId,          // Branded ID
  DebtorId,
  ClientId,
  CaseDTO,
  DebtorDTO,
  CollectionDTO,
  PolicyDecision,
  GateResult,
} from '@shared/types';
```

---

## ⚠️ Hata Kodları

| Kod | Açıklama |
|-----|----------|
| `CASE_NOT_FOUND` | Dosya bulunamadı |
| `GATE_BLOCKED` | CPE gate engeli |
| `INVALID_TRANSITION` | Geçersiz durum geçişi |
| `POA_VALIDATION_FAILED` | Vekalet hatası |
| `CPE_GATE_BLOCKED` | Policy engine engeli |
| `LIMITATION_EXPIRED` | Zamanaşımı dolmuş |

---

## 🔗 İlgili Belgeler

- [ARCHITECTURE.md](../ARCHITECTURE.md) - Mimari kılavuz
- [architecture-gap-matrix.md](./architecture-gap-matrix.md) - Eksiklik matrisi
- [decision-point-inventory.md](./decision-point-inventory.md) - Karar noktaları
- [high-risk-action-matrix.md](./high-risk-action-matrix.md) - Yüksek riskli aksiyonlar

---

*Bu belge otomatik olarak güncellenmez. Endpoint değişikliklerinde manuel güncelleme gerekir.*
