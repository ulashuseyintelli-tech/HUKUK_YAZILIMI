/**
 * API Types - Shared type definitions
 */

// ============================================
// Validation Types
// ============================================

export interface ValidationError {
  code: string;
  message: string;
  field?: string;
  severity: 'error' | 'warning' | 'info';
}

export interface ValidationGateResult {
  gateId: string;
  gateName: string;
  passed: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  infos: ValidationError[];
  validatedAt: string;
}

// ============================================
// Case Instrument (Cek/Senet) Types
// ============================================

export type InstrumentType = 'CEK' | 'SENET' | 'BONO' | 'POLICE';

export interface CaseInstrument {
  id: string;
  caseId: string;
  instrumentType: InstrumentType;
  serialNo: string;
  issueDate: string;
  maturityDate: string;
  amount: number;
  currency: string;
  bankName?: string;
  branchName?: string;
  checkNo?: string;
  drawerName?: string;
  drawerIdentityNo?: string;
  notes?: string;
  createdAt: string;
}

// ============================================
// Case Lease (Kira) Types
// ============================================

export type PropertyType = 'KONUT' | 'ISYERI' | 'ARSA' | 'DIGER';
export type EvictionReason = 'KIRA_BORCU' | 'TAHLIYE_TAAHHUTNAMESI' | 'IHTIYAC' | 'YENIDEN_INSAAT' | 'DIGER';

export interface CaseLease {
  id: string;
  caseId: string;
  propertyType: PropertyType;
  propertyAddress: string;
  leaseStartDate: string;
  monthlyRent: number;
  rentCurrency: string;
  evictionReason?: EvictionReason;
  unpaidMonths?: number;
  notes?: string;
  createdAt: string;
}

// ============================================
// Case Judgment (Ilam) Types
// ============================================

export type NafakaType = 'YOKSULLUK' | 'ISTIRAK' | 'TEDBIR' | 'DIGER';

export interface CaseJudgment {
  id: string;
  caseId: string;
  courtName: string;
  decisionNo?: string;
  decisionDate: string;
  finalizationDate?: string;
  judgmentAmount?: number;
  currency: string;
  nafakaType?: NafakaType;
  monthlyNafaka?: number;
  notes?: string;
  createdAt: string;
}

// ============================================
// Case Collateral (Rehin/Ipotek) Types
// ============================================

export type CollateralType = 'IPOTEK' | 'TASIT_REHNI' | 'TICARI_ISLETME_REHNI' | 'MENKUL_REHNI' | 'DIGER';

export interface CaseCollateral {
  id: string;
  caseId: string;
  collateralType: CollateralType;
  description: string;
  estimatedValue?: number;
  mortgageAmount?: number;
  currency: string;
  notes?: string;
  createdAt: string;
}

// ============================================
// Tebligat Types
// ============================================

export type TebligatType = 'ODEME_EMRI' | 'ICRA_EMRI' | 'TAHLIYE_EMRI' | 'HACIZ_IHBARNAMESI_89_1' | 'HACIZ_IHBARNAMESI_89_2' | 'HACIZ_IHBARNAMESI_89_3' | 'SATIS_ILANI' | 'KIYMET_TAKDIRI' | 'DIGER';
export type TebligatChannel = 'PTT' | 'KEP' | 'UETS' | 'ILANEN' | 'ELDEN';
export type TebligatStatus = 'HAZIRLANDI' | 'GONDERILDI' | 'TESLIM_EDILDI' | 'IADE_GELDI' | 'MUHTARLIGA_BIRAKILDI' | 'TEBLIG_EDILMIS_SAYILDI' | 'IPTAL';
export type TebligatPttResult = 'TESLIM_EDILDI' | 'AYNI_KONUTTA_TESLIM' | 'ISYERINDE_TESLIM' | 'ADRESTE_BULUNAMADI' | 'TASINMIS' | 'ADRES_YETERSIZ' | 'BINA_YIKILMIS' | 'ADRES_KAPALI' | 'IMTINA' | 'MUHTARLIGA_BIRAKILDI' | 'VEFAT' | 'TANIMIYOR' | 'DIGER';

export interface TebligatDTO {
  id: string;
  caseId: string;
  caseDebtorId?: string;
  tebligatType: TebligatType;
  addressText: string;
  recipientName: string;
  channel: TebligatChannel;
  status: TebligatStatus;
  barcodeNo?: string;
  sentAt?: string;
  deliveredAt?: string;
  pttResult?: TebligatPttResult;
  notes?: string;
  createdAt: string;
}

export interface CreateTebligatDTO {
  caseId: string;
  caseDebtorId?: string;
  tebligatType: TebligatType;
  addressText: string;
  recipientName: string;
  channel?: TebligatChannel;
}

export interface UpdateTebligatDTO {
  status?: TebligatStatus;
  barcodeNo?: string;
  pttResult?: TebligatPttResult;
  notes?: string;
}

export interface PttTrackingResult {
  barcodeNo: string;
  status: string;
  statusCode: string;
  lastUpdate: string;
  deliveryDate?: string;
  events: Array<{ date: string; location: string; status: string; description: string }>;
  mappedResult?: TebligatPttResult;
}

export interface UetsRecipient {
  tcVkn: string;
  name: string;
  kepAddress?: string;
  uetsAddress?: string;
  isRegistered: boolean;
}

// ============================================
// Debtor Types
// ============================================

export type ServiceReturnReason = 'ADRESTE_BULUNAMADI' | 'TASINMIS' | 'ADRES_YETERSIZ' | 'BINA_YIKILMIS' | 'ADRES_KAPALI' | 'IMTINA' | 'VEFAT' | 'TANIMIYOR' | 'DIGER';

export interface CaseDebtorListItem {
  id: string;
  caseDebtorId: string;
  displayName: string;
  lifecycleStatus: 'ACTIVE' | 'PASSIVE';
  [key: string]: any;
}

export interface CaseDebtorsResponse {
  items: CaseDebtorListItem[];
  summary: {
    total: number;
    delivered: number;
    pending: number;
    returned: number;
    danger: number;
  };
}

export interface VerificationResultDTO {
  verified: boolean;
  source: string;
  verifiedAt: string;
  details?: any;
}

export interface NextAddressSuggestionDTO {
  suggestions: string[];
  createTask: boolean;
}

export interface AddressStatsDTO {
  totalNotifications: number;
  successRate: number;
  lastNotificationDate?: string;
}

export interface NotificationChainDTO {
  chain: Array<{
    addressId: string;
    addressText: string;
    status: string;
    date: string;
    result?: string;
  }>;
}

// ============================================
// Address Discovery Types
// ============================================

export type ClientInfoRequestStatus = 'SENT' | 'RESPONDED' | 'NO_RESPONSE';
export type UyapQueryStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'NO_RESULT';
export type UyapQueryType = 'NUFUS_ADRES' | 'SGK' | 'TICARET_ODASI' | 'VERGI_DAIRESI' | 'GSM' | 'GUMRUK' | 'ORTAKLAR' | 'AILE' | 'ORTAK_DETAY';
export type InstitutionType = 'SGK' | 'VERGI_DAIRESI' | 'TICARET_SICILI' | 'BELEDIYE' | 'TAPU' | 'NUFUS';
export type InstitutionLetterStatus = 'DRAFT' | 'SENT' | 'RESPONDED' | 'NO_RESPONSE';
export type AddressResearchStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'EXHAUSTED';

export interface CreateClientInfoRequestDTO {
  caseId: string;
  clientId: string;
  debtorId?: string;
  emailTo?: string;
  emailSubject?: string;
  emailBody?: string;
}

export interface ClientInfoRequestDTO {
  id: string;
  caseId: string;
  clientId: string;
  status: ClientInfoRequestStatus;
  sentAt: string;
  respondedAt?: string;
  responseNotes?: string;
}

export interface CreateUyapQueryDTO {
  caseDebtorId: string;
  queryType: UyapQueryType;
  notes?: string;
}

export interface UyapQueryDTO {
  id: string;
  caseDebtorId: string;
  queryType: UyapQueryType;
  queryCode: string;
  status: UyapQueryStatus;
  requestedAt: string;
  addressesFound: number;
}

export interface CreateInstitutionLetterDTO {
  caseDebtorId: string;
  institution: InstitutionType;
  letterType: string;
  subject?: string;
  body?: string;
}

export interface InstitutionLetterDTO {
  id: string;
  caseDebtorId: string;
  institution: InstitutionType;
  status: InstitutionLetterStatus;
  sentAt?: string;
  addressesFound: number;
  createdAt: string;
}

export interface CrossFileMatch {
  caseId: string;
  fileNumber: string;
  debtorId: string;
  debtorName: string;
  addressCount: number;
}

export interface AddressResearchDTO {
  id: string;
  caseDebtorId: string;
  status: AddressResearchStatus;
  clientInfoRequested: boolean;
  uyapQueriesCompleted: boolean;
  crossFileChecked: boolean;
  institutionLettersSent: boolean;
  totalAddressesFound: number;
  failedNotifications: number;
  startedAt?: string;
  completedAt?: string;
}

// ============================================
// Report Types
// ============================================

export interface DashboardStats {
  totalCases: number;
  activeCases: number;
  closedCases: number;
  totalCollection: number;
}

export interface RiskSummary {
  totalActive: number;
  distribution: Array<{
    code: string;
    name: string;
    color: string;
    count: number;
    totalAmount: number;
    percentage: number;
  }>;
}

// ============================================
// Finance Types
// ============================================

export interface SummaryResult {
  caseId: string;
  asOfDate: string;
  currency: string;
  totals: {
    takipTutari: number;
    icraMasraflari: number;
    vekaletUcreti: number;
    takipSonrasiFaiz: number;
    toplamBorc: number;
    toplamTahsilat: number;
    sonBorc: number;
  };
}

export interface BankAccount {
  id: string;
  bankProvider: string;
  accountName: string;
  iban: string;
  currency: string;
  isActive: boolean;
}

// ============================================
// UYAP Types
// ============================================

export type UyapRequestStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'RETRY';

export interface UyapResponse<T = any> {
  success: boolean;
  data?: T;
  errorCode?: string;
  errorMessage?: string;
  requestId: string;
}

export interface UyapStatus {
  connected: boolean;
  mode: 'STUB' | 'LIVE';
  message: string;
}

// ============================================
// Client (Müvekkil) — kanonik tip kaynağı (Task 3)
// ============================================
// Tek-kaynak: lib/api/client.types.ts. Umbrella re-export → consumer'lar @/lib/api/types'tan da erişir.
export * from './client.types';
