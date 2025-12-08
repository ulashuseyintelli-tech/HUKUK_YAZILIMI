const { getDistrictsByCity, cities } = require("./cities");

const USER_TYPE = {
  BOSS: "boss",
  PERSON: "person",
  LAWYER: "lawyer",
};

const CLIENT_TYPES = {
  PERSON: "person",
  INSTITUTION: "institution",
};

const DEBTOR_TYPE = {
  PERSON: "person",
  INSTITUTION: "institution",
};

const ADDRESS_TYPE = {
  FORMAL: {
    value: "formal",
    text: "Resmi Adres",
  },
  DECLARATION: {
    value: "declaration",
    text: "Beyan Adresi",
  },
};

const TASK_TYPE = {
  CASE_DETAILS_REQUIRED: "case-details-required",
  AGAIN_QUERY_REQUIRED: "again-query-required",
  QUERY_RESPONSE_REQUIRED: "query-response-required",
  QUERY_RESPONSE_ENTRY_REQUIRED: "query-response-entry-required",
  SEIZE_DE_FACTO_REQUIRED: "seize-de-facto-required",
  FORECLOSABLE_ADDRESS_REQUIRED: "foreclosable-address-required",
  REASON_FOR_NEGATIVE_REQUIRED: "reason-for-negative-required",
  DEBTOR_NOTIFICATION_REQUIRED: "debtor-notification-required",
  DEBTOR_NULL_ADDRESS: "debtor-null-address",
  DEBTOR_NULL_IDENTITY: "debtor-null-identity",
  DEBTOR_NULL_ADDRESS_AND_IDENTITY: "debtor-null-address-and-identity",
  DEBTOR_NULL_FORMAL_ADDRESS: "debtor-null-formal-address",
  NOTIFICATION_BARCODE_NUMBER_REQUIRED: "notification-barcode-number-required",
  NOTIFICATION_BARCODE_NUMBER_REQUEST: "notification-barcode-number-request",
  NOTIFICATION_STEP_1: "notification-step-1",
  NOTIFICATION_STEP_2: "notification-step-2",
  NOTIFICATION_STEP_3: "notification-step-3",
  NOTIFICATION_STEP_4: "notification-step-4",
  NOTIFICATION_THIRD_PERSON_STEP_0: "notification-third-person-step-1",
  NOTIFICATION_THIRD_PERSON_STEP_1: "notification-third-person-step-2",
  NOTIFICATION_THIRD_PERSON_STEP_2: "notification-third-person-step-3",
  NOTIFICATION_OBJECTION: "notification-objection",
  NOTIFICATION_OBJECTION_DATE: "notification-objection-date",
  NOTIFICATION_DONE_DATE: "notification-done-date",
  NOTIFICATION_RECIPIENT: "notification-recipient",
  NOTIFICATION_DONE: "notification-done",
  NOTIFICATION_THIRD_PERSON_DONE: "notification-third-person-done",
  IS_SEIZED: "is-seized",
  NOT_DISTRAINABLE_OBJECTION: "not-distrainable-objection",
  RESTRICTIONS_NOTIFICATION_REQUIRED: "restrictions-notification-required",
  RESTRICTIONS_NOTIFICATION_RESPONSE: "restrictions-notification-response",
  RESTRICTIONS_NOTIFICATION_MEMORIAL: "restrictions-notification-memorial",
  RESTRICTIONS_NOTIFICATION_MEMORIAL_RESPONSE:
    "restrictions-notification-memorial-response",
  RESTRICTIONS_EXIST: "restrictions-exist",
  RESTRICTIONS_COUNT: "restrictions-count",
  RESTRICTIONS_CANCELLED_ASSET: "restrictions-cancelled-asset",
  RESTRICTIONS_COMPLETED: "restrictions-completed",
  RESTRICTIONS_REQUIRED: "restrictions-required",
  INPOUNDMENT_NOTIFICATION_REQUIRED: "inpoundment-notification-required",
  CLAIM_103_DOCUMENT_CREATE: "claim-103-document-create",
  CLAIM_103_DOCUMENT_STATUS: "claim-103-document-status",
  NOTIFICATION_OBJECTION_REMAINING_TIME:
    "notification-objection-remaining-time",
  SALE_ADVANCE_REQUIRED: "sale-advance-required",
  WARRANT_REQUIRED: "warrant-required",
  ZONING_STATUS_DOCUMENT_CREATE: "zoning-status-document-create",
  ZONING_STATUS_ANSWER: "zoning-status-answer",
  CADASTRE_DOCUMENT_CREATE: "cadastre-document-create",
  CADASTRE_ANSWER: "cadastre-answer",
  CUSTODIAN_INFO_REQUIRED: "custodian-info-required",
  APPRAISAL_DOCUMENT_REQUIRED: "appraisal-document-required",
  APPRAISAL_RESULT_REQUIRED: "appraisal-result-required",
  CLAIM_100_DOCUMENT_CREATE: "claim-100-document-create",
  CLAIM_100_DOCUMENT_STATUS: "claim-100-document-status",
  GARNISHMENT_CLAIM_100_DOCUMENT_CREATE:
    "garnishment-claim-100-document-create",
  GARNISHMENT_CLAIM_100_DOCUMENT_STATUS:
    "garnishment-claim-100-document-status",
  LAST_INPOUNDMENT_STATUS_REQUIRED: "last-inpoundment-status-required",
  RESTRICTIONS_UPDATE_REQUIRED: "restrictions-update-required",
  APPRAISAL_NOTIFICATION_REQUIRED: "appraisal-notification-required",
  APPRAISAL_NOTIFICATION_DONE_REQUIRED: "appraisal-notification-done-required",
  SALE_SOLD_BY_ANOTHER_CREDITOR: "sale-sold-by-another-creditor",
  SALE_REQUEST_REQUIRED: "sale-request-required",
  SALE_REQUEST_TRACKING_NUMBER_REQUIRED:
    "sale-request-tracking-number-required",
  SALE_REQUEST_RESPONSE_REQUIRED: "sale-request-answer-required",
  SALE_REQUEST_RESPONSE_STATUS_REQUIRED: "sale-status-required",
  SALE_REQUEST_RESPONSE_STATUS_NEGATIVE_REASON_REQUIRED:
    "sale-request-negative-reason-required",
  SALE_REQUEST_DAY_ADDRESSES_REQUIRED: "sale-request-day-addresses-required",
  SALE_REQUEST_DAY_DATES_REQUIRED: "sale-request-day-dates-required",
  SALE_REQUEST_DAY_NEWSPAPER_ANNOUNCE_REQUIRED:
    "sale-request-day-newspaper-announce-required",
  SALE_REQUEST_DAY_RESPONSE: "sale-request-day-response",
  SALE_REQUEST_DAY_REASON_FOR_NEGATIVE: "sale-request-day-reason-for-negative",
  SALE_REQUEST_SECOND_DAY_REQUIRED: "sale-request-second-day-required",
  SALE_REQUEST_COMPLETED_NOTIFICATION_REQUIRED:
    "sale-request-completed-notification-required",
  NEW_SALE_REQUEST_REQUIRED: "new-sale-request-required",
  SALE_NOTIFICATION_REQUIRED: "sale-notification-required",
  SALE_DETAILS: "sale-details",
  SALE_HAVE_WE_SHARE: "sale-have-we-share",
  SHARE_AMOUNT: "share-amount",
  SALE_MONEY_INCOME_REQUIRED: "sale-money-income-required",
  SALE_MONEY_INCOME_SHARE_REQUIRED: "sale-money-income-share-required",
  SALE_COLLECTION_REQUIRED: "sale-collection-required",
  DE_FACTO_IS_DEBTOR_EXIST: "de-facto-is-debtor-exist",
  DE_FACTO_IS_POLICE_HELPED: "de-facto-is-police-helped",
  DE_FACTO_IS_MONEY_RECEIVED: "de-facto-is-money-received",
  DE_FACTO_RECEIVED_MONEY_AMOUNT: "de-facto-received-money-amount",
  DE_FACTO_PERSON_GOT_MONEY: "de-facto-person-got-money",
  DE_FACTO_IS_MONEY_REQUESTED: "de-facto-is-money-requested",
  DE_FACTO_IS_RECEIVED_MONEY_DECLARED: "de-facto-is-received-money-declared",
  DE_FACTO_MONEY_COLLECTION_REQUIRED: "de-facto-money-collection-required",
  IS_ASSET_RECEIVED: "is-asset-received",
  RECEIVED_ASSETS: "received-assets",
  RECEIVED_ASSETS_RESTRICTIONS_EXIST: "received-assets-restrictions-exist",
  RECEIVED_ASSETS_RESTRICTIONS_CREATED: "received-assets-restrictions-created",
  DE_FACTO_IS_COMMITMENT_RECEIVED: "de-facto-is-commitment-received",
  DE_FACTO_PERSON_MAKE_COMMITMENT: "de-facto-person-make-commitment",
  DE_FACTO_COMMITMENT_DETAILS: "de-facto-commitment-details",
  DE_FACTO_IS_GUARANTEED: "de-facto-is-guaranteed",
  DE_FACTO_GUARANTEE_DETAILS: "de-facto-guarantee-details",
  DE_FACTO_CONSENT_TO_GARNISHMENT: "de-facto-consent-to-garnishment",
  DE_FACTO_PERSON_CONSENT_TO_GARNISHMENT:
    "de-facto-person-consent-to-garnishment",
  DE_FACTO_COMPANY_OF_PERSON_CONSENT_TO_GARNISHMENT:
    "de-facto-company-of-person-consent-to-garnishment",
  DE_FACTO_GARNISHMENT_DETAILS: "de-facto-garnishment-details",
  DE_FACTO_GARNISHMENT_SALARY_INFO: "de-facto-garnishment-salary-info",
  DE_FACTO_GARNISHMENT_DOCUMENTS: "de-facto-garnishment-documents",
  DE_FACTO_GARNISHMENT_DOCUMENTS_RESPONSE:
    "de-facto-garnishment-documents-response",
  CREATE_INPOUNDMENT: "create-inpoundment",
  SHOULD_CREATE_SSI_INPOUNDMENT: "should-create-ssi-inpoundment",
  INPOUNDMENT_RESPONSE: "inpoundment-response",
  INPOUNDMENT_MEMORIAL: "inpoundment-memorial",
  INPOUNDMENT_MEMORIAL_RESPONSE: "inpoundment-memorial-response",
  SSI_INPOUNDMENT_SALARY_AMOUNT: "ssi-inpoundment-salary-amount",
  SSI_INPOUNDMENT_SALARY_INFO: "ssi-inpoundment-salary-info",
  SSI_MEMORIAL: "ssi-memorial",
  DE_FACTO_GARNISHMENT_MEMORIAL: "de-facto-garnishment-memorial",
  MONEY_REQUEST_REQUIRED: "money-request-required",
  MONEY_REQUEST_RESPONSE: "money-request-response",
  CREATE_COLLECTION: "create-collection",
  SHARE_COMPANY: "share-company",
  CHAMBER_OF_COMMERCE_DOCUMENT: "chamber-of-commerce-document",
  CHAMBER_OF_COMMERCE_NOTIFICATION: "chamber-of-commerce-notification",
  CREDITOR_CASE_THIRD_PERSON_WARN: "creditor-case-third-person-warn",
  CREDITOR_CASE_INCOME_CHECK: "creditor-case-income-check",
  MAKE_THIRD_PERSON_DEBTOR: "make-third-person-debtor",
  CUSTOMS_SEIZE_DE_FACTO_REQUIRED: "customs-seize-de-facto-required",
  ENTER_WRIT_DETAILS: "enter-writ-details",
  CREATE_CHILDREN: "create-children",
  CREATE_CHILDREN_DAYS: "create-children-days",
  RECEIVE_CHILDREN: "receive-children",
  BANK_RESPOND: "bank-respond",
  BANK_ACCOUNT_EXIST: "bank-account-exist",
  BANK_ACCOUNT_BALANCE: "bank-account-balance",
  BANK_ACCOUNT_BALANCE_CANCELLED_ASSET: "restrictions-cancelled-asset",
  BANK_MONEY_RESPONSE: "bank-money-response",
  COMMITMENT_COLLECTION_REQUIRED: "commitment-collection-required",
  ACTION_FOR_ANNULMENT_OF_OBJECTION: "action-for-annulment-of-objection",
  CREATE_COURT: "create-court",
  ENTER_INTEL_INFO: "enter-intel-info",
  SELECT_INTEL_TYPES: "select-intel-types",
  REQUEST_INTEL: "request-intel",
  ENTER_INTEL_RESPONSE: "enter-intel-response",
  REQUEST_INTEL_ALIAS: "request-intel-alias",
  ENTER_INTEL_ALIAS_RESPONSE: "enter-intel-alias-response",
  IS_INTEL_RESPONSE_USEFUL: "is-intel-response-useful",
  UPDATE_DEBTOR_BY_INTEL: "update-debtor-by-intel",
  IS_EVACUATED: "is-evacuated",
  REQUEST_EVICTION: "request-eviction",
  ENTER_EVICTION_RESPONSE: "enter-eviction-response",
  REQUEST_BANKRUPTCY: "request-bankruptcy",
  ENTER_BANKRUPTCY_RESPONSE: "enter-bankruptcy-response",
  MAKE_BANKRUPTCY_WRITTEN_TO_ESTATE: "make-bankruptcy-written-to-estate",
  JURIDICAL_DAY_RESPONSE_REQUIRED: "juridical-day-response-required",
  NEXT_JURIDICAL_DAY_REQUIRED: "next-juridical-day-required",
  COURT_ASSURANCE_SHOULD_PAY: "court-assurance-should-pay",
  GUARANTEE_FEE_MUST_PAY: "guarantee-fee-must-pay",
  IS_103_LEFT_TO_PLACE: "is-103-left-to-place",
  FAMILY_MEMBER_ASSET_QUERY_REQUIRED: "family-member-asset-query",
  FAMILY_MEMBER_FORECLOSABLE_ANYMORE: "family-member-foreclosable-anymore",
};

const CASE_INITIALIZATION_TASK_TYPES = [
  TASK_TYPE.DEBTOR_NOTIFICATION_REQUIRED,
  TASK_TYPE.DEBTOR_NULL_ADDRESS,
  TASK_TYPE.DEBTOR_NULL_IDENTITY,
  TASK_TYPE.DEBTOR_NULL_ADDRESS_AND_IDENTITY,
  TASK_TYPE.DEBTOR_NULL_FORMAL_ADDRESS,
  TASK_TYPE.NOTIFICATION_BARCODE_NUMBER_REQUIRED,
  TASK_TYPE.NOTIFICATION_BARCODE_NUMBER_REQUEST,
  TASK_TYPE.NOTIFICATION_STEP_1,
  TASK_TYPE.NOTIFICATION_STEP_2,
  TASK_TYPE.NOTIFICATION_STEP_3,
  TASK_TYPE.NOTIFICATION_STEP_4,
  TASK_TYPE.NOTIFICATION_OBJECTION,
  TASK_TYPE.NOTIFICATION_OBJECTION_DATE,
  TASK_TYPE.NOTIFICATION_DONE_DATE,
  TASK_TYPE.NOTIFICATION_DONE,
  TASK_TYPE.ENTER_INTEL_INFO,
  TASK_TYPE.SELECT_INTEL_TYPES,
  TASK_TYPE.REQUEST_INTEL,
  TASK_TYPE.ENTER_INTEL_RESPONSE,
  TASK_TYPE.REQUEST_INTEL_ALIAS,
  TASK_TYPE.ENTER_INTEL_ALIAS_RESPONSE,
  TASK_TYPE.UPDATE_DEBTOR_BY_INTEL,
];

const TASK_STATUS = {
  PENDING: "PENDING",
  DONE: "DONE",
  CANCELLED: "CANCELLED",
  CANCELLED_BY_SYSTEM: "CANCELLED_BY_SYSTEM",
  CANCELLED_BY_CASE_REMOVE: "CANCELLED_BY_CASE_REMOVE",
  CANCELLED_BY_RESTRICTIONS_THRESHOLD: "CANCELLED_BY_RESTRICTIONS_THRESHOLD",
  CANCELLED_BY_BANK_ACCOUNT_BALANCE_THRESHOLD:
    "CANCELLED_BY_RESTRICTIONS_THRESHOLD",
  CANCELLED_BY_SSI_PAY: "CANCELLED_BY_SSI_PAY",
  FUTURE: "FUTURE",
  OVERDUE: "OVERDUE",
};

const NOTIFICATION_STATUS = {
  PENDING: "PENDING",
  REJECTED: "REJECTED",
  DONE: "DONE",
};

const NOTIFICATION_KIND = {
  FAST: "FAST",
  NORMAL: "NORMAL",
  ONLINE: "ONLINE",
};

const NOTIFICATION_STATUS_WITH_OBJECTION = {
  ...NOTIFICATION_STATUS,
  OBJECTION: "OBJECTION",
};

const NOTIFICATION_TYPE = {
  CASE_INITIALIZATION: "case-initalization",
  THIRD_PERSON: "third-person",
  103: "103",
  ZONING_STATUS: "zoning-status",
  CADASTRE: "cadastre",
  APPRAISAL_RESULT: "appraisal-result",
  GARNISHMENT: "garnishment",
  SHARE: "share",
  CHAMBER_OF_COMMERCE: "chamber-of-commerce",
  INPOUNDMENT_MEMORIAL: "inpoundment-memorial",
  SSI_MEMORIAL: "ssi-memorial",
  RESTRICTIONS_MEMORIAL: "restrictions-memorial",
  DE_FACTO_GARNISHMENT_MEMORIAL: "de-facto-garnishment-memorial",
};

const INPOUNDMENT_TYPES = {
  FAMILY_REGISTER: "Aile Nüfus Kaydı",
  VEHICLE: "Araç",
  IMMOVABLE: "Gayrimenkul",
  SSI: "SGK",
  BANK: "Toplu Banka",
  CUSTOMS: "Gümrük",
  TAX_DUE: "Vergi Alacağı",
  PATENT: "Patent Enstitüsü",
  CREDITOR_CASE: "Alacaklı Olduğu Dosya",
  SHARE: "Hisse Haczi",
  DE_FACTO: "Fiili Haciz",
};

const QUERY_TYPES = {
  FAMILY_REGISTER: INPOUNDMENT_TYPES.FAMILY_REGISTER,
  VEHICLE: INPOUNDMENT_TYPES.VEHICLE,
  IMMOVABLE: INPOUNDMENT_TYPES.IMMOVABLE,
  SSI: INPOUNDMENT_TYPES.SSI,
  BANK: INPOUNDMENT_TYPES.BANK,
  CUSTOMS: INPOUNDMENT_TYPES.CUSTOMS,
  TAX_DUE: INPOUNDMENT_TYPES.TAX_DUE,
  PATENT: INPOUNDMENT_TYPES.PATENT,
  CREDITOR_CASE: INPOUNDMENT_TYPES.CREDITOR_CASE,
  SHARE: INPOUNDMENT_TYPES.SHARE,
};

const ASSET_TYPE = {
  FAMILY_REGISTER: "FAMILY_REGISTER",
  FAMILY_MEMBER: "FAMILY_MEMBER",
  VEHICLE: "VEHICLE",
  IMMOVABLE: "IMMOVABLE",
  SSI: "SSI",
  BANK: "BANK",
  CUSTOMS: "CUSTOMS",
  TAX_DUE: "TAX_DUE",
  PATENT: "PATENT",
  CREDITOR_CASE: "CREDITOR_CASE",
  SHARE: "SHARE",
  NORMAL_ASSET: "NORMAL_ASSET",
  DE_FACTO: "DE_FACTO",
  PLEDGED_MOVABLE: "PLEDGED_MOVABLE",
};

const BANK_LIST = [
  "ING BANK A.Ş.",
  "DENİZBANK A.Ş.",
  "YAPI VE KREDİ BANKASI A.Ş.",
  "TÜRKİYE GARANTİ BANKASI A.Ş.",
  "TÜRK EKONOMİ BANKASI A.Ş.",
  "ŞEKERBANK T.A.Ş.",
  "AKBANK T.A.Ş.",
  "BURGAN BANK A.Ş.",
  "T.C. ZİRAAT BANKASI A.Ş.",
  "TÜRKİYE HALK BANKASI A.Ş.",
  "ALBARAKA TÜRK KATILIM BANKASI A.Ş.",
  "TÜRKİYE VAKIFLAR BANKASI T.A.O.",
  "ODEABANK A.Ş.",
  "KUVEYT TÜRK A.Ş",
  "TÜRKİYE FİNANS KATILIM BANKASI",
  "CİTİBANK A.Ş",
  "DEUTSCHE BANK A.Ş.",
  "FİBABANKA A.Ş.",
  "ARAP TÜRK BANKASI",
  "KBC TURKEY BANK A.Ş.",
  "QNB FİNANSBANK A.Ş.",
  "TÜRKİYE İŞ BANKASI A.Ş.",
  "ALTERNATİFBANK A.Ş.",
];

const SALE_DAY = {
  saleDate: null,
  address: null,
  isSaleAnnouncedAtNewspaper: null,
  saleStatus: null,
  reasonForBeingNegative: null,
  saleNotificationStatus: NOTIFICATION_STATUS.PENDING,
};

const SSI_SALARY_TYPE = {
  ALL: {
    value: "ALL",
    text: "Maaşın Tümü",
  },
  PERCENTAGE: {
    value: "PERCENTAGE",
    text: "Belirli Bir Oranda",
  },
  DIRECT: {
    value: "DIRECT",
    text: "Miktar",
  },
};

const COMMITMENT_DETAILS = {
  totalAmount: 0,
  createdAt: new Date(),
  isSplittedToInstallments: false,
  areInstallmentsFree: false,
  firstInstallmentDate: new Date(),
  installmentsCount: 0,
  installmentsIntervalByDays: 0,
  calculatedInstallments: [],
};

const GARNISHMENT_DETAILS = {
  date: null,
  amount: null,
  type: SSI_SALARY_TYPE.DIRECT.value,
  percentageToCollection: null,
  amountToCollection: null,
};

const QUERY_REMINDER_DAYS = {
  FAMILY_REGISTER: 180,
  VEHICLE: 180,
  IMMOVABLE: 180,
  SSI: 180,
  BANK: 180,
  CUSTOMS: 180,
  TAX_DUE: 180,
  PATENT: 180,
  CREDITOR_CASE: 180,
  SHARE: 180,
  BANK_ACCOUNT_EXIST: 180,
  BANK_ACCOUNT_BALANCE: 180,
};

const getDefaultTaskTransitionDays = () => {
  return Object.keys(TASK_TYPE).map((type) => {
    return { value: TASK_TYPE[type], days: 3 };
  });
};

const CUSTODIAN_INFO = {
  address: {
    city: cities[0].name,
    district: getDistrictsByCity(cities[0].name)[0].districtName,
    description: "",
  },
  name: "",
  startDate: null,
  dailyPrice: null,
};

const HYPOTEC_INFO = {
  assetType: null,
  assetId: null,
  isUnsatisfied: null,
};

const BANKRUPTCY_INFO = {
  isRequested: null,
  response: null,
  isWrittenToEstate: null,
  estateResponse: null,
};

const COURT_TYPE = {
  DUD: "dud",
  CASE_INITIALIZATION: "case-initialization",
  NOT_WANTING_BANKRUPTCY: "not-wanting-bankruptcy",
  OFFICER_PROCESS: "officer-process",
  ABANDON_THE_TRADE_WITHOUT_DECLARATION:
    "abandon-the-trade-without-declaration",
  OBJECTION_TO_ORDER_TABLE: "objection-to-order-table",
  ACTION_FOR_NOT_DISTRAINABLE_OBJECTION:
    "action-for-not-distrainable-objection",
};

const WRIT_TYPE = {
  COURT: {
    value: "COURT",
    tr: "Mahkeme",
  },
  NOTARY: {
    value: "NOTARY",
    tr: "Noter",
  },
  ARBITRATION_AWARD: {
    value: "ARBITRATION_AWARD",
    tr: "Hakem Kararı",
  },
  OTHER: {
    value: "OTHER",
    tr: "Diğer",
  },
  CONCILIATION: {
    value: "CONCILIATION",
    tr: "Arabuluculuk",
  },
};

const WRIT_FILE_TYPE = {
  LAW_CASE: {
    value: "LAW_CASE",
    text: "Hukuk Dava Dosyası",
  },
  LAW_JOB: {
    value: "LAW_JOB",
    text: "Hukuk Değişik İş Dosyası",
  },
  HERITAGE: {
    value: "HERITAGE",
    text: "Tereke Dosyası",
  },
  ARBIRATIOR: {
    value: "ARBIRATOR",
    text: "Hakem Dava Dosyası",
  },
  PUNISHMENT: {
    value: "PUNISHMENT",
    text: "Ceza Dava Dosyası",
  },
  PUNISHMENT_DIFFEREN: {
    value: "PUNISHMENT_DIFFEREN",
    text: "Ceza Değişik İş Dosyası",
  },
  CONTROL: {
    value: "CONTROL",
    text: "İdare Dava Dosyası",
  },
  REGION: {
    value: "REGION",
    text: "Bölge Dosyası",
  },
  TAX: {
    value: "TAX",
    text: "Vergi Dava Dosyası",
  },
  PUBLIC: {
    value: "PUBLIC",
    text: "Kamu Dosyası",
  },
  OBJECTION: {
    value: "OBJECTION",
    text: "YD İtiraz Dosyası",
  },
};

const WRIT = {
  type: WRIT_TYPE.COURT,
  fileType: WRIT_FILE_TYPE.LAW_CASE,
  basisNumber: "",
  adjudgementNumber: "",
  writDate: new Date(),
  court: null,
  request: "",
};

const CHILDREN_DETAILS = {
  days: [],
  areChildrenReceived: null,
};

const RENTAL_DETAILS = {
  type: null,
  annualValue: null,
  annualValueCurrency: "TRY",
  contractType: null,
  address: null,
  contractDuration: null,
};

const RENTAL_TYPES = ["Adi kira", "Hasılat kirası"];

const EVICTION = {
  isEvacuatedBySelf: null,
  isEvictionRequested: null,
  isEvacuated: null,
};

const CASE_TRANSITION_DAYS = {
  2: 7,
  3: 7,
  4: 7,
  6: 30,
  7: 7,
  8: 15,
  9: 30,
  10: 10,
  11: 7,
  12: 5,
  13: 30,
  14: 15,
};

const EVACUATION_AND_DELIVERY_DETAILS = {
  isWent: null,
  isDelivered: null,
  isDeliveredToCustodian: null,
  goForEvacuationAndDelivery: null,
  isEvacuated: null,
  custodianInfo: CUSTODIAN_INFO,
};

const TASK_SORT_OPTIONS = {
  DUE_DATE: {
    value: { dueDate: -1 },
    text: "Bitiş Tarihi En Uzak Olan",
  },
  DUE_DATE_DESCENDING: {
    value: { dueDate: 1 },
    text: "Bitiş Tarihi En Yakın Olan",
  },
  START_DATE: {
    value: { startDate: -1 },
    text: "Başlangıç Tarihi En Uzak Olan",
  },
  START_DATE_DESCENDING: {
    value: { startDate: 1 },
    text: "Başlangıç Tarihi En Yakın Olan",
  },
};

const EXPENSE_TYPE = {
  OFFICIAL: "OFFICIAL",
  UNOFFICIAL: "UNOFFICIAL",
};

const COLLECTION_TYPE = {
  GENERAL: "GENERAL",
  BANK: "BANK",
  CREDITOR_CASE: "CREDITOR_CASE",
  TAX_DUE: "TAX_DUE",
  SALE: "SALE",
  COMMITMENT: "COMMITMENT",
  DE_FACTO_COMMITMENT: "DE_FACTO_COMMITMENT",
  DE_FACTO_MONEY: "DE_FACTO_MONEY",
  DE_FACTO_GARNISHMENT: "DE_FACTO_GARNISHMENT",
  SSI: "SSI",
};

const PAYEE_OPTIONS = [
  "VEKİL",
  "HARİCEN",
  "İCRA DOSYASI",
  "MÜVEKKİL",
  "BANKA",
  "BAYİİ",
  "RESMİ TAAHHÜT",
];

const CASE_TYPES_NEEDS_WRIT = ["2", "3", "4", "5", "6"];
const CASE_TYPES_WITHOUT_DUE = ["3", "14"];

const RECEIVED_ASSET_MODEL = {
  assetName: { type: String },
  assetType: { type: String },
  assetBrand: { type: String },
  assetSize: { type: String },
  assetAppraisalResult: { type: String },
  areRestrictionsExist: { type: Boolean },
  restriction: { type: Object },
};

const DEFAULT_RESTRICTION = {
  exist: null,
  count: 0,
  isCancelledByThreshold: null,
  table: [],
  completed: null,
  updated: null,
};

const THIRD_PERSON_REASONS = {
  BANK: "bank",
  GUARANTEE: "guarantee",
  COMMITMENT: "commitment",
  SSI: "ssi",
  SHARE: "share",
};

const DEATH_OPTIONS = {
  CLOSED: "CLOSED",
  ALIVE: "ALIVE",
  DEAD: "DEAD",
};

const PROXIMITY_OPTIONS = {
  FATHER: "FATHER",
  MOTHER: "MOTHER",
  SIBLING: "SIBLING",
  PARTNER: "PARTNER",
  EX_PARTNER: "EX_PARTNER",
};

const NOTIFICATION_RECIPIENT = {
  OWN: {
    value: "OWN",
    text: "Kendisine",
  },
  PARTNER: {
    value: "PARTNER",
    text: "Eşine",
  },
  HOUSEMATE: {
    value: "HOUSEMATE",
    text: "Birlikte Oturan Yakınına",
  },
  COMPANY_EMPLOYEE: {
    value: "COMPANY_EMPLOYEE",
    text: "Daimi çalışanına",
  },
  CHIEF: {
    value: "CHIEF",
    text: "İdare Amiri",
  },
  TK20: {
    value: "TK20",
    text: "TK. 20 MD Göre",
  },
  TK21: {
    value: "TK21",
    text: "TK. 21 MD Göre",
  },
  TK35: {
    value: "TK35",
    text: "TK. 35 MD Göre",
  },
  PUBLICATION: {
    value: "PUBLICATION",
    text: "İlanen Tebligat",
  },
  HEADMEN: {
    value: "HEADMEN",
    text: "Muhtara",
  },
};

const FORECLOSABLE_RECIPIENTS = [
  NOTIFICATION_RECIPIENT.OWN.value,
  NOTIFICATION_RECIPIENT.PARTNER.value,
  NOTIFICATION_RECIPIENT.HOUSEMATE.value,
  NOTIFICATION_RECIPIENT.COMPANY_EMPLOYEE.value,
  NOTIFICATION_RECIPIENT.TK20.value,
];

module.exports = {
  USER_TYPE,
  CLIENT_TYPES,
  DEBTOR_TYPE,
  ADDRESS_TYPE,
  TASK_TYPE,
  TASK_STATUS,
  NOTIFICATION_STATUS,
  NOTIFICATION_KIND,
  NOTIFICATION_STATUS_WITH_OBJECTION,
  NOTIFICATION_TYPE,
  INPOUNDMENT_TYPES,
  QUERY_TYPES,
  BANK_LIST,
  SALE_DAY,
  SSI_SALARY_TYPE,
  COMMITMENT_DETAILS,
  GARNISHMENT_DETAILS,
  QUERY_REMINDER_DAYS,
  getDefaultTaskTransitionDays,
  CUSTODIAN_INFO,
  HYPOTEC_INFO,
  BANKRUPTCY_INFO,
  WRIT,
  CHILDREN_DETAILS,
  RENTAL_DETAILS,
  RENTAL_TYPES,
  EVICTION,
  EVACUATION_AND_DELIVERY_DETAILS,
  CASE_TRANSITION_DAYS,
  TASK_SORT_OPTIONS,
  EXPENSE_TYPE,
  COLLECTION_TYPE,
  CASE_INITIALIZATION_TASK_TYPES,
  CASE_TYPES_NEEDS_WRIT,
  CASE_TYPES_WITHOUT_DUE,
  COURT_TYPE,
  RECEIVED_ASSET_MODEL,
  PAYEE_OPTIONS,
  DEFAULT_RESTRICTION,
  ASSET_TYPE,
  THIRD_PERSON_REASONS,
  DEATH_OPTIONS,
  PROXIMITY_OPTIONS,
  FORECLOSABLE_RECIPIENTS,
};
