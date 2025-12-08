import React, { useState } from 'react'
import { FaCheckSquare, FaExclamationTriangle } from 'react-icons/fa'
import {
	getRestrictionAppraisalNotification,
	NOTIFICATION_STATUS,
	NOTIFICATION_STATUS_WITH_OBJECTION,
	NOTIFICATION_TYPE,
} from '../../constants'
import { checkObjectionDate } from '../../helpers/Helper'
import { useRestrictionContext } from '../../services/hooks/useRestrictionContext'
import Button from '../anBrains/Button'
import Modal from '../anBrains/Modal'
import Notification from '../notification/Notification'
import NotificationForm from '../notification/NotificationForm'
import TaskRadar from '../task/TaskRadar'

export default function RestrictionAppraisalNotification({
	restriction,
	changeProperty,
}) {
	const [isDetailsVisible, setIsDetailsVisible] = useState(false)
	const [isFormVisible, setIsFormVisible] = useState(false)

	const { creditors } = useRestrictionContext()
	const creditor = restriction?.creditorId
		? creditors.find(c => c._id === restriction.creditorId)
		: null

	const declareRequiredOperation = () => {
		const returnObject = { status: false, message: null, taskType: null }
		if (restriction.notifications) {
			if (restriction.notifications.some(n => checkObjectionDate(n, 7))) {
				returnObject.status = true
			} else {
				const lastOne =
					restriction.notifications[restriction.notifications.length - 1]
				if (!lastOne.barcodeNumber) {
					returnObject.message = 'Barkod numarası bekleniyor'
					returnObject.taskType = 'barcodeNumber'
				} else if (lastOne.status === NOTIFICATION_STATUS.PENDING.value) {
					returnObject.message = 'Durumunun kontrol edilmesi gerekiyor'
					returnObject.taskType = 'status'
				} else if (lastOne.status === NOTIFICATION_STATUS.REJECTED.value) {
					returnObject.message = 'Tekrar gönderilmesi gerekiyor'
				} else if (lastOne.status === NOTIFICATION_STATUS.DONE.value) {
					if (!lastOne.doneDate) {
						returnObject.message = 'Tebliğ tarihi bekleniyor'
						returnObject.taskType = 'doneDate'
					}
				} else if (
					lastOne.status === NOTIFICATION_STATUS_WITH_OBJECTION.OBJECTION.value
				) {
					if (!lastOne.objectionDate) {
						returnObject.message = 'İtiraz tarihi gerekiyor.'
						returnObject.taskType = 'objectionDate'
					} else {
						returnObject.message = 'İtiraz var!'
						returnObject.taskType = 'objectionDate'
					}
				}
			}
		} else {
			returnObject.message = 'Tebligat gönderilmesi gerekiyor'
		}
		return returnObject
	}

	const addNewNotification = address => {
		if (restriction.notifications) {
			changeProperty('notifications', [
				...restriction.notifications,
				{ ...getRestrictionAppraisalNotification(address) },
			])
		} else {
			changeProperty('notifications', [
				{ ...getRestrictionAppraisalNotification(address) },
			])
		}
	}

	const changeNotification = (index, notification) => {
		restriction.notifications[index] = notification
		changeProperty('notifications', [...restriction.notifications])
	}

	const hasCreationTask =
		!restriction.notifications ||
		restriction.notifications[restriction.notifications.length - 1].status ===
			NOTIFICATION_STATUS.REJECTED.value

	return (
		<>
			{!restriction.isContinue && restriction.creditorId && (
				<div className="red fw-600 flex al-center">
					<FaExclamationTriangle className="mr-2" />
					Devam etmiyor!
				</div>
			)}
			{restriction.withoutCreditor && (
				<div className="blue fw-600">Takyidat bize ait</div>
			)}
			{restriction.isContinue && !restriction.withoutCreditor && (
				<>
					{declareRequiredOperation().status !== true ? (
						<TaskRadar right="90%" top="-1rem" always>
							<Button onClick={() => setIsDetailsVisible(true)}>
								<p className="orange fw-600">
									{declareRequiredOperation().message}
								</p>
							</Button>
						</TaskRadar>
					) : (
						<Button
							classes="green fw-600 flex al-center btn-green"
							onClick={() => setIsDetailsVisible(true)}
						>
							<FaCheckSquare className="mr-2" />
							Tamamlandı
						</Button>
					)}
				</>
			)}
			<Modal
				visible={isDetailsVisible}
				close={() => setIsDetailsVisible(false)}
			>
				<div className="form-modal">
					<p className="fs-md bold mb-4">Kıymet Takdiri Tebligatı</p>
					<div className="flex">
						<div>
							<div className="debtor-notifications">
								<div className="flex al-center jst-between mb-4">
									<p className="fw-500 fs-md">Tebligat Listesi</p>
									{hasCreationTask && (
										<TaskRadar always={true} right="100%" top="-.5rem">
											<Button
												theme="orange"
												classes="fw-600"
												onClick={() => setIsFormVisible(true)}
											>
												Yeni Tebligat Oluştur
											</Button>
											<NotificationForm
												debtor={creditor}
												visible={isFormVisible}
												create={addNewNotification}
												close={() => setIsFormVisible(false)}
												notificationType={NOTIFICATION_TYPE.APPRAISAL_RESULT}
												notificationGroup={{
													items: restriction.notifications || [],
												}}
											/>
										</TaskRadar>
									)}
								</div>
								{restriction.notifications &&
									restriction.notifications.map((notification, index) => {
										return (
											<Notification
												withoutUpdate
												key={`appraisal-notification-${index}`}
												notification={notification}
												debtor={creditor}
												setNotification={not => changeNotification(index, not)}
												radarField={
													index === restriction.notifications.length - 1
														? declareRequiredOperation().taskType
														: null
												}
												customStatusText={
													index === restriction.notifications.length - 1
														? declareRequiredOperation().message ||
														  'Tebliğ oldu'
														: Object.values(NOTIFICATION_STATUS).find(
																v => v.value === notification.status,
														  ).text
												}
											/>
										)
									})}
							</div>
						</div>
					</div>
				</div>
			</Modal>
		</>
	)
}
