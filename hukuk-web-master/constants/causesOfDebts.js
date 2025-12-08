export const CAUSES_OF_DEBT_13 = [
	'ASIL ALACAK',
	'İHTAR GİDERİ',
	'KİRA',
	'KİRA FARKI',
	'EK GİDER',
	'TÜKETİM GİDERİ',
	'YAKIT',
	'REKLAM KATKI PAYI',
]

export const CAUSES_OF_DEBT_10 = ['ÇEK', 'SENET', 'PROTESTO GİDERİ']
export const CAUSES_OF_DEBT_9 = [
	'ASIL ALACAK',
	'CARİ HESAP',
	'ÇEK',
	'FATURA',
	'GECİKME ZAMMI',
	'İHTAR GİDERİ',
	'İPOTEK ALACAĞI',
	'KREDİ',
	'KREDİ KARTI',
	'PROTESTO GİDERİ',
	'SENET',
	'TEMİNAT MEKTUBU',
]
export const CAUSES_OF_DEBT_8 = [
	'ASIL ALACAK',
	'ÇEK',
	'FATURA',
	'GECİKME ZAMMI',
	'İHTAR GİDERİ',
	'KREDİ',
	'PROTESTO GİDERİ',
	'SENET',
]
export const CAUSES_OF_DEBT_7 = [
	'ASIL ALACAK',
	'CARİ HESAP',
	'ÇEK',
	'FATURA',
	'İHTAR GİDERİ',
	'İNKAR TAZMİNATI',
	'KİRA',
	'KİRA FARKI',
	'KREDİ',
	'PROTESTO GİDERİ',
	'SENET',
	'TEDBİR NAFAKASI',
	'TEMİNAT MEKTUBU',
	'YÖNETİM GİDERİ',
	'AİDAT ALACAĞI',
	'SÖZLEŞME',
]
export const CAUSES_OF_DEBT_5 = [
	'AİDAT ALACAĞI',
	'ASIL ALACAK',
	'BAKİYE HARÇ',
	'GECİKME ZAMMI',
	'FAZLA ÇALIŞMA ÜCRETİ',
	'HAFTA TATİLİ ÜCRETİ',
	'İHBAR TAZMİNATI',
	'İHTAR GİDERİ',
	'İLAM VEKALET ÜCRETİ',
	'İNKAR TAZMİNATI',
	'İŞTİRAK NAFAKASI',
	'KIDEM TAZMİNATI',
	'TEDBİR NAFAKASI',
	'ÜCRET',
	'YARDIM NAFAKASI',
	'YARGILAMA GİDERİ',
	'YARGITAY ONAMA HARCI',
	'YILLIK İZİN ÜCRETİ',
	'YOKSULLUK NAFAKASI',
	'MADDİ TAZMİNAT',
	'MANEVİ TAZMİNAT',
]

export const CAUSES_OF_DEBT = [
	'ASIL ALACAK',
	'BAKİYE HARÇ',
	'GECİKME ZAMMI',
	'İHTAR GİDERİ',
	'İLAM VEKALET ÜCRETİ',
	'İNKAR TAZMİNATI',
	'TEBLİĞ GİDERİ',
	'YARGILAMA GİDERİ',
	'YARGITAY ONAMA HARCI',
]

export const getCauseOfDebt = caseType => {
	switch (caseType) {
		case '13':
			return CAUSES_OF_DEBT_13
		case '10':
			return CAUSES_OF_DEBT_10
		case '9':
			return CAUSES_OF_DEBT_9
		case '8':
			return CAUSES_OF_DEBT_8
		case '7':
			return CAUSES_OF_DEBT_7
		case '5':
			return CAUSES_OF_DEBT_5
		default:
			return CAUSES_OF_DEBT
	}
}
