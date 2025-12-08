import React, { useContext, useEffect, useState } from 'react'
import {
	NOTIFICATION_CREATION_TASK_TYPES,
	NOTIFICATION_STATUS,
	NOTIFICATION_TYPE,
} from '../../constants'
import {
	check103ObjectionDateByNotificationList,
	handleError,
} from '../../helpers/Helper'
import useInpoundmentContext from '../../services/hooks/useInpoundmentContext'
import {
	createNotification,
	getNotifications,
} from '../../services/notificationService'
import { useSocketContext } from '../../services/socket'
import LoadingCircle from '../anBrains/animations/LoadingCircle'
import Button from '../anBrains/Button'
import TaskRadar from '../task/TaskRadar'
import Notification from './Notification'
import NotificationForm from './NotificationForm'

export default function AssetNotifications({
	notificationType,
	title,
	emptyText,
	setObjectionDateCheck,
	onNotificationsChange = () => {},
	customAddresses,
	customAsset,
	customAssetType,
}) {
	const { assetProps, currentCase, selectedDebtor, debtorTasks } =
		useInpoundmentContext()

	const visibleAsset = customAsset || assetProps.visibleAsset
	const assetType = customAssetType || assetProps.assetType

	const [notificationsLoading, setNotificationsLoading] = useState(true)
	const [notifications, setNotifications] = useState([])
	const [isNewOneCreating, setIsNewOneCreating] = useState(false)

	useEffect(() => {
		load()
	}, [visibleAsset])

	useEffect(() => {
		onNotificationsChange(notifications)
	}, [notifications])

	const load = async () => {
		await _getNotifications()
	}

	const _getNotifications = async () => {
		setNotificationsLoading(true)
		await getNotifications(
			notificationType,
			currentCase._id,
			selectedDebtor._id,
			assetType,
			visibleAsset._id,
		)
			.then(res => {
				setNotifications(res.data)
			})
			.catch(handleError)
		setNotificationsLoading(false)
	}

	useEffect(() => {
		if (notificationType === NOTIFICATION_TYPE[103]) {
			setObjectionDateCheck(
				check103ObjectionDateByNotificationList(notifications),
			)
		}
	}, [notifications])

	const setNotification = (notIndex, notification) => {
		notifications[notIndex] = notification
		setNotifications([...notifications])
	}

	useEffect(() => {
		watchNewNotification()
		return () => {
			unwatchNewNotification()
		}
	}, [])

	const socket = useSocketContext()

	const watchNewNotification = () => {
		socket.on(
			`${selectedDebtor._id} ${currentCase._id} assets notification`,
			() => {
				_getNotifications()
			},
		)
	}

	const unwatchNewNotification = () => {
		socket.off(`${selectedDebtor._id} ${currentCase._id} assets notification`)
	}

	const hasCreationTask = debtorTasks.some(
		t =>
			NOTIFICATION_CREATION_TASK_TYPES.includes(t.type) &&
			(t.extra?.notificationType === notificationType ||
				t.extra?.notificationType === NOTIFICATION_TYPE.INPOUNDMENT_MEMORIAL) &&
			t.extra?.notificationAssetType === assetType &&
			t.extra?.notificationAssetId === visibleAsset._id,
	)

	const hasMemorialCreationTask = debtorTasks.some(
		t =>
			NOTIFICATION_CREATION_TASK_TYPES.includes(t.type) &&
			t.extra?.notificationType === NOTIFICATION_TYPE.INPOUNDMENT_MEMORIAL &&
			t.extra?.notificationAssetType === assetType &&
			t.extra?.notificationAssetId === visibleAsset._id,
	)

	const createNewOne = async address => {
		await createNotification(
			currentCase._id,
			selectedDebtor._id,
			address || giveAddress(),
			assetType,
			visibleAsset._id,
			hasMemorialCreationTask
				? NOTIFICATION_TYPE.INPOUNDMENT_MEMORIAL
				: notificationType,
			// notifications.length + 1,
		)
			.then(res => {
				setNotifications([...notifications, res.data])
			})
			.catch(handleError)
	}

	const giveAddress = () => {
		return notificationType === NOTIFICATION_TYPE.THIRD_PERSON &&
			notifications.length > 0
			? notifications[notifications.length - 1].address
			: selectedDebtor.notifications.find(
					n =>
						n.type === NOTIFICATION_TYPE.CASE_INITIALIZATION &&
						n.status === NOTIFICATION_STATUS.DONE.value,
			  ).address
	}

	return (
		<div className="debtor-notifications">
			<div className="flex al-center jst-between mb-4">
				<p className="fw-500">{title}</p>
				{hasCreationTask && (
					<TaskRadar always={true} right="100%" top="-.5rem">
						<Button
							theme="orange"
							classes="fw-600"
							onClick={() => setIsNewOneCreating(true)}
						>
							Yeni Tebligat Oluştur
						</Button>
						<NotificationForm
							customAddresses={customAddresses}
							debtor={selectedDebtor}
							visible={isNewOneCreating}
							create={createNewOne}
							close={() => setIsNewOneCreating(false)}
							notificationType={
								hasMemorialCreationTask
									? NOTIFICATION_TYPE.INPOUNDMENT_MEMORIAL
									: notificationType
							}
							notificationGroup={{ items: notifications }}
						/>
					</TaskRadar>
				)}
			</div>
			{notificationsLoading ? (
				<LoadingCircle />
			) : (
				notifications.length === 0 && <p>{emptyText}</p>
			)}
			{notifications.map((notification, index) => {
				return (
					<Notification
						key={notification._id}
						notification={notification}
						debtor={selectedDebtor}
						setNotification={val => setNotification(index, val)}
					/>
				)
			})}
		</div>
	)
}
