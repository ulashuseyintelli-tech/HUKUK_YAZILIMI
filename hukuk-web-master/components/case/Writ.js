import React, { useEffect, useState } from 'react'
import {
	FaCheck,
	FaChevronCircleDown,
	FaChevronCircleUp,
	FaLongArrowAltLeft,
} from 'react-icons/fa'
import { WRIT_TYPE, WRIT_FILE_TYPE, STATUS } from '../../constants'
import {
	getCasePartOpacity,
	goPreviousStepOfTeacher,
	handleError,
	toDateInputValue,
} from '../../helpers/Helper'
import { saveCase } from '../../services/caseService'
import useInpoundmentContext from '../../services/hooks/useInpoundmentContext'
import Button from '../anBrains/Button'
import Input from '../anBrains/Input'
import Note from '../Note'

export default function Writ() {
	const { currentCase, setCurrentCase } = useInpoundmentContext()

	const [status, setStatus] = useState(STATUS.NORMAL)
	const [isOpen, setIsOpen] = useState(false)
	const [writ, setWrit] = useState(currentCase.writ)

	const [isBlinking, setIsBlinking] = useState(
		getCasePartOpacity(currentCase, 'writ'),
	)

	useEffect(() => {
		if (currentCase.isDetailsCompleted && !currentCase.isWritDetailsCompleted) {
			setIsOpen(true)
		}
	}, [currentCase])

	const changeProperty = (property, value) => {
		writ[property] = value
		setWrit({ ...writ })
	}

	const completeWrit = async () => {
		setStatus(STATUS.LOADING)
		await saveCase(currentCase.number, {
			...currentCase,
			isWritDetailsCompleted: true,
			writ,
		})
			.then(res => {
				setCurrentCase(res.data)
				setIsOpen(false)
			})
			.catch(handleError)
		setStatus(STATUS.NORMAL)
	}

	return (
		<div
			className="case-form__writ relative"
			disabled={!getCasePartOpacity(currentCase, 'writ')}
		>
			<Button
				onClick={() => setIsOpen(!isOpen)}
				classes="jst-between w-100 orange fs-nm"
			>
				<p className="bold">İlam Detayları</p>
				{isOpen ? (
					<FaChevronCircleUp className="orange" />
				) : (
					<FaChevronCircleDown className="orange" />
				)}
			</Button>
			{isOpen && (
				<>
					<div className="step-item-divider"></div>
					<div className="flex al-center">
						<div className="w-50 mr-4">
							<p className="fw-500 mb-2">İlam Türü</p>
							<select
								className="input w-100 mb-2"
								onChange={e => changeProperty('type', e.target.value)}
							>
								{Object.values(WRIT_TYPE).map(value => {
									return <option value={value.value}>{value.text}</option>
								})}
							</select>
						</div>
						<div className="w-50 mr-4">
							<p className="fw-500 mb-2">Dosya Türü</p>
							<select
								className="input w-100 mb-2"
								onChange={e => changeProperty('fileType', e.target.value)}
							>
								{Object.values(WRIT_FILE_TYPE).map(value => {
									return <option value={value.value}>{value.text}</option>
								})}
							</select>
						</div>
						<div className="w-50">
							<p className="fw-500 mb-2">İlam Tarihi</p>
							<Input
								type="date"
								value={toDateInputValue(new Date(writ.writDate))}
								classes="mb-2"
								onChange={e =>
									changeProperty('writDate', new Date(e.target.value))
								}
							/>
						</div>
					</div>
					<div className="flex al-center">
						<div className="w-50 mr-4">
							<p className="fw-500 mb-2">İlamı Veren Mahkeme</p>
							<select
								className="input w-100 mb-2"
								onChange={e => changeProperty('court', e.target.value)}
							>
								{Object.values(WRIT_FILE_TYPE).map(value => {
									return <option value={value.value}>{value.text}</option>
								})}
							</select>
						</div>
						<div className="w-50 mr-4">
							<p className="fw-500 mb-2">Esas Numarası</p>
							<Input
								value={writ.basisNumber}
								classes="mb-2"
								onChange={e => changeProperty('basisNumber', e.target.value)}
							/>
						</div>
						<div className="w-50">
							<p className="fw-500 mb-2">Karar Numarası</p>
							<Input
								value={writ.adjudgementNumber}
								classes="mb-2"
								onChange={e =>
									changeProperty('adjudgementNumber', e.target.value)
								}
							/>
						</div>
					</div>
					<div className="flex al-center"></div>
					<p className="fw-500 mb-2">Talep</p>
					<Input
						textarea
						onChange={e => changeProperty('request', e.target.value)}
						classes="mb-2"
					/>
					<Button
						theme="orange"
						classes="w-100 py-3 fw-600 mt-10"
						onClick={completeWrit}
					>
						KAYDET
						<FaCheck className="ml-2" />
					</Button>
				</>
			)}
			{currentCase.isDetailsCompleted && !currentCase.isWritDetailsCompleted && (
				<Note
					type="zekiye"
					classes="teacher"
					blinking={isBlinking}
					onMouseOver={() => setIsBlinking(false)}
				>
					Bir sonraki aşamaya geçebilmek için ilam detaylarını girin
					<Button
						classes="mt-4"
						onClick={() =>
							goPreviousStepOfTeacher(setStatus, currentCase, setCurrentCase)
						}
					>
						<FaLongArrowAltLeft className="fs-xsm blue" />
						<span className="fw-500 fs-xsm blue">Önceki Adım</span>
					</Button>
				</Note>
			)}
		</div>
	)
}
