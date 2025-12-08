import {
	CASE_INITIALIZATION_TASK_TYPES,
	DEBTOR_PROFILE_TASK_TYPES,
	DEBTOR_TYPES,
	INTEL_TYPE,
	NOTIFICATION_TYPE,
	NOTIFICATION_TYPE_TEXT,
	TASK_STATUS,
	TASK_TYPE,
} from '../constants'

export const getTaskStatusText = type => {
	switch (type) {
		case TASK_STATUS.CANCELLED:
			return 'İptal Edilmiş'
		case TASK_STATUS.CANCELLED_BY_SYSTEM:
			return 'Otomatik İptal Edilmiş'
		case TASK_STATUS.DONE:
			return 'Tamamlanmış'
		case TASK_STATUS.FUTURE:
			return 'Planlanmış'
		case TASK_STATUS.PENDING:
			return 'Devam Eden'
		case TASK_STATUS.OVERDUE:
			return 'Gecikmiş'
	}
}

export const getTaskStatusClassName = type => {
	switch (type) {
		case TASK_STATUS.CANCELLED:
			return 'gray'
		case TASK_STATUS.CANCELLED_BY_SYSTEM:
			return 'gray'
		case TASK_STATUS.DONE:
			return 'green'
		case TASK_STATUS.FUTURE:
			return 'blue'
		case TASK_STATUS.PENDING:
			return 'yellow'
		case TASK_STATUS.OVERDUE:
			return 'red'
	}
}

export const getTaskTargetUrl = task => {
	let url = `/takip/${task.currentCase[0].number}`
	const notificationAssetType = task.extra?.notificationAssetType
	const notificationAssetId = task.extra?.notificationAssetId
	const parentAssetType = task.extra?.parentAssetType
	const parentAssetId = task.extra?.parentAssetId
	const queryType = task.extra?.queryType

	const courtType = task.extra?.courtType
	const courtId = task.extra?.courtId

	if (
		CASE_INITIALIZATION_TASK_TYPES.includes(task.type) &&
		task.extra?.notificationType === NOTIFICATION_TYPE.CASE_INITIALIZATION
	) {
		if (notificationAssetType === 'BANK') {
			url += `/haciz`
		}
	} else if (DEBTOR_PROFILE_TASK_TYPES.includes(task.type)) {
	} else {
		url += `/haciz`
	}
	if (task.debtor[0]) {
		url += `?debtorId=${task.debtor[0]._id}`
	}
	if (notificationAssetId) url += `&assetId=${notificationAssetId}`
	else if (parentAssetId) url += `&assetId=${parentAssetId}`
	else if (task.assetId) url += `&assetId=${task.assetId}`

	if (notificationAssetType && notificationAssetType !== 'DEBTOR')
		url += `&assetType=${notificationAssetType}`
	else if (parentAssetType) url += `&assetType=${parentAssetType}`
	else if (queryType) url += `&assetType=${queryType}`
	else {
		if (task.assetType && task.type !== TASK_TYPE.NOTIFICATION_DONE)
			url += `&assetType=${task.assetType}`
	}
	if (courtType) url += `&courtType=${courtType}`
	if (courtId) url += `&courtId=${courtId}`
	url += `&taskId=${task._id}`
	url += `#${task.type}`

	return url
}

export const getTaskButtons = task => {
	switch (task.type) {
		case TASK_TYPE.DEBTOR_NULL_IDENTITY:
			return [
				{
					text: 'İstihbarat Yap',
					link: getTaskTargetUrl(task),
				},
				{
					text: 'Emniyet T.C. Kimlik No Araştrıması',
					link: getTaskTargetUrl(task),
				},
			]
		case TASK_TYPE.DEBTOR_NULL_ADDRESS:
			return [
				{
					text: 'Tebliğe Yarar Adreslerini Talep Et',
					link: getTaskTargetUrl(task),
				},
			]
		case TASK_TYPE.DEBTOR_NULL_FORMAL_ADDRESS:
			return [
				{
					text: 'Tebliğe Yarar Adreslerini Talep Et',
					link: getTaskTargetUrl(task),
				},
			]
		default:
			return []
	}
}

export const getTaskTextByType = task => {
	const type = task.type || task
	switch (type) {
		case TASK_TYPE.AGAIN_QUERY_REQUIRED:
			return `boş çıkan sorgunun tekrarlanması gerekiyor`
		case TASK_TYPE.DEBTOR_NOTIFICATION_REQUIRED:
			return 'Adresine haciz ihbarnamesi gönderilmesi gerekiyor'
		case TASK_TYPE.DEBTOR_NULL_ADDRESS:
			return 'Adresinin bulunması gerekiyor.'
		case TASK_TYPE.DEBTOR_NULL_FORMAL_ADDRESS:
			return 'Resmi adresinin bulunması gerekiyor.'
		case TASK_TYPE.DEBTOR_NULL_IDENTITY:
			return `${
				task.debtor && task.debtor[0]
					? task.debtor.type === DEBTOR_TYPES.INSTITUTION
						? 'Vergi Numarasının'
						: 'T.C. Kimlik Numarasınını'
					: 'Kimlik Bilgilerinini'
			} bulunması gerekiyor.`
		case TASK_TYPE.DEBTOR_NULL_ADDRESS_AND_IDENTITY:
			return 'Adresinin ve TC Kimlik Numarasının bulunması gerekiyor'
		case TASK_TYPE.NOTIFICATION_BARCODE_NUMBER_REQUIRED:
			return 'Tebligatına dair barkod numarasının girilmesi gerekiyor'
		case TASK_TYPE.NOTIFICATION_BARCODE_NUMBER_REQUEST:
			return 'Tebligatına dair barkod numarasının sorgulanıp tebligat durumunun belirtilmesi gerekiyor'
		case TASK_TYPE.NOTIFICATION_STEP_1:
			return task.debtor
				? `${
						task.debtor[0].type === DEBTOR_TYPES.INSTITUTION ? '35' : '21'
				  }'e göre tebligat hazırlanması gerekiyor`
				: '21 veya 35 e göre ödeme emri'
		case TASK_TYPE.NOTIFICATION_STEP_2:
			return task.debtor && task.debtor[0]
				? `${
						task.debtor[0].type === DEBTOR_TYPES.INSTITUTION ? '35' : '21'
				  }/1'e göre tebligat hazırlanması gerekiyor`
				: '21/1 veya 35/1 e göre ödeme emri'
		case TASK_TYPE.NOTIFICATION_STEP_3:
			return task.debtor && task.debtor[0]
				? `${
						task.debtor[0].type === DEBTOR_TYPES.INSTITUTION ? '35' : '21'
				  }/2'e göre tebligat hazırlanması gerekiyor`
				: '21/1 veya 35/1 e göre ödeme emri'
		case TASK_TYPE.NOTIFICATION_STEP_4:
			return task.debtor && task.debtor[0]
				? `${
						task.debtor[0].type === DEBTOR_TYPES.INSTITUTION ? '35' : '21'
				  }/2'e göre TEKİDEN tebligat hazırlanması gerekiyor`
				: '21/1 veya 35/1 e göre ödeme emri'
		case TASK_TYPE.NOTIFICATION_THIRD_PERSON_STEP_0:
			return '3.şahısa 89/1 hazırlanması gerekiyor'
		case TASK_TYPE.NOTIFICATION_THIRD_PERSON_STEP_1:
			return '3.şahısa 89/2 hazırlanması gerekiyor'
		case TASK_TYPE.NOTIFICATION_THIRD_PERSON_STEP_2:
			return '3.şahısa 89/3 hazırlanması gerekiyor'
		case TASK_TYPE.NOTIFICATION_OBJECTION:
			return 'İtirazın iptali davası açılması gerekiyor.'
		case TASK_TYPE.NOTIFICATION_OBJECTION_DATE:
			return 'Tebligata itiraz edilme tarihinin girilmesi gerekiyor.'
		case TASK_TYPE.NOTIFICATION_DONE_DATE:
			return 'tebligatına ait tebliğ tarihinin girilmesi gerekiyor'
		case TASK_TYPE.NOTIFICATION_RECIPIENT:
			return 'tebligatına ait tebliğ edilen kişinin belirtilmesi gerekiyor.'
		case TASK_TYPE.NOTIFICATION_DONE:
			return 'Haciz işlemlerinin başlatılması gerekiyor'
		case TASK_TYPE.NOTIFICATION_THIRD_PERSON_DONE:
			return 'Toplu Banka Haciz detaylarının girilmesi gerekiyor'
		case TASK_TYPE.QUERY_RESPONSE_REQUIRED:
			return 'sorgusunun cevabının girilmesi gerekiyor'
		case TASK_TYPE.QUERY_RESPONSE_ENTRY_REQUIRED:
			return 'sorgusunda çıkan kayıtların sisteme girilmesi gerekiyor.'
		case TASK_TYPE.SEIZE_DE_FACTO_REQUIRED:
			return 'borçlu adresine fiili hacize çıkılması gerekiyor'
		case TASK_TYPE.FORECLOSABLE_ADDRESS_REQUIRED:
			return 'fiili haciz istihbaratı yapılması gerekiyor'
		case TASK_TYPE.CUSTOMS_SEIZE_DE_FACTO_REQUIRED:
			return 'gümrük müdürlüğüne fiili hacze çıkılması gerekiyor.'
		case TASK_TYPE.IS_SEIZED:
			return 'haciz durumunun belirtilmesi gerekiyor'
		case TASK_TYPE.NOT_DISTRAINABLE_OBJECTION:
			return 'haczedilmezlik itirazının olup olmadığının kontrol edilmesi gerekiyor.'
		case TASK_TYPE.ZONING_STATUS_DOCUMENT_CREATE:
			return 'İmar durumu için talep hazırlanması gerekiyor.'
		case TASK_TYPE.ZONING_STATUS_ANSWER:
			return 'İmar durumu cevabının kontrol edilmesi gerekiyor.'
		case TASK_TYPE.CADASTRE_DOCUMENT_CREATE:
			return 'Tapu Kadastroya Çap Durumu için talep hazırlanması gerekiyor'
		case TASK_TYPE.CADASTRE_ANSWER:
			return 'Tapu Kadastro cevabının kontrol edilmesi gerekiyor.'
		case TASK_TYPE.RESTRICTIONS_NOTIFICATION_REQUIRED:
			return 'haciz takyidatları için bankaya tebligat gönderilmesi gerekiyor'
		case TASK_TYPE.RESTRICTIONS_NOTIFICATION_RESPONSE:
			return 'bankaya, takyidatlar için gönderilen tebligat cevabının girilmesi gerekiyor'
		case TASK_TYPE.RESTRICTIONS_NOTIFICATION_MEMORIAL:
			return 'haciz takyidatları için bankaya muhtıra gönderilmesi gerekiyor'
		case TASK_TYPE.RESTRICTIONS_NOTIFICATION_MEMORIAL_RESPONSE:
			return 'bankaya gönderilen muhtıranın cevabının girilmesi gerekiyor'
		case TASK_TYPE.RESTRICTIONS_EXIST:
			return 'takyidatlarının olup olmadığının belirtilmesi gerekiyor.'
		case TASK_TYPE.RESTRICTIONS_COUNT:
			return 'takyidat sayısının belirtilmesi gerekiyor'
		case TASK_TYPE.RESTRICTIONS_CANCELLED_ASSET:
			return 'takiydat sayısına göre hacze devam edilip edilmeyeceğinin belirtilmesi gerekiyor.'
		case TASK_TYPE.RESTRICTIONS_REQUIRED:
			return 'takyidatlarının girilmesi gerekiyor'
		case TASK_TYPE.RESTRICTIONS_COMPLETED:
			return 'takyidatların tamamının girilip girilmediğinin belirtilmesi gerekiyor'
		case TASK_TYPE.REASON_FOR_NEGATIVE_REQUIRED:
			return 'Olumsuz Haciz Sebebinin Girilmesi Gerekiyor'
		case TASK_TYPE.INPOUNDMENT_NOTIFICATION_REQUIRED:
			return '103. madde tebligatının hazırlanması ve tebliğ olması gerekiyor'
		case TASK_TYPE.CLAIM_103_DOCUMENT_CREATE:
			return '103. made tebligatının hazırlanması gerekiyor.'
		case TASK_TYPE.CLAIM_103_DOCUMENT_STATUS:
			return '103. made tebligatının tebliğ durumunun kontrol edilmesi gerekiyor.'
		case TASK_TYPE.NOTIFICATION_OBJECTION_REMAINING_TIME:
			return `Haciz işlemlerine devam edebilmek için ${
				Object.values(NOTIFICATION_TYPE_TEXT).find(
					v => v.type === task.extra?.notificationType,
				)?.text
			} itiraz süresinin beklenmesi gerekiyor.`
		case TASK_TYPE.SALE_ADVANCE_REQUIRED:
			return 'satış avansının yatırılması gerekiyor'
		case TASK_TYPE.WARRANT_REQUIRED:
			return 'yakalanması gerekiyor'
		case TASK_TYPE.CUSTODIAN_INFO_REQUIRED:
			return 'yeddiemin bilgilerinin girilmesi gerekiyor'
		case TASK_TYPE.APPRAISAL_DOCUMENT_REQUIRED:
			return 'kıymet takdiri için talep hazırlanması gerekiyor'
		case TASK_TYPE.APPRAISAL_RESULT_REQUIRED:
			return 'kıymet takdiri sonucunun girilmesi gerekiyor'
		case TASK_TYPE.CLAIM_100_DOCUMENT_CREATE:
			return '100. maddeye yarar bilgileri için talep hazırlanması gerekiyor.'
		case TASK_TYPE.CLAIM_100_DOCUMENT_STATUS:
			return '100. maddeye yarar bilgilerin cevabının kontrol edilmesi gerekiyor'
		case TASK_TYPE.GARNISHMENT_CLAIM_100_DOCUMENT_CREATE:
			return 'Fiili Haciz maaş rızasının 100. maddeye yarar bilgileri için talep hazırlanması gerekiyor.'
		case TASK_TYPE.GARNISHMENT_CLAIM_100_DOCUMENT_STATUS:
			return 'Fiili haciz maaş rızasının 100. maddeye yarar bilgilerin cevabının kontrol edilmesi gerekiyor'
		case TASK_TYPE.LAST_INPOUNDMENT_STATUS_REQUIRED:
			return '100. maddeye yarar bilgilerinin talep edilmesi ve cevabın alınması gerekiyor'
		case TASK_TYPE.RESTRICTIONS_UPDATE_REQUIRED:
			return '100. maddeye yarar bilgilere göre takyidatların güncellenmesi gerekiyor'
		case TASK_TYPE.APPRAISAL_NOTIFICATION_REQUIRED:
			return 'kıymet takdiri tebligatının hazırlanması gerekiyor'
		case TASK_TYPE.APPRAISAL_NOTIFICATION_DONE_REQUIRED:
			return 'kıymet takdiri tebligatının tebliğ durumunun kontrol edilmesi gerekiyor'
		case TASK_TYPE.CREATE_INPOUNDMENT:
			return 'haciz tebligatının hazırlanması gerekiyor'
		case TASK_TYPE.SHOULD_CREATE_SSI_INPOUNDMENT:
			return 'Maaç haczi hazırlanıp hazırlanmayacağının kararının verilmesi gerekiyor'
		case TASK_TYPE.INPOUNDMENT_RESPONSE:
			return 'cevabının girilmesi gerekiyor.'
		case TASK_TYPE.INPOUNDMENT_MEMORIAL:
			return 'muhtıra gönderilmesi gerekiyor'
		case TASK_TYPE.SSI_MEMORIAL:
			return 'maaş haczi ödenmediğinden dolayı muhtıra gönderilmesi gerekiyor'
		case TASK_TYPE.DE_FACTO_GARNISHMENT_MEMORIAL:
			return 'fiili haciz maaş rızası ödenmediğinden dolayı muhtıra gönderilmesi gerekiyor'
		case TASK_TYPE.INPOUNDMENT_MEMORIAL_RESPONSE:
			return 'muhtıra cevabının girilmesi gerekiyor'
		case TASK_TYPE.SSI_INPOUNDMENT_SALARY_AMOUNT:
			return 'maaş haczinde ilk sıradaki takyidata her ay yatan paranın girilmesi gerekiyor'
		case TASK_TYPE.SSI_INPOUNDMENT_SALARY_INFO:
			return 'maaş detaylarının girilmesi gerekiyor'
		case TASK_TYPE.MONEY_REQUEST_RESPONSE:
			return 'alacağın dosyaya talep edilmesi ve sonucunun girilmesi gerekiyor.'
		case TASK_TYPE.CREATE_COLLECTION:
			return 'tahsilat eklenmesi gerekiyor'
		case TASK_TYPE.SHARE_COMPANY:
			return 'borçlunun hissesinin olduğu şirket bilgilerinin girilmesi gerekiyor.'
		case TASK_TYPE.CHAMBER_OF_COMMERCE_DOCUMENT:
			return 'haciz durumu için Ticaret Odasına müzekkere hazırlanması gerekiyor.'
		case TASK_TYPE.CHAMBER_OF_COMMERCE_NOTIFICATION:
			return 'haciz durumunun Ticaret Odasına tebliğ edilmesi gerekiyor.'
		case TASK_TYPE.CREDITOR_CASE_THIRD_PERSON_WARN:
			return 'durumun 3. şahsa ihtar edilmesi gerekiyor.'
		case TASK_TYPE.CREDITOR_CASE_INCOME_CHECK:
			return 'gelecek ödemenin kontrol edilmesi ve durumun belirtilmesi gerekiyor'
		case TASK_TYPE.MAKE_THIRD_PERSON_DEBTOR:
			return 'haciz durumundan dolayı 3. şahsın borçlu olarak eklenmesi gerekiyor'
		case TASK_TYPE.IS_ASSET_RECEIVED:
			return 'fiili haczinde mal haczi yapılıp yapılmadığının belirtilmesi gerekiyor.'
		case TASK_TYPE.RECEIVED_ASSETS:
			return 'haczedilen malların girilmesi gerekiyor.'
		case TASK_TYPE.RECEIVED_ASSETS_RESTRICTIONS_EXIST:
			return 'haczedilen malların takyidatı olup olmadığının belirtilmesi gerekiyor.'
		case TASK_TYPE.RECEIVED_ASSETS_RESTRICTIONS_CREATED:
			return 'haczedilen malların takyidatlarının girilmesi gerekiyor.'
		case TASK_TYPE.DE_FACTO_IS_DEBTOR_EXIST:
			return 'adreste olup olmadığının belirtilmesi gerekiyor.'
		case TASK_TYPE.DE_FACTO_IS_POLICE_HELPED:
			return 'adrese polis yardımı ile girilip girilmediğinin belirtilmesi gerekiyor'
		case TASK_TYPE.DE_FACTO_IS_MONEY_RECEIVED:
			return 'para tahsilatı yapılıp yapılmadığının belirtilmesi gerekiyor.'
		case TASK_TYPE.DE_FACTO_IS_COMMITMENT_RECEIVED:
			return 'taahhüt alınıp alınmadığının belirtilmesi gerekiyor.'
		case TASK_TYPE.DE_FACTO_IS_GUARANTEED:
			return 'kefillik olup olmadığının belirtilmesi gerekiyor.'
		case TASK_TYPE.DE_FACTO_GUARANTEE_DETAILS:
			return 'kefillik detaylarının girilmesi gerekiyor.'
		case TASK_TYPE.DE_FACTO_CONSENT_TO_GARNISHMENT:
			return 'maaş haczi rızasının olup olmadığı belirtilmesi gerekiyor.'
		case TASK_TYPE.DE_FACTO_RECEIVED_MONEY_AMOUNT:
			return 'tahsilat yapılan paranının miktarının belirtilmesi gerekiyor.'
		case TASK_TYPE.DE_FACTO_PERSON_GOT_MONEY:
			return 'tahsilat yapılan parayı alan kişinin belirtilmesi gerekiyor.'
		case TASK_TYPE.DE_FACTO_IS_MONEY_REQUESTED:
			return 'paranın dosyaya yatırılmasının talep edilmesi gerekiyor.'
		case TASK_TYPE.DE_FACTO_IS_RECEIVED_MONEY_DECLARED:
			return 'tahsilatı yapılan paranın beyan edilmesi gerekiyor.'
		case TASK_TYPE.DE_FACTO_MONEY_COLLECTION_REQUIRED:
			return 'tahsilatı yapılan paranın tahsilat olarak eklenmesi gerekiyor.'
		case TASK_TYPE.DE_FACTO_PERSON_MAKE_COMMITMENT:
			return 'taahhüt veren kişinin belirtilmesi gerekiyor.'
		case TASK_TYPE.DE_FACTO_COMMITMENT_DETAILS:
			return 'taahhüt detaylarının girilmesi gerekiyor.'
		case TASK_TYPE.DE_FACTO_PERSON_CONSENT_TO_GARNISHMENT:
			return 'maaş haczi rızasında bulunan kişinin belirtilmesi gerekiyor.'
		case TASK_TYPE.DE_FACTO_COMPANY_OF_PERSON_CONSENT_TO_GARNISHMENT:
			return 'maaş haczi rızasında bulunan kişinin şirketinin belirtilmesi gerekiyor.'
		case TASK_TYPE.DE_FACTO_GARNISHMENT_DETAILS:
			return 'maaş haczi rızasının detaylarının girilmesi gerekiyor.'
		case TASK_TYPE.DE_FACTO_GARNISHMENT_SALARY_INFO:
			return 'fiili haciz maaş rızasında ilk sıradaki takyidata her ay yatan paranın girilmesi gerekiyor'
		case TASK_TYPE.DE_FACTO_GARNISHMENT_DOCUMENTS:
			return 'maaş haczi hazırlanması gerekiyor.'
		case TASK_TYPE.DE_FACTO_GARNISHMENT_DOCUMENTS_RESPONSE:
			return 'maaş haczi cevabının belirtilmesi gerekiyor.'
		case TASK_TYPE.DE_FACTO_GARNISHMENT_RESTRICTIONS_EXIST:
			return 'Maaş rızasında takyidat olup olmadığının belirtilmesi gerekiyor'
		case TASK_TYPE.DE_FACTO_GARNISHMENT_RESTRICTIONS_CREATED:
			return 'Maaş rızasına ait takyidatların girilmesi gerekiyor.'
		case TASK_TYPE.DE_FACTO_GARNISHMENT_RESTRICTIONS_REQUIRED:
			return 'Maaş rızasına ait takyidatların girilmesi gerekiyor.'
		case TASK_TYPE.SALE_COLLECTION_REQUIRED:
			return 'satışından olacak tahsilatın yapılması gerekiyor.'
		case TASK_TYPE.SALE_SOLD_BY_ANOTHER_CREDITOR:
			return 'başkası tarafından satılıp satılmadığının belirtilmesi gerekiyor'
		case TASK_TYPE.SALE_REQUEST_REQUIRED:
			return 'satış talep edilmesi gerekiyor'
		case TASK_TYPE.SALE_REQUEST_TRACKING_NUMBER_REQUIRED:
			return 'satış talebinin takip numarasının girilmesi gerekiyor.'
		case TASK_TYPE.SALE_REQUEST_RESPONSE_REQUIRED:
			return 'satış talebinin cevabının kontrol edilmesi gerekiyor.'
		case TASK_TYPE.SALE_REQUEST_RESPONSE_STATUS_REQUIRED:
			return 'satış talebine gelen cevabın girilmesi gerekiyor.'
		case TASK_TYPE.SALE_REQUEST_RESPONSE_STATUS_NEGATIVE_REASON_REQUIRED:
			return 'satış talebinin olumsuz olma nedeninin belirtilmesi gerekiyor.'
		case TASK_TYPE.SALE_REQUEST_DAY_DATES_REQUIRED:
			return 'satış günlerinin belirtilmesi gerekiyor.'
		case TASK_TYPE.SALE_REQUEST_DAY_NEWSPAPER_ANNOUNCE_REQUIRED:
			return 'satış günü için gazete ilanının yayınlanması gerekiyor'
		case TASK_TYPE.SALE_REQUEST_DAY_RESPONSE:
			return 'satış günü sonucunun belirtilmesi gerekiyor.'
		case TASK_TYPE.SALE_REQUEST_DAY_REASON_FOR_NEGATIVE:
			return 'satış günü sonucunun olumsuz olma nedeninin belirtilmesi gerekiyor.'
		case TASK_TYPE.SALE_REQUEST_SECOND_DAY_REQUIRED:
			return 'ikinci satış gününün takip edilmesi ve sonucunun girilmesi gerekiyor.'
		case TASK_TYPE.SALE_REQUEST_COMPLETED_NOTIFICATION_REQUIRED:
			return 'satış sonucunun taraflara tebliğ edilmesi gerekiyor'
		case TASK_TYPE.NEW_SALE_REQUEST_REQUIRED:
			return 'yeni bir satış talebinde bulunulması gerekiyor.'
		case TASK_TYPE.SALE_NOTIFICATION_REQUIRED:
			return 'satışın taraflara tebliğ edilmesi gerekiyor.'
		case TASK_TYPE.SALE_DETAILS:
			return 'satılan varlığa ait satış detaylarının girilmesi gerekiyor'
		case TASK_TYPE.SALE_MONEY_INCOME_REQUIRED:
			return 'satıştan gelecek paranın yatırılıp yatırılmadığının takip edilmesi gerekiyor.'
		case TASK_TYPE.SALE_MONEY_INCOME_SHARE_REQUIRED:
			return 'satıştan gelen paranın takyidatlara göre dağıtılması gerekiyor.'
		case TASK_TYPE.ENTER_WRIT_DETAILS:
			return 'dosyasının ilam detaylarının girilmesi gerekiyor'
		case TASK_TYPE.CREATE_CHILDREN:
			return 'Teslimi İstenen Çocukların kayıtlarının girilmesi gerekiyor'
		case TASK_TYPE.CREATE_CHILDREN_DAYS:
			return "Çocukları Görebildiği Günler' kayıtlarının girilmesi gerekiyor"
		case TASK_TYPE.SHARE_AMOUNT:
			return 'paya düşen para miktarının belirtilmesi gerekiyor'
		case TASK_TYPE.RECEIVE_CHILDREN:
			return 'Çocukların Teslim Alınması gerekiyor'
		case TASK_TYPE.BANK_RESPOND:
			return 'Bankanın cevap durumunun belirtilmesi gerekiyor.'
		case TASK_TYPE.BANK_ACCOUNT_EXIST:
			return 'Bankada hesabının olup olmadığının belirtilmesi gerekiyor.'
		case TASK_TYPE.BANK_ACCOUNT_BALANCE:
			return 'Banka hesap bakiyesinin belirtilmesi gerekiyor.'
		case TASK_TYPE.BANK_ACCOUNT_BALANCE_CANCELLED_ASSET:
			return 'Banka hesap bakiyesine göre hacze devam edilip edilmeyeceğinin belirtilmesi gerekiyor.'
		case TASK_TYPE.BANK_MONEY_RESPONSE:
			return 'Banka tahsilat durumunun belirtilmesi gerekiyor'
		case TASK_TYPE.COMMITMENT_COLLECTION_REQUIRED:
			return 'Taahhüt taksidinin tahsil edilmesi gerekiyor.'
		case TASK_TYPE.CREATE_COURT:
			return `${
				task.assetType === 'DUE'
					? 'Karşılıksız çek davası'
					: 'İtirazın iptali davası'
			} açılması gerekiyor`
		case TASK_TYPE.ENTER_INTEL_INFO:
			return 'İstihbarata yarar bilgilerin doldurulması gerekiyor.'
		case TASK_TYPE.SELECT_INTEL_TYPES:
			return 'Yapılacak istihbarat türlerinin belirtilmesi gerekiyor.'
		case TASK_TYPE.REQUEST_INTEL:
			return task.extra && task.extra.intelType === 'client'
				? 'Müvekkile gönderilen istihbarat e-postasının cevabının alınması gerekiyor'
				: `${
						task.extra
							? Object.values(INTEL_TYPE).find(
									t => t.entityName === task.extra.intelType,
							  ).name
							: ''
				  } istihbarat müzekkeresinin gönderilmesi gerekiyor.`
		case TASK_TYPE.ENTER_INTEL_RESPONSE:
			return `${
				task.extra
					? Object.values(INTEL_TYPE).find(
							t => t.entityName === task.extra.intelType,
					  ).name
					: ''
			} istihbarat sonucunun belirtilmesi gerekiyor.`
		case TASK_TYPE.REQUEST_INTEL_ALIAS:
			return `${
				task.extra
					? Object.values(INTEL_TYPE).find(
							t => t.entityName === task.extra.intelType,
					  ).name
					: ''
			} istihbarat tekid müzekkeresinin gönderilmesi gerekiyor.`
		case TASK_TYPE.ENTER_INTEL_ALIAS_RESPONSE:
			return `${
				task.extra
					? Object.values(INTEL_TYPE).find(
							t => t.entityName === task.extra.intelType,
					  ).name
					: ''
			} istihbarat tekid sonucunun belirtilmesi gerekiyor.`
		case TASK_TYPE.IS_INTEL_RESPONSE_USEFUL:
			return `${
				task.extra
					? Object.values(INTEL_TYPE).find(
							t => t.entityName === task.extra.intelType,
					  ).name
					: ''
			} istihbarat sonucunda yarar bilgi gelip gelmediğinin belirtilmesi gerekiyor.`
		case TASK_TYPE.UPDATE_DEBTOR_BY_INTEL:
			return `${
				task.extra
					? Object.values(INTEL_TYPE).find(
							t => t.entityName === task.extra.intelType,
					  ).name
					: ''
			} istihbarat sonucunun göre borçlu bilgilerinin doldurulması gerekiyor.`
		case TASK_TYPE.IS_EVACUATED:
			return 'Borçlu tarafından tahliye edilip edilmediğinin belirtilmesi gerekiyor.'
		case TASK_TYPE.REQUEST_EVICTION:
			return 'İcra mahkemesinden tahliye istenmesi gerekiyor.'
		case TASK_TYPE.ENTER_EVICTION_RESPONSE:
			return 'Tahliye talebinin sonucunun girilmesi gerekiyor'
		case TASK_TYPE.REQUEST_BANKRUPTCY:
			return 'İflas kararı istenmesi gerekiyor'
		case TASK_TYPE.ENTER_BANKRUPTCY_RESPONSE:
			return 'İflas kararı isteğinin sonucunun belirtilmesi gerekiyor'
		case TASK_TYPE.MAKE_BANKRUPTCY_WRITTEN_TO_ESTATE:
			return 'İflas kararının iflas masasına yazdırılması gerekiyor'
		case TASK_TYPE.JURIDICAL_DAY_RESPONSE_REQUIRED:
			return 'Dava duruşma günü sonucunun belirtilmesi gerekiyor.'
		case TASK_TYPE.NEXT_JURIDICAL_DAY_REQUIRED:
			return 'Bir sonraki duruşma gününün belirtilmesi gerekiyor.'
		case TASK_TYPE.GUARANTEE_FEE_MUST_PAY:
			return `Kefalet harcının ödenmesinin talep edilmesi gerekiyor`
		case TASK_TYPE.IS_103_LEFT_TO_PLACE:
			return `Fiili haciz mahalinde 103 tebligatı bırakılıp bırakılmadığının belirtilmesi gerekiyor.`
		case TASK_TYPE.MONEY_REQUEST_REQUIRED:
			return 'Paranın talep edilmesi gerekiyor'
		case TASK_TYPE.CANCEL_ALL:
			return 'Takibin kapatılması gerekiyor'
	}
}
