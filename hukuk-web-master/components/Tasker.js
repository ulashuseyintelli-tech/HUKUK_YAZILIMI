import { TASK_STATUS, QUERY_LIST, STATUS } from '../constants'
import Button from './anBrains/Button'
import { useEffect, useState } from 'react'
import {
	FaCheckCircle,
	FaBellSlash,
	FaBell,
	FaInfoCircle,
} from 'react-icons/fa'
import { getAssetName, handleError, getDebtorName } from '../helpers/Helper'
import { cancelTask, extendTask, getTasks } from '../services/taskService'
import TaskExtender from './task/TaskExtender'
import TaskCanceler from './task/TaskCanceler'
import LoadingCircle from './anBrains/animations/LoadingCircle'
import { useSocketContext } from '../services/socket'
import { getTaskTextByType } from '../helpers/taskHelper'

export default function Tasker({ handleOpen, isOpen }) {
	const [status, setStatus] = useState(STATUS.LOADING)
	const [tasksStatus, setTasksStatus] = useState(TASK_STATUS.PENDING)
	const [tasks, setTasks] = useState([])
	const [extendingTaskId, setExtendingTaskId] = useState(null)
	const [cancelingTaskId, setCancelingTaskId] = useState(null)

	const socket = useSocketContext()

	useEffect(() => {
		load()
	}, [])

	useEffect(() => {
		if (socket) {
			socket.on('newTask', () => {
				getUserTasks()
			})
			return () => {
				socket.off('newTask')
			}
		}
	}, [socket])

	const load = () => {
		getUserTasks()
	}

	useEffect(() => {
		getUserTasks()
	}, [tasksStatus])

	const getUserTasks = async () => {
		setStatus(STATUS.LOADING)
		await getTasks(tasksStatus)
			.then(res => {
				setTasks(res.data)
			})
			.catch(e => console.log(e))
		setStatus(STATUS.NORMAL)
	}

	const cancel = async causeOfCancel => {
		setStatus(STATUS.LOADING)
		if (causeOfCancel.trim() !== '') {
			await cancelTask(cancelingTaskId, causeOfCancel)
				.then(res => {
					setCancelingTaskId(null)
				})
				.catch(e => handleError(e))
		} else {
			alert('İptal sebebi boş bırakılamaz!')
		}
		setStatus(STATUS.NORMAL)
	}

	const extend = async (extensionDays, causeOfExtension) => {
		setStatus(STATUS.LOADING)
		if (causeOfExtension.trim() !== '') {
			await extendTask(extendingTaskId, extensionDays, causeOfExtension)
				.then(() => {
					setExtendingTaskId(null)
				})
				.catch(e => handleError(e))
		} else {
			alert('Uzatma sebebi boş bırakılamaz!')
		}
		setStatus(STATUS.NORMAL)
	}

	return (
		<div className="tasker" id="tasker">
			<Button classes="zekiye-btn " onClick={handleOpen}>
				<div>
					<div className="fit-bg" />
				</div>
			</Button>
			{isOpen && (
				<div className="case-form__modal">
					<Button classes="zekiye-btn " onClick={handleOpen}>
						<div>
							<div className="fit-bg" />
						</div>
					</Button>
					<div className="tasker-list">
						<div className="flex al-center py-2">
							<Button
								classes={`mr-4 ${
									tasksStatus === TASK_STATUS.PENDING ? 'blue fw-500' : ''
								}`}
								onClick={() => setTasksStatus(TASK_STATUS.PENDING)}
							>
								Devam Eden
							</Button>
							<Button
								classes={`mr-4 ${
									tasksStatus === TASK_STATUS.DONE ? 'blue fw-500' : ''
								}`}
								onClick={() => setTasksStatus(TASK_STATUS.DONE)}
							>
								Tamamlanmış
							</Button>
							<Button
								classes={`mr-4 ${
									tasksStatus === TASK_STATUS.CANCELLED ? 'blue fw-500' : ''
								}`}
								onClick={() => setTasksStatus(TASK_STATUS.CANCELLED)}
							>
								İptal Edilen
							</Button>
							<Button
								classes={`mr-4 ${
									tasksStatus === TASK_STATUS.CANCELLED_BY_SYSTEM
										? 'blue fw-500'
										: ''
								}`}
								onClick={() => setTasksStatus(TASK_STATUS.CANCELLED_BY_SYSTEM)}
							>
								Otomatik İptal
							</Button>
							<Button
								classes={`${
									tasksStatus === TASK_STATUS.FUTURE ? 'blue fw-500' : ''
								}`}
								onClick={() => setTasksStatus(TASK_STATUS.FUTURE)}
							>
								Planlanmış
							</Button>
						</div>
						{!status === STATUS.LOADING && tasks.length === 0 && (
							<div className="note mt-4 mb-8">
								<FaInfoCircle />
								Bu statüde henüz görev oluşturulmamış.
							</div>
						)}
						{status === STATUS.LOADING && <LoadingCircle classes="my-4" />}
						{tasks.map(task => {
							const debtor = task.debtor[0]
							return (
								<div
									key={task._id}
									className={`task-card ${
										task.status !== TASK_STATUS.PENDING
											? 'task-card__closed'
											: ''
									}`}
								>
									<React.Fragment>
										{/* {task.type} */}
										<p>
											<span className="fw-500">{getDebtorName(debtor)}</span>{' '}
											adlı borçlunun
										</p>
										<div>
											<p className="mb-4">
												<span className="fw-500">
													{task.extra &&
														task.extra.queryType &&
														QUERY_LIST[task.extra.queryType].text}
													{task.assetType && getAssetName(task.assetType)}
												</span>{' '}
												{getTaskTextByType(task)}
											</p>
										</div>
										{task.status === TASK_STATUS.CANCELLED_BY_SYSTEM && (
											<div className="flex al-center mt-4">
												<FaBellSlash className="mr-2 red" />
												<div>
													<p className="fw-500 red">
														Görev sistem tarafından otomatik olarak iptal
														edildi.
													</p>
													<p className="fs-sm ">
														İptal edilme tarihi:{' '}
														{new Date(task.updatedAt).toLocaleDateString(
															'tr-TR',
														)}
														{new Date(task.updatedAt).toLocaleTimeString()}
													</p>
												</div>
											</div>
										)}

										{task.status === TASK_STATUS.FUTURE && (
											<div className="flex al-center mt-4">
												<FaBell className="mr-2 blue" />
												<div>
													<p className="fw-500 blue">
														Görev ileri bir tarih için ayarlandı.
													</p>
													<p className="fs-sm ">
														Görev tarihi:{' '}
														{new Date(task.startDate).toLocaleDateString(
															'tr-TR',
														)}
													</p>
												</div>
											</div>
										)}
										{task.status === TASK_STATUS.DONE && (
											<div className="fs-sm">
												<div className="flex al-center green mb-1">
													<FaCheckCircle className="mr-2" />
													<p>
														Görev{' '}
														<span className="fw-500">
															{task.completedUserId && (
																<React.Fragment>
																	{
																		task.users.filter(
																			u => u._id === task.completedUserId,
																		)[0].name
																	}{' '}
																	{
																		task.users.filter(
																			u => u._id === task.completedUserId,
																		)[0].surname
																	}{' '}
																</React.Fragment>
															)}
														</span>
														tarafından tamamlandı
													</p>
												</div>
												<p>
													<span className="fw-500">Tamamlanma tarihi:</span>{' '}
													{new Date(task.updatedAt).toLocaleDateString('tr-TR')}{' '}
													{new Date(task.updatedAt).toLocaleTimeString()}
												</p>
											</div>
										)}
										{task.status === TASK_STATUS.CANCELLED && (
											<div className="fs-sm">
												<p className="red">
													Görev{' '}
													<span className="fw-500">
														{
															task.users.filter(
																u => u._id === task.canceledUserId,
															)[0].name
														}{' '}
														{
															task.users.filter(
																u => u._id === task.canceledUserId,
															)[0].surname
														}{' '}
													</span>
													tarafından iptal edildi
												</p>
												<p>
													<span className="fw-500">İptal Sebebi:</span>{' '}
													{task.causeOfCancel}
												</p>
												<p>
													<span className="fw-500">İptal edilme tarihi:</span>{' '}
													{new Date(task.updatedAt).toLocaleDateString('tr-TR')}{' '}
													{new Date(task.updatedAt).toLocaleTimeString()}
												</p>
											</div>
										)}
										{task.status === TASK_STATUS.PENDING && (
											<React.Fragment>
												<div className="flex al-center jst-between mt-4">
													<div>
														{/* <p className="fs-sm">
														Görev toplam {task.userIds.length} kişiye atandı
													</p> */}
														<p className="fs-sm">
															<span className="fw-500">Bitiş Süresi: </span>
															{new Date(task.dueDate).toLocaleDateString(
																'tr-TR',
															)}
														</p>
													</div>
													{/* <div>
													<Button
														classes="fw-500 red"
														onClick={() => setCancelingTaskId(task._id)}
													>
														Görevi İptal Et
													</Button>
													<Button
														classes="fw-500 blue mt-2"
														onClick={() => setExtendingTaskId(task._id)}
													>
														Görevin Süresini Uzat
													</Button>
												</div> */}
												</div>

												{cancelingTaskId === task._id && (
													<TaskCanceler
														close={() => setCancelingTaskId(null)}
														cancel={cancel}
													/>
												)}
												{extendingTaskId === task._id && (
													<TaskExtender
														extend={extend}
														close={() => setExtendingTaskId(null)}
													/>
												)}
											</React.Fragment>
										)}
									</React.Fragment>
								</div>
							)
						})}
					</div>
				</div>
			)}
		</div>
	)
}
