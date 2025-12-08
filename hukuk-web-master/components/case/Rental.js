import { useEffect, useState } from 'react'
import {
	FaCheck,
	FaChevronCircleDown,
	FaChevronCircleUp,
	FaEye,
	FaFileContract,
	FaLongArrowAltLeft,
	FaTruckLoading,
} from 'react-icons/fa'
import {
	CURRENCIES,
	RENTAL_TYPES,
	RENTAL_CONTRACT_TYPES,
	STATUS,
	DEBTOR_ADDRESS,
	ADDRESS_TYPE,
	getRentalDurationList,
	TASK_TYPE,
} from '../../constants'
import {
	getCasePartOpacity,
	goPreviousStepOfTeacher,
	handleError,
} from '../../helpers/Helper'
import {
	saveCase,
	updateCasePropertyByNumber,
} from '../../services/caseService'
import { useDebtorContext } from '../../services/hooks/useDebtorContext'
import useInpoundmentContext from '../../services/hooks/useInpoundmentContext'
import LoadingAnimation from '../anBrains/animations/LoadingAnimation/LoadingAnimation'
import Button from '../anBrains/Button'
import Input from '../anBrains/Input'
import AddressForm from '../forms/AddressForm'
import Note from '../Note'
import TaskRadar from '../task/TaskRadar'
import TrueFalse from '../TrueFalse'

export default function Rental() {
	const { currentCase, setCurrentCase, selectedDebtor } =
		useInpoundmentContext()
	const debtorContext = useDebtorContext()
	const [status, setStatus] = useState(STATUS.NORMAL)
	const [isOpen, setIsOpen] = useState(false)
	const [rentalDetails, setRentalDetails] = useState(currentCase.rentalDetails)

	const [isDetailsOpen, setIsDetailsOpen] = useState(false)

	const [isBlinking, setIsBlinking] = useState(
		getCasePartOpacity(currentCase, 'rental'),
	)

	useEffect(() => {
		if (
			currentCase.isDebtorsCompleted &&
			!currentCase.isRentalDetailsCompleted
		) {
			setIsOpen(true)
			setIsDetailsOpen(true)
		}
	}, [currentCase])

	const changeProperty = (property, value) => {
		rentalDetails[property] = value
		setRentalDetails({ ...rentalDetails })
	}

	const completeRentalDetails = async () => {
		if (validate()) {
			setStatus(STATUS.LOADING)

			await saveCase(currentCase.number, {
				...currentCase,
				isRentalDetailsCompleted: true,
				rentalDetails,
			})
				.then(res => {
					setCurrentCase(res.data)
					setIsOpen(false)
				})
				.catch(handleError)
			setStatus(STATUS.NORMAL)
		} else {
			alert('Lütfen tüm alanları doldurun')
		}
	}

	const validate = () => {
		let status = true
		Object.keys(rentalDetails).map(key => {
			if (!rentalDetails[key]) status = false
		})
		return status
	}

	const changeEvictionProperty = (property, value) => {
		setStatus(STATUS.LOADING)
		currentCase.eviction[property] = value
		updateCasePropertyByNumber(
			currentCase.number,
			'eviction',
			currentCase.eviction,
		)
			.then(res => {
				setCurrentCase(res.data)
			})
			.catch(handleError)
		setStatus(STATUS.NORMAL)
	}

	const rentalTaskTypes = [
		TASK_TYPE.IS_EVACUATED,
		TASK_TYPE.ENTER_EVICTION_RESPONSE,
		TASK_TYPE.REQUEST_EVICTION,
	]
	const actionRequired =
		debtorContext &&
		debtorContext.debtorTasks.some(t => rentalTaskTypes.includes(t.type))

	return (
		<div
			className="case-form__writ relative my-8"
			disabled={!getCasePartOpacity(currentCase, 'rental')}
		>
			<LoadingAnimation status={status} />
			<TaskRadar always={actionRequired} right={'5%'} top="-.75rem">
				<Button
					onClick={() => setIsOpen(!isOpen)}
					classes="jst-between w-100 orange fs-nm"
				>
					<p className="bold">Kira ve Tahliye Detayları</p>
					{currentCase.eviction.isEvacuated && (
						<div className="green fs-sm fw-500 flex al-center">
							<FaCheck className="mr-2 fs-xsm" /> Tahliye Edilmiş
						</div>
					)}
					{isOpen ? (
						<FaChevronCircleUp className="orange" />
					) : (
						<FaChevronCircleDown className="orange" />
					)}
				</Button>
			</TaskRadar>
			{isOpen && (
				<>
					<div className="step-item-divider"></div>
					<div className="bg br p-4">
						<Button
							classes="w-100  fw-500 jst-between fs-nm orange"
							icon={<FaEye />}
							iconPosition="right"
							onClick={() => setIsDetailsOpen(!isDetailsOpen)}
						>
							<div className="flex al-center">
								<div className="btn btn-orange p-2 mr-2">
									<FaFileContract />
								</div>
								Kira Detayları
							</div>
						</Button>

						{isDetailsOpen && (
							<>
								<div className="step-item-divider my-4"></div>
								<div className="flex al-center">
									<div className="w-50 mr-4">
										<p className="fw-500 mb-2">Kira Türü</p>
										<select
											value={rentalDetails.type}
											className="input bg-white w-100 mb-2"
											onChange={e => changeProperty('type', e.target.value)}
										>
											<option value={null} disabled selected>
												Seçiniz
											</option>
											{RENTAL_TYPES.map(value => {
												return <option value={value}>{value}</option>
											})}
										</select>
									</div>
									<div className="w-50 mr-4">
										<p className="fw-500 mb-2">Yıllık Kira Bedeli</p>
										<div className="flex ">
											<Input
												classes="bg-white"
												placeholder="Kira bedeli"
												value={rentalDetails.annualValue || ''}
												onChange={e =>
													changeProperty('annualValue', e.target.value)
												}
											/>
											<select
												value={rentalDetails.annualValueCurrency}
												onChange={e =>
													changeProperty('annualValueCurrency', e.target.value)
												}
												className="input bg-white "
											>
												<option value={null} disabled selected>
													Seçiniz
												</option>
												{Object.keys(CURRENCIES).map(key => {
													return <option value={key}>{key}</option>
												})}
											</select>
										</div>
									</div>
									<div className="w-50 mr-4">
										<p className="fw-500 mb-2">Sözleşme Türü</p>
										<select
											value={rentalDetails.contractType}
											className="input bg-white w-100 mb-2"
											onChange={e =>
												changeProperty('contractType', e.target.value)
											}
										>
											<option value={null} disabled selected>
												Seçiniz
											</option>
											{RENTAL_CONTRACT_TYPES.map(value => {
												return <option value={value}>{value}</option>
											})}
										</select>
									</div>
								</div>
								<div className="w-50 mr-4">
									<p className="fw-500 mb-2">Sözleşme Süresi (ay)</p>
									<select
										value={rentalDetails.contractDuration}
										className="input bg-white w-100 mb-2"
										onChange={e =>
											changeProperty('contractDuration', e.target.value)
										}
									>
										<option value={null} disabled selected>
											Sözleşme Süresi (Ay)
										</option>
										{getRentalDurationList().map(value => {
											return <option value={value}>{value}</option>
										})}
									</select>
								</div>
								<div>
									<p className="fw-500 my-2">Adres</p>
									<AddressForm
										exactType={ADDRESS_TYPE.DECLARATION}
										withoutHeader
										addresses={[rentalDetails.address || DEBTOR_ADDRESS]}
										setAddresses={addresses =>
											changeProperty('address', addresses[0])
										}
									/>
								</div>
								<Button
									theme="orange"
									classes="py-3 w-100 fw-600 mt-8"
									icon={<FaCheck />}
									onClick={completeRentalDetails}
								>
									KAYDET
								</Button>
							</>
						)}
					</div>
					{currentCase.type === '14' && selectedDebtor && (
						<div className="bg br p-4 mt-4">
							<Button
								classes="w-100  fw-500 jst-between fs-nm orange"
								icon={<FaEye />}
								iconPosition="right"
							>
								<div className="flex al-center">
									<div className="btn btn-orange p-2 mr-2">
										<FaTruckLoading />
									</div>{' '}
									Tahliye Detayları
								</div>
							</Button>
							<TaskRadar
								right="99%"
								always={debtorContext?.debtorTasks.some(
									t => t.type === TASK_TYPE.IS_EVACUATED,
								)}
							>
								<div className="step-item-divider my-4"></div>
								<p className="fw-500">
									Borçlu Tarafından Tahliye İşlemi Gerçekleştirildi Mi?
								</p>
								<TrueFalse
									options={['Hayır', 'Evet']}
									property="isEvacuatedBySelf"
									object={currentCase.eviction}
									change={changeEvictionProperty}
								/>
							</TaskRadar>
							{currentCase.eviction.isEvacuatedBySelf === false && (
								<>
									<div className="step-item-divider my-4"></div>
									<TaskRadar
										always={debtorContext?.debtorTasks.some(
											t => t.type === TASK_TYPE.REQUEST_EVICTION,
										)}
										right="99%"
									>
										<p className="fw-500">
											İcra Mahkemesinden Tahliye Talep Edildi Mi?
										</p>
										<TrueFalse
											options={['Hayır', 'Evet']}
											property="isEvictionRequested"
											object={currentCase.eviction}
											change={changeEvictionProperty}
										/>
									</TaskRadar>
									{currentCase.eviction.isEvictionRequested && (
										<>
											<div className="step-item-divider"></div>
											<TaskRadar
												right="99%"
												always={debtorContext?.debtorTasks.some(
													t => t.type === TASK_TYPE.ENTER_EVICTION_RESPONSE,
												)}
											>
												<p className="fw-500">Tahliye Edildi Mi?</p>
												<TrueFalse
													options={['Hayır', 'Evet']}
													property="isEvacuated"
													object={currentCase.eviction}
													change={changeEvictionProperty}
												/>
											</TaskRadar>
										</>
									)}
								</>
							)}
						</div>
					)}
				</>
			)}
			{!currentCase.isRentalDetailsCompleted && (
				<Note
					type="zekiye"
					classes="teacher"
					blinking={isBlinking}
					onMouseOver={() => setIsBlinking(false)}
				>
					Bir sonraki aşamaya geçebilmek için kira bilgilerini girin
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
