import { cities, getDistrictsByCity } from './services/cities'
import tr from 'date-fns/locale/tr'
import { getTaskTargetUrl } from './helpers/Helper'
import printer from './printer'
import {
	FaBuilding,
	FaCar,
	FaCopyright,
	FaDungeon,
	FaHome,
	FaMoneyBill,
	FaMoneyBillWaveAlt,
	FaSuitcase,
	FaUniversity,
	FaUsers,
	FaWalking,
} from 'react-icons/fa'
export const locale = tr

export const STATUS = {
	LOADING: 'loading',
	NORMAL: 'normal',
	ERROR: 'error',
}

export const USER_TYPE = {
	BOSS: 'boss',
	PERSON: 'person',
	LAWYER: 'lawyer',
}

export const CASE_STATUS = [
	'HİTAM',
	'DERDEST',
	'BATAK',
	'TEMLİK',
	'MAHSUP',
	'ACİZ',
	'DERKENAR',
	'İNFAZ',
	'MÜVEKKİL İADE',
	'İTİRAZLI',
]

export const CASE_STATUS_REQUIRE_CANCEL = ['TEMLİK', 'MÜVEKKİL İADE', 'BATAK']

export const CASE_TRANSITION_DAYS = {
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
}

export const CASE_TYPE = {
	2: 'Form 2 (Taşınır Teslimine veya Taşınmaz Tahliye veya Teslimi)',
	3: 'Form 3 (Çocuk Teslimi)',
	4: 'Form 4-5 (Para veya Teminat veya İşin Yapılmasına İlamlı)',
	6: 'Form 6 (İpoteğin Paraya Çevrilmesi İLAMLI)',
	7: 'Form 7 (İlamsız)',
	8: 'Form 8 (Taşınır Rehninin Para Çevrilmesi)',
	9: 'Form 9 (İpoteğin Paraya Çevrilmesi)',
	10: 'Form 10 (Kambiyo Haciz)',
	11: 'Form 11 (İflas)',
	12: 'Form 12 (Kambiyo İflas)',
	13: 'Form 13 (Kira)',
	14: 'Form 14 (Kira Tahliye)',
}

export const CASE_TYPES_NEEDS_WRIT = ['2', '3', '4', '5', '6']
export const CASE_TYPES_WITHOUT_DUE = ['2', '3', '14']
export const CASE_TYPES_WITHOUT_BACK_BUTTON = ['6', '8']

export const CASE_WAY = {
	2: [
		{
			text: 'Taşınır Teslimi',
			value: 'DELIVERY_OF_MOVABLE',
		},
		{
			text: 'Taşınmaz Tahliye ve Teslimi',
			value: 'EVACUATION_AND_DELIVERY_OF_REAL_ESTATE',
		},
		{
			text: 'Tahliye',
			value: 'EVACUATION',
		},
	],
}

export const getDefaultCase = type => {
	return {
		status: CASE_STATUS[0],
		type: type,
		way: CASE_WAY.EVACUATION,
		executionFileNumber: '2020/',
		date: new Date(),
		lawyerIds: [],
		customerIds: [],
		debtorIds: [],
		dueIds: [],
		paymentIds: [],
	}
}

export const LAWYER_TYPE = {
	INSTITUTION: 'Kurum Avukatı',
	ASSURED: 'Sigortalı',
}

export const LAWYER_DEPUTY_TYPE = {
	BARO: 'Baro',
	BARO: 'Baro',
}

export const CLIENT_TYPES = {
	PERSON: 'person',
	INSTITUTION: 'institution',
}

export const DEBTOR_TYPES = {
	PERSON: 'person',
	INSTITUTION: 'institution',
}

export const DEBTOR_KINDS = ['BORÇLU/MÜFLİS', 'BORÇLU/MÜFLİS2']

export const POWERS_FOR_CLIENT = ['Ahzu Kabza', 'Feragat', 'İbra', 'Sulh']

export const INSTITUTION_TYPES = {
	PUBLIC: 'public',
	PUBLIC2: 'public2',
}

export const PHONE_NUMBER = {
	title: '',
	number: '',
}

export const ADDRESS = {
	title: '',
	description: '',
	city: cities[0].name,
	district: getDistrictsByCity(cities[0].name)[0].districtName,
}

export const ADDRESS_TYPE = {
	FORMAL: {
		value: 'formal',
		text: 'MERNIS Adresi',
		getText: (debtor, debtorType) => {
			return `${
				(debtor?.type || debtorType) === DEBTOR_TYPES.INSTITUTION
					? 'MERSİS'
					: 'MERNİS'
			} Adresi`
		},
	},
	DECLARATION: {
		value: 'declaration',
		text: 'Beyan Adresi',
		getText: () => {
			return `Beyan Adresi`
		},
	},
}

export const PERSON_ADDRESS_KIND = {
	DOMESTIC_RESIDENCE_ADDRESS: {
		value: 'domestic-residence-address',
		text: 'Yurt İçi İkametgah Adresi',
	},
	ABROAD_RESIDENCE_ADDRESS: {
		value: 'abroad-residence-address',
		text: 'Yurt Dışı İkametgah Adresi',
	},
	MILITARY: {
		value: 'military',
		text: 'Askerlik Adresi',
	},
	PRISON: {
		value: 'prison',
		text: 'Cezaevi Adresi',
	},
}

export const INSTITUTION_ADDRESS_KIND = {
	DOMESTIC_WORKPLACE_ADDRESS: {
		value: 'domestic-workplace-address',
		text: 'Yurt İçi İşyeri Adresi',
	},
	ABROAD_WORKPLACE_ADDRESS: {
		value: 'abroad-workplace-address',
		text: 'Yurt Dışı İşyeri Adresi',
	},
	WAREHOUSE: {
		value: 'warehouse',
		text: 'Depo Adresi',
	},
}

export const DEBTOR_ADDRESS = {
	title: '',
	description: '',
	city: cities[0].name,
	district: getDistrictsByCity(cities[0].name)[0].districtName,
	withNotification: true,
	type: ADDRESS_TYPE.DECLARATION.value,
}

export const BANK_ACCOUNT_INFORMATION = {
	bankName: '',
	IBAN: '',
}

export const EXACT_EXPENDITURES = [
	{
		name: 'Başvurma Harcı',
		amount: 54.4,
	},
	{
		name: 'Vekalet Harcı',

		amount: 7.8,
	},

	{
		name: 'Dosya Gideri',

		amount: 0.6,
	},
	{
		name: 'Vekalet Pulu',

		amount: 12.3,
	},
]

export const CASE_FEE_RATIOS = [
	{
		text: 'Normal',
		ratio: 10,
	},
	{
		text: 'Normal2',
		ratio: 15,
	},
]

export const PAYMENT_TYPES = {
	NORMAL: {
		text: 'Ödeme',
		value: 'NORMAL',
	},
	WITHDRAW: {
		text: 'Feragat',
		value: 'WITHDRAW',
	},
}

export const PAYEE_OPTIONS = [
	'VEKİL',
	'HARİCEN',
	'İCRA DOSYASI',
	'MÜVEKKİL',
	'BANKA',
	'BAYİİ',
	'RESMİ TAAHHÜT',
]

export const CURRENCIES = {
	AED: 'United Arab Emirates Dirham',
	AFN: 'Afghan Afghani',
	ALL: 'Albanian Lek',
	AMD: 'Armenian Dram',
	ANG: 'Netherlands Antillean Guilder',
	AOA: 'Angolan Kwanza',
	ARS: 'Argentine Peso',
	AUD: 'Australian Dollar',
	AWG: 'Aruban Florin',
	AZN: 'Azerbaijani Manat',
	BAM: 'Bosnia-Herzegovina Convertible Mark',
	BBD: 'Barbadian Dollar',
	BDT: 'Bangladeshi Taka',
	BGN: 'Bulgarian Lev',
	BHD: 'Bahraini Dinar',
	BIF: 'Burundian Franc',
	BMD: 'Bermudan Dollar',
	BND: 'Brunei Dollar',
	BOB: 'Bolivian Boliviano',
	BRL: 'Brazilian Real',
	BSD: 'Bahamian Dollar',
	BTC: 'Bitcoin',
	BTN: 'Bhutanese Ngultrum',
	BWP: 'Botswanan Pula',
	BYN: 'Belarusian Ruble',
	BZD: 'Belize Dollar',
	CAD: 'Canadian Dollar',
	CDF: 'Congolese Franc',
	CHF: 'Swiss Franc',
	CLF: 'Chilean Unit of Account (UF)',
	CLP: 'Chilean Peso',
	CNH: 'Chinese Yuan (Offshore)',
	CNY: 'Chinese Yuan',
	COP: 'Colombian Peso',
	CRC: 'Costa Rican Colón',
	CUC: 'Cuban Convertible Peso',
	CUP: 'Cuban Peso',
	CVE: 'Cape Verdean Escudo',
	CZK: 'Czech Republic Koruna',
	DJF: 'Djiboutian Franc',
	DKK: 'Danish Krone',
	DOP: 'Dominican Peso',
	DZD: 'Algerian Dinar',
	EGP: 'Egyptian Pound',
	ERN: 'Eritrean Nakfa',
	ETB: 'Ethiopian Birr',
	EUR: 'Euro',
	FJD: 'Fijian Dollar',
	FKP: 'Falkland Islands Pound',
	GBP: 'British Pound Sterling',
	GEL: 'Georgian Lari',
	GGP: 'Guernsey Pound',
	GHS: 'Ghanaian Cedi',
	GIP: 'Gibraltar Pound',
	GMD: 'Gambian Dalasi',
	GNF: 'Guinean Franc',
	GTQ: 'Guatemalan Quetzal',
	GYD: 'Guyanaese Dollar',
	HKD: 'Hong Kong Dollar',
	HNL: 'Honduran Lempira',
	HRK: 'Croatian Kuna',
	HTG: 'Haitian Gourde',
	HUF: 'Hungarian Forint',
	IDR: 'Indonesian Rupiah',
	ILS: 'Israeli New Sheqel',
	IMP: 'Manx pound',
	INR: 'Indian Rupee',
	IQD: 'Iraqi Dinar',
	IRR: 'Iranian Rial',
	ISK: 'Icelandic Króna',
	JEP: 'Jersey Pound',
	JMD: 'Jamaican Dollar',
	JOD: 'Jordanian Dinar',
	JPY: 'Japanese Yen',
	KES: 'Kenyan Shilling',
	KGS: 'Kyrgystani Som',
	KHR: 'Cambodian Riel',
	KMF: 'Comorian Franc',
	KPW: 'North Korean Won',
	KRW: 'South Korean Won',
	KWD: 'Kuwaiti Dinar',
	KYD: 'Cayman Islands Dollar',
	KZT: 'Kazakhstani Tenge',
	LAK: 'Laotian Kip',
	LBP: 'Lebanese Pound',
	LKR: 'Sri Lankan Rupee',
	LRD: 'Liberian Dollar',
	LSL: 'Lesotho Loti',
	LYD: 'Libyan Dinar',
	MAD: 'Moroccan Dirham',
	MDL: 'Moldovan Leu',
	MGA: 'Malagasy Ariary',
	MKD: 'Macedonian Denar',
	MMK: 'Myanma Kyat',
	MNT: 'Mongolian Tugrik',
	MOP: 'Macanese Pataca',
	MRO: 'Mauritanian Ouguiya (pre-2018)',
	MRU: 'Mauritanian Ouguiya',
	MUR: 'Mauritian Rupee',
	MVR: 'Maldivian Rufiyaa',
	MWK: 'Malawian Kwacha',
	MXN: 'Mexican Peso',
	MYR: 'Malaysian Ringgit',
	MZN: 'Mozambican Metical',
	NAD: 'Namibian Dollar',
	NGN: 'Nigerian Naira',
	NIO: 'Nicaraguan Córdoba',
	NOK: 'Norwegian Krone',
	NPR: 'Nepalese Rupee',
	NZD: 'New Zealand Dollar',
	OMR: 'Omani Rial',
	PAB: 'Panamanian Balboa',
	PEN: 'Peruvian Nuevo Sol',
	PGK: 'Papua New Guinean Kina',
	PHP: 'Philippine Peso',
	PKR: 'Pakistani Rupee',
	PLN: 'Polish Zloty',
	PYG: 'Paraguayan Guarani',
	QAR: 'Qatari Rial',
	RON: 'Romanian Leu',
	RSD: 'Serbian Dinar',
	RUB: 'Russian Ruble',
	RWF: 'Rwandan Franc',
	SAR: 'Saudi Riyal',
	SBD: 'Solomon Islands Dollar',
	SCR: 'Seychellois Rupee',
	SDG: 'Sudanese Pound',
	SEK: 'Swedish Krona',
	SGD: 'Singapore Dollar',
	SHP: 'Saint Helena Pound',
	SLL: 'Sierra Leonean Leone',
	SOS: 'Somali Shilling',
	SRD: 'Surinamese Dollar',
	SSP: 'South Sudanese Pound',
	STD: 'São Tomé and Príncipe Dobra (pre-2018)',
	STN: 'São Tomé and Príncipe Dobra',
	SVC: 'Salvadoran Colón',
	SYP: 'Syrian Pound',
	SZL: 'Swazi Lilangeni',
	THB: 'Thai Baht',
	TJS: 'Tajikistani Somoni',
	TMT: 'Turkmenistani Manat',
	TND: 'Tunisian Dinar',
	TOP: "Tongan Pa'anga",
	TRY: 'Turkish Lira',
	TTD: 'Trinidad and Tobago Dollar',
	TWD: 'New Taiwan Dollar',
	TZS: 'Tanzanian Shilling',
	UAH: 'Ukrainian Hryvnia',
	UGX: 'Ugandan Shilling',
	USD: 'United States Dollar',
	UYU: 'Uruguayan Peso',
	UZS: 'Uzbekistan Som',
	VEF: 'Venezuelan Bolívar Fuerte',
	VND: 'Vietnamese Dong',
	VUV: 'Vanuatu Vatu',
	WST: 'Samoan Tala',
	XAF: 'CFA Franc BEAC',
	XAG: 'Silver Ounce',
	XAU: 'Gold Ounce',
	XCD: 'East Caribbean Dollar',
	XDR: 'Special Drawing Rights',
	XOF: 'CFA Franc BCEAO',
	XPD: 'Palladium Ounce',
	XPF: 'CFP Franc',
	XPT: 'Platinum Ounce',
	YER: 'Yemeni Rial',
	ZAR: 'South African Rand',
	ZMW: 'Zambian Kwacha',
	ZWL: 'Zimbabwean Dollar',
}

export const TASK_TYPE = {
	AGAIN_QUERY_REQUIRED: 'again-query-required',
	QUERY_RESPONSE_REQUIRED: 'query-response-required',
	QUERY_RESPONSE_ENTRY_REQUIRED: 'query-response-entry-required',
	SEIZE_DE_FACTO_REQUIRED: 'seize-de-facto-required',
	FORECLOSABLE_ADDRESS_REQUIRED: 'foreclosable-address-required',
	REASON_FOR_NEGATIVE_REQUIRED: 'reason-for-negative-required',
	DEBTOR_NOTIFICATION_REQUIRED: 'debtor-notification-required',
	DEBTOR_NULL_ADDRESS: 'debtor-null-address',
	DEBTOR_NULL_FORMAL_ADDRESS: 'debtor-null-formal-address',
	DEBTOR_NULL_IDENTITY: 'debtor-null-identity',
	DEBTOR_NULL_ADDRESS_AND_IDENTITY: 'debtor-null-address-and-identity',
	NOTIFICATION_BARCODE_NUMBER_REQUIRED: 'notification-barcode-number-required',
	NOTIFICATION_BARCODE_NUMBER_REQUEST: 'notification-barcode-number-request',
	NOTIFICATION_STEP_1: 'notification-step-1',
	NOTIFICATION_STEP_2: 'notification-step-2',
	NOTIFICATION_STEP_3: 'notification-step-3',
	NOTIFICATION_STEP_4: 'notification-step-4',
	NOTIFICATION_THIRD_PERSON_STEP_0: 'notification-third-person-step-1',
	NOTIFICATION_THIRD_PERSON_STEP_1: 'notification-third-person-step-2',
	NOTIFICATION_THIRD_PERSON_STEP_2: 'notification-third-person-step-3',
	NOTIFICATION_DONE_DATE: 'notification-done-date',
	NOTIFICATION_RECIPIENT: 'notification-recipient',
	NOTIFICATION_DONE: 'notification-done',
	NOTIFICATION_OBJECTION: 'notification-objection',
	NOTIFICATION_OBJECTION_DATE: 'notification-objection-date',
	NOTIFICATION_THIRD_PERSON_DONE: 'notification-third-person-done',
	IS_SEIZED: 'is-seized',
	NOT_DISTRAINABLE_OBJECTION: 'not-distrainable-objection',
	RESTRICTIONS_NOTIFICATION_REQUIRED: 'restrictions-notification-required',
	RESTRICTIONS_NOTIFICATION_RESPONSE: 'restrictions-notification-response',
	RESTRICTIONS_NOTIFICATION_MEMORIAL: 'restrictions-notification-memorial',
	RESTRICTIONS_NOTIFICATION_MEMORIAL_RESPONSE:
		'restrictions-notification-memorial-response',
	RESTRICTIONS_EXIST: 'restrictions-exist',
	RESTRICTIONS_COUNT: 'restrictions-count',
	RESTRICTIONS_CANCELLED_ASSET: 'restrictions-cancelled-asset',
	RESTRICTIONS_COMPLETED: 'restrictions-completed',
	RESTRICTIONS_REQUIRED: 'restrictions-required',
	INPOUNDMENT_NOTIFICATION_REQUIRED: 'inpoundment-notification-required',
	CLAIM_103_DOCUMENT_CREATE: 'claim-103-document-create',
	CLAIM_103_DOCUMENT_STATUS: 'claim-103-document-status',
	NOTIFICATION_OBJECTION_REMAINING_TIME:
		'notification-objection-remaining-time',
	SALE_ADVANCE_REQUIRED: 'sale-advance-required',
	WARRANT_REQUIRED: 'warrant-required',
	ZONING_STATUS_DOCUMENT_CREATE: 'zoning-status-document-create',
	ZONING_STATUS_ANSWER: 'zoning-status-answer',
	CADASTRE_DOCUMENT_CREATE: 'cadastre-document-create',
	CADASTRE_ANSWER: 'cadastre-answer',
	CUSTODIAN_INFO_REQUIRED: 'custodian-info-required',
	APPRAISAL_DOCUMENT_REQUIRED: 'appraisal-document-required',
	APPRAISAL_RESULT_REQUIRED: 'appraisal-result-required',
	CLAIM_100_DOCUMENT_CREATE: 'claim-100-document-create',
	CLAIM_100_DOCUMENT_STATUS: 'claim-100-document-status',
	GARNISHMENT_CLAIM_100_DOCUMENT_CREATE:
		'garnishment-claim-100-document-create',
	GARNISHMENT_CLAIM_100_DOCUMENT_STATUS:
		'garnishment-claim-100-document-status',
	LAST_INPOUNDMENT_STATUS_REQUIRED: 'last-inpoundment-status-required',
	RESTRICTIONS_UPDATE_REQUIRED: 'restrictions-update-required',
	APPRAISAL_NOTIFICATION_REQUIRED: 'appraisal-notification-required',
	APPRAISAL_NOTIFICATION_DONE_REQUIRED: 'appraisal-notification-done-required',
	SALE_SOLD_BY_ANOTHER_CREDITOR: 'sale-sold-by-another-creditor',
	SALE_REQUEST_REQUIRED: 'sale-request-required',
	SALE_REQUEST_TRACKING_NUMBER_REQUIRED:
		'sale-request-tracking-number-required',
	SALE_REQUEST_RESPONSE_REQUIRED: 'sale-request-answer-required',
	SALE_REQUEST_RESPONSE_STATUS_REQUIRED: 'sale-status-required',
	SALE_REQUEST_RESPONSE_STATUS_NEGATIVE_REASON_REQUIRED:
		'sale-request-negative-reason-required',
	SALE_REQUEST_DAY_DATES_REQUIRED: 'sale-request-day-dates-required',
	SALE_REQUEST_DAY_NEWSPAPER_ANNOUNCE_REQUIRED:
		'sale-request-day-newspaper-announce-required',
	SALE_REQUEST_DAY_RESPONSE: 'sale-request-day-response',
	SALE_REQUEST_DAY_REASON_FOR_NEGATIVE: 'sale-request-day-reason-for-negative',
	SALE_REQUEST_SECOND_DAY_REQUIRED: 'sale-request-second-day-required',
	SALE_REQUEST_COMPLETED_NOTIFICATION_REQUIRED:
		'sale-request-completed-notification-required',
	NEW_SALE_REQUEST_REQUIRED: 'new-sale-request-required',
	SALE_NOTIFICATION_REQUIRED: 'sale-notification-required',
	SALE_DETAILS: 'sale-details',
	SALE_MONEY_INCOME_REQUIRED: 'sale-money-income-required',
	SALE_MONEY_INCOME_SHARE_REQUIRED: 'sale-money-income-share-required',
	SALE_COLLECTION_REQUIRED: 'sale-collection-required',
	DE_FACTO_IS_DEBTOR_EXIST: 'de-facto-is-debtor-exist',
	DE_FACTO_IS_POLICE_HELPED: 'de-facto-is-police-helped',
	DE_FACTO_IS_MONEY_RECEIVED: 'de-facto-is-money-received',
	DE_FACTO_RECEIVED_MONEY_AMOUNT: 'de-facto-received-money-amount',
	DE_FACTO_PERSON_GOT_MONEY: 'de-facto-person-got-money',
	DE_FACTO_IS_MONEY_REQUESTED: 'de-facto-is-money-requested',
	DE_FACTO_IS_RECEIVED_MONEY_DECLARED: 'de-facto-is-received-money-declared',
	DE_FACTO_MONEY_COLLECTION_REQUIRED: 'de-facto-money-collection-required',
	IS_ASSET_RECEIVED: 'is-asset-received',
	RECEIVED_ASSETS: 'received-assets',
	RECEIVED_ASSETS_RESTRICTIONS_EXIST: 'received-assets-restrictions-exist',
	RECEIVED_ASSETS_RESTRICTIONS_CREATED: 'received-assets-restrictions-created',
	DE_FACTO_IS_COMMITMENT_RECEIVED: 'de-facto-is-commitment-received',
	DE_FACTO_PERSON_MAKE_COMMITMENT: 'de-facto-person-make-commitment',
	DE_FACTO_COMMITMENT_DETAILS: 'de-facto-commitment-details',
	DE_FACTO_IS_GUARANTEED: 'de-facto-is-guaranteed',
	DE_FACTO_GUARANTEE_DETAILS: 'de-facto-guarantee-details',
	DE_FACTO_CONSENT_TO_GARNISHMENT: 'de-facto-consent-to-garnishment',
	DE_FACTO_PERSON_CONSENT_TO_GARNISHMENT:
		'de-facto-person-consent-to-garnishment',
	DE_FACTO_COMPANY_OF_PERSON_CONSENT_TO_GARNISHMENT:
		'de-facto-company-of-person-consent-to-garnishment',
	DE_FACTO_GARNISHMENT_DETAILS: 'de-facto-garnishment-details',
	DE_FACTO_GARNISHMENT_SALARY_INFO: 'de-facto-garnishment-salary-info',
	DE_FACTO_GARNISHMENT_DOCUMENTS: 'de-facto-garnishment-documents',
	DE_FACTO_GARNISHMENT_DOCUMENTS_RESPONSE:
		'de-facto-garnishment-documents-response',
	DE_FACTO_GARNISHMENT_RESTRICTIONS_EXIST:
		'de-facto-garnishment-restrictions-exist',
	DE_FACTO_GARNISHMENT_RESTRICTIONS_CREATED:
		'de-facto-garnishment-restrictions-created',
	DE_FACTO_GARNISHMENT_RESTRICTIONS_REQUIRED:
		'de-facto-garnishment-restrictions-created',
	CREATE_INPOUNDMENT: 'create-inpoundment',
	SHOULD_CREATE_SSI_INPOUNDMENT: 'should-create-ssi-inpoundment',
	INPOUNDMENT_RESPONSE: 'inpoundment-response',
	INPOUNDMENT_MEMORIAL: 'inpoundment-memorial',
	INPOUNDMENT_MEMORIAL_RESPONSE: 'inpoundment-memorial-response',
	SSI_INPOUNDMENT_SALARY_AMOUNT: 'ssi-inpoundment-salary-amount',
	SSI_INPOUNDMENT_SALARY_INFO: 'ssi-inpoundment-salary-info',
	DE_FACTO_GARNISHMENT_MEMORIAL: 'de-facto-garnishment-memorial',
	SSI_MEMORIAL: 'ssi-memorial',
	MONEY_REQUEST_RESPONSE: 'money-request-response',
	CREATE_COLLECTION: 'create-collection',
	SHARE_COMPANY: 'share-company',
	CHAMBER_OF_COMMERCE_DOCUMENT: 'chamber-of-commerce-document',
	CHAMBER_OF_COMMERCE_NOTIFICATION: 'chamber-of-commerce-notification',
	CREDITOR_CASE_THIRD_PERSON_WARN: 'creditor-case-third-person-warn',
	CREDITOR_CASE_INCOME_CHECK: 'creditor-case-income-check',
	MAKE_THIRD_PERSON_DEBTOR: 'make-third-person-debtor',
	CUSTOMS_SEIZE_DE_FACTO_REQUIRED: 'customs-seize-de-facto-required',
	ENTER_WRIT_DETAILS: 'enter-writ-details',
	CREATE_CHILDREN: 'create-children',
	CREATE_CHILDREN_DAYS: 'create-children-days',
	RECEIVE_CHILDREN: 'receive-children',
	BANK_RESPOND: 'bank-respond',
	BANK_ACCOUNT_EXIST: 'bank-account-exist',
	BANK_ACCOUNT_BALANCE: 'bank-account-balance',
	BANK_ACCOUNT_BALANCE_CANCELLED_ASSET: 'restrictions-cancelled-asset',
	BANK_MONEY_RESPONSE: 'bank-money-response',
	COMMITMENT_COLLECTION_REQUIRED: 'commitment-collection-required',
	CREATE_COURT: 'create-court',
	ENTER_INTEL_INFO: 'enter-intel-info',
	SELECT_INTEL_TYPES: 'select-intel-types',
	REQUEST_INTEL: 'request-intel',
	ENTER_INTEL_RESPONSE: 'enter-intel-response',
	REQUEST_INTEL_ALIAS: 'request-intel-alias',
	ENTER_INTEL_ALIAS_RESPONSE: 'enter-intel-alias-response',
	IS_INTEL_RESPONSE_USEFUL: 'is-intel-response-useful',
	UPDATE_DEBTOR_BY_INTEL: 'update-debtor-by-intel',
	IS_EVACUATED: 'is-evacuated',
	REQUEST_EVICTION: 'request-eviction',
	ENTER_EVICTION_RESPONSE: 'enter-eviction-response',
	REQUEST_BANKRUPTCY: 'request-bankruptcy',
	ENTER_BANKRUPTCY_RESPONSE: 'enter-bankruptcy-response',
	MAKE_BANKRUPTCY_WRITTEN_TO_ESTATE: 'make-bankruptcy-written-to-estate',
	JURIDICAL_DAY_RESPONSE_REQUIRED: 'juridical-day-response-required',
	NEXT_JURIDICAL_DAY_REQUIRED: 'next-juridical-day-required',
	COURT_ASSURANCE_SHOULD_PAY: 'court-assurance-should-pay',
	GUARANTEE_FEE_MUST_PAY: 'guarantee-fee-must-pay',
	IS_103_LEFT_TO_PLACE: 'is-103-left-to-place',
	MONEY_REQUEST_REQUIRED: 'money-request-required',
	SHARE_AMOUNT: 'share-amount',
	CANCEL_ALL: 'cancel-all',
}

export const CASE_INITIALIZATION_TASK_TYPES = [
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
]

export const DEBTOR_PROFILE_TASK_TYPES = [
	TASK_TYPE.DEBTOR_NULL_ADDRESS,
	TASK_TYPE.DEBTOR_NULL_IDENTITY,
	TASK_TYPE.DEBTOR_NULL_FORMAL_ADDRESS,
	TASK_TYPE.NOTIFICATION_DONE,
	TASK_TYPE.JURIDICAL_DAY_RESPONSE_REQUIRED,
	TASK_TYPE.NEXT_JURIDICAL_DAY_REQUIRED,
	TASK_TYPE.COURT_ASSURANCE_SHOULD_PAY,
	TASK_TYPE.CREATE_COURT,
	TASK_TYPE.ENTER_INTEL_INFO,
	TASK_TYPE.SELECT_INTEL_TYPES,
	TASK_TYPE.REQUEST_INTEL,
	TASK_TYPE.ENTER_INTEL_RESPONSE,
	TASK_TYPE.REQUEST_INTEL_ALIAS,
	TASK_TYPE.ENTER_INTEL_ALIAS_RESPONSE,
	TASK_TYPE.IS_INTEL_RESPONSE_USEFUL,
	TASK_TYPE.UPDATE_DEBTOR_BY_INTEL,
	TASK_TYPE.IS_EVACUATED,
	TASK_TYPE.REQUEST_EVICTION,
	TASK_TYPE.ENTER_EVICTION_RESPONSE,
	TASK_TYPE.RECEIVE_CHILDREN,
	TASK_TYPE.CREATE_CHILDREN_DAYS,
]

export const NOTIFICATION_CREATION_TASK_TYPES = [
	TASK_TYPE.DEBTOR_NOTIFICATION_REQUIRED,
	TASK_TYPE.NOTIFICATION_STEP_1,
	TASK_TYPE.NOTIFICATION_STEP_2,
	TASK_TYPE.NOTIFICATION_STEP_3,
	TASK_TYPE.NOTIFICATION_STEP_4,
]

export const RESTRICTION_TASK_TYPES = [
	TASK_TYPE.RESTRICTIONS_CANCELLED_ASSET,
	TASK_TYPE.RESTRICTIONS_COUNT,
	TASK_TYPE.RESTRICTIONS_COMPLETED,
	TASK_TYPE.RESTRICTIONS_EXIST,
	TASK_TYPE.RESTRICTIONS_REQUIRED,
	TASK_TYPE.RESTRICTIONS_UPDATE_REQUIRED,
]

export const TASK_STATUS = {
	PENDING: 'PENDING',
	OVERDUE: 'OVERDUE',
	FUTURE: 'FUTURE',
	DONE: 'DONE',
	CANCELLED: 'CANCELLED',
	CANCELLED_BY_SYSTEM: 'CANCELLED_BY_SYSTEM',
}

export const DEBTOR_NOTIFICATIONS = [
	{
		caseId: '',
		address: '',
		barcodeNumber: '',
		status: '',
	},
]

export const NOTIFICATION_STEPS = {
	BARCODE_NUMBER: {
		text: 'Tebligat takibi için barkod numarası girildi mi?',
	},
	NOTIFICATION_STATUS: {
		text: '',
	},
}

export const NOTIFICATION_STATUS = {
	PENDING: {
		value: 'PENDING',
		text: 'Bekliyor',
	},
	REJECTED: {
		value: 'REJECTED',
		text: 'Bila',
	},
	DONE: {
		value: 'DONE',
		text: 'Tebliğ Olmuş',
	},
}

export const NOTIFICATION_RECIPIENT = {
	OWN: {
		value: 'OWN',
		text: 'Kendisine',
	},
	PARTNER: {
		value: 'PARTNER',
		text: 'Eşine',
	},
	HOUSEMATE: {
		value: 'HOUSEMATE',
		text: 'Birlikte Oturan Yakınına',
	},
	COMPANY_EMPLOYEE: {
		value: 'COMPANY_EMPLOYEE',
		text: 'Daimi çalışanına',
	},
	CHIEF: {
		value: 'CHIEF',
		text: 'İdare Amiri',
	},
	TK20: {
		value: 'TK20',
		text: 'TK. 20 MD Göre',
	},
	TK21: {
		value: 'TK21',
		text: 'TK. 21 MD Göre',
	},
	TK35: {
		value: 'TK35',
		text: 'TK. 35 MD Göre',
	},
	PUBLICATION: {
		value: 'PUBLICATION',
		text: 'İlanen Tebligat',
	},
	HEADMEN: {
		value: 'HEADMEN',
		text: 'Muhtara',
	},
}

export const NOTIFICATION_TYPE = {
	CASE_INITIALIZATION: 'case-initalization',
	THIRD_PERSON: 'third-person',
	103: '103',
	ZONING_STATUS: 'zoning-status',
	CADASTRE: 'cadastre',
	APPRAISAL_RESULT: 'appraisal-result',
	GARNISHMENT: 'garnishment',
	SHARE: 'share',
	CHAMBER_OF_COMMERCE: 'chamber-of-commerce',
	INPOUNDMENT_MEMORIAL: 'inpoundment-memorial',
	RESTRICTIONS_MEMORIAL: 'restrictions-memorial',
	SSI_MEMORIAL: 'ssi-memorial',
	DE_FACTO_GARNISHMENT_MEMORIAL: 'de-facto-garnishment-memorial',
}

export const NOTIFICATION_TYPE_TEXT = {
	CASE_INITIALIZATION: {
		type: 'case-initalization',
		text: 'Ödeme Emri',
	},
	THIRD_PERSON: {
		type: 'third-person',
		text: '89 Haciz Müzekkeresi',
	},
	103: {
		type: '103',
		text: '103. Madde Tebligatı',
	},
	ZONING_STATUS: {
		type: 'zoning-status',
		text: 'Belediye İmar Durumu Talebi',
	},
	CADASTRE: {
		type: 'cadastre',
		text: 'Tapu Kadastro Çap Durumu Talebi',
	},
	APPRAISAL_RESULT: {
		type: 'appraisal-result',
		text: 'Kıymet Takdiri Tebligatı',
	},
	GARNISHMENT: {
		type: 'garnishment',
		text: 'Maaş Haciz Tebligatı',
	},
	SHARE: { type: 'share', text: 'Hisse Haciz Tebligatı' },
	CHAMBER_OF_COMMERCE: {
		type: 'chamber-of-commerce',
		text: 'Ticaret Odası Haciz Tebligatı',
	},
	INPOUNDMENT_MEMORIAL: {
		type: 'inpoundment-memorial',
		text: 'Haciz Muhtırası',
	},
	RESTRICTIONS_MEMORIAL: {
		type: 'restrictions-memorial',
		text: 'Takyidat Talebi Muhtırası',
	},
	SSI_MEMORIAL: { type: 'ssi-memorial', text: 'Maaş Haciz Muhtırası' },
	DE_FACTO_GARNISHMENT_MEMORIAL: {
		type: 'de-facto-garnishment-memorial',
		text: 'Fiili Haciz Maaş Rızası Muhtırası',
	},
}

export const NOTIFICATION_KIND = {
	NORMAL: {
		value: 'normal',
		text: 'Normal Tebligat',
	},
	FAST: {
		value: 'fast',
		text: 'Hızlı Tebligat',
	},
	VIRTUAL: {
		value: 'virtual',
		text: 'Sanal Ortam',
	},
}

export const NOTIFICATION_STATUS_WITH_OBJECTION = {
	...NOTIFICATION_STATUS,
	OBJECTION: {
		value: 'OBJECTION',
		text: 'İtiraz Var',
	},
}

export const getNotificationObject = (
	caseId,
	address,
	barcodeNumber,
	status,
) => {
	return {
		caseId,
		address,
		barcodeNumber,
		status,
	}
}

export const INPOUNDMENT_TYPE = {
	DE_FACTO: 'Fiili Haciz',
	FAMILY_REGISTER: 'Aile Nüfus Kaydı',
	VEHICLE: 'Araç',
	IMMOVABLE: 'Gayrimenkul',
	SSI: 'SGK',
	BANK: 'Toplu Banka',
	CUSTOMS: 'Gümrük Alacağı',
	TAX_DUE: 'Vergi Alacağı',
	PATENT: 'Patent Enstitüsü',
	CREDITOR_CASE: 'Alacaklı Olduğu Dosya',
	SHARE: 'Hisse Haczi',
}

export const INPOUNDMENT_PROPERTIES = {
	DE_FACTO: {
		text: 'Fiili Haciz',
		key: 'DE_FACTO',
		icon: <FaWalking />,
		field: 'deFactos',
	},
	FAMILY_REGISTER: {
		text: 'Aile Nüfus Kaydı',
		key: 'FAMILY_REGISTER',
		icon: <FaUsers />,
		field: 'familyRegisters',
		condition: debtor => debtor.type === DEBTOR_TYPES.PERSON,
	},
	VEHICLE: {
		text: 'Araç Haczi',
		key: 'VEHICLE',
		icon: <FaCar />,
		field: 'vehicles',
	},
	IMMOVABLE: {
		text: 'Gayrimenkul Haczi',
		key: 'IMMOVABLE',
		icon: <FaHome />,
		field: 'immovables',
	},
	SSI: {
		text: 'Maaş Haczi',
		key: 'SSI',
		icon: <FaMoneyBill />,
		field: 'ssis',
		condition: debtor => debtor.type === DEBTOR_TYPES.PERSON,
	},
	BANK: {
		text: 'Banka Haczi',
		key: 'BANK',
		icon: <FaUniversity />,
		field: 'bankQueries',
	},
	CUSTOMS: {
		text: 'Gümrük Haczi',
		key: 'CUSTOMS',
		icon: <FaDungeon />,
		field: 'customs',
	},
	TAX_DUE: {
		text: 'Vergi Alacağı Haczi',
		key: 'TAX_DUE',
		icon: <FaMoneyBillWaveAlt />,
		field: 'taxDues',
	},
	PATENT: {
		text: 'Patent, Marka ve Faydalı Tasarım Haczi',
		key: 'PATENT',
		icon: <FaCopyright />,
		field: 'patents',
	},
	CREDITOR_CASE: {
		text: 'Alacaklı Olduğu Dosya Haczi',
		key: 'CREDITOR_CASE',
		icon: <FaSuitcase />,
		field: 'creditorCases',
	},
	SHARE: {
		text: 'Hisse Haczi',
		key: 'SHARE',
		icon: <FaBuilding />,
		field: 'shares',
	},
}

export const QUERY_TYPE = {
	FAMILY_REGISTER: INPOUNDMENT_TYPE.FAMILY_REGISTER,
	VEHICLE: INPOUNDMENT_TYPE.VEHICLE,
	IMMOVABLE: INPOUNDMENT_TYPE.IMMOVABLE,
	SSI: INPOUNDMENT_TYPE.SSI,
	BANK: INPOUNDMENT_TYPE.BANK,
	CUSTOMS: INPOUNDMENT_TYPE.CUSTOMS,
	TAX_DUE: INPOUNDMENT_TYPE.TAX_DUE,
	PATENT: INPOUNDMENT_TYPE.PATENT,
	CREDITOR_CASE: INPOUNDMENT_TYPE.CREDITOR_CASE,
	SHARE: INPOUNDMENT_TYPE.SHARE,
}

export const QUERY_LIST = {
	FAMILY_REGISTER: {
		text: 'Aile Nüfus Kaydı',
		value: 'FAMILY_REGISTER',
	},
	VEHICLE: {
		text: 'Araç',
		value: 'VEHICLE',
	},
	IMMOVABLE: {
		text: 'Gayrimenkul',
		value: 'IMMOVABLE',
	},
	SSI: {
		text: 'SGK - Maaş Haczi',
		value: 'SSI',
	},
	BANK: {
		text: 'Toplu Banka',
		value: 'BANK',
	},
	CUSTOMS: {
		text: 'Gümrük Alacağı',
		value: 'CUSTOMS',
	},
	TAX_DUE: {
		text: 'Vergi Alacağı',
		value: 'TAX_DUE',
	},
	PATENT: {
		text: 'Patent Enstitüsü',
		value: 'PATENT',
	},
	CREDITOR_CASE: {
		text: 'Alacaklı Olduğu Dosya',
		value: 'CREDITOR_CASE',
	},
	SHARE: {
		text: 'Hisse Haczi',
		value: 'SHARE',
	},
}

export const AVALIABLE_FOR_SALE_QUERIES = [
	QUERY_LIST.VEHICLE,
	QUERY_LIST.IMMOVABLE,
	QUERY_LIST.CUSTOMS,
	QUERY_LIST.PATENT,
	QUERY_LIST.SHARE,
]

export const RESTRICTION_UPDATE_REQUIRED_ASSET_TYPES = [
	QUERY_LIST.VEHICLE.value,
	QUERY_LIST.IMMOVABLE.value,
]

export const QUERY_EXIST_TEXT = {
	FAMILY_REGISTER: 'Borçlunun aile bireyi var mı?',
	VEHICLE: 'Borçlunun aracı var mı?',
	IMMOVABLE: 'Borçlunun gayrimenkulü var mı?',
	SSI: 'Borçlunun sigorta aktifliği var mı?',
	TAX_DUE: 'Borçlunun vergi alacağı var mı?',
	CUSTOMS: 'Borçlunun gümrük alacğaı var mı?',
	CREDITOR_CASE: 'Borçlunun alacaklı olduğu dosya var mı?',
	SHARE: 'Borçlunun herhangi bir şirkette hissesi var mı?',
	PATENT: 'Borçlunun patenti, markası veya faydalı tasarımı var mı?',
}

export const MULTI_SOURCE_INPOUNDMENT_TYPE = [
	'FAMILY_REGISTER',
	'VEHICLE',
	'IMMOVABLE',
	'PATENT',
	'CREDITOR_CASE',
	'SHARE',
	'SSI',
	'TAX_DUE',
	'CUSTOMS',
]

export const COURT_TASK_TYPES = [
	TASK_TYPE.COURT_ASSURANCE_SHOULD_PAY,
	TASK_TYPE.CREATE_COURT,
	TASK_TYPE.JURIDICAL_DAY_RESPONSE_REQUIRED,
	TASK_TYPE.NEXT_JURIDICAL_DAY_REQUIRED,
]

export const COURT_TYPE = {
	DUD: {
		value: 'dud',
		text: 'Karşılıksız Çek Ceza Davası',
		condition: currentCase => currentCase.type == 10,
	},
	OBJECTION_TO_DEBT: {
		value: 'objection-to-debt',
		text: 'Borca İtiraz Davasi',
		condition: currentCase => currentCase.type == 10,
	},
	CASE_INITIALIZATION: {
		value: 'case-initialization',
		text: 'İtirazın İptali Davası',
	},
	NOT_WANTING_BANKRUPTCY: {
		value: 'not-wanting-bankruptcy',
		text: 'İflas İstememe Ceza Davası',
	},
	OFFICER_PROCESS: {
		value: 'officer-process',
		text: 'Memur İşlemini Şikayet Davası',
	},
	ABANDON_THE_TRADE_WITHOUT_DECLARATION: {
		value: 'abandon-the-trade-without-declaration',
		text: 'Ticareti Beyansız Terk Ceza Davası',
	},
	OBJECTION_TO_ORDER_TABLE: {
		value: 'objection-to-order-table',
		text: 'Sıra Cetveline İtiraz Davası',
	},
	OBJECTION_TO_ORDER_TABLE: {
		value: 'objection-to-sale',
		text: 'Satış İşlemini İtiraz Davası',
	},
	ACTION_FOR_NOT_DISTRAINABLE_OBJECTION: {
		value: 'action-for-not-distrainable-objection',
		text: 'Hacz İşlemine İtirazın İptali Davası',
	},
	ANNULMENT_OF_TENDER: {
		value: 'annulment-of-tender',
		text: 'Satış İhalesinin Feshi Davası',
	},
}

export const VEHICLE_NEGATIVE_REASONS = {
	SALED_ALREADY: {
		value: 'SALED_ALREADY',
		text: 'Satış İşlemi',
	},
	COURT_ORDER: {
		value: 'COURT_ORDER',
		text: 'Mahkeme veya Hakim Kararı',
	},
	EMPTY_PARTICIPANTS: {
		value: 'EMPTY_PARTICIPANTS',
		text: 'Katılımcı Olmadı',
	},
	UNSATISFIED_PRICE: {
		value: 'UNSATISFIED_PRICE',
		text: 'Uygun Olmayan Fiyat',
	},
	ASSET_NOT_EXIST: {
		value: 'ASSET_NOT_EXIST',
		text: 'Mal Yerinde Yoktu',
	},
}

export const VEHICLE_INPOUNDMENT_STEPS = {
	isQueryCreated: false,
	isQueryAnswered: false,
	hasVehacle: false,
	areVehaclesCreated: false,
}

export const SALE_DAY = {
	saleDate: new Date(),
	isSaleAnnouncedAtNewspaper: false,
	saleStatus: null,
	reasonForBeingNegative: null,
	saleNotificationStatus: NOTIFICATION_STATUS.PENDING.value,
}

export const SSI_SALARY_TYPE = {
	ALL: {
		value: 'ALL',
		text: 'Maaşın Tümü',
	},
	PERCENTAGE: {
		value: 'PERCENTAGE',
		text: 'Belirli Bir Oranda',
	},
	DIRECT: {
		value: 'DIRECT',
		text: 'Miktar',
	},
}

export const BANK_LIST = [
	'ING BANK A.Ş.',
	'DENİZBANK A.Ş.',
	'YAPI VE KREDİ BANKASI A.Ş.',
	'TÜRKİYE GARANTİ BANKASI A.Ş.',
	'TÜRK EKONOMİ BANKASI A.Ş.',
	'ŞEKERBANK T.A.Ş.',
	'AKBANK T.A.Ş.',
	'BURGAN BANK A.Ş.',
	'T.C. ZİRAAT BANKASI A.Ş.',
	'TÜRKİYE HALK BANKASI A.Ş.',
	'ALBARAKA TÜRK KATILIM BANKASI A.Ş.',
	'TÜRKİYE VAKIFLAR BANKASI T.A.O.',
	'ODEABANK A.Ş.',
	'KUVEYT TÜRK A.Ş',
	'TÜRKİYE FİNANS KATILIM BANKASI',
	'CİTİBANK A.Ş',
	'DEUTSCHE BANK A.Ş.',
	'FİBABANKA A.Ş.',
	'ARAP TÜRK BANKASI',
	'KBC TURKEY BANK A.Ş.',
	'QNB FİNANSBANK A.Ş.',
	'TÜRKİYE İŞ BANKASI A.Ş.',
	'ALTERNATİFBANK A.Ş.',
]

export const COMMITMENT_DETAILS = {
	commitmentDate: new Date(),
	debtorId: null,
	totalAmount: 0,
	isSplittedToInstallments: false,
	areInstallmentsFree: false,
	firstInstallmentDate: new Date(),
	installmentsCount: 0,
	installmentsIntervalByDays: 0,
	calculatedInstallments: [],
	assetType: null,
	assetId: null,
}

export const GUARANTEE_DETAILS = {
	thirdPersonId: null,
	isPartner: null,
	isPartnerConsentient: null,
	amount: 0,
	isFeePaid: false,
	feePayer: false,
	assetType: null,
	assetId: null,
}

export const GARNISHMENT_DETAILS = {
	date: null,
	amount: null,
	type: SSI_SALARY_TYPE.DIRECT.value,
	percentageToCollection: null,
	amountToCollection: null,
}

export const WRIT_TYPE = {
	COURT: {
		value: 'COURT',
		text: 'Mahkeme',
	},
	NOTARY: {
		value: 'NOTARY',
		text: 'Noter',
	},
	ARBITRATION_AWARD: {
		value: 'ARBITRATION_AWARD',
		text: 'Hakem Kararı',
	},
	OTHER: {
		value: 'OTHER',
		text: 'Diğer',
	},
	CONCILIATION: {
		value: 'CONCILIATION',
		text: 'Arabuluculuk',
	},
}

export const WRIT_FILE_TYPE = {
	LAW_CASE: {
		value: 'LAW_CASE',
		text: 'Hukuk Dava Dosyası',
	},
	LAW_JOB: {
		value: 'LAW_JOB',
		text: 'Hukuk Değişik İş Dosyası',
	},
	HERITAGE: {
		value: 'HERITAGE',
		text: 'Tereke Dosyası',
	},
	ARBIRATIOR: {
		value: 'ARBIRATOR',
		text: 'Hakem Dava Dosyası',
	},
	PUNISHMENT: {
		value: 'PUNISHMENT',
		text: 'Ceza Dava Dosyası',
	},
	PUNISHMENT_DIFFEREN: {
		value: 'PUNISHMENT_DIFFEREN',
		text: 'Ceza Değişik İş Dosyası',
	},
	CONTROL: {
		value: 'CONTROL',
		text: 'İdare Dava Dosyası',
	},
	REGION: {
		value: 'REGION',
		text: 'Bölge Dosyası',
	},
	TAX: {
		value: 'TAX',
		text: 'Vergi Dava Dosyası',
	},
	PUBLIC: {
		value: 'PUBLIC',
		text: 'Kamu Dosyası',
	},
	OBJECTION: {
		value: 'OBJECTION',
		text: 'YD İtiraz Dosyası',
	},
}

export const PATENT_TYPES = {
	BRAND: {
		value: 'BRAND',
		text: 'Marka',
	},
	PATENT: {
		value: 'PATENT',
		text: 'Patent',
	},
	USEFUL_DESIGN: {
		value: 'USEFUL_DESIGN',
		text: 'Faydalı Tasarım',
	},
}

export const DEFAULT_RESTRICTION = {
	exist: null,
	count: 0,
	isCancelledByThreshold: null,
	table: [],
	completed: null,
	updated: null,
}

export const THIRD_PERSON_REASONS = {
	BANK: {
		value: 'bank',
		text: 'Banka Haczi',
	},
	GUARANTEE: {
		value: 'guarantee',
		text: 'Kefil',
	},
	COMMITMENT: {
		value: 'commitment',
		text: 'Taahhüt',
	},
	SSI: {
		value: 'ssi',
		text: 'Maaş Haczi',
	},
	SHARE: {
		value: 'share',
		text: 'Hisse Haczi',
	},
}

export const STEP_NAME = {
	CASE_DETAILS: {
		1: 'Takip Detayları',
		3: 'Müvekkiller',
		4: 'Borçlular',
		5: 'Alacak Kalemleri',
	},
	RECEIVED_ASSETS: {
		1: 'Haciz Detayları',
		2: '103. Madde',
		3: 'Yeddiemin Detayları',
		4: '100. Madde ve Kıymet Takdiri',
		SALE: 'Satış',
	},
	VEHICLE: {
		1: 'Haciz Detayları',
		2: 'Takyidat Detayları',
		3: 'Yeddiemin Detayları',
		4: '100. Madde',
		5: 'Kıymet Takdiri Tebligatı',
		SALE: 'Satış',
	},
	IMMOVABLE: {
		1: 'Haciz Detayları',
		2: 'Takyidat Detayları',
		3: '100. Madde',
		4: 'Kıymet Takdiri Tebligatı',
		SALE: 'Satış',
	},
	TAX_DUE: {
		1: 'Haciz Detayları',
		2: 'Takyidat Detayları',
		3: 'Yeddiemin Detayları',
		4: '100. Madde',
		5: 'Kıymet Takdiri Tebligatı',
		SALE: 'Satış',
	},
	CUSTOMS: {
		1: 'Haciz Detayları',
		2: 'Takyidat Detayları',
		3: 'Yeddiemin Detayları',
		4: '100. Madde',
		5: 'Kıymet Takdiri Tebligatı',
		SALE: 'Satış',
	},
	DE_FACTO: {
		1: 'Adres Detayları',
		2: 'Haciz Detayları',
	},
	CREDITOR_CASE: {
		1: 'Haciz Detayları',
		2: 'Takyidat Detayları',
		3: 'Yeddiemin Detayları',
		4: '100. Madde',
		5: 'Kıymet Takdiri Tebligatı',
		SALE: 'Satış',
	},
	SSI: {
		1: 'Haciz Durumu',
		2: 'Takyidat Detayları',
		3: '100. Madde',
		4: 'Maaş Bilgisi ve Tahsilat',
	},
	GARNISHMENT: {
		1: 'Haciz Detayları',
		2: 'Takyidat Detayları',
		3: '100. Madde',
		4: 'Maaş Bilgisi ve Tahsilat',
	},
	BANK: {
		// 1: 'Tebligat Detayları',
		// 2: 'Hesap Detayları',
		// 3: 'Takyidat Detayları',
		// 4: '100. Madde',
		// 5: 'Tahsilat Detayları',
		1: 'Hesap Detayları',
		2: 'Takyidat Detayları',
		3: '100. Madde',
		4: 'Tahsilat Detayları',
	},
	SHARE: {
		1: 'Haciz Detayları',
		2: 'Takyidat Detayları',
		3: 'Kıymet Takdiri',
		SALE: 'Satış',
	},
	PATENT: {
		1: 'Haciz Detayları',
		2: 'Takyidat Detayları',
		3: 'Kıymet Takdiri',
		SALE: 'Satış',
	},
	NORMAL_ASSET: {
		1: 'Takyidat Detayları',
		2: '100. Madde',
		3: 'Kıymet Takdiri Tebligatı',
	},
	PLEDGED_MOVABLE: {
		1: 'Takyidat Detayları',
		2: 'Yeddiemin Detayları',
		3: '100. Madde',
		4: 'Kıymet Takdiri Tebligatı',
		SALE: 'Satış',
	},
}

export const SALARY_INFO = {
	date: null,
	amount: null,
	type: SSI_SALARY_TYPE.DIRECT.value,
	percentageToCollection: null,
	amountToCollection: null,
}

export const TASK_SORT_OPTIONS = {
	DUE_DATE: {
		value: 'DUE_DATE',
		text: 'Bitiş Tarihine En Uzak Olan',
	},
	DUE_DATE_DESCENDING: {
		value: 'DUE_DATE_DESCENDING',
		text: 'Bitiş Tarihi En Yakın Olan',
	},
	START_DATE: {
		value: 'START_DATE',
		text: 'Başlangıç Tarihi En Uzak Olan',
	},
	START_DATE_DESCENDING: {
		value: 'START_DATE_DESCENDING',
		text: 'Başlangıç Tarihi En Yakın Olan',
	},
}

export const EXPENSE_TYPE = {
	OFFICIAL: {
		text: 'Resmi Masraf',
		value: 'OFFICIAL',
	},
	UNOFFICIAL: {
		text: 'Gayriresmi Masraf',
		value: 'UNOFFICIAL',
	},
}

export const COLLECTION_TYPE = {
	GENERAL: {
		text: 'Genel Tahsilat',
		value: 'GENERAL',
	},
	BANK: {
		text: 'Banka Tahsilatı',
		value: 'BANK',
	},
	CREDITOR_CASE: {
		text: 'Alacaklı Olduğu Dosya Tahsilatı',
		value: 'CREDITOR_CASE',
	},
	TAX_DUE: {
		text: 'Vergi Alacağı Tahsilatı',
		value: 'TAX_DUE',
	},
	SALE: {
		text: 'Satış Tahsilatı',
		value: 'SALE',
	},
	COMMITMENT: {
		text: 'Taahhüt Tahsilatı',
		value: 'COMMITMENT',
	},
	DE_FACTO_COMMITMENT: {
		text: 'Taahhüt Tahsilatı',
		value: 'DE_FACTO_COMMITMENT',
	},
	DE_FACTO_MONEY: {
		text: 'Fiili Haciz Para Tahsilatı',
		value: 'DE_FACTO_MONEY',
	},
	DE_FACTO_GARNISHMENT: {
		text: 'Maaş Rızası Tahsilatı',
		value: 'DE_FACTO_GARNISHMENT',
	},
	SSI: {
		text: 'Maaş Haczi Tahsilatı',
		value: 'SSI',
	},
}

export const PROXIMITY_OPTIONS = {
	FATHER: {
		text: 'Babası',
		value: 'FATHER',
	},
	MOTHER: {
		text: 'Annesi',
		value: 'MOTHER',
	},
	SIBLING: {
		text: 'Kardeşi',
		value: 'SIBLING',
	},
	PARTNER: {
		text: 'Eşi',
		value: 'PARTNER',
	},
	EX_PARTNER: {
		text: 'Eski Eşi',
		value: 'EX_PARTNER',
	},
}

export const MARITAL_OPTIONS = {
	BACHELOR: {
		text: 'Bekar',
		value: 'BACHELOR',
	},
	MARRIED: {
		text: 'Evli',
		value: 'MARRIED',
	},
	DIVORCED: {
		text: 'Boşanmış',
		value: 'DIVORCED',
	},
}

export const DEATH_OPTIONS = {
	CLOSED: {
		text: 'Kapalı',
		value: 'CLOSED',
	},
	ALIVE: {
		text: 'Sağ',
		value: 'ALIVE',
	},
	DEAD: {
		text: 'Ölü',
		value: 'DEAD',
	},
}

export const GENDER_OPTIONS = {
	MALE: {
		text: 'Erkek',
		value: 'MALE',
	},
	FEMALE: {
		text: 'Kadın',
		value: 'FEMALE',
	},
}

export const FAMILY_MEMBER = {
	BSN: '',
	gender: GENDER_OPTIONS.MALE.value,
	proximity: PROXIMITY_OPTIONS.FATHER,
	identityNumber: '',
	name: '',
	surname: '',
	fathersName: '',
	mothersName: '',
	placeAndDateOfBirth: '',
	maritalStatus: MARITAL_OPTIONS.BACHELOR.value,
	religion: '',
	registryDate: '',
	death: DEATH_OPTIONS.ALIVE.value,
	deathDate: new Date(),
	marriage: '',
	divorce: '',
}

export const RESTRICTION_DEBT_TYPE = {
	IMPOUNDMENT: {
		value: 'IMPOUNDMENT',
		text: 'Haciz',
	},
	HPYOTHEC: {
		value: 'HPYOTHEC',
		text: 'Rehin',
	},
	ANNOTATION: {
		value: 'ANNOTATION',
		text: 'Şerh',
	},
	SPECIAL_ANNOTATION: {
		value: 'SPECIAL_ANNOTATION',
		text: 'Özel Şerh',
	},
}

export const UTILS = {
	DEBTOR: {
		text: 'Borçlu',
		plural: 'Borçlular',
		key: 'debtor',
	},
	CLIENT: {
		text: 'Müvekkil',
		plural: 'Müvekkiller',
		key: 'client',
	},
	DUE: {
		text: 'Alacak Kalemi',
		plural: 'Alacak Kalemleri',
		key: 'due',
	},
	PAYMENT: {
		text: 'Ödeme',
		plural: 'Ödemeler',
		key: 'payment',
	},
	LAWYER: {
		text: 'Avukat',
		plural: 'Avukatlar',
		key: 'lawyers',
	},
	CREDITOR: {
		text: 'Alacaklı',
		plural: 'Alacaklılar',
		key: 'creditor',
	},
	EXECUTION_OFFICE: {
		text: 'İcra Dairesi',
		plural: 'İcra Daireleri',
		key: 'lawOffice',
	},
	TAX_OFFICE: {
		text: 'Vergi Dairesi',
		plural: 'Vergi Daireleri',
		key: 'tax_office',
	},
	CUSTOMS_OFFICE: {
		text: 'Gümrük Müdürlüğü',
		plural: 'Gümrük Müdürlükleri',
		key: 'customs_office',
	},
	LAND_REGISTRY_OFFICE: {
		text: 'Tapu Sicil Müdürlüğü',
		plural: 'Tapu Sicil Müdürlükleri',
		key: 'land_registry_office',
	},
	THIRD_PERSON: {
		text: 'Üçüncü Şahıs',
		plural: 'Üçüncü Şahıslar',
		key: 'thirdPerson',
	},
}

export const INTEL = {
	isCityKnown: null,
	isDistrictKnown: null,
	knownDistrict: getDistrictsByCity(cities[0].name)[0].districtName,
	knownCity: cities[0].name,
}

export const INTEL_TYPE = {
	CIVIL_REGISTRY: {
		...printer.CIVIL_REGISTRY_INTELLIGENCE,
		entityName: 'civilRegistry',
		isAvailable: (intel, debtor) => {
			return (
				((intel.isCityKnown && intel.knownCity) ||
					debtor.addresses.length > 0) &&
				(debtor.type === DEBTOR_TYPES.INSTITUTION
					? !debtor.taxNumber
					: !debtor.identityNumber)
			)
		},
	},
	TAX_OFFICE: {
		...printer.TAX_OFFICE_INTELLIGENCE,
		entityName: 'taxOffice',
		isAvailable: (intel, debtor) => {
			return (
				(intel.isCityKnown && intel.knownCity) || debtor.addresses.length > 0
			)
		},
	},
	CHAMBER_OF_COMMERCE: {
		...printer.CHAMBER_OF_COMMERCE_INTELLIGENCE,
		entityName: 'chamberOfCommerce',
		isAvailable: (intel, debtor) => {
			return (
				(intel.isCityKnown && intel.knownCity) || debtor.addresses.length > 0
			)
		},
	},
	SSI: {
		...printer.SSI_INTELLIGENCE,
		entityName: 'ssi',
		isAvailable: (intel, debtor) => {
			return (
				(intel.isCityKnown && intel.knownCity) || debtor.addresses.length > 0
			)
		},
	},
	CUSTOMS: {
		...printer.CUSTOMS_INTELLIGENCE,
		entityName: 'customs',
		isAvailable: (intel, debtor) => {
			return (
				(intel.isCityKnown && intel.knownCity) || debtor.addresses.length > 0
			)
		},
	},
	GSM: {
		...printer.GSM_INTELLIGENCE,
		entityName: 'gsm',
		isAvailable: (intel, debtor) => {
			return debtor.phoneNumbers.length > 0
		},
	},
	COMAC: {
		...printer.COMAC_INTELLIGENCE,
		entityName: 'comac',
		isAvailable: (intel, debtor) => {
			return (
				(intel.isCityKnown && intel.knownCity) || debtor.addresses.length > 0
			)
		},
	},
	POLICE: {
		...printer.POLICE_INTELLIGENCE,
		entityName: 'police',
		isAvailable: () => true,
	},
	MERNIS: {
		...printer.MERNIS_INTELLIGENCE,
		entityName: 'mernis',
		isAvailable: (intel, debtor) => {
			return debtor.type === DEBTOR_TYPES.INSTITUTION
				? debtor.taxNumber
				: debtor.identityNumber
		},
	},
	CLIENT: {
		...printer.CLIENT_INTELLIGENCE,
		entityName: 'client',
		isAvailable: (intel, debtor) => {
			return true
		},
	},
}

export const COUNSEL_FEE_THRESHOLDS = [
	{
		amount: 40000,
		percentage: 15,
	},
	{
		amount: 50000,
		percentage: 13,
	},
	{
		amount: 90000,
		percentage: 9.5,
	},
	{
		amount: 250000,
		percentage: 7,
	},
	{
		amount: 620000,
		percentage: 5,
	},
	{
		amount: 775000,
		percentage: 3.5,
	},
	{
		amount: 1275000,
		percentage: 1.8,
	},
	{
		amount: 3100000,
		percentage: 1,
	},
]

export const USURY_TYPE = [
	{
		value: 9,
		name: 'Adi Kanuni Faiz',
	},
	{
		value: 18.25,
		name: 'Temerrüt Faiz',
	},
	{
		value: 15,
		name: 'Ticari Temerrüt Faiz',
	},
	{
		value: 16.75,
		name: 'Avans Faizi',
	},
	{
		value: 16.75,
		name: 'Reeskot Faizi',
	},
	{
		value: 3.4,
		name: 'TBB - Mevduat USD (Bankalarca)',
	},
	{
		value: 2.5,
		name: 'TBB - Mevduat USD (Kamu Banka)',
	},
	{
		value: 1.65,
		name: 'TBB - Mevduat Euro (Bankalarca)',
	},
	{
		value: 1.65,
		name: 'TBB - Mevduat Euro (Kamu Banka)',
	},
]

export const RENTAL_TYPES = ['Adi kira', 'Hasılat kirası']
export const RENTAL_CONTRACT_TYPES = ['Sözleşme türü 1', '2 türü sözleşme']
export const getRentalDurationList = () => {
	const arr = []
	for (let index = 1; index < 100; index++) {
		arr.push(index)
	}
	return arr
}

export const getRestrictionAppraisalNotification = address => {
	return {
		barcodeNumber: '',
		status: NOTIFICATION_STATUS.PENDING.value,
		address,
		doneDate: null,
		objectionDate: null,
	}
}
