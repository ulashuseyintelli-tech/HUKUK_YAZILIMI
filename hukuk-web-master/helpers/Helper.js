import {
	DEBTOR_TYPES,
	NOTIFICATION_STATUS,
	INPOUNDMENT_TYPE,
	NOTIFICATION_TYPE,
	CASE_TRANSITION_DAYS,
	ADDRESS_TYPE,
	STEP_NAME,
	SSI_SALARY_TYPE,
	STATUS,
	CASE_TYPES_NEEDS_WRIT,
	NOTIFICATION_STATUS_WITH_OBJECTION,
	THIRD_PERSON_REASONS,
	PAYMENT_TYPES,
	COLLECTION_TYPE,
	RENTAL_TYPES,
	USURY_TYPE,
} from '../constants'
import printer from '../printer'
import { saveCase } from '../services/caseService'
import { calculatePercentage } from './financeHelper'

export const toDateInputValue = (date, increment) => {
	if (!date || isNaN(date.getTime())) {
		return ''
	}

	var local = date || new Date()
	increment = increment === null || increment === undefined ? 1 : increment
	local.setDate(local.getDate() + increment)
	local.setMinutes(local.getMinutes() - local.getTimezoneOffset())

	return local.toJSON().slice(0, 10)
}

export const checkArraysEqual = (arr1, arr2) => {
	if (arr1.length !== arr2.length) {
		return false
	}
	let returnValue = true
	arr1.map((a1, index) => {
		if (a1 !== arr2[index]) {
			returnValue = false
		}
	})
	return returnValue
}

export const findNotNullAddress = addresses => {
	let status = false
	if (Array.isArray(addresses)) {
		addresses.map(address => {
			Object.keys(address).map(key => {
				if (address[key] !== '' && address.description !== '') {
					status = true
				}
			})
		})
	}
	return status
}

export const validateAddresses = addresses => {
	return (
		addresses &&
		Array.isArray(addresses) &&
		addresses.length > 0 &&
		addresses.every(validateAddress)
	)
}

export const validateAddress = address => {
	return address && Object.keys(address).every(key => address[key])
}

export const validatePhoneNumbers = phoneNumbers => {
	return (
		phoneNumbers &&
		Array.isArray(phoneNumbers) &&
		phoneNumbers.length > 0 &&
		phoneNumbers.every(validatePhoneNumber)
	)
}

export const validatePhoneNumber = phoneNumber => {
	return phoneNumber && Object.keys(phoneNumber).every(key => phoneNumber[key])
}

export const getDebtorName = debtor => {
	return debtor.type === DEBTOR_TYPES.INSTITUTION
		? debtor.institutionName
		: `${debtor.name} ${debtor.surname}`
}

export const getDebtorIdentityString = debtor => {
	return debtor.type === DEBTOR_TYPES.INSTITUTION
		? debtor.taxNumber
			? `Vergi No: ${debtor.taxNumber}`
			: ''
		: debtor.identityNumber
		? `T.C. Kimlik No: ${debtor.identityNumber}`
		: ''
}

export const checkIdentityNumber = debtor => {
	return (
		(debtor.type === DEBTOR_TYPES.INSTITUTION && debtor.taxNumber) ||
		(debtor.type === DEBTOR_TYPES.PERSON && debtor.identityNumber)
	)
}

export const getDebtorType = debtor => {
	return debtor.type === DEBTOR_TYPES.INSTITUTION ? 'Kurum' : 'Şahıs'
}

export const getNotificationStatusText = notification => {
	if (!notification.type) {
		return 'Tebligat tipinin belirtilmesi gerekiyor'
	} else if (!notification.barcodeNumber) {
		return 'Barkod numarasının girilmesi gerekiyor'
	} else if (!notification.status === NOTIFICATION_STATUS.PENDING.value) {
		return 'Tebligat durumunun girilmesi gerekiyor'
	} else if (notification.status === NOTIFICATION_STATUS.REJECTED.value) {
		return 'Bila'
	} else if (
		notification.status === NOTIFICATION_STATUS_WITH_OBJECTION.OBJECTION.value
	) {
		if (!notification.objectionDate) {
			return 'İtiraz tarihinin girilmesi gerekiyor'
		} else {
			return 'İtiraz Var'
		}
	} else if (notification.status === NOTIFICATION_STATUS.DONE.value) {
		if (!notification.doneDate) {
			return 'Tebliğ tarihinin girilmesi gerekiyor'
		} else {
			return 'Tebliğ olmuş'
		}
	}
}

export const getVehicleInpoundmentStepsCompletedStatus = (
	vehicle,
	lawOffice,
) => {
	return {
		STEP1: vehicle.isSeized,
		STEP2:
			vehicle.isWarranted &&
			vehicle.claim103DocumentCreated === true &&
			vehicle.claim103Status === NOTIFICATION_STATUS.DONE.value &&
			checkRestrictionsStatus(vehicle, lawOffice),
		STEP3: checkCustodianInfoStatus(vehicle),
		STEP4: vehicle.appraisalResult && check100DocumentStatus(vehicle),
		STEP5:
			vehicle.appraisalNotificationStatus === NOTIFICATION_STATUS.DONE.value,
	}
}

export const getImmovableInpoundmentStepsCompletedStatus = (
	immovable,
	lawOffice,
) => {
	return {
		STEP1: immovable.isSeized,
		STEP2:
			immovable.zoningStatusNotificationStatus ===
				NOTIFICATION_STATUS.DONE.value &&
			immovable.cadastreNotificationStatus === NOTIFICATION_STATUS.DONE.value &&
			immovable.claim103DocumentCreated === true &&
			immovable.claim103Status === NOTIFICATION_STATUS.DONE.value &&
			checkRestrictionsStatus(immovable, lawOffice),
		STEP3: immovable.appraisalResult && check100DocumentStatus(immovable),
		STEP4:
			immovable.appraisalNotificationStatus === NOTIFICATION_STATUS.DONE.value,
	}
}

export const getBankInpoundmentStepsCompletedStatus = (
	bankQuery,
	lawOffice,
) => {
	return {
		// STEP1:
		// 	bankQuery.firstResponse === NOTIFICATION_STATUS.DONE.value ||
		// 	bankQuery.secondResponse === NOTIFICATION_STATUS.DONE.value ||
		// 	bankQuery.thirdResponse === NOTIFICATION_STATUS.DONE.value,
		// STEP2: bankQuery.isAccountExist && bankQuery.accountBalance,
		// STEP3: checkRestrictionsStatus(bankQuery, lawOffice),
		// STEP4: check100DocumentStatus(bankQuery),
		STEP1:
			bankQuery.isAccountExist &&
			bankQuery.accountBalance &&
			(bankQuery.accountBalance > lawOffice.bankAccountBalanceThreshold ||
				bankQuery.isCancelledByThreshold === false) &&
			bankQuery.restrictionsNotificationStatus ===
				NOTIFICATION_STATUS.DONE.value &&
			(bankQuery.restrictionsNotificationResponse ===
				NOTIFICATION_STATUS.DONE.value ||
				(bankQuery.restrictionsNotificationResponse ===
					NOTIFICATION_STATUS.PENDING.value &&
					bankQuery.memorialResponse === NOTIFICATION_STATUS.DONE.value)),
		STEP2: checkRestrictionsStatus(bankQuery, lawOffice),
		STEP3: check100DocumentStatus(bankQuery),
	}
}

export const getShareInpoundmentStepsCompletedStatus = (asset, lawOffice) => {
	return {
		STEP1:
			asset.inpoundmentNotificationStatus === NOTIFICATION_STATUS.DONE.value &&
			(asset.inpoundmentResponse === NOTIFICATION_STATUS.DONE.value ||
				(asset.inpoundmentResponse === NOTIFICATION_STATUS.PENDING.value &&
					asset.memorialResponse === NOTIFICATION_STATUS.DONE.value)),
		STEP2:
			checkRestrictionsStatus(asset, lawOffice) &&
			asset.claim103DocumentCreated === true &&
			asset.claim103Status === NOTIFICATION_STATUS.DONE.value &&
			asset.chamberOfCommerceNotificationStatus ===
				NOTIFICATION_STATUS.DONE.value,
		STEP3:
			asset.appraisalResult &&
			check100DocumentStatus(asset) &&
			asset.appraisalNotificationStatus === NOTIFICATION_STATUS.DONE.value,
	}
}

export const getPatentInpoundmentStepsCompletedStatus = (patent, lawOffice) => {
	return {
		STEP1: patent.isSeized,
		STEP2:
			checkRestrictionsStatus(patent, lawOffice) &&
			patent.claim103DocumentCreated === true &&
			patent.claim103Status === NOTIFICATION_STATUS.DONE.value,
		STEP3:
			patent.appraisalResult &&
			check100DocumentStatus(patent) &&
			patent.appraisalNotificationStatus === NOTIFICATION_STATUS.DONE.value,
	}
}

export const getSsiStepsCompletedStatus = (asset, lawOffice) => {
	return {
		STEP1:
			asset.inpoundmentNotificationStatus === NOTIFICATION_STATUS.DONE.value &&
			(asset.inpoundmentResponse === NOTIFICATION_STATUS.DONE.value ||
				(asset.inpoundmentResponse === NOTIFICATION_STATUS.PENDING.value &&
					asset.memorialResponse === NOTIFICATION_STATUS.DONE.value)),
		STEP2: checkRestrictionsStatus(asset, lawOffice),
		STEP3:
			asset.restriction.exist === false ||
			asset.restriction?.table[0]?.withoutCreditor,
		// STEP3:
		// 	((asset.salaryInfo.type === SSI_SALARY_TYPE.ALL.value &&
		// 		asset.salaryInfo.amount) ||
		// 		(asset.salaryInfo.type === SSI_SALARY_TYPE.PERCENTAGE.value &&
		// 			asset.salaryInfo.amount &&
		// 			asset.salaryInfo.percentageToCollection) ||
		// 		(asset.salaryInfo.type === SSI_SALARY_TYPE.DIRECT.value &&
		// 			asset.salaryInfo.amountToCollection)) &&
		// 	asset.salaryInfo.date,
	}
}

export const getReceivedAssetsStepsCompletedStatus = object => {
	return {
		STEP1: object.isAssetReceived === true && object.allReceivedAssetsEntered,
		STEP2:
			(object.claim103DocumentCreated === true &&
				object.claim103Status === NOTIFICATION_STATUS.DONE.value) ||
			object.isDebtorExist === true ||
			object.is103LeftToPlace === true,
		STEP3: checkCustodianInfoStatus(object),
		STEP4:
			(object.claim100Status === NOTIFICATION_STATUS.DONE.value ||
				object.receivedAssets?.every(
					asset => asset.restriction.exist === false,
				)) &&
			object.appraisalNotificationStatus === NOTIFICATION_STATUS.DONE.value,
	}
}

export const getGarnishmentStepsCompletedStatus = (object, lawOffice) => {
	return {
		STEP1:
			object.consentToGarnishment &&
			(object.personConsentGarnishment === 0 ||
				(object.personConsentGarnishment === 1 &&
					object.thirdPersonConsentGarnishmentId !== null)) &&
			object.companyId &&
			object.inpoundmentNotificationStatus === NOTIFICATION_STATUS.DONE.value &&
			(object.inpoundmentResponse === NOTIFICATION_STATUS.DONE.value ||
				(object.inpoundmentResponse === NOTIFICATION_STATUS.PENDING.value &&
					object.memorialResponse === NOTIFICATION_STATUS.DONE.value)),
		STEP2: checkRestrictionsStatus(object, lawOffice),
		STEP3:
			object.restriction.exist === false ||
			object.restriction?.table[0]?.withoutCreditor,
	}
}

export const getDeFactoStepsCompletedStatus = object => {
	return {
		STEP1:
			object.isDebtorExist ||
			(object.isPoliceHelped && object.is103LeftToPlace !== null),
	}
}

export const getNormalAssetCompletedStatus = (object, lawOffice) => {
	return {
		STEP1: checkRestrictionsStatus(object, lawOffice),
		STEP2: object.appraisalResult && check100DocumentStatus(object),
		STEP3:
			object.appraisalNotificationStatus === NOTIFICATION_STATUS.DONE.value,
	}
}

export const getPledgedMovableStepsCompletedStatus = (asset, lawOffice) => {
	return {
		STEP1: checkRestrictionsStatus(asset, lawOffice),
		STEP2: checkCustodianInfoStatus(asset),
		STEP3: asset.appraisalResult && check100DocumentStatus(asset),
		STEP4: asset.appraisalNotificationStatus === NOTIFICATION_STATUS.DONE.value,
	}
}

export const checkRestrictionsStatus = (asset, lawOffice) => {
	return (
		asset.restriction?.exist === false ||
		(asset.restriction?.table.length > 0 &&
			(asset.restriction?.table.length < lawOffice.restrictionThreshold ||
				!asset.restriction?.isCancelledByThreshold) &&
			asset.restriction?.completed)
	)
}

export const checkCustodianInfoStatus = asset => {
	return (
		asset.custodianInfo.address &&
		asset.custodianInfo.address !== '' &&
		asset.custodianInfo.name &&
		asset.custodianInfo.name !== '' &&
		asset.custodianInfo.startDate &&
		(asset.custodianInfo.dailyPrice || asset.custodianInfo.dailyPrice === 0)
	)
}

export const check100DocumentCreated = (asset, type) => {
	return type === 'GARNISHMENT'
		? asset.garnishmentClaim100Created
		: asset.claim100DocumentCreated
}

export const check100DocumentStatus = (asset, type) => {
	return (
		asset.restriction.exist === false ||
		(check100DocumentCreated(asset, type) &&
			asset[
				type === 'GARNISHMENT' ? 'garnishmentClaim100Status' : 'claim100Status'
			] === NOTIFICATION_STATUS.DONE.value)
	)
}

export const getInpoundmentStepStatus = (type, object, step, lawOffice) => {
	return (status = getInpoundmentStepStatusObject(type, object, lawOffice)[
		`STEP${step}`
	])
}

export const getInpoundmentStepStatusObject = (type, object, lawOffice) => {
	let status
	switch (type) {
		case 'VEHICLE':
			status = getVehicleInpoundmentStepsCompletedStatus(object, lawOffice)
			break
		case 'IMMOVABLE':
			status = getImmovableInpoundmentStepsCompletedStatus(object, lawOffice)
			break
		case 'BANK':
			status = getBankInpoundmentStepsCompletedStatus(object, lawOffice)
			break
		case 'SHARE':
			status = getShareInpoundmentStepsCompletedStatus(object, lawOffice)
			break
		case 'PATENT':
			status = getPatentInpoundmentStepsCompletedStatus(object, lawOffice)
			break
		case 'RECEIVED_ASSETS':
			status = getReceivedAssetsStepsCompletedStatus(object, lawOffice)
			break
		case 'GARNISHMENT':
			status = getGarnishmentStepsCompletedStatus(object, lawOffice)
			break
		case 'DE_FACTO':
			status = getDeFactoStepsCompletedStatus(object, lawOffice)
			break
		case 'SSI':
			status = getSsiStepsCompletedStatus(object, lawOffice)
			break
		case 'NORMAL_ASSET':
			status = getNormalAssetCompletedStatus(object, lawOffice)
			break
		case 'PLEDGED_MOVABLE':
			status = getPledgedMovableStepsCompletedStatus(object, lawOffice)
			break
	}
	return status
}

export const getInpoundmentStepName = (type, step) => {
	switch (type) {
		case 'VEHICLE':
			return null
		case 'immovable':
			return null
		case 'bank':
			return null
		case 'share':
			return null
		case 'patent':
			return null
		case 'receivedAssets':
			return STEP_NAME.RECEIVED_ASSETS[step]
		case 'garnishment':
			return null
		case 'deFacto':
			return null
		case 'NORMAL_ASSET':
			return null
	}
}

export const checkInpoundmentTypeIsMultiSource = type => {
	type === INPOUNDMENT_TYPE.VEHICLE ||
		type === INPOUNDMENT_TYPE.IMMOVABLE ||
		type === INPOUNDMENT_TYPE
}

export const isMoreThanOneMonth = dateString => {
	dateString = new Date(dateString)
	const now = new Date()
	const oneMonthAsMs = 2592000000
	return now - dateString > oneMonthAsMs
}

// Find at least 1 sale day that saleStatus === true and saleNotificationStatus DONE
export const findSuccessfulSaleDay = sale => {
	let value = false
	sale.saleRequests.map(request => {
		request.days.map(day => {
			if (
				day.saleStatus === true &&
				day.saleNotificationStatus === NOTIFICATION_STATUS.DONE.value
			) {
				value = true
			}
		})
	})
	return value
}

export const getAssetName = assetType => {
	switch (assetType) {
		case 'VEHICLE':
			return 'Araç'
		case 'IMMOVABLE':
			return 'Gayrimenkul'
		case 'SSI':
			return 'Maaş haczi'
		case 'TAX_DUE':
			return 'Vergi alacağı'
		case 'SHARE':
			return 'Hisse Haczi'
		case 'CREDITOR_CASE':
			return 'Alacaklı Olduğu Dosya'
		case 'DE_FACTO':
			return 'Fiili Haciz'
		case 'CUSTOMS':
			return 'Gümrük Alacağı'
		case 'PATENT':
			return 'Patent, Marka veya Faydalı Tasarım'
		case 'BANK':
			return 'Toplu Banka'
		case 'COMMITMENT':
			return 'Taahhüt'
		case 'FAMILY_REGISTER':
			return 'Aile Nüfus Kaydı'
		case 'PLEDGED_MOVABLE':
			return 'Rehinli Taşınır'
		case assetType.includes('QUERY'):
			return 'Sorgu'
		default:
			return ''
	}
}

export const calculateCommitmentInstallments = commitmentDetails => {
	const installments = []
	if (!commitmentDetails.isSplittedToInstallments) {
		installments.push({
			date: new Date(commitmentDetails.commitmentDate),
			amount: commitmentDetails.totalAmount,
		})
	} else {
		for (let i = 0; i < commitmentDetails.installmentsCount; i++) {
			const installmentDate = new Date(commitmentDetails.firstInstallmentDate)
			installmentDate.setDate(
				installmentDate.getDate() +
					parseInt(commitmentDetails.installmentsIntervalByDays) * i,
			)
			installments.push({
				date: installmentDate,
				amount: (
					commitmentDetails.totalAmount / commitmentDetails.installmentsCount
				).toFixed(2),
				isPaid: false,
			})
		}
	}
	return installments
}

export const handleError = (e, customMessage, setError) => {
	if (!setError) setError = alert
	if (customMessage) {
		setError(customMessage)
	} else {
		setError(
			e.response && e.response.data.message
				? e.response.data.message
				: 'Bilinmeyen bir hata meydana geldi!',
		)
	}
}

export const getQueryVariable = variable => {
	var query = window.location.search.substring(1)
	var vars = query.split('&')
	for (var i = 0; i < vars.length; i++) {
		var pair = vars[i].split('=')
		if (decodeURIComponent(pair[0]) == variable) {
			return decodeURIComponent(pair[1])
		}
	}
}

export const findTodayQueriesByType = (queries, type) => {
	const now = new Date()
	return (
		queries.filter(q => {
			const createdAt = new Date(q.createdAt)
			return (
				q.type === type &&
				now.getDate() === createdAt.getDate() &&
				now.getMonth() === createdAt.getMonth() &&
				now.getFullYear() === createdAt.getFullYear()
			)
		}).length === 0
	)
}

export const findDistrainableDebtors = (currentCase, debtors) => {
	return debtors.filter(d => {
		if (
			Array.isArray(d.thirdPersonReasons) &&
			(d.thirdPersonReasons.includes(THIRD_PERSON_REASONS.SHARE.value) ||
				d.thirdPersonReasons.includes(THIRD_PERSON_REASONS.SSI.value) ||
				d.thirdPersonReasons.includes(THIRD_PERSON_REASONS.BANK.value))
		) {
			return true
		} else {
			const doneItems = d.notifications.filter(
				n =>
					n.caseId === currentCase._id &&
					n.status === NOTIFICATION_STATUS.DONE.value &&
					n.doneDate,
			)
			if (doneItems.length > 0) {
				const now = new Date()
				const doneDate = new Date(doneItems[0].doneDate)
				const daysDiff = (now - doneDate) / 86400000
				let caseTransitionDays = 0
				if (currentCase.type === '13') {
					if (currentCase.rentalDetails.type === RENTAL_TYPES[0]) {
						if (parseInt(currentCase.rentalDetails.contractDuration) >= 6) {
							caseTransitionDays = 30
						} else {
							caseTransitionDays = 6
						}
					} else {
						caseTransitionDays = 60
					}
				} else {
					caseTransitionDays = CASE_TRANSITION_DAYS[currentCase.type]
				}
				const areDaysPast = daysDiff > caseTransitionDays
				return (
					currentCase.debtorIds.includes(d._id) &&
					doneItems.length > 0 &&
					areDaysPast
				)
			} else {
				return false
			}
		}
	})
}

export const getPrinterTypeByQueryType = queryType => {
	switch (queryType) {
		case 'FAMILY_REGISTER':
			return printer.FAMILY_REGISTER_INTELLIGENCE.value
		case 'VEHICLE':
			return printer.VEHICLE_INPOUNDMENT.value
		case 'IMMOVABLE':
			return printer.IMMOVABLE_QUERY.value
		case 'SSI':
			return printer.SSI_QUERY.value
		case 'CUSTOMS':
			return printer.CUSTOMS.value
		case 'TAX_DUE':
			return printer.TAX_OFFICE.value
		case 'PATENT':
			return printer.PATENT.value
		case 'CREDITOR_CASE':
			return printer.CREDITOR_CASE.value
		case 'SHARE':
			return printer.SHARE_QUERY.value
		case 'BANK':
			return printer.BANK.value
	}
}

export const findSaleRequestPrinterTypeByAsset = assetType => {
	switch (assetType) {
		case 'VEHICLE':
			return printer.VEHICLE_SALE_REQUEST.value
		case 'IMMOVABLE':
			return printer.IMMOVABLE_SALE_REQUEST.value
		default:
			return printer.MOVABLE_SALE_REQUEST.value
	}
}

export const checkCaseNotificationAccessibility = (
	currentCase,
	setIsAccessible,
	setAccessibilityWarning,
) => {
	if (!currentCase.executionOfficeId) {
		setAccessibilityWarning(
			'İcra Dairesi girilmeden tebligat işlemleri başlatılamaz!',
		)
	} else if (currentCase.lawyerIds.length === 0) {
		setAccessibilityWarning(
			'Yetkili Avukatlar girilmeden tebligat işlemleri başlatılamaz!',
		)
	} else if (currentCase.lawyerIds.length === 0) {
		setAccessibilityWarning(
			'Müvekkiller girilmeden tebligat işlemleri başlatılamaz!',
		)
	} else if (currentCase.debtorIds.length === 0) {
		setAccessibilityWarning(
			'Borçlular girilmeden tebligat işlemleri başlatılamaz!',
		)
	} else if (
		currentCase.type === '2' ||
		currentCase.type === '3' ||
		currentCase.type === '4' ||
		currentCase.type === '6'
	) {
		if (
			currentCase.writ.basisNumber === '' ||
			currentCase.adjudgementNumber === ''
		) {
			setAccessibilityWarning(
				'İlam detayları girilmeden tebligat işlemleri başlatılamaz!',
			)
		} else if (currentCase.type === '3' && currentCase.children.length === 0) {
			setAccessibilityWarning(
				'Teslimi istenen çocuklar girilmeden tebligat işlemleri başlatılamaz!',
			)
		} else {
			setIsAccessible(true)
		}
	} else {
		setIsAccessible(true)
	}
}

export const getNotificationLevelText = (notification, debtor) => {
	let text = ''
	if (
		notification.type === NOTIFICATION_TYPE.INPOUNDMENT_MEMORIAL ||
		notification.type === NOTIFICATION_TYPE.RESTRICTIONS_MEMORIAL ||
		notification.type === NOTIFICATION_TYPE.SSI_MEMORIAL ||
		notification.type === NOTIFICATION_TYPE.DE_FACTO_GARNISHMENT_MEMORIAL
	) {
		text += 'Muhtıra'
	} else if (notification.type === NOTIFICATION_TYPE.CASE_INITIALIZATION) {
		text += debtor.type === DEBTOR_TYPES.PERSON ? '21' : '35'
		text +=
			notification.level === 1
				? ''
				: `/${notification.level === 4 ? `2 TEKİDEN` : notification.level - 1}`
	} else if (notification.type === NOTIFICATION_TYPE.THIRD_PERSON) {
		text += `89/${notification.level}`
	}
	return text
}

export const findFormalAddresses = debtor => {
	return debtor.addresses.filter(a => a.type === ADDRESS_TYPE.FORMAL.value)
}

export const getBulkQueryText = (query, lawOffice) => {
	switch (query) {
		case 'SSI':
			return 'Borçlular hakkında PTT, SGK, GİB sorgularının yapılmasını, olması halinde haczi için gereğinin yapılmasını,'
		case 'VEHICLE':
			return 'Dosya borçluları adına kayıtlı araç kaydı bulunup bulunmadığının sorgulanmasını, mevcut ise adlarına kayıtlı araç kayıtlarına haciz şerhi konuluo, takyidatlarının dosya arasına alınmasını,'
		case 'IMMOVABLE':
			return 'Dosya borçluları adına kayıtlı tapu kaydı bulunup bulunmadığının sorgulanmasını, mevcut ise adlarına kayıtlı tapuların kayıtlarına haciz şerhi konuluo, takyidatlarının dosya arasına alınmasını,'
		case 'BANK':
			return 'Borçlunun 3. Kişilerdeki hak ve alacaklarının haczi ve muhafazası için belirtilen bankalara 89/1 haciz ihbarnamesi gönderilmesini,'
		case 'CREDITOR_CASE':
			return 'Borçlunun 3. Şahıslara karşı alacaklı veya borçlu sıfatını taşıdığı dosyaların icradan uyapta sorgulanmasını, tespiti halinde alacaklı olduğu dosyalara haciz koyulmasını,'
		case 'FAMILY_REGISTER':
			return 'Dosya borçlusuna intikat edebilecek hak ve alacaklarına haciz konulabilmesi için aile nüfus kaydının sorgulanarak uyap sistemine kayıt edilmesini,'
		case 'CUSTOMS':
			return 'Ticari unvanı yazılı dosyamız borçlusunun vergi sicil numarasına göre GÜMRÜK MÜDÜRLÜĞÜNDE HERHANGİ BİR hak ve alacaklarının haczi için GÜMRÜK MÜDÜRLÜĞÜNE 89/1 ve haciz müzekkeresi yazılmasını'
		case 'PATENT':
			return 'Borçluların Türkiye Patent Enstitüsünde bulunan markalarına, patentlerine ve faydalı tasarımlarının sorgulanmasına ve tespiti halinde haciz konulması aksi takdirde devredilmiş ise devir tarihinin ve devir gerekçesinin bildirilmesi için müzekkere yazılmasını'
		case 'SHARE':
			return 'Borçluların ticaret odasında kayıtlı şirketlerinin olup olmadığının ayrıca var ise şirket hisse oranının öğrenilmesini ve ticaret odasına müzekkere ile sorulması,'
		case 'TAX_DUE':
			return 'Ticari unvanı yazılı dosyamız borçlusunun vergi sicil numarasına göre hak ve alacaklarının haczi için VERGİ DAİRESİ MÜDÜRLÜĞÜNE 89/1 ve haciz müzekkeresi yazılmasını'
		case 'FINALIZATION':
			return 'Dosya borçlusuna gönderilen ödeme emri tebliğ edildiğinden tebligatların uyap ortamında kesinleştirme kaydı yapılmasını,'
		case 'DE_FACTO':
			return 'Borçlunun menkul ve gayrimenkul malları ile 3.kişilerdeki hak ve alacaklarının Haczine karar verilmekle, haciz edilen menkul malların ve aynı adreste veya gösterilecek adreslerde ek haciz yapılarak kapının kilitli olması halinde çilingir vasıtası ile açılarak muhafaza altına alınması için haciz kararı verilmesini'
	}
}

export const declareAreAddressesSame = (address1, address2) => {
	return (
		address1 &&
		address2 &&
		address1.title === address2.title &&
		address1.type === address2.type &&
		address1.city === address2.city &&
		address1.district === address2.district &&
		address1.description === address2.description
	)
}

export const checkAllBeforeStepsCompleted = (stepsStatus, step) => {
	let count = 0
	for (let i = step - 1; i > 0; i--) {
		const status = stepsStatus[`STEP${i}`]
		if (status) count += 1
	}
	return count >= step - 1
}

export const getAddressType = address => {
	return Object.values(ADDRESS_TYPE).filter(a => a.value === address.type)[0]
}

export const goPreviousStepOfTeacher = async (
	setStatus,
	currentCase,
	setCurrentCase,
) => {
	let revertingStep = ''
	if (!currentCase.isWritDetailsCompleted) {
		revertingStep = 'isDetailsCompleted'
	} else if (!currentCase.isClientsCompleted) {
		if (CASE_TYPES_NEEDS_WRIT.includes(currentCase.type)) {
			revertingStep = 'isWritDetailsCompleted'
		} else {
			revertingStep = 'isDetailsCompleted'
		}
	} else if (!currentCase.isLawyersCompleted) {
		revertingStep = 'isClientsCompleted'
	} else if (!currentCase.isDebtorsCompleted) {
		revertingStep = 'isLawyersCompleted'
	} else if (!currentCase.isHypotecInfoCompleted) {
		revertingStep = 'isDebtorsCompleted'
	} else if (!currentCase.isChildrenCompleted) {
		revertingStep = 'isDebtorsCompleted'
	} else if (!currentCase.isRentalDetailsCompleted) {
		revertingStep = 'isDebtorsCompleted'
	} else if (!currentCase.isDuesCompleted) {
		revertingStep =
			currentCase.type === '8'
				? 'isHypotecInfoCompleted'
				: currentCase.type === '3'
				? 'isChildrenCompleted'
				: currentCase.type === '13' || currentCase.type === '14'
				? 'isRentalDetailsCompleted'
				: 'isDebtorsCompleted'
	} else {
		return false
	}
	setStatus(STATUS.LOADING)
	await saveCase(currentCase.number, { [revertingStep]: false })
		.then(res => setCurrentCase(res.data))
		.catch(e => handleError(e))
	setStatus(STATUS.NORMAL)
}

export const checkCaseInitialized = currentCase => {
	return (
		currentCase.isDetailsCompleted &&
		currentCase.isDebtorsCompleted &&
		currentCase.isClientsCompleted &&
		currentCase.isHypotecInfoCompleted &&
		currentCase.isDuesCompleted &&
		currentCase.isWritDetailsCompleted &&
		currentCase.isChildrenCompleted &&
		currentCase.isEnforcementRequestPaperCreated &&
		currentCase.isRentalDetailsCompleted
	)
}

export const getCasePartOpacity = (currentCase, part) => {
	if (checkCaseInitialized(currentCase)) {
		return true
	}

	switch (part) {
		case 'details':
			return !currentCase.isDetailsCompleted
		case 'writ':
			return (
				currentCase.isDetailsCompleted && !currentCase.isWritDetailsCompleted
			)
		case 'clients':
			return (
				currentCase.isDetailsCompleted &&
				currentCase.isWritDetailsCompleted &&
				!currentCase.isClientsCompleted
			)
		case 'lawyers':
			return currentCase.isClientsCompleted && !currentCase.isLawyersCompleted
		case 'debtors':
			return currentCase.isLawyersCompleted && !currentCase.isDebtorsCompleted
		case 'rental':
			return (
				currentCase.isDebtorsCompleted && !currentCase.isRentalDetailsCompleted
			)
		case 'hypotec':
			return (
				currentCase.isDebtorsCompleted && !currentCase.isHypotecInfoCompleted
			)
		case 'children':
			return currentCase.isDebtorsCompleted && !currentCase.isChildrenCompleted
		case 'dues':
			return (
				currentCase.isDebtorsCompleted &&
				currentCase.isHypotecInfoCompleted &&
				currentCase.isChildrenCompleted &&
				currentCase.isRentalDetailsCompleted &&
				!currentCase.isDuesCompleted
			)
		case 'utils':
			return (
				currentCase.isDetailsCompleted &&
				currentCase.isWritDetailsCompleted &&
				(!currentCase.isClientsCompleted || !currentCase.isLawyersCompleted)
			)
		case 'enforcementRequest':
			return (
				currentCase.isDuesCompleted &&
				!currentCase.isEnforcementRequestPaperCreated
			)
	}
}

// Takibin borçlu için kesinleşip kesinleşmediğini kontrol eder
export const checkDebtorEffectiveDate = (currentCase, notification) => {
	if (currentCase && notification) {
		const transitionDays = CASE_TRANSITION_DAYS[currentCase.type]
		if (
			(notification.type === NOTIFICATION_TYPE.CASE_INITIALIZATION,
			notification.doneDate &&
				transitionDays &&
				notification.status === NOTIFICATION_STATUS.DONE.value)
		) {
			const now = new Date()
			const doneDate = new Date(notification.doneDate)
			return (now - doneDate) / 86400000 > transitionDays
		} else return false
	} else return false
}

export const checkObjectionDate = (notification, days = 7) => {
	if (
		notification.doneDate &&
		notification.status === NOTIFICATION_STATUS.DONE.value
	) {
		const now = new Date()
		const doneDate = new Date(notification.doneDate)
		return (now - doneDate) / 86400000 > days
	} else return false
}

// 103 itiraz süresinin dolup dolmadığını hesaplar
const check103ObjectionDate = notification => {
	if (
		notification.doneDate &&
		notification.status === NOTIFICATION_STATUS.DONE.value &&
		notification.type === NOTIFICATION_TYPE[103]
	) {
		const now = new Date()
		const doneDate = new Date(notification.doneDate)
		return (now - doneDate) / 86400000 > 7
	} else return false
}

export const checkEffectiveDateByNotificationList = (
	currentCase,
	notifications,
) => {
	let isEffective = false
	notifications.map(n => {
		if (checkDebtorEffectiveDate(currentCase, n)) {
			isEffective = true
		}
	})
	return isEffective
}

export const check103ObjectionDateByNotificationList = notifications => {
	let objectionCheck = false
	notifications.map(n => {
		if (check103ObjectionDate(n)) {
			objectionCheck = true
		}
	})
	return objectionCheck
}

export const validateNonZeroInteger = value => {
	return value && !isNaN(parseInt(value)) && parseInt(value) > 0
}

export const validateNonZeroFloat = value => {
	return value && !isNaN(parseFloat(value)) && parseFloat(value) > 0
}

export const calculateSsiAmountToCollection = salaryInfo => {
	if (salaryInfo.type === SSI_SALARY_TYPE.ALL.value) {
		return parseInt(salaryInfo.amount)
	} else if (salaryInfo.type === SSI_SALARY_TYPE.DIRECT.value) {
		return parseInt(salaryInfo.amountToCollection)
	} else if (salaryInfo.type === SSI_SALARY_TYPE.PERCENTAGE.value) {
		return calculatePercentage(
			parseInt(salaryInfo.amount),
			parseInt(salaryInfo.percentageToCollection),
		)
	}
}

export const calculateRestrictionCollections = (
	saleAmount = 0,
	restriction,
) => {
	const collectionTable = []
	let remainingSaleAmount = parseFloat(saleAmount)
	restriction.table.map((item, index) => {
		const debtAmount = parseInt(
			item.debtAmount.replace(',', '').replace('.', ''),
		)

		if (debtAmount >= parseFloat(remainingSaleAmount)) {
			collectionTable.push(parseFloat(remainingSaleAmount))
			remainingSaleAmount = 0
		} else {
			collectionTable.push(debtAmount)
			remainingSaleAmount -= debtAmount
		}
	})
	return {
		debtorCollection: remainingSaleAmount,
		collectionTable,
		ourCollection:
			collectionTable[
				restriction.table.findIndex(i => i.withoutCreditor && !i.creditorId)
			],
	}
}

export const calculateRemainingMonthsToSsiRestrictionComplete = (
	object,
	type,
) => {
	const index = object.restriction.table.findIndex(
		item => !item.creditorId && item.withoutCreditor,
	)
	let debtUntilIndex = 0
	for (let i = 0; i < index; i++) {
		debtUntilIndex += parseInt(
			object.restriction.table[i].debtAmount.replace(',', '').replace('.', ''),
		)
	}
	const field = type === 'GARNISHMENT' ? 'garnishmentDetails' : 'salaryInfo'
	return parseInt(debtUntilIndex / object[field].amount) || 1
}

export const getPaymentType = payment => {
	return PAYMENT_TYPES[payment.type]?.text || COLLECTION_TYPE[payment.type].text
}

export const checkDatesAreSame = (date1, date2) => {
	if (!isNaN(date1.getDate()) || !isNaN(date2.getDate())) {
		return (
			date1.getDate() === date2.getDate() &&
			date1.getMonth() === date2.getMonth() &&
			date1.getFullYear() === date2.getFullYear()
		)
	}
}

export const getUsuryTypesByCurrency = currency => {
	return USURY_TYPE.filter(type => {
		if (currency === 'USD') {
			return type.name.includes('USD')
		} else if (currency === 'EUR') {
			return type.name.includes('Euro')
		} else {
			return true
		}
	})
}
