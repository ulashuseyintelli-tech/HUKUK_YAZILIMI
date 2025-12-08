import { useEffect, useState } from 'react'
import Link from 'next/link'
import { FaCheckCircle, FaClock, FaUser } from 'react-icons/fa'
import {
	CASE_TYPE,
	QUERY_LIST,
	STATUS,
	TASK_SORT_OPTIONS,
	TASK_STATUS,
} from '../../constants'
import { getAssetName, getDebtorName, handleError } from '../../helpers/Helper'
import { useSocketContext } from '../../services/socket'
import { getTasksByFilters } from '../../services/taskService'
import LoadingCircle from '../anBrains/animations/LoadingCircle'
import Countdown from 'react-countdown'
import { thisEvening } from '../../services/dateService'
import {
	getTaskStatusClassName,
	getTaskStatusText,
	getTaskTargetUrl,
	getTaskTextByType,
} from '../../helpers/taskHelper'

export default function TaskColumn({
	sortBy = TASK_SORT_OPTIONS.DUE_DATE.value,
	taskStatus,
	debtorIdFilter,
	caseId,
	exactTasks,
}) {
	const [status, setStatus] = useState(STATUS.LOADING)
	const [tasks, setTasks] = useState([])

	const socket = useSocketContext()

	useEffect(() => {
		if (socket && caseId && !exactTasks) {
			subscribeTasks()
		}
	}, [socket])

	const subscribeTasks = () => {
		let roomName = ''
		if (debtorIdFilter) roomName += `${debtorIdFilter} `
		if (caseId) roomName += `${caseId} `
		roomName += `task`
		socket.on(roomName, () => {
			load()
			return () => {
				socket.off(roomName)
			}
		})
	}

	useEffect(() => {
		load()
	}, [])

	const load = async () => {
		setStatus(STATUS.LOADING)
		await getTasksByFilters(sortBy, taskStatus, debtorIdFilter, caseId)
			.then(res => {
				setTasks(res.data)
			})
			.catch(e => handleError(e))
		setStatus(STATUS.NORMAL)
	}

	useEffect(() => {
		load()
	}, [sortBy, debtorIdFilter])

	if (status === STATUS.LOADING && !exactTasks) {
		return <LoadingCircle />
	}

	return (
		<div className="tasker__column">
			<div
				className={`general-tasker__task ta-center general-tasker__${getTaskStatusClassName(
					taskStatus,
				)}`}
			>
				<h3 className="fw-600">{getTaskStatusText(taskStatus)} Görevler</h3>
			</div>
			<div className="tasker__column__task-list">
				{(exactTasks || tasks).map(task => {
					const isDone = task.status === TASK_STATUS.DONE
					const isPending =
						(task.status === TASK_STATUS.PENDING ||
							task.status === TASK_STATUS.FUTURE) &&
						thisEvening < new Date(task.dueDate)
					const isOverdue =
						isPending &&
						(task.status === TASK_STATUS.PENDING ||
							task.status === TASK_STATUS.FUTURE) &&
						thisEvening > new Date(task.dueDate)
					const isFuture =
						task.status === TASK_STATUS.FUTURE ||
						(task.status === TASK_STATUS.PENDING &&
							new Date(task.startDate) >
								new Date(new Date().setUTCHours(23, 59, 59, 59)))
					if (!caseId) {
						return (
							<Link href={`/takip/${task.case[0].number}`}>
								<a>
									<div className="general-tasker__task">
										<div className="flex al-center jst-between ">
											<p className="fw-500">
												{task.case[0].executionFileNumber}
											</p>
											<p className="badge fs-xsm">
												{CASE_TYPE[task.case[0].type]}
											</p>
										</div>
										<p>{task.count} görev</p>
									</div>
								</a>
							</Link>
						)
					}
					return (
						<Link href={getTaskTargetUrl(task)}>
							<div
								className={`general-tasker__task general-tasker__${getTaskStatusClassName(
									taskStatus,
								)}`}
							>
								<a>
									<div className="flex al-center jst-between mb-2">
										{task.debtor[0] && (
											<p className="blue fw-500 mr-2 fs-sm">
												<FaUser className="fs-xsm mr-1" />
												{getDebtorName(task.debtor[0])}
											</p>
										)}
										{task.assetType && (
											<p className="fw-500 fs-xsm mr-2 badge-cyan">
												{getAssetName(task.assetType)}
											</p>
										)}
									</div>
									<p>
										{task.extra &&
											task.extra.queryType &&
											QUERY_LIST[task.extra.queryType].text}{' '}
										{getTaskTextByType(task)}
									</p>
									<div className="flex al-center mt-2">
										<p className="fs-xsm mr-4">
											<span className="fw-500">Başlangıç: </span>
											<span>
												{new Date(task.startDate).toLocaleDateString('tr-TR')}{' '}
											</span>
										</p>
										<p className="fs-xsm">
											<span className="fw-500">Bitiş: </span>
											<span>
												{new Date(task.dueDate).toLocaleDateString('tr-TR')}{' '}
											</span>
										</p>
									</div>
									{isPending && !isOverdue && !isFuture && (
										<div className="flex al-center jst-end orange bold fs-sm">
											<FaClock className="mr-2" />
											<Countdown date={new Date(task.dueDate)} />
										</div>
									)}
									{isDone && (
										<div className="fs-xsm green flex al-center mt-2 fw-500">
											<FaCheckCircle className="mr-2" />
											<span>
												{new Date(task.updatedAt).toLocaleDateString('tr-TR')}{' '}
											</span>
										</div>
									)}
									{isFuture && (
										<div className="btn-orange py-1 fs-xsm mt-2 fw-600">
											PLANLANMIŞ
										</div>
									)}
								</a>
							</div>
						</Link>
					)
				})}
			</div>
		</div>
	)
}
