import React, { useEffect, useState } from 'react'
import { FaCheck } from 'react-icons/fa'
import LoadingAnimation from '../components/anBrains/animations/LoadingAnimation/LoadingAnimation'
import Button from '../components/anBrains/Button'
import Layout from '../components/Layout'
import Printer from '../components/Printer'
import { TASK_STATUS } from '../constants'
import { getDebtorName, handleError } from '../helpers/Helper'
import { getDeFactoPreparingTasks } from '../services/taskService'
import Link from 'next/link'
import { useAppContext } from '../services/hooks/useAppContext'
import { getDistrictsByCity } from '../services/cities'

export default function DeFactoPreparingList(props) {
	const [loading, setLoading] = useState(true)
	const [tasks, setTasks] = useState([])
	const [addresses, setAddresses] = useState([])

	const [filteredCity, setFilteredCity] = useState(null)
	const [filteredDistrict, setFilteredDistrict] = useState(null)

	useEffect(() => {
		load()
	}, [])

	const load = async () => {
		await getTasks()
		setLoading(false)
	}

	const getTasks = async () => {
		await getDeFactoPreparingTasks()
			.then(res => {
				setTasks(res.data.tasks)
				const tasks = res.data.tasks
				const addressArr = []
				tasks.map(t => {
					if (t.notification) {
						addressArr.push(t.notification.address)
					} else if (t.customsDue?.customsOffice) {
						addressArr.push({
							city: t.customsDue.customsOffice.city,
							district: t.customsDue.customsOffice.district,
						})
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
			return (
				t.notification?.address[field] === comparedValue ||
				t.customsDue?.customsOffice[field] === comparedValue
			)
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

	return (
		<Layout {...props}>
			<LoadingAnimation loading={loading} />
			<div className="container de-facto-list pt-10">
				<div className="flex al-center jst-between mb-8">
					<h1 className="fs-lg dark-blue">
						Fiili Hacze Çıkılması Gereken Borçlular
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
						<th>Haciz</th>
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
							<tr
								className={`restriction-raw ${
									isCompleted ? 'bg-green-300' : ''
								}`}
							>
								<td className="white-wrap">{getDebtorName(t.debtor)}</td>
								<td>
									{t.assetType === 'CUSTOMS' ? 'Gümrük Haczi' : 'Fiili Haciz'}
								</td>
								<td>
									{t.notification
										? t.notification.address.city
										: t.customsDue?.customsOffice?.city}
								</td>
								<td>
									{t.notification
										? t.notification.address.district
										: t.customsDue?.customsOffice?.district}
								</td>
								<td className="white-wrap">
									{t.notification
										? t.notification.address.description
										: t.customsDue?.customsOffice?.description}
								</td>
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
								<td>
									<div className="flex column al-center">
										{!isCompleted && (
											<Printer
												paperDebtors={[t.debtor]}
												type="BULK"
												queryList={['DE_FACTO']}
												caseId={t.currentCase?._id}
												title="Talep Yazdır"
											/>
										)}
										{!isCompleted && (
											<Link
												href={`/takip/${t.currentCase.number}/haciz?debtorId=${
													t.debtorId
												}&assetType=${t.assetType || 'DE_FACTO'}&assetId=${
													t.assetId
												}`}
											>
												<a className="blue fw-600 mt-4 fs-sm">Hacze Çıktım</a>
											</Link>
										)}
									</div>
								</td>
							</tr>
						)
					})}
				</table>
			</div>
		</Layout>
	)
}
