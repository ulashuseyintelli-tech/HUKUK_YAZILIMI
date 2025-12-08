import React, { useEffect, useState } from 'react'
import { FaCheckCircle, FaLongArrowAltRight } from 'react-icons/fa'
import {
	NOTIFICATION_STATUS_WITH_OBJECTION,
	NOTIFICATION_TYPE,
	STATUS,
} from '../../constants'
import { getDebtorName, handleError } from '../../helpers/Helper'
import {
	createNotification,
	getNotifications,
} from '../../services/notificationService'
import LoadingCircle from '../anBrains/animations/LoadingCircle'
import Button from '../anBrains/Button'
import Notification from './Notification'
import NotificationForm from './NotificationForm'

export default function ThirdPersonNotification({
	object,
	assetType,
	debtor,
	set,
}) {
	const [status, setStatus] = useState(STATUS.NORMAL)
	// const [notifications, setNotifications] = useState(object.notifications)
	const [isFormOpen, setIsFormOpen] = useState(false)

	// useEffect(() => {
	// 	if (set && notifications.length > 0) {
	// 		console.log({ notifications })
	// 		set(notifications)
	// 	}
	// }, [notifications])

	// useEffect(() => {
	// 	get()
	// }, [])

	// const get = () => {
	// 	const { caseId, debtorId } = object
	// 	getNotifications(
	// 		NOTIFICATION_TYPE.THIRD_PERSON,
	// 		caseId,
	// 		debtorId,
	// 		assetType,
	// 		object._id,
	// 	)
	// 		.then(res => {
	// 			setNotifications(res.data)
	// 		})
	// 		.catch(e => {
	// 			console.log(e)
	// 			alert(e)
	// 		})
	// 	setStatus(STATUS.NORMAL)
	// }

	const create = address => {
		const pendingCount = object.notifications.filter(
			n => n.status === NOTIFICATION_STATUS_WITH_OBJECTION.PENDING.value,
		).length
		if (pendingCount === 0) {
			const doneCount = object.notifications.filter(
				n => n.status === NOTIFICATION_STATUS_WITH_OBJECTION.DONE.value,
			).length
			if (doneCount === 0) {
				createNotification(
					object.caseId,
					object.debtorId,
					address,
					assetType,
					object._id,
					NOTIFICATION_TYPE.THIRD_PERSON,
				)
					.then(res => {
						object.notifications.push(res.data)
						set([...object.notifications])
						setIsFormOpen(false)
					})
					.catch(e => handleError(e))
			} else {
				alert(
					'Borçlunun tebligatı tebliğ olmuş, yeni bir tebligat oluşturamazsınız.',
				)
			}
		} else {
			alert(
				'Sonuçlanmamış bir tebligat var. Yeni bir tebligat oluşturamazsınız!',
			)
		}
	}

	const updateNotification = (index, notification) => {
		object.notifications[index] = notification
		set([...object.notifications])
	}

	if (status === STATUS.LOADING) {
		return <LoadingCircle />
	}

	return (
		<div>
			<NotificationForm
				debtor={debtor}
				visible={isFormOpen}
				create={create}
				close={() => setIsFormOpen(false)}
				notificationGroup={{ debtor, items: object.notifications }}
			/>
			<div className="flex al-center fs-nm">
				{object.notifications.filter(
					n => n.status === NOTIFICATION_STATUS_WITH_OBJECTION.DONE.value,
				).length > 0 ? (
					<div className="flex al-center green">
						<FaCheckCircle className="mr-2 fs-xsm" />
						<p className="fs-sm fw-500">Tebligat, 3. şahısa tebliğ olmuş.</p>
					</div>
				) : (
					<Button
						theme="green"
						classes="fw-500"
						onClick={() => setIsFormOpen(true)}
					>
						Tebligat Hazırla
					</Button>
				)}
			</div>
			<div className="divider my-4"></div>
			<div className="mt-2">
				<React.Fragment>
					<p className="bold mb-4">Hazırlanmış Tebligatlar</p>
					{object.notifications && object.notifications.length > 0 ? (
						<div>
							{object.notifications.map((notification, index) => {
								return (
									<Notification
										key={notification._id}
										notification={notification}
										debtor={debtor}
										setNotification={not => updateNotification(index, not)}
									/>
								)
							})}
						</div>
					) : (
						<p>Borçluya ait tebligat bulunamadı</p>
					)}
				</React.Fragment>
			</div>
		</div>
	)
}
