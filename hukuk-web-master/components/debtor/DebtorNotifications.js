import React, { useEffect, useState } from 'react'
import {
	FaCheckCircle,
	FaInfoCircle,
	FaLongArrowAltRight,
	FaScroll,
	FaTimes,
} from 'react-icons/fa'
import {
	CASE_INITIALIZATION_TASK_TYPES,
	NOTIFICATION_CREATION_TASK_TYPES,
	NOTIFICATION_STATUS,
	NOTIFICATION_TYPE,
} from '../../constants'
import { findFormalAddresses, handleError } from '../../helpers/Helper'
import { useDebtorContext } from '../../services/hooks/useDebtorContext'
import useInpoundmentContext from '../../services/hooks/useInpoundmentContext'
import { createNotification } from '../../services/notificationService'
import Button from '../anBrains/Button'
import Modal from '../anBrains/Modal'
import Note from '../Note'
import Notification from '../notification/Notification'
import NotificationForm from '../notification/NotificationForm'
import TaskRadar from '../task/TaskRadar'

export default function DebtorNotifications({
	debtor,
	getTasks,
	notificationRequired,
}) {
	const { debtorTasks, setDebtor } = useDebtorContext()
	const { currentCase } = useInpoundmentContext()
	const [isFormOpen, setIsFormOpen] = useState(false)
	const [isOpen, setIsOpen] = useState(false)

	useEffect(() => {
		if (
			CASE_INITIALIZATION_TASK_TYPES.includes(
				window.location.hash.replace('#', ''),
			)
		) {
			setIsOpen(true)
		}
	}, [])

	const create = (address, level) => {
		if (validateNewNotification() === true) {
			createNotification(
				currentCase._id,
				debtor._id,
				address,
				null,
				null,
				NOTIFICATION_TYPE.CASE_INITIALIZATION,
				level,
			)
				.then(res => {
					handleNotificationCreation(res.data)
					setIsFormOpen(false)
				})
				.catch(e => {
					handleError(e)
					console.log(e)
				})
		}
	}

	const validateNewNotification = () => {
		if (
			debtor.notifications.filter(
				n => n.status === NOTIFICATION_STATUS.PENDING.value,
			).length === 0
		) {
			if (
				debtor.notifications.filter(
					n => n.status === NOTIFICATION_STATUS.DONE.value,
				).length === 0
			) {
				return true
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

	const handleNotificationCreation = notification => {
		debtor.notifications.push(notification)
		setDebtor({ ...debtor })
	}

	const setNotification = (notIndex, notification) => {
		debtor.notifications[notIndex] = notification
		setDebtor({ ...debtor })
		getTasks()
	}

	const hasCreationTask = debtorTasks.some(
		t =>
			NOTIFICATION_CREATION_TASK_TYPES.includes(t.type) &&
			t.extra?.notificationType === NOTIFICATION_TYPE.CASE_INITIALIZATION,
	)

	if (!isOpen) {
		return (
			<div className="debtor-notifications debtor-notifications-card">
				<div className="flex al-center">
					<div className="icon icon-yellow bg-white mr-2">
						<FaScroll />
					</div>
					<p className="fw-500 fs-md">Tebligatlar</p>
				</div>
				{debtor.addresses.length === 0 && (
					<p className="mt-2">Tebligat için adres gerekiyor.</p>
				)}
				{notificationRequired && (
					<p className="mt-2 fs-sm">Haciz ihbarnamesi gönderilmesi gerekiyor</p>
				)}
				{debtor.notifications.length > 0 && (
					<p className="mt-2 fs-sm">
						{debtor.notifications.length} adet tebligat çıkartılmış
					</p>
				)}
				<Button
					onClick={() => setIsOpen(true)}
					icon={<FaLongArrowAltRight />}
					iconPosition="right"
					classes="yellow mt-1 fw-500"
				>
					Tebligat Detayları
				</Button>
			</div>
		)
	}

	return (
		<Modal visible={true} close={() => setIsOpen(false)}>
			<div className="form-modal">
				<div className="flex al-center jst-between mb-4">
					<div className="flex al-center">
						<div className="icon icon-yellow bg-white mr-2">
							<FaScroll />
						</div>
						<p className="fw-500 fs-lg">Tebligatlar</p>
					</div>
					<Button
						theme="basic"
						icon={<FaTimes />}
						onClick={() => setIsOpen(false)}
					>
						Kapat
					</Button>
				</div>
				<div className="debtor-notifications">
					<NotificationForm
						visible={isFormOpen}
						close={() => setIsFormOpen(false)}
						debtor={debtor}
						create={create}
						notificationGroup={{ debtor, items: debtor.notifications }}
					/>
					<div className="flex al-center jst-between fs-nm mb-4">
						<div>
							<p className="fw-500 fs-md">Borçlu Tebligatları</p>
							<p>(Toplam {debtor.addresses.length} adresi biliniyor)</p>
						</div>
						{debtor.notifications.filter(
							n => n.status === NOTIFICATION_STATUS.DONE.value,
						).length > 0 ? (
							<div className="flex al-center green">
								<FaCheckCircle className="mr-2 fs-xsm" />
								<p className="fs-sm fw-500">Tebligat, borçluya tebliğ olmuş.</p>
							</div>
						) : (
							<React.Fragment>
								{debtor.addresses.length === 0 ? (
									<Note>Tebligat için adres gerekiyor.</Note>
								) : debtor.notifications.filter(i => i.level === 1).length >
										0 && findFormalAddresses(debtor).length === 0 ? (
									<p className="note">
										<FaInfoCircle />
										Resmi adres gerekiyor!
									</p>
								) : (
									<TaskRadar
										always={hasCreationTask}
										right="9rem"
										top="-.25rem"
									>
										<Button
											theme="green"
											classes="fw-500"
											onClick={() => setIsFormOpen(true)}
										>
											Tebligat Hazırla
										</Button>
									</TaskRadar>
								)}
							</React.Fragment>
						)}
					</div>
					<div className="divider my-4"></div>
					<div className="mt-2">
						<React.Fragment>
							{debtor.notifications && debtor.notifications.length > 0 ? (
								<div>
									{debtor.notifications.map((notification, index) => {
										return (
											<Notification
												key={notification._id}
												notification={notification}
												debtor={debtor}
												setNotification={not => setNotification(index, not)}
												currentCase={currentCase}
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
			</div>
		</Modal>
	)
}
