// WSMR-A2 — Dashboard OKUMA durumu: "veri yok" ile "veri alınamadı" ayrımı.
//
// BULGU AİLESİ: dashboard okuma yolları hatayı sessizce varsayılan değere çeviriyordu
// (`api.get(...).catch(() => ({ data: null }))` → `stats?.total || '0'`). Sonuç: API
// çökmüşken kullanıcı "Toplam Dosya 0" görüyor ve bunu GERÇEK sıfırdan ayırt edemiyor.
// Yakın akrabaları: catch içinde demo kayıt üretmek, Math.random() ile sahte rakam
// basmak ve hiç API çağırmayan "load*" fonksiyonlarının literal veriyle "yüklendi"
// görüntüsü vermesi.
//
// KURAL: gerçek sıfır YALNIZ doğrulanmış başarılı yanıttan doğar. Hata, boş yanıt ve
// bozuk yanıt asla veri gibi gösterilmez; her biri görünür ve tekrar denenebilir olur.
//
// NEDEN AYRI MODEL: `action-error.ts` mutation sonucunu modeller (başarı yan etkisinin
// kapısı). Okuma yolunda "yan etki" yoktur; sorun durum ayrımıdır. Bu yüzden hata
// NORMALİZASYONU (iç detay maskeleme + transient) oradan tüketilir, sonuç modeli ayrıdır.

import { toActionError, type ActionErrorContract } from './action-error';
import { reportClientError } from './error-reporter';

/** Bir dashboard okuma yolunun ayrık durumu. Ara durum yok; her biri kendini anlatır. */
export type DashboardReadState<T> =
  | { status: 'IDLE' }
  | { status: 'LOADING' }
  /** Doğrulanmış başarılı yanıt, içeriği boş (GERÇEK sıfır/boş liste). */
  | { status: 'SUCCESS_EMPTY'; data: T; receivedAt: number }
  /** Doğrulanmış başarılı yanıt, içeriği dolu. */
  | { status: 'SUCCESS_DATA'; data: T; receivedAt: number }
  /**
   * Okuma başarısız. `stale` YALNIZ daha önce doğrulanmış bir yanıt varsa dolar ve
   * arayüzde "güncel olmayabilir" olarak İŞARETLENEREK gösterilir — taze veri gibi DEĞİL.
   */
  | { status: 'ERROR'; error: ActionErrorContract; stale?: { data: T; receivedAt: number } };

export const IDLE: DashboardReadState<never> = { status: 'IDLE' };
export const LOADING: DashboardReadState<never> = { status: 'LOADING' };

/** Yükleniyor mu — iskelet/spinner kararı. */
export function isPending<T>(s: DashboardReadState<T>): boolean {
  return s.status === 'IDLE' || s.status === 'LOADING';
}

/** Gösterilebilir doğrulanmış veri (yoksa `undefined`). Stale veri buradan GELMEZ. */
export function freshData<T>(s: DashboardReadState<T>): T | undefined {
  return s.status === 'SUCCESS_DATA' || s.status === 'SUCCESS_EMPTY' ? s.data : undefined;
}

/**
 * Hata anında gösterilecek son bilinen iyi veri. Çağıran bunu göstermeyi seçerse
 * "güncel olmayabilir" etiketini de göstermek ZORUNDADIR (bkz. `isStale`).
 */
export function staleData<T>(s: DashboardReadState<T>): T | undefined {
  return s.status === 'ERROR' ? s.stale?.data : undefined;
}

/** Ekranda görünen veri bayat mı — etiket bu bayrağa bağlanır. */
export function isStale<T>(s: DashboardReadState<T>): boolean {
  return s.status === 'ERROR' && s.stale !== undefined;
}

/**
 * Yanıt gövdesini doğrular ve durumu üretir.
 *
 * `validate` yanıtı ya beklenen şekle indirger ya da `undefined` döner. `undefined`
 * BOZUK yanıt demektir ve `SUCCESS_*` DEĞİL, `ERROR` üretir — bozuk gövde gerçek
 * sıfır sayılmaz.
 */
export function fromResponse<T>(
  payload: unknown,
  validate: (raw: unknown) => T | undefined,
  isEmpty: (value: T) => boolean,
  now: number,
): DashboardReadState<T> {
  const value = validate(payload);
  if (value === undefined) {
    return {
      status: 'ERROR',
      error: {
        message: 'Veri alınamadı: sunucu yanıtı beklenen biçimde değil.',
        transient: false,
      },
    };
  }
  return isEmpty(value)
    ? { status: 'SUCCESS_EMPTY', data: value, receivedAt: now }
    : { status: 'SUCCESS_DATA', data: value, receivedAt: now };
}

/**
 * Hata durumunu üretir; varsa önceki doğrulanmış veriyi BAYAT olarak taşır.
 * `previous` yalnız daha önce başarılı olmuş bir okumadan gelir.
 */
export function fromError<T>(
  error: unknown,
  previous: DashboardReadState<T> | undefined,
  context: { endpoint: string; widget: string },
): DashboardReadState<T> {
  const normalized = toActionError(error, 'Veri alınamadı. Lütfen tekrar deneyin.');

  // Merkezi observable reporter — sessiz yutma YOK.
  // `metadata` backend allowlist'ine tabidir; ham hata/gövde GÖNDERİLMEZ.
  reportClientError({
    level: 'ERROR',
    message: `dashboard okuma hatası: ${context.widget}`,
    endpoint: context.endpoint,
    stack: error instanceof Error ? error.stack : undefined,
    metadata: normalized.code ? { safeErrorCode: normalized.code } : undefined,
  });

  const keep =
    previous && (previous.status === 'SUCCESS_DATA' || previous.status === 'SUCCESS_EMPTY')
      ? { data: previous.data, receivedAt: previous.receivedAt }
      : previous && previous.status === 'ERROR'
        ? previous.stale
        : undefined;

  return keep ? { status: 'ERROR', error: normalized, stale: keep } : { status: 'ERROR', error: normalized };
}

/** `Promise.allSettled` sonucunu, diğer yolları düşürmeden tek bir okumaya çevirir. */
export function fromSettled<T>(
  settled: PromiseSettledResult<unknown>,
  validate: (raw: unknown) => T | undefined,
  isEmpty: (value: T) => boolean,
  previous: DashboardReadState<T> | undefined,
  context: { endpoint: string; widget: string },
  now: number,
): DashboardReadState<T> {
  if (settled.status === 'rejected') return fromError(settled.reason, previous, context);
  return fromResponse(settled.value, validate, isEmpty, now);
}
