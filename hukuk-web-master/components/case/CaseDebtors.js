import { useState, useEffect } from 'react'
import {
	STATUS,
	DEBTOR_TYPES,
	NOTIFICATION_STATUS_WITH_OBJECTION,
	NOTIFICATION_TYPE,
} from '../../constants'
import { getDebtors } from '../../services/deptorService'
import { getDebtorName, handleError } from '../../helpers/Helper'
import {
	addDebtorToCase,
	removeDebtorFromCase,
} from '../../services/caseService'
import CaseUtilsList from './CaseUtilsList'
import Debtor from '../debtor/Debtor'
import { getTasksByFilters } from '../../services/taskService'
import Bell from '../Bell'
import LoadingCircle from '../anBrains/animations/LoadingCircle'
import { getNotifications } from '../../services/notificationService'
import useInpoundmentContext from '../../services/hooks/useInpoundmentContext'
import NewDebtorForm from '../forms/NewDebtorForm'
import { FaBuilding, FaUser } from 'react-icons/fa'

export default function CaseDebtors({ debtors, setDebtors }) {
	const { currentCase, setCurrentCase, selectedDebtorId, selectedDebtor } =
		useInpoundmentContext()

	const [status, setStatus] = useState(STATUS.NORMAL)
	const [allDebtors, setAllDebtors] = useState([])

	useEffect(() => {
		getAll()
	}, [])

	useEffect(() => {
		setCurrentCase({ ...currentCase, debtorIds: debtors.map(d => d._id) })
	}, [debtors])

	const filterNotificationsByCase = debtor => {
		debtor.notifications = debtor.notifications.filter(
			n =>
				n.caseId === currentCase._id &&
				n.type === NOTIFICATION_TYPE.CASE_INITIALIZATION,
		)
		return debtor
	}

	const getAll = async () => {
		setStatus(STATUS.LOADING)
		await getDebtors()
			.then(res => {
				setAllDebtors(res.data.map(filterNotificationsByCase))
				setDebtors(
					res.data
						.filter(debtor => currentCase.debtorIds.includes(debtor._id))
						.map(filterNotificationsByCase),
				)
			})
			.catch(e => {
				alert('Hata')
				console.log(e)
			})
		setStatus(STATUS.NORMAL)
	}

	const handleClickItem = async (item, isCreated) => {
		setStatus(STATUS.LOADING)
		if (isCreated) {
			setAllDebtors([{ ...item }, ...allDebtors])
		}
		const index = debtors.findIndex(debtor => debtor._id === item._id)
		let result = true
		if (index !== -1) {
			result = confirm(
				'Bir takipten borçlu çıkardığınızda, borçlunun takibe ait tüm görevleri sistem tarafından otomatik iptal edilir. Hala devam etmek istiyor musunuz?',
			)
		}
		if (result) {
			let queryFunc = index === -1 ? addDebtorToCase : removeDebtorFromCase
			if (
				index === -1 &&
				currentCase.type === '3' &&
				currentCase.debtorIds.length === 1
			) {
				alert('Bu dosyaya yalnızca 1 borçlu eklenebilir.')
			} else {
				await queryFunc(currentCase.number, item._id)
					.then(res => {
						if (index !== -1) {
							debtors.splice(index, 1)
							setDebtors([...debtors])
						} else {
							setDebtors([...debtors, item])
						}
					})
					.catch(e => handleError(e))
			}
		}
		setStatus(STATUS.NORMAL)
	}

	const ModalListBody = ({ item }) => {
		const [tasksLoading, setTasksLoading] = useState(true)
		const [tasks, setTasks] = useState([])
		const [notificationsLoading, setNotificationsLoading] = useState(true)
		const [notifications, setNotifications] = useState([])
		const isCaseDebtor = currentCase && currentCase.debtorIds.includes(item._id)

		useEffect(() => {
			if (isCaseDebtor) {
				getTasks()
				findNotifications()
			}
		}, [])

		const getTasks = async () => {
			setTasksLoading(true)
			await getTasksByFilters(undefined, undefined, item._id, currentCase._id)
				.then(res => {
					setTasks(res.data)
				})
				.catch(e => handleError(e))
			setTasksLoading(false)
		}

		const findNotifications = async () => {
			await getNotifications(
				NOTIFICATION_TYPE.CASE_INITIALIZATION,
				currentCase._id,
				item._id,
			)
				.then(res => {
					setNotifications(res.data)
				})
				.catch(e => console.log(e))
			setNotificationsLoading(false)
		}

		return (
			<div className="flex al-center">
				<div className="flex al-center">
					{item.type === DEBTOR_TYPES.INSTITUTION ? (
						<FaBuilding className="gray fs-sm mr-2" />
					) : (
						<FaUser className="gray fs-sm mr-2" />
					)}
					<p className="black fw-500">{getDebtorName(item)}</p>
				</div>
				{isCaseDebtor && (
					<>
						{notificationsLoading ? (
							<LoadingCircle classes="ml-4" />
						) : (
							notifications.some(
								n =>
									n.status ===
									NOTIFICATION_STATUS_WITH_OBJECTION.OBJECTION.value,
							) && (
								<p className="bg-red fs-xsm px-2 white br ml-4">İtiraz var</p>
							)
						)}
						{/* {item.thirdPersonReasons &&
							item.thirdPersonReasons.includes('guarantee') && (
								<p className="badge fs-xsm px-2 py-0 ml-4">Kefil</p>
							)} */}
						{tasksLoading ? (
							<LoadingCircle classes="ml-4" />
						) : (
							<Bell tasks={tasks} className="ml-4" />
						)}
					</>
				)}
			</div>
		)
	}

	if (selectedDebtorId && !selectedDebtor) {
		return <LoadingCircle />
	}

	if (selectedDebtorId) {
		return (
			<Debtor
				addDebtor={d => handleClickItem(d, true)}
				allDebtors={allDebtors}
				setAllDebtors={setAllDebtors}
			/>
		)
	}

	return (
		<CaseUtilsList
			utilType="debtor"
			title="Borçlular"
			status={status}
			utils={allDebtors}
			setUtils={setAllDebtors}
			selectedUtils={debtors}
			handleClickItem={handleClickItem}
			selectable
			modalListBody={<ModalListBody />}
			listBody={<ModalListBody />}
			utilItem={
				<NewDebtorForm
					addDebtor={d => handleClickItem(d, true)}
					allDebtors={allDebtors}
					setAllDebtors={setAllDebtors}
				/>
			}
		/>
	)
}
