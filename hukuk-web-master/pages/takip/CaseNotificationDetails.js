import {
	getDebtorName,
	findNotNullAddress,
	findFormalAddresses,
	handleError,
	checkCaseNotificationAccessibility,
} from '../../helpers/Helper'
import Button from '../../components/anBrains/Button'
import { useState, useEffect } from 'react'
import {
	NOTIFICATION_STATUS,
	NOTIFICATION_STATUS_WITH_OBJECTION,
	NOTIFICATION_TYPE,
} from '../../constants'
import { FaInfoCircle, FaLongArrowAltLeft, FaCheckCircle } from 'react-icons/fa'
import { createNotification } from '../../services/notificationService'
import { getCaseByNumberWithDetails } from '../../services/caseService'
import LoadingCircle from '../../components/anBrains/animations/LoadingCircle'
import Layout from '../../components/Layout'
import CaseNav from '../../components/case/CaseNav'
import Notification from '../../components/notification/Notification'
import NotificationForm from '../../components/notification/NotificationForm'
import CurrentTask from '../../components/task/CurrentTask'
import { InpoundmentContext } from './CaseInpoundmentDetails'

export default function CaseNotificationDetails(props) {
	const { number, queryDebtorId, queryTaskId } = props

	const [loading, setLoading] = useState(true)
	const [currentCase, setCurrentCase] = useState(null)
	const [notificationGroups, setNotificationGroups] = useState([])
	const [selectedGroup, setSelectedGroup] = useState(null)
	const [isFormOpen, setIsFormOpen] = useState(false)

	const [isAccessible, setIsAccessible] = useState(false)
	const [accessibilityWarning, setAccessibilityWarning] = useState('')

	useEffect(() => {
		getCase()
	}, [])

	const getCase = async () => {
		await getCaseByNumberWithDetails(number)
			.then(res => {
				setCurrentCase(res.data)
			})
			.catch(e => alert('Hata'))
	}

	useEffect(() => {
		if (currentCase) {
			prepare()
		}
	}, [currentCase])

	const prepare = async () => {
		checkCaseNotificationAccessibility(
			currentCase,
			setIsAccessible,
			setAccessibilityWarning,
		)
		const groups = []
		setNotificationGroups(
			currentCase.debtors.map(d => {
				groups.push({ debtor: d, items: d.notifications })
			}),
		)
		setNotificationGroups([...groups])
		if (queryDebtorId) {
			setSelectedGroup(
				notificationGroups.filter(g => g.debtor._id === queryDebtorId)[0],
			)
		}
		setLoading(false)
	}

	const create = (address, level) => {
		if (validateNewNotification() === true) {
			createNotification(
				currentCase._id,
				selectedGroup.debtor._id,
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
			selectedGroup.items.filter(
				n => n.status === NOTIFICATION_STATUS.PENDING.value,
			).length === 0
		) {
			if (
				selectedGroup.items.filter(
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
		const groupIndex = notificationGroups.findIndex(
			g => g.debtor._id === selectedGroup.debtor._id,
		)
		notificationGroups[groupIndex].items.push(notification)
		setNotificationGroups([...notificationGroups])
	}

	const setNotification = (notIndex, notification) => {
		const groupIndex = notificationGroups.findIndex(
			notGroup => notGroup.debtor._id === selectedGroup.debtor._id,
		)
		notificationGroups[groupIndex].items[notIndex] = notification
		setNotificationGroups([...notificationGroups])
	}

	if (loading) {
		return <LoadingCircle />
	}

	if (!isAccessible) {
		return (
			<Layout {...props}>
				<CaseNav currentCase={currentCase} debtors={currentCase.debtors} />
				<div className="note">
					<FaInfoCircle />
					{accessibilityWarning}
				</div>
			</Layout>
		)
	}

	return (
		<InpoundmentContext.Provider
			value={{
				currentCase,
				debtors: currentCase.debtors,
				assetProps: { visibleAsset: null },
			}}
		>
			<Layout {...props}>
				{queryTaskId && selectedGroup && (
					<CurrentTask
						queryTaskId={queryTaskId}
						debtor={selectedGroup.debtor}
					/>
				)}
				<CaseNav currentCase={currentCase} debtors={currentCase.debtors} />
				<div className="column case-notification-details">
					{selectedGroup && (
						<NotificationForm
							visible={isFormOpen}
							close={() => setIsFormOpen(false)}
							debtor={selectedGroup.debtor}
							create={create}
							notificationGroup={selectedGroup}
						/>
					)}
					<div>
						{selectedGroup ? (
							<div className="case-notification-details__debtor">
								<div className="flex al-center fs-nm mb-4">
									<Button onClick={() => setSelectedGroup(null)}>
										<FaLongArrowAltLeft className="fs-lg" />
									</Button>
									<div className="mx-8">
										<p className="bold mb-1">
											{getDebtorName(selectedGroup.debtor)}
										</p>
										<p>
											(Toplam {selectedGroup.debtor.addresses.length} adresi
											biliniyor)
										</p>
									</div>
									{selectedGroup.items.filter(
										n => n.status === NOTIFICATION_STATUS.DONE.value,
									).length > 0 ? (
										<div className="flex al-center green">
											<FaCheckCircle className="mr-2 fs-xsm" />
											<p className="fs-sm fw-500">
												Tebligat, borçluya tebliğ olmuş.
											</p>
										</div>
									) : (
										<React.Fragment>
											{selectedGroup.items.filter(i => i.level === 1).length >
												0 &&
											findFormalAddresses(selectedGroup.debtor).length === 0 ? (
												<p className="note">
													<FaInfoCircle />
													Resmi adres gerekiyor!
												</p>
											) : (
												<Button
													theme="green"
													classes="fw-500"
													onClick={() => setIsFormOpen(true)}
												>
													Tebligat Hazırla
												</Button>
											)}
										</React.Fragment>
									)}
								</div>
								<div className="divider my-4"></div>
								<div className="mt-2">
									<React.Fragment>
										<p className="bold mb-4">Hazırlanmış Tebligatlar</p>
										{selectedGroup.items && selectedGroup.items.length > 0 ? (
											<div>
												{selectedGroup.items.map((notification, index) => {
													return (
														<Notification
															key={notification._id}
															notification={notification}
															debtor={selectedGroup.debtor}
															setNotification={not =>
																setNotification(index, not)
															}
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
						) : (
							notificationGroups
								.sort((x, y) =>
									findNotNullAddress(x.debtor.addresses) ===
									findNotNullAddress(y.debtor.addresses)
										? 0
										: findNotNullAddress(x.debtor.addresses)
										? -1
										: 1,
								)
								.map((group, index) => {
									return (
										<div
											key={group.debtor._id}
											className="case-notification-details__debtor"
											style={{
												opacity: findNotNullAddress(group.debtor.addresses)
													? 1
													: 0.55,
											}}
										>
											<Button
												onClick={() => setSelectedGroup(group)}
												classes="bold fs-nm"
											>
												{getDebtorName(group.debtor)}
											</Button>
											{findNotNullAddress(group.debtor.addresses) ? (
												<div className="mt-2">
													{group.items.filter(
														n =>
															n.status ===
															NOTIFICATION_STATUS_WITH_OBJECTION.DONE.value,
													).length > 0 && (
														<div className="flex al-center green">
															<FaCheckCircle className="mr-2 fs-xsm" />
															<p className="fs-sm">
																Tebligat, borçluya tebliğ olmuş.
															</p>
														</div>
													)}
													<p className="mt-1 fs-sm">
														{group.items.length} adet hazırlanmış tebligat
														mevcut.
													</p>
												</div>
											) : (
												<div className="mt-2 flex al-center">
													<FaInfoCircle className="mr-2 fs-xsm" />
													<p className=" fs-sm">
														Borçlunun adres bilgisi olmadığı için tebligat
														hazırlanamaz.
													</p>
												</div>
											)}
										</div>
									)
								})
						)}
					</div>
				</div>
			</Layout>
		</InpoundmentContext.Provider>
	)
}

CaseNotificationDetails.getInitialProps = ({ query }) => {
	return {
		number: query.number,
		queryDebtorId: query.debtorId,
		queryTaskId: query.taskId,
	}
}
