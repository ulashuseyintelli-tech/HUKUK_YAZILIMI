import React, { useEffect, useState } from 'react'
import LoadingAnimation from '../components/anBrains/animations/LoadingAnimation/LoadingAnimation'
import Layout from '../components/Layout'
import Printer from '../components/Printer'
import { TASK_STATUS } from '../constants'
import { getDebtorName, handleError } from '../helpers/Helper'
import { getDeFactoIntelTasks } from '../services/taskService'
import Link from 'next/link'
import { getDistrictsByCity } from '../services/cities'
import Button from '../components/anBrains/Button'
import { FaCheck, FaTimes } from 'react-icons/fa'
import { updateDeFactoIntel } from '../services/deFactoService'

export default function DeFactoIntelList(props) {
	const [loading, setLoading] = useState(true)
	const [tasks, setTasks] = useState([])
	const [addresses, setAddresses] = useState([])

	const [filteredCity, setFilteredCity] = useState(null)
	const [filteredDistrict, setFilteredDistrict] = useState(null)

	const [modalVisibleTaskId, setModalVisibleTaskId] = useState(null)

	useEffect(() => {
		load()
	}, [])

	const load = async () => {
		await getTasks()
		setLoading(false)
	}

	const getTasks = async () => {
		await getDeFactoIntelTasks()
			.then(res => {
				setTasks(res.data.filter(t => t.extra?.address))
				const tasks = res.data
				const addressArr = []
				tasks.map(t => {
					if (t.extra?.address) {
						addressArr.push(t.extra.address)
					}
				})
				setAddresses([...addressArr])
			})
			.catch(handleError)
	}

	useEffect(() => {
		setFilteredDistrict(null)
	}, [filteredCity])

	const filterByAddressField = (taskArr, field, comparedValue) => {
		return taskArr.filter(t => {
			return t.extra?.address[field] === comparedValue
		})
	}

	const filterTasks = () => {
		if (!filteredCity && !filteredDistrict) {
			return tasks
		} else if (filteredCity && !filteredDistrict) {
			return filterByAddressField(tasks, 'city', filteredCity)
		} else if (!filteredCity && filteredDistrict) {
			return filterByAddressField(tasks, 'district', filteredDistrict)
		} else {
			return filterByAddressField(
				filterByAddressField(tasks, 'city', filteredCity),
				'district',
				filteredDistrict,
			)
		}
	}

	const completeTask = (taskId, isForeclosable) => {
		updateDeFactoIntel(taskId, isForeclosable)
			.then(res => {
				const index = tasks.findIndex(t => t._id === taskId)
				tasks[index].status = TASK_STATUS.DONE
				tasks[index].extra.isForeclosable = isForeclosable
				setTasks([...tasks])
			})
			.catch(handleError)
	}

	return (
		<Layout {...props}>
			<LoadingAnimation loading={loading} />
			<div className="container de-facto-list pt-10">
				<div className="flex al-center jst-between mb-8">
					<h1 className="fs-lg dark-blue">
						Fiili İstihbarata Çıkılması Gereken Borçlular
					</h1>
					<div className="flex al-center">
						<div className="column ml-4">
							<p className="fw-500 fs-sm mb-2">Şehir Filtresi</p>
							<select
								value={filteredCity}
								className="input bg-white"
								onChange={e => setFilteredCity(e.target.value)}
							>
								<option value="">Tüm Şehirler</option>
								{[...new Set(addresses.map(e => e.city))].map(city => {
									return (
										<option key={city} value={city}>
											{city}
										</option>
									)
								})}
							</select>
						</div>
						<div className="column ml-4">
							<p className="fw-500 fs-sm mb-2">İlçe Filtresi</p>
							<select
								value={filteredDistrict}
								className="input bg-white"
								onChange={e => setFilteredDistrict(e.target.value)}
							>
								<option value="">Tüm İlçeler</option>
								{[
									...new Set(
										addresses.filter(e => e.district).map(e => e.district),
									),
								]
									.filter(district =>
										filteredCity
											? getDistrictsByCity(filteredCity).some(
													d => d.districtName === district,
											  )
											: false,
									)
									.map(district => {
										return <option value={district}>{district}</option>
									})}
							</select>
						</div>
					</div>
				</div>
				<table className="restriction-list bg-white">
					<tr className="restriction-raw">
						<th>Borçlu</th>
						<th>İl</th>
						<th>İlçe</th>
						<th>Adres</th>
						<th>İcra Dairesi</th>
						<th>Dosya No</th>
						<th>Görevin Verilme Tarihi</th>
						<th>Durum</th>
						<th>Aksiyon</th>
					</tr>
					{filterTasks().map(t => {
						const isCompleted = t.status === TASK_STATUS.DONE
						return (
							<tr className="restriction-raw">
								<td className="white-wrap">{getDebtorName(t.debtor)}</td>
								<td>{t.extra?.address?.city}</td>
								<td>{t.extra?.address?.district}</td>
								<td className="white-wrap">{t.extra?.address?.description}</td>
								<td className="white-wrap">
									{t.currentCase?.executionOffice[0]?.name}
								</td>
								<td>{t.currentCase?.executionFileNumber}</td>
								<td>{new Date(t.createdAt).toLocaleDateString('tr-TR')}</td>
								<td>
									<p
										className={`fw-500 ${isCompleted ? 'green' : 'dark-blue'}`}
									>
										{isCompleted ? 'Tamamlanmış' : 'Bekliyor'}
									</p>
								</td>
								<td className="relative">
									{t.status === TASK_STATUS.DONE ? (
										<>
											{t.extra?.isForeclosable ? (
												<div className="green flex al-center fw-500">
													<FaCheck className="mr-2" />
													Haczedilebilir Adres
												</div>
											) : (
												<div className="red flex al-center fw-500">
													<FaTimes className="mr-2" />
													Haczedilebilir Adres Değil
												</div>
											)}
										</>
									) : (
										<>
											<Button
												theme="green"
												classes="fw-500"
												onClick={() => {
													setModalVisibleTaskId(
														modalVisibleTaskId === t._id ? null : t._id,
													)
												}}
											>
												Görevi Tamamla
											</Button>
											{modalVisibleTaskId === t._id && (
												<div className="de-facto-intel-actions">
													<Button
														classes="fw-500 green mb-2"
														theme="basic"
														onClick={() => completeTask(t._id, true)}
													>
														<FaCheck className="mr-2" />
														Haczedilebilir Adres
													</Button>
													<Button
														classes="fw-500 red"
														theme="basic"
														onClick={() => completeTask(t._id, false)}
													>
														<FaTimes className="mr-2" />
														Haczedilebilir Adres Değil
													</Button>
													<Button
														classes="mt-4 ta-center w-100"
														onClick={() => setModalVisibleTaskId(null)}
													>
														Kapat
													</Button>
												</div>
											)}
										</>
									)}
								</td>
							</tr>
						)
					})}
				</table>
			</div>
		</Layout>
	)
}
