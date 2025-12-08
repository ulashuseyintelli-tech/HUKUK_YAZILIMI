import React, { useEffect, useState } from 'react'
import { FaLongArrowAltLeft } from 'react-icons/fa'
import {
	ADDRESS_TYPE,
	DEBTOR_TYPES,
	NOTIFICATION_STATUS,
	NOTIFICATION_TYPE,
} from '../../constants'
import { declareAreAddressesSame, getDebtorName } from '../../helpers/Helper'
import useInpoundmentContext from '../../services/hooks/useInpoundmentContext'
import LoadingAnimation from '../anBrains/animations/LoadingAnimation/LoadingAnimation'
import Button from '../anBrains/Button'
import Modal from '../anBrains/Modal'

export default function NotificationForm({
	visible,
	close,
	debtor,
	create,
	notificationGroup,
	notificationType = NOTIFICATION_TYPE.CASE_INITIALIZATION,
	customAddresses,
}) {
	const { assetProps, visibleInpoundment } = useInpoundmentContext()

	const [isLoading, setIsLoading] = useState(true)
	const [selectedAddress, setSelectedAdress] = useState(null)
	const [selectedNotificationLevel, setSelectedNotificationLevel] =
		useState(null)

	useEffect(() => {
		handleInitialization()
	}, [])

	const handleInitialization = async () => {
		if (
			notificationType === NOTIFICATION_TYPE.CADASTRE ||
			notificationType === NOTIFICATION_TYPE.GARNISHMENT ||
			notificationType === NOTIFICATION_TYPE.ZONING_STATUS ||
			notificationType === NOTIFICATION_TYPE.THIRD_PERSON
		) {
			await create()
			setIsLoading(false)
			close()
		} else {
			setIsLoading(false)
		}
	}

	useEffect(() => {
		setSelectedNotificationLevel(null)
	}, [selectedAddress])

	const getAvailableLevels = () => {
		if (selectedAddress) {
			if (notificationType !== NOTIFICATION_TYPE.CASE_INITIALIZATION) {
				return [
					notificationGroup.items.filter(n => n.type === notificationType)
						.length + 1,
				]
			} else {
				if (selectedAddress.type === ADDRESS_TYPE.DECLARATION.value) {
					return [1]
				} else {
					const sameAddressFormalNotifications = notificationGroup.items.filter(
						i => declareAreAddressesSame(i.address, selectedAddress),
					)
					if (sameAddressFormalNotifications.length > 0) {
						if (
							sameAddressFormalNotifications.some(
								n => n.status === NOTIFICATION_STATUS.PENDING.value,
							)
						) {
							return []
						} else {
							if (sameAddressFormalNotifications.some(n => n.level === 3))
								return [4]
							else return [3]
						}
					} else {
						return [2]
					}
				}
			}
		} else {
			return []
		}
	}

	const getLevelText = (level, debtor) => {
		if (notificationType !== NOTIFICATION_TYPE.CASE_INITIALIZATION) {
			if (
				notificationType === NOTIFICATION_TYPE.INPOUNDMENT_MEMORIAL ||
				notificationType === NOTIFICATION_TYPE.RESTRICTIONS_MEMORIAL
			) {
				return 'Muhtıra'
			} else if (notificationType === NOTIFICATION_TYPE.APPRAISAL_RESULT) {
				return 'Kıymet Takdiri Tebligatı'
			} else {
				return 'Haciz Müzekkeresi'
			}
		} else if (notificationType === NOTIFICATION_TYPE.CASE_INITIALIZATION) {
			if (level === 1) return 'Beyan Adresine Tebligat'
			else if (level === 2) {
				if (debtor.type === DEBTOR_TYPES.INSTITUTION)
					return "35/1'e Göre Tebligat"
				else return "21/1'e Göre Tebligat"
			} else if (level === 3) {
				if (debtor.type === DEBTOR_TYPES.INSTITUTION)
					return "35/2'e Göre Tebligat"
				else return "21/2'e Göre Tebligat"
			} else if (level === 4) {
				if (debtor.type === DEBTOR_TYPES.INSTITUTION)
					return "35/2'e TEKİDEN Göre Tebligat"
				else return "21/2'e TEKİDEN Göre Tebligat"
			}
		} else if (notificationType === NOTIFICATION_TYPE.THIRD_PERSON) {
			if (level === 1) return "89/1'e Göre Tebligat"
			else if (level === 2) return "89/2'e Göre Tebligat"
			else if (level > 2) return "89/3'e Göre Tebligat"
		}
	}

	const _create = () => {
		setSelectedAdress(null)
		setSelectedNotificationLevel(null)
		create(selectedAddress, selectedNotificationLevel)
	}

	if (isLoading) {
		return <LoadingAnimation loading={true} />
	}

	return (
		<Modal visible={visible} close={close}>
			<div className="form-modal">
				<Button theme="basic" classes="py-1 mb-4" onClick={close}>
					<FaLongArrowAltLeft className="mr-2" /> Geri Dön
				</Button>
				<p className="fw-600 fs-md mb-8">
					{visibleInpoundment === 'BANK'
						? assetProps.visibleAsset.bankName
						: getDebtorName(debtor)}{' '}
					Adlı{' '}
					<span>
						{visibleInpoundment === 'BANK' ? '3. Şahısa' : 'Borçluya'} Yeni
						Tebligat
					</span>
				</p>
				{visibleInpoundment !== 'BANK' && (
					<>
						<p className="fw-600">Tebligat Adresi Seçin</p>
						<div>
							{(customAddresses || debtor.addresses).map(address => {
								// if (address.title !== '' && address.description !== '') {
								const addressType = Object.values(ADDRESS_TYPE).filter(
									a => a.value === address.type,
								)[0]
								const isAvailable =
									notificationType !== NOTIFICATION_TYPE.CASE_INITIALIZATION
										? true
										: !notificationGroup.items.filter(i => i.level === 1)
												.length > 0 ||
										  addressType.value === ADDRESS_TYPE.FORMAL.value
								const isSelected = declareAreAddressesSame(
									address,
									selectedAddress,
								)
								return (
									<Button
										disabled={!isAvailable}
										classes={`notification-address ${
											isSelected ? 'notification-address__selected' : ''
										}`}
										onClick={() => {
											setSelectedAdress(address)
											setSelectedNotificationLevel(null)
										}}
									>
										<div className="flex al-center mb-2">
											<p className="fw-500">{address.title}</p>
											{addressType && (
												<div className="badge ml-4">
													{addressType.getText(debtor)}
												</div>
											)}
										</div>
										<p className="mb-1">{address.description}</p>
										<p>
											{address.city} {address.district}
										</p>
									</Button>
								)
								// }
							})}
						</div>
					</>
				)}
				<div className="mt-8">
					<p className="fw-600 mb-4">Tebligat Türü Seçin</p>
					<div className="notification-type-list">
						{getAvailableLevels().map(level => {
							const isSelected = selectedNotificationLevel === level
							return (
								<button
									className={`notification-type ${
										isSelected ? 'notification-type__selected' : ''
									}`}
									onClick={() => setSelectedNotificationLevel(level)}
								>
									{getLevelText(level, debtor)}
								</button>
							)
						})}
					</div>
				</div>
				<Button
					theme="blue"
					disabled={
						selectedAddress === null || selectedNotificationLevel === null
					}
					classes="w-100 mt-8 fw-600 py-3"
					onClick={_create}
				>
					Tebligat Oluştur
				</Button>
			</div>
		</Modal>
	)
}
