import React, { useEffect, useRef, useState } from 'react'
import { COLLECTION_TYPE, NOTIFICATION_TYPE, STATUS } from '../../../constants'
import {
	calculateSsiAmountToCollection,
	handleError,
} from '../../../helpers/Helper'
import { getCollectionsByAssetId } from '../../../services/collectionService'
import useInpoundmentContext from '../../../services/hooks/useInpoundmentContext'
import { getCollectionTasks } from '../../../services/taskService'
import LoadingCircle from '../../anBrains/animations/LoadingCircle'
import CollectionForm from '../../collection/CollectionForm'
import Note from '../../Note'
import AssetNotifications from '../../notification/AssetNotifications'

export default function SsiCollectionTasks({ fieldName, type }) {
	const {
		assetProps: { visibleAsset, currentStep },
	} = useInpoundmentContext()

	const [tasksStatus, setTasksStatus] = useState(STATUS.NORMAL)
	const [futureCollectionTasks, setFutureCollectionTasks] = useState([])

	useEffect(() => {
		getFutureCollectionTasks()
	}, [visibleAsset, currentStep])

	const getFutureCollectionTasks = async () => {
		setTasksStatus(STATUS.LOADING)
		await getCollectionTasks(visibleAsset._id)
			.then(async tasksRes => {
				await getCollectionsByAssetId(visibleAsset._id)
					.then(res => {
						const tasks = tasksRes.data.map(task => {
							return {
								...task,
								collections: res.data.filter(c => {
									const taskDate = new Date(task.startDate)
									const monthStart = new Date(
										taskDate.getFullYear(),
										taskDate.getMonth(),
										0,
									)
									const monthEnd = new Date(
										taskDate.getFullYear(),
										taskDate.getMonth() + 1,
										1,
									)
									const collectionTaskStartDate = new Date(
										c.extra.taskStartDate,
									)

									return (
										collectionTaskStartDate < monthEnd &&
										collectionTaskStartDate > monthStart
									)
								}),
							}
						})
						setFutureCollectionTasks([...tasks])
					})
					.catch(e => {
						handleError(e)
						console.log(e)
					})
			})
			.catch(e => handleError(e))
		setTasksStatus(STATUS.NORMAL)
	}

	const collectionFormRef = useRef()

	const addCollection = (taskIndex, collection) => {
		futureCollectionTasks[taskIndex].collections.push(collection)
		setFutureCollectionTasks([...futureCollectionTasks])
	}

	return (
		<>
			{tasksStatus === STATUS.LOADING ? (
				<LoadingCircle />
			) : futureCollectionTasks.length > 0 ? (
				<div className="flex mb-4 w-100">
					<div className="w-50 mr-8">
						<p className="fs-md blue mb-4 fw-600">
							Planlanmış Tahsilat Görevleri
						</p>
						<div>
							{futureCollectionTasks.map((task, index) => {
								const now = new Date()
								const startDate = new Date(task.startDate)
								const inThisMonth =
									startDate.getMonth() === now.getMonth() &&
									startDate.getFullYear() === now.getFullYear()
								const isOutOfDate =
									now > startDate && now.setDate(1) - startDate.setDate(1) > 30
								let totalCollection = 0
								task.collections.map(
									c => (totalCollection += parseInt(c.amount)),
								)
								const isCollected =
									totalCollection >=
									calculateSsiAmountToCollection(visibleAsset[fieldName])
								return (
									<React.Fragment>
										<div className="bg-light p-4 br">
											<div className="flex al-center">
												<p>
													{new Date(task.startDate).toLocaleDateString('tr-TR')}{' '}
													tarihinde ödenecek{' '}
													<span className="fw-500">
														{calculateSsiAmountToCollection(
															visibleAsset[fieldName],
														)}
														₺{' '}
													</span>
													tutarında para
												</p>
												<div className="ml-4">
													{isCollected && (
														<p className="green fw-500">Tahsil edildi</p>
													)}
												</div>
											</div>
											<div className="step-item-divider my-2"></div>
											{task.collections.length > 0 ? (
												<div>
													{task.collections.map(c => {
														return (
															<p className="fs-sm">
																{new Date(c.date).toLocaleDateString('tr-TR')}{' '}
																tarihinde {c.amount}
																{c.receivedMoneyCurrency} tutarında tahsilat
																yapıldı
															</p>
														)
													})}
												</div>
											) : (
												<p className="fs-sm">Henüz tahsilat yapılamadı</p>
											)}
											<div className="mt-2"></div>
											{!isCollected && (
												<CollectionForm
													ref={collectionFormRef}
													exactType={
														type === 'GARNISHMENT'
															? COLLECTION_TYPE.DE_FACTO_GARNISHMENT.value
															: COLLECTION_TYPE.SSI.value
													}
													addCollection={col => addCollection(index, col)}
													extra={{
														taskStartDate: new Date(task.startDate),
														type,
													}}
												/>
											)}
										</div>
										{index !== futureCollectionTasks.length - 1 && (
											<div className="step-item-divider"></div>
										)}
									</React.Fragment>
								)
							})}
							<Note type="zekiye" classes="mt-8">
								<div>
									Her ay tahsilat eklendiğinde, o aya ait görev otomatik olarak
									tamamlanır.
								</div>
								<div>
									Eğer ödenmemiş bir tahsilat varsa muhtıra çıkartılması için
									görev oluşturulur.
								</div>
							</Note>
						</div>
					</div>
					<div className="w-50">
						<AssetNotifications
							notificationType={
								type === 'GARNISHMENT'
									? NOTIFICATION_TYPE.DE_FACTO_GARNISHMENT_MEMORIAL
									: NOTIFICATION_TYPE.SSI_MEMORIAL
							}
							title="Maaş Haczi Muhtıraları"
							emptyText="Henüz muhtıra oluşturulmamış"
						/>
					</div>
				</div>
			) : (
				<Note type="zekiye" classes="mt-8">
					Bilgiler kaydedildiğinde otomatik olarak bir sonraki ay için tahsilat
					görevi oluşturulacaktır. Her tahsilat yapıldığında bir sonraki ay için
					yeni görev oluşturulur. Lütfen planlanmış görevleri takip edin.
				</Note>
			)}
		</>
	)
}
