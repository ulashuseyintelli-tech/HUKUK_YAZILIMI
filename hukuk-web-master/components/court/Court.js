import React, { useEffect, useState } from 'react'
import { FaCalendarAlt } from 'react-icons/fa'
import { TASK_TYPE } from '../../constants'
import { handleError, toDateInputValue } from '../../helpers/Helper'
import {
	createCourt,
	updateCourt,
	updateCourtByProperty,
} from '../../services/courtService'
import useInpoundmentContext from '../../services/hooks/useInpoundmentContext'
import LoadingCircle from '../anBrains/animations/LoadingCircle'
import Button from '../anBrains/Button'
import Input from '../anBrains/Input'
import Modal from '../anBrains/Modal'
import Note from '../Note'
import RadioSelect from '../RadioSelect'
import TaskRadar from '../task/TaskRadar'

export default function Court({
	type,
	reload,
	item,
	debtorTasks,
	courts,
	setCourts,
}) {
	const { selectedDebtor, assetProps, visibleInpoundment, currentCase } =
		useInpoundmentContext()

	const [loading, setLoading] = useState(false)
	const [court, setCourt] = useState(item)

	const [name, setName] = useState(item ? item.name : '')
	const [fileNumber, setFileNumber] = useState(item ? item.fileNumber : '')
	const [startDate, setStartDate] = useState(item ? item.startDate : new Date())
	const [juridicalDays, setJuridicalDays] = useState(
		item ? item.juridicalDays : [],
	)

	const [isNewDayFormOpen, setIsNewDayFormOpen] = useState(false)
	const [newJuridicalDate, setNewJuridicalDate] = useState(new Date())
	const [error, setError] = useState(null)
	const [dateError, setDateError] = useState(null)

	const submit = async () => {
		setLoading(true)
		if (court) {
			updateCourt(court._id, { name, fileNumber, startDate, juridicalDays })
				.then(thenSubmit)
				.catch(catchSubmit)
		} else {
			if (validateNewCourt() === true) {
				await createCourt(currentCase._id, selectedDebtor._id, {
					name,
					fileNumber,
					startDate,
					juridicalDays,
					type,
					assetType: visibleInpoundment,
					assetId:
						assetProps && assetProps.visibleAsset
							? assetProps.visibleAsset._id
							: null,
				})
					.then(thenSubmit)
					.catch(catchSubmit)
			}
		}
		setLoading(false)
	}

	const validateNewCourt = () => {
		if (!name) {
			setError('Lütfen mahkeme adı girin!')
		} else if (!fileNumber) {
			setError('Lütfen dosya numarası girin!')
		} else if (!startDate) {
			setError('Lütfen dava açılış tarihi girin!')
		} else if (!juridicalDays.length === 0) {
			setError('Lütfen bir duruşma günü girin!')
		} else {
			setError(null)
			return true
		}
	}

	const thenSubmit = res => {
		setStatesByCourt(res.data)
		if (court) {
			const index = courts.findIndex(c => c._id === court._id)
			courts[index] = { ...res.data }
			setCourts([...courts])
		} else {
			courts.push({ ...res.data })
			setCourt([...courts])
		}
		if (reload) {
			reload()
		}
	}

	const catchSubmit = e => {
		handleError(e)
	}

	const updateDayStatus = (index, status) => {
		juridicalDays[index].status = status
		updateCourtByProperty(court._id, 'juridicalDays', {
			operation: 'changeStatus',
			data: juridicalDays,
		})
			.then(thenSubmit)
			.catch(handleError)
	}

	const setStatesByCourt = data => {
		setName(data.name)
		setFileNumber(data.fileNumber)
		setStartDate(data.startDate)
		setJuridicalDays(data.juridicalDays)
		setCourt({ ...data })
	}

	const addNewJuridicalDay = () => {
		if (new Date(newJuridicalDate) < new Date()) {
			setDateError('Duruşma günü bugünden önce olamaz!')
		} else {
			if (!court) {
				juridicalDays.push({ date: newJuridicalDate, status: null })
				setJuridicalDays([...juridicalDays])
				setDateError(null)
				setNewJuridicalDate(new Date())
				setIsNewDayFormOpen(false)
			} else {
				const isGreatestDate = !juridicalDays.some(
					d => new Date(d.date) > new Date(newJuridicalDate),
				)
				if (!isGreatestDate) {
					setDateError('Duruşma günü, diğer duruşma günlerinden önce olamaz!')
				} else {
					juridicalDays.push({ date: newJuridicalDate, status: null })
					setJuridicalDays([...juridicalDays])
					setDateError(null)
					setNewJuridicalDate(new Date())
					setIsNewDayFormOpen(false)
					updateCourtByProperty(court._id, 'juridicalDays', {
						operation: 'add',
						data: juridicalDays,
					})
						.then(thenSubmit)
						.catch(catchSubmit)
				}
			}
		}
	}

	const hasDayStatusTask = debtorTasks.some(
		t =>
			t.type === TASK_TYPE.JURIDICAL_DAY_RESPONSE_REQUIRED &&
			t.extra.courtType === type,
	)

	const hasNextDayTask = debtorTasks.some(
		t =>
			t.type === TASK_TYPE.NEXT_JURIDICAL_DAY_REQUIRED &&
			t.extra.courtType === type,
	)

	if (loading) return <LoadingCircle />

	return (
		<div className="court">
			<span className="fw-500">Dava Detayları</span>
			<div className="mt-4 flex al-center">
				<div className="w-100 mr-4">
					<span className="gray">Mahkeme Adı</span>
					<Input
						value={name}
						onChange={e => setName(e.target.value)}
						classes="mt-2"
						placeholder="Mahkeme adı"
					/>
				</div>
				<div className="w-100 mr-4">
					<span className="gray">Dosya Numarası</span>
					<Input
						value={fileNumber}
						onChange={e => setFileNumber(e.target.value)}
						classes="mt-2"
						placeholder="Dosya numarası"
					/>
				</div>
				<div className="w-100">
					<span className="gray">Dava Açılış Tarihi</span>
					<Input
						value={toDateInputValue(new Date(startDate), 0)}
						onChange={e => setStartDate(e.target.value)}
						classes="mt-2"
						type="date"
					/>
				</div>
			</div>
			{error && (
				<Note type="error" classes="mt-4">
					{error}
				</Note>
			)}
			<Button
				theme="blue"
				classes="ml-auto mt-4 fw-600"
				onClick={submit}
				disabled={
					court &&
					court.startDate === startDate &&
					court.name === name &&
					court.fileNumber === fileNumber
				}
			>
				{court ? 'Kaydet' : 'Oluştur'}
			</Button>
			<div className="w-100 mt-4">
				<div className="flex al-center jst-between">
					<span className="gray">Duruşma Günleri</span>
					{(court ? !hasDayStatusTask : juridicalDays.length === 0) && (
						<TaskRadar always={hasNextDayTask} top="-1rem" right="7.5rem">
							<Button
								classes="fw-600 blue"
								onClick={() => setIsNewDayFormOpen(true)}
							>
								Duruşma Günü Ekle
							</Button>
						</TaskRadar>
					)}
				</div>
				<Modal
					visible={isNewDayFormOpen}
					close={() => setIsNewDayFormOpen(false)}
				>
					<div className="bg-white p-8 br column">
						<span className="fw-600 mb-4">Yeni Duruşma Günü</span>
						<input
							value={toDateInputValue(newJuridicalDate, 0)}
							className="input px-4 py-2 mb-4"
							type="date"
							onChange={e => setNewJuridicalDate(new Date(e.target.value))}
						/>
						{dateError && (
							<Note type="error" classes="mb-4">
								{dateError}
							</Note>
						)}
						<Button onClick={addNewJuridicalDay} classes="btn btn-blue fw-600">
							Ekle
						</Button>
					</div>
				</Modal>
				<div className="mt-4">
					{juridicalDays.length > 0 ? (
						juridicalDays.map((day, dayIndex) => {
							return (
								<div className="bg-white p-4 br">
									<div className="flex al-center">
										<FaCalendarAlt className="fs-xsm mb-1 gray" />
										<p className="fw-500 fs-sm ml-2">
											{new Date(day.date).toLocaleDateString('tr-TR')} tarihli
											duruşma
										</p>
									</div>
									<div className="divider my-4"></div>
									<TaskRadar
										always={
											hasDayStatusTask && dayIndex === juridicalDays.length - 1
										}
									>
										<p className="fs-sm fw-500 gray">Duruşma Sonucu</p>
										<RadioSelect
											onChange={v => updateDayStatus(dayIndex, v)}
											values={[1, 2, 3]}
											className="mt-4"
											options={[
												'Yeni Duruşma Tarihi Verildi',
												'Lehe Sonuçlandı',
												'Aleyhe Sonuçlandı',
											]}
											value={day.status}
										/>
									</TaskRadar>
								</div>
							)
						})
					) : (
						<p className="dark">
							Henüz duruşma günü eklenmemiş. Bir duruşma günü ekleyin.
						</p>
					)}
				</div>
			</div>
		</div>
	)
}
