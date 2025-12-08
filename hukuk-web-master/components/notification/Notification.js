import React, { useEffect, useState } from 'react'
import { FaChevronDown, FaChevronUp, FaScroll } from 'react-icons/fa'
import {
	NOTIFICATION_CREATION_TASK_TYPES,
	NOTIFICATION_KIND,
	NOTIFICATION_RECIPIENT,
	NOTIFICATION_STATUS,
	NOTIFICATION_STATUS_WITH_OBJECTION,
	NOTIFICATION_TYPE,
	TASK_TYPE,
	THIRD_PERSON_REASONS,
} from '../../constants'
import {
	checkDebtorEffectiveDate,
	findFormalAddresses,
	getNotificationLevelText,
	getNotificationStatusText,
	handleError,
	toDateInputValue,
} from '../../helpers/Helper'
import { useDebtorContext } from '../../services/hooks/useDebtorContext'
import useInpoundmentContext from '../../services/hooks/useInpoundmentContext'
import { updateNotification } from '../../services/notificationService'
import Button from '../anBrains/Button'
import Input from '../anBrains/Input'
import Note from '../Note'
import TaskRadar from '../task/TaskRadar'
import TaskRow from '../task/TaskRow'

export default function Notification({
	notification,
	debtor,
	setNotification,
	setDebtor,
	radarField,
	withoutUpdate,
	customStatusText,
}) {
	const debtorTasks = useDebtorContext()
		? useDebtorContext().debtorTasks
		: useInpoundmentContext().debtorTasks
	const { currentCase, assetProps, visibleInpoundment, queryTaskId } =
		useInpoundmentContext()

	const [isOpen, setIsOpen] = useState(false)

	const [kind, setKind] = useState(notification.kind)
	const [barcodeNumber, setBarcodeNumber] = useState(notification.barcodeNumber)
	const [status, setStatus] = useState(notification.status)
	const [doneDate, setDoneDate] = useState(notification.doneDate)
	const [recipient, setRecipient] = useState(notification.recipient)
	const [objectionDate, setObjectionDate] = useState(notification.objectionDate)

	useEffect(() => {
		let currentTask = debtorTasks.find(t => t._id === queryTaskId)

		if (currentTask && currentTask.assetId === notification._id) {
			setIsOpen(true)
		}
	}, [debtorTasks])

	const update = (property, propertyValue) => {
		if (property !== 'kind' && (!barcodeNumber || barcodeNumber === '')) {
			alert('Barkod numarası girilmeden Tebligat güncellenemez')
		} else {
			if (withoutUpdate) {
				notification[property] = propertyValue
				setNotification({ ...notification })
			} else {
				updateNotification(notification, property, propertyValue)
					.then(res => {
						if (setDebtor) {
							debtor.notifications[findNotificationIndex()] = res.data
							setDebtor({ ...debtor })
						} else {
							setNotification(res.data)
						}
						alert('Başarılı')
					})
					.catch(e => {
						handleError(e)
						console.log(e)
					})
			}
		}
	}

	const onDoneDateChange = value => {
		if (new Date(value) > new Date()) {
			alert('Tebliğ tarihi bugünden sonra olamaz.')
		} else {
			setDoneDate(value)
		}
	}

	const onObjectionDateChange = value => {
		if (new Date(value) > new Date()) {
			alert('İtiraz tarihi bugünden sonra olamaz.')
		} else {
			setObjectionDate(new Date(value))
		}
	}

	const hasTask = debtorTasks.some(t =>
		radarField !== undefined
			? radarField
			: !NOTIFICATION_CREATION_TASK_TYPES.includes(t.type) &&
			  new Date(t.startDate) < new Date() &&
			  t.assetId === notification._id &&
			  t.type !== TASK_TYPE.NOTIFICATION_DONE &&
			  t.extra?.notificationType === notification.type &&
			  t.extra?.notificationLevel === notification.level &&
			  t.type !== TASK_TYPE.NOTIFICATION_OBJECTION_REMAINING_TIME,
	)

	const checkTasksIncludes = (field, type) => {
		return (
			radarField === field ||
			debtorTasks.some(
				t =>
					new Date(t.startDate) < new Date() &&
					t.assetId === notification._id &&
					t.type === type,
			)
		)
	}

	return (
		<TaskRadar
			containerClasses="mb-4 bg-white p-4 br"
			always={hasTask && !isOpen}
		>
			<Button
				classes="w-100 flex al-center jst-between"
				onClick={() => setIsOpen(!isOpen)}
			>
				<div className="flex al-center ta-left w-50 mr-4">
					<div className="bg-yellow p-2 flex al-center jst-center br mr-4">
						<FaScroll className="fs-xsm white fs-nm" />

						{getNotificationLevelText(notification, debtor) && (
							<p className="white fw-600 fs-sm ml-2">
								{getNotificationLevelText(notification, debtor)}
							</p>
						)}
					</div>
					<div className="mr-4">
						<p className="fw-500 fs-sm">
							{visibleInpoundment === 'BANK'
								? assetProps.visibleAsset.bankName
								: `${notification.address.title} başlıklı adres ${
										notification.level || ''
								  }`}
						</p>
						{visibleInpoundment !== 'BANK' &&
							!debtor?.thirdPersonReasons?.includes(
								THIRD_PERSON_REASONS.BANK.value,
							) && (
								<p className="fs-sm">
									{notification.address.description} {notification.address.city}
									{'/'}
									{notification.address.district}
								</p>
							)}
					</div>
				</div>
				<div className="btn btn-orange">
					{
						<p className="fw-500">
							{customStatusText || getNotificationStatusText(notification)}
						</p>
					}
				</div>
				<div
					className={`btn btn-cute br-50 p-2 ml-4 ${
						hasTask && !isOpen ? 'mr-8' : ''
					}`}
				>
					{isOpen ? <FaChevronUp /> : <FaChevronDown />}
				</div>
			</Button>
			{isOpen && (
				<>
					<div className="step-item-divider"></div>
					<div className="flex al-center mt-4">
						<div className=" w-25 mr-4">
							<p className="mb-2 fw-500">Tebligat Türü: </p>
							<select
								value={notification.kind}
								onChange={e => setKind(e.target.value)}
								className="input  w-100"
							>
								{Object.values(NOTIFICATION_KIND).map(v => {
									return <option value={v.value}>{v.text}</option>
								})}
							</select>
							{notification.kind !== kind && (
								<Button
									classes="mt-2"
									theme="blue"
									onClick={() => update('kind', kind)}
								>
									Kaydet
								</Button>
							)}
						</div>
						<TaskRadar
							top="40%"
							containerClasses=" w-50 mr-4"
							always={checkTasksIncludes(
								'barcodeNumber',
								TASK_TYPE.NOTIFICATION_BARCODE_NUMBER_REQUIRED,
							)}
						>
							<p className="mb-2 fw-500">Barkod Numarası: </p>
							<Input
								classes=""
								placeholder="Barkod numarası"
								value={barcodeNumber}
								onChange={e => setBarcodeNumber(e.target.value)}
							/>

							{notification.barcodeNumber !== barcodeNumber &&
								barcodeNumber !== '' && (
									<Button
										classes="mt-2"
										theme="blue"
										onClick={() => update('barcodeNumber', barcodeNumber)}
									>
										Kaydet
									</Button>
								)}
						</TaskRadar>
						<TaskRadar
							top="40%"
							containerClasses=" w-25 mr-4"
							always={checkTasksIncludes(
								'status',
								TASK_TYPE.NOTIFICATION_BARCODE_NUMBER_REQUEST,
							)}
						>
							<p className="fw-500 mb-2">Tebligat Durumu: </p>
							<select
								value={status}
								className="input  w-100"
								onChange={e => setStatus(e.target.value)}
							>
								{Object.keys(NOTIFICATION_STATUS_WITH_OBJECTION).map(
									(key, index) => {
										return (
											<option
												key={key + index}
												value={NOTIFICATION_STATUS_WITH_OBJECTION[key].value}
											>
												{NOTIFICATION_STATUS_WITH_OBJECTION[key].text}
											</option>
										)
									},
								)}
							</select>
							{notification.status !== status && (
								<Button
									classes="mt-2"
									theme="blue"
									onClick={() => update('status', status)}
								>
									Kaydet
								</Button>
							)}
						</TaskRadar>
					</div>
					<div className=" mt-4">
						{notification.type === NOTIFICATION_TYPE.CASE_INITIALIZATION &&
							notification.status === NOTIFICATION_STATUS.REJECTED.value &&
							findFormalAddresses(debtor).length === 0 &&
							debtor.notifications.findIndex(
								n => n._id === notification._id,
							) ===
								debtor.notifications.length - 1 && (
								<Note type="zekiye" classes="mt-4">
									Resmi adres bulunması gerekiyor
								</Note>
							)}

						{notification.status === NOTIFICATION_STATUS.DONE.value && (
							<>
								<div className="flex al-center">
									<TaskRadar
										top="1.75rem"
										right="2rem"
										containerClasses="w-50 mr-4"
										always={checkTasksIncludes(
											'doneDate',
											TASK_TYPE.NOTIFICATION_DONE_DATE,
										)}
									>
										<p className="mb-2 fw-500">Tebliğ Tarihi: </p>
										<Input
											containerClasses="w-100"
											classes="w-100 mt-2"
											type="date"
											value={
												doneDate ? toDateInputValue(new Date(doneDate), 0) : ''
											}
											onChange={e => onDoneDateChange(e.target.value)}
										/>
										{toDateInputValue(new Date(notification.doneDate)) !==
											toDateInputValue(new Date(doneDate)) && (
											<Button
												classes="mt-2"
												theme="blue"
												onClick={() => update('doneDate', doneDate)}
											>
												Kaydet
											</Button>
										)}
									</TaskRadar>
									<TaskRadar
										top="1.75rem"
										right="2rem"
										containerClasses="w-50"
										always={checkTasksIncludes(
											'recipient',
											TASK_TYPE.NOTIFICATION_RECIPIENT,
										)}
									>
										<p className="mb-2 fw-500">Tebellüğ: </p>
										<select
											className="input w-100 py-2"
											value={recipient}
											onChange={e => setRecipient(e.target.value)}
										>
											<option value="" disabled selected>
												Seçiniz
											</option>
											{Object.keys(NOTIFICATION_RECIPIENT).map(key => {
												return (
													<option value={NOTIFICATION_RECIPIENT[key].value}>
														{NOTIFICATION_RECIPIENT[key].text}
													</option>
												)
											})}
										</select>
										{recipient && recipient !== notification.recipient && (
											<Button
												classes="mt-2"
												theme="blue"
												onClick={() => update('recipient', recipient)}
											>
												Kaydet
											</Button>
										)}
									</TaskRadar>
								</div>
								{!visibleInpoundment &&
									!checkDebtorEffectiveDate(currentCase, notification) && (
										<Note type="zekiye" classes="my-4">
											Tebliğ tarihi ve Tebellüğ girildikten sonra kesinleşme
											tarihi için "Hacize Başlama" görevi oluşturulur.
											Planlanmış görevleri takip edin.
										</Note>
									)}
								{!visibleInpoundment &&
									checkDebtorEffectiveDate(currentCase, notification) && (
										<Note type="zekiye" classes="my-4">
											Takip borçlu için kesinleşmiş, haciz işlemleri için borçlu
											sayfasına göz atın.
										</Note>
									)}
							</>
						)}
						{notification.status ===
							NOTIFICATION_STATUS_WITH_OBJECTION.OBJECTION.value && (
							<TaskRadar
								className="mt-4"
								top="-.75rem"
								always={checkTasksIncludes(
									'objectionDate',
									TASK_TYPE.NOTIFICATION_OBJECTION_DATE,
								)}
							>
								<p className="mb-2 fw-500">İtiraz Tarihi: </p>
								<Input
									type="date"
									classes="bg-white"
									value={
										objectionDate
											? toDateInputValue(new Date(objectionDate), 0)
											: ''
									}
									onChange={e => onObjectionDateChange(e.target.value)}
								/>
								{notification.objectionDate !== objectionDate && (
									<Button
										classes="mt-2"
										theme="blue"
										onClick={() => update('objectionDate', objectionDate)}
									>
										Kaydet
									</Button>
								)}
							</TaskRadar>
						)}
						{/* <Printer
							type="requestPaper"
							request={printer['21'].value}
							caseId={notification.caseId}
							object={notification}
							paperDebtors={[debtor]}
						/> */}
					</div>
				</>
			)}
		</TaskRadar>
	)
}
