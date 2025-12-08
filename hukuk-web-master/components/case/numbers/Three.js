import React, { useEffect, useState } from 'react'
import { FaCheck, FaInfoCircle, FaPlusCircle, FaTrash } from 'react-icons/fa'
import { TASK_TYPE } from '../../../constants'
import { checkArraysEqual } from '../../../helpers/Helper'
import {
	saveCase,
	updateCasePropertyByNumber,
} from '../../../services/caseService'
import { useDebtorContext } from '../../../services/hooks/useDebtorContext'
import useInpoundmentContext from '../../../services/hooks/useInpoundmentContext'
import Button from '../../anBrains/Button'
import TaskField from '../../task/TaskField'
import TaskRadar from '../../task/TaskRadar'
import TrueFalse from '../../TrueFalse'

export default function Three() {
	const { debtorTasks } = useDebtorContext()

	const { currentCase, setCurrentCase, handleError } = useInpoundmentContext()
	const [days, setDays] = useState(currentCase.childrenDetails.days)
	const [areChildrenReceived, setAreChildrenReceived] = useState(
		currentCase.childrenDetails.areChildrenReceived,
	)

	// useEffect(() => {
	// 	if (!checkArraysEqual(days, currentCase.childrenDetails.days)) {
	// 		save()
	// 	}
	// }, [areChildrenReceived])

	const DAYS_OF_THE_WEEK = [
		'Pazartesi',
		'Salı',
		'Çarşamba',
		'Perşembe',
		'Cuma',
		'Cumartesi',
		'Pazar',
	]

	const save = () => {
		updateCasePropertyByNumber(currentCase.number, 'childrenDetails', {
			days,
			areChildrenReceived,
		})
			.then(res => {
				setCurrentCase({ ...res.data })
				alert('Günler başarıyla kaydedildi')
			})
			.catch(handleError)
	}

	const addDay = () => {
		if (days.length < 7) {
			setDays([...days, DAYS_OF_THE_WEEK.filter(d => !days.includes(d))[0]])
		}
	}

	const changeDay = (index, value) => {
		if (days.includes(value)) {
			alert('Bu gün zaten eklenmiş')
		} else {
			days[index] = value
			setDays([...days])
		}
	}

	return (
		<div className="inpoundment-asset-card mt-4">
			<TaskRadar
				right="7rem"
				containerClasses="flex al-center jst-between mb-4"
				always={debtorTasks.some(
					t => t.type === TASK_TYPE.CREATE_CHILDREN_DAYS,
				)}
			>
				<p className="orange fw-700">
					Alacaklının Çocukları Görebildiği Günler
				</p>
				{days.length < 7 && (
					<Button
						theme="orange"
						icon={<FaPlusCircle />}
						classes="fw-600  py-3"
						onClick={addDay}
					>
						Gün Ekle
					</Button>
				)}
			</TaskRadar>
			<div className="flex al-center wrap">
				{days.length === 0 ? (
					<p>Henüz gün eklenmemiş.</p>
				) : (
					days.map((day, i) => {
						return (
							<div className="flex al-center mr-4 mb-2 bg br p-4" key={day + i}>
								<select
									value={day}
									className="input bg-white"
									onChange={e => changeDay(i, e.target.value)}
								>
									{DAYS_OF_THE_WEEK.map((dd, index) => {
										return (
											<option key={dd + index + dd} value={dd}>
												{dd}
											</option>
										)
									})}
								</select>
								<Button
									classes="ml-4 red px-2 py-1"
									onClick={() => {
										days.splice(i, 1)
										setDays([...days])
									}}
								>
									<FaTrash />
								</Button>
							</div>
						)
					})
				)}
			</div>
			{currentCase.childrenDetails.days.length === 0 && (
				<div className="note my-4">
					<FaInfoCircle />
					<p>
						Günler kaydedildiğinde otomatik olarak en yakın güne{' '}
						<span className="fw-500">Çocukları Almak İçin</span> görev
						oluşturulacaktır.
					</p>
				</div>
			)}
			{!checkArraysEqual(currentCase.childrenDetails.days, days) && (
				<Button
					theme="cute"
					icon={<FaCheck />}
					classes="fw-500 mt-4 w-100 py-3"
					onClick={save}
				>
					Kaydet
				</Button>
			)}
			{currentCase.childrenDetails.days.length !== 0 && (
				<TaskRadar
					always={debtorTasks.some(t => t.type === TASK_TYPE.RECEIVE_CHILDREN)}
					right="98%"
				>
					<div className="step-item-divider"></div>
					<p className="fw-500">Çocuklar Teslim Alındı Mı?</p>
					<TrueFalse
						change={(prop, value) => setAreChildrenReceived(value)}
						object={{ areChildrenReceived }}
						property="areChildrenReceived"
						options={['Teslim Alınmadı', 'Teslim Alındı']}
					/>
				</TaskRadar>
			)}
			{currentCase.childrenDetails.areChildrenReceived === false && (
				<Button theme="red" classes="mt-4">
					Ceza Davası Aç
				</Button>
			)}
		</div>
	)
}
