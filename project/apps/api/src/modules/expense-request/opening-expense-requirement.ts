/**
 * Açılış masrafı şartı — tutarı BELİRLENEMEMİŞ açılış masrafı "sağlandı" sayılır mı?
 *
 * Ölçülen durum (main 6681b1d5, gerçek HTTP + disposable PostgreSQL): dövizli / karma dosyada otomatik açılış masraf
 * talebi oluşturulmaz (peşin harç matrahı TL değil; bkz. opening-expense-basis.ts). Dosyada talep bulunmadığı için masraf
 * kapısı durum uçları dosyayı "UYAP işlemleri için hazır" bildiriyordu (isBlocked=false, canPerform=true); UYAP gönderim
 * hazırlığı ise dosyada hiç talep yokken "Ödenmemiş masraf talebi var" gerekçesiyle reddediyordu.
 *
 * Owner ek kararı (2026-10-01): masraf tutarı belirlenemediği için talebin oluşturulamaması "masraf şartı sağlandı" olarak
 * yorumlanmaz. Açılış masrafı şartına bağlı işlemlerde eksik hesap görünür ve engelleyicidir; okuma, sorgulama ve bu
 * şarttan bağımsız işlemler etkilenmez. Kapıyı çalıştırmak için sıfır ya da uydurma tutarlı talep, muhasebe kaydı veya
 * ödeme ÜRETİLMEZ; kur, matrah ya da yeni mali kural SEÇİLMEZ.
 *
 * Bu yardımcı HESAP YAPMAZ, tutar ÇEVİRMEZ ve kayıt YAZMAZ. Yalnız şunu bildirir: tarife oranıyla bulunan ve bu dosyada
 * hesaplanamayan kalem(ler) (peşin harç) iptal edilmemiş bir masraf talebinde TUTARIYLA kayıtlı mı? Kayıtlıysa şartın
 * gerisi mevcut kurala bırakılır (masraf kapısı: BLOCKING talep karşılanmadan kilit) — talebin yalnız VAR OLMASI şartı
 * sağlamaz. Kayıtlı sayılan satır kanonik kalem satırıdır (ExpenseRequestItem); paket modunun yalnız eski biçim JSON
 * yazan talepleri sayılmaz, çünkü o yoldaki öneri de aynı oranı ham sayıya uygular ve düzenlenip düzenlenmediği kayıtlı
 * değildir.
 *
 * Dayanak: RECEIVABLE-GOVERNANCE REC-FX-002 (yetkili kur sözleşmesi olmadan çevirme yok), REC-FEE-003 (eksik hukuki /
 * tarife verisi sessiz 0 ya da varsayılan üretmez).
 */
import type { PrismaClient } from '@prisma/client';
import {
  evaluateOpeningExpenseBasis,
  openingExpenseBasisInputOfCase,
  OPENING_EXPENSE_TARIFF_CURRENCY,
  type OpeningExpenseBasisDecision,
  type OpeningExpenseNotCalculableItem,
} from './opening-expense-basis';

export const OPENING_EXPENSE_NOT_DETERMINED = 'OPENING_EXPENSE_NOT_DETERMINED' as const;

/** Peşin harç matrahı TL: açılış masrafı tarifeden hesaplanır (mevcut davranış aynen). */
export interface OpeningExpenseTariffCalculable {
  readonly status: 'TARIFF_CALCULABLE';
}

/** Hesaplanamayan kalem(ler) bir masraf talebinde tutarıyla kayıtlı: şartın gerisi mevcut masraf kapısı kuralıdır. */
export interface OpeningExpenseRateItemsRecorded {
  readonly status: 'RATE_ITEMS_RECORDED';
}

/** Açılış masrafı belirlenmedi: tutar YOKTUR (0 değildir); şart sağlanmış SAYILMAZ. */
export interface OpeningExpenseNotDetermined {
  readonly status: 'NOT_DETERMINED';
  readonly reasonCode: typeof OPENING_EXPENSE_NOT_DETERMINED;
  /** Kullanıcıya gösterilecek neden. */
  readonly message: string;
  /** Şartın değerlendirilebilmesi için tamamlanması gereken bilgi. */
  readonly requiredInfo: readonly string[];
  /** Tutarı belirlenmemiş kalemler. */
  readonly notCalculableItems: readonly OpeningExpenseNotCalculableItem[];
  /** Düzeltmenin mevcut geçerli yolu. */
  readonly completionPath: string;
  readonly clientAssigned: boolean;
  readonly caseCurrency: string;
  readonly basisCurrencies: readonly string[];
  readonly tariffCurrency: typeof OPENING_EXPENSE_TARIFF_CURRENCY;
}

export type OpeningExpenseRequirement = OpeningExpenseTariffCalculable | OpeningExpenseRateItemsRecorded | OpeningExpenseNotDetermined;

export interface OpeningExpenseRequirementInput {
  readonly basis: OpeningExpenseBasisDecision;
  /** Dosyaya müvekkil atanmış mı (masraf talebi müvekkil adına oluşturulur). */
  readonly clientAssigned: boolean;
  /** İptal edilmemiş masraf taleplerinde tutarı (> 0) kayıtlı kalem kodları. */
  readonly recordedItemCodes: readonly string[];
}

const CONSEQUENCE = 'Açılış masrafı belirlenmediği için masraf şartı sağlanmış sayılmaz.';

/**
 * <remarks>
 * Çağrıldığı yerler:
 * - loadOpeningExpenseRequirement() (bu dosya)
 * </remarks>
 */
export function evaluateOpeningExpenseRequirement(input: OpeningExpenseRequirementInput): OpeningExpenseRequirement {
  const { basis } = input;
  if (basis.calculable) {
    return { status: 'TARIFF_CALCULABLE' };
  }

  const recorded = new Set(input.recordedItemCodes);
  const missing = basis.notCalculableItems.filter((item) => !recorded.has(item.itemCode));
  if (missing.length === 0) {
    return { status: 'RATE_ITEMS_RECORDED' };
  }

  const labels = missing.map((item) => `"${item.label}"`).join(', ');
  const itemWord = missing.length > 1 ? 'kalemlerini' : 'kalemini';
  const clientStep = input.clientAssigned ? '' : 'Dosyaya müvekkil atanmamış; masraf talebi için önce müvekkil atanmalıdır. ';
  return {
    status: 'NOT_DETERMINED',
    reasonCode: OPENING_EXPENSE_NOT_DETERMINED,
    message: `${CONSEQUENCE} ${basis.message}`,
    requiredInfo: basis.requiredInfo,
    notCalculableItems: missing,
    completionPath:
      `${clientStep}Bu engelin kalkması için ${labels} ${itemWord} TL tutarıyla içeren masraf talebi, kalemleri elle girilerek ` +
      'oluşturulmalı ve karşılanmalıdır (ödeme alındı ya da avukat karşıladı).',
    clientAssigned: input.clientAssigned,
    caseCurrency: basis.caseCurrency,
    basisCurrencies: basis.basisCurrencies,
    tariffCurrency: basis.tariffCurrency,
  };
}

/**
 * Masraf kapısı (durum uçları) TALEP bazlıdır: müvekkilsiz dosyada otomatik açılış talebi hiç denenmez (TL dosyayla
 * aynı) ve kapı bu nedenle kilitlenmez. UYAP gönderim hazırlığı ise paket bazlıdır, müvekkilden bağımsızdır: orada
 * belirlenmemiş açılış masrafı her durumda engeldir (bkz. StageTriggerService.triggerStage).
 *
 * <remarks>
 * Çağrıldığı yerler:
 * - ExpenseGateService.checkGateForCase() / canPerformUyapActionForCase() / getGateSummaryForCase()
 * </remarks>
 */
export function openingExpenseBlocksExpenseGate(requirement: OpeningExpenseRequirement): requirement is OpeningExpenseNotDetermined {
  return requirement.status === 'NOT_DETERMINED' && requirement.clientAssigned;
}

/** Şartın okunması için gereken en küçük okuma yüzeyi (PrismaService ve işlem istemcisi bu şekle uyar). */
export type OpeningExpenseRequirementReadClient = Pick<PrismaClient, 'case' | 'expenseRequestItem'>;

/**
 * Dosyanın açılış masrafı şartını okur. SALT OKUMA; kiracı kapsamlıdır — dosya çağıranın bürosuna ait değilse `null`
 * döner (çağıran "bulunamadı" yanıtı verir; başka büronun dosyası hakkında bilgi sızmaz).
 *
 * <remarks>
 * Çağrıldığı yerler:
 * - ExpenseGateService.getOpeningExpenseRequirement() → GET /expense-requests/case/:caseId/gate-status,
 *   .../can-perform/:actionType, .../gate-summary ve StageTriggerService.triggerStage() (POST /cases/:caseId/uyap/prepare)
 * </remarks>
 */
export async function loadOpeningExpenseRequirement(
  client: OpeningExpenseRequirementReadClient,
  tenantId: string,
  caseId: string,
): Promise<OpeningExpenseRequirement | null> {
  const caseItem = await client.case.findFirst({
    where: { id: caseId, tenantId },
    select: {
      clientId: true,
      currency: true,
      claimItems: { where: { itemType: 'PRINCIPAL' }, select: { currency: true } },
      dues: { where: { type: 'PRINCIPAL' }, select: { currency: true } },
    },
  });
  if (!caseItem) {
    return null;
  }

  const basis = evaluateOpeningExpenseBasis(openingExpenseBasisInputOfCase(caseItem));
  const clientAssigned = !!caseItem.clientId;
  if (basis.calculable) {
    return evaluateOpeningExpenseRequirement({ basis, clientAssigned, recordedItemCodes: [] });
  }

  // Tutarı 0 olan satır "kayıtlı" sayılmaz: eksik tutar 0 kabul edilmez.
  const recorded = await client.expenseRequestItem.findMany({
    where: {
      itemCode: { in: basis.notCalculableItems.map((item) => item.itemCode) },
      finalAmount: { gt: 0 },
      expenseRequest: { caseId, tenantId, status: { not: 'CANCELLED' } },
    },
    select: { itemCode: true },
    distinct: ['itemCode'],
  });

  return evaluateOpeningExpenseRequirement({ basis, clientAssigned, recordedItemCodes: recorded.map((row) => row.itemCode) });
}
