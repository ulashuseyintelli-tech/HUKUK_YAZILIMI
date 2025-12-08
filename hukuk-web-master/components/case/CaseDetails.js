import React, { useEffect, useState } from 'react'
import Input from '../anBrains/Input'
import { getDayCount } from '../../services/dateService'
import {
	CASE_WAY,
	CASE_STATUS,
	STATUS,
	CASE_TYPES_WITHOUT_DUE,
	CASE_STATUS_REQUIRE_CANCEL,
} from '../../constants'
import ExecutionOffices from './ExecutionOffices'
import Button from '../anBrains/Button'
import useInpoundmentContext from '../../services/hooks/useInpoundmentContext'
import {
	checkDatesAreSame,
	getCasePartOpacity,
	goPreviousStepOfTeacher,
	handleError,
	toDateInputValue,
} from '../../helpers/Helper'
import CaseDebtors from './CaseDebtors'
import CaseClients from './CaseClients'
import CaseLawyers from './CaseLawyers'
import Note from '../Note'
import { completeCaseDetails, saveCase } from '../../services/caseService'
import LoadingAnimation from '../anBrains/animations/LoadingAnimation/LoadingAnimation'
import {
	FaCheck,
	FaCheckCircle,
	FaLongArrowAltLeft,
	FaLongArrowAltRight,
} from 'react-icons/fa'
import Modal from '../anBrains/Modal'
import Printer from '../Printer'
import printer from '../../printer'
import Eight from './numbers/Eight'
import Writ from './Writ'
import Six from './numbers/Six'
import CaseChildren from './CaseChildren'
import Rental from './Rental'
import Eleven from './numbers/Eleven'
import Two from './numbers/Two'

export default function CaseDetails() {
	const { currentCase, setCurrentCase, debtors, setDebtors } =
		useInpoundmentContext()

	const [status, setStatus] = useState(STATUS.NORMAL)
	const [date, setDate] = useState(currentCase.date)
	const [lawyers, setLawyers] = useState(currentCase ? currentCase.lawyers : [])
	const [clients, setClients] = useState(currentCase ? currentCase.clients : [])
	const [executionOffice, setExecutionOffice] = useState(
		currentCase && currentCase.executionOffice
			? currentCase.executionOffice
			: null,
	)

	const [utilsTab, setUtilsTab] = useState(1)

	const [isDetailsBlinking, setIsDetailsBlinking] = useState(
		getCasePartOpacity(currentCase, 'details'),
	)
	const [isClientsBlinking, setIsClientsBlinking] = useState(
		getCasePartOpacity(currentCase, 'clients'),
	)
	const [isLawyersBlinking, setIsLawyersBlinking] = useState(
		getCasePartOpacity(currentCase, 'lawyers'),
	)
	const [isDebtorsBlinking, setIsDebtorsBlinking] = useState(
		getCasePartOpacity(currentCase, 'debtors'),
	)

	useEffect(() => {
		if (currentCase) {
			setIsDetailsBlinking(getCasePartOpacity(currentCase, 'details'))
			setIsClientsBlinking(getCasePartOpacity(currentCase, 'clients'))
			setIsLawyersBlinking(getCasePartOpacity(currentCase, 'lawyers'))
			setIsDebtorsBlinking(getCasePartOpacity(currentCase, 'debtors'))
			if (!currentCase.isClientsCompleted || !currentCase.isLawyersCompleted) {
				setUtilsTab(currentCase.isClientsCompleted ? 2 : 1)
			}
		}
	}, [currentCase])

	const onCaseChange = (property, value) => {
		setCurrentCase({ ...currentCase, [property]: value })
	}

	const saveAndCompleteDetails = async () => {
		if (currentCase.type === '2' && !currentCase.way) {
			return alert('Lütfen takip yolu seçin')
		}
		setStatus(STATUS.LOADING)
		await completeCaseDetails(currentCase.number, {
			date,
			isDetailsCompleted: true,
			way: currentCase.way,
			executionFileNumber: currentCase.executionFileNumber,
		})
			.then(res => {
				setCurrentCase(res.data)
			})
			.catch(e => handleError(e))
		setStatus(STATUS.NORMAL)
	}

	const completeDebtors = async () => {
		if (currentCase.debtorIds.length > 0) {
			setStatus(STATUS.LOADING)
			await saveCase(currentCase.number, {
				isDebtorsCompleted: true,
			})
				.then(res => {
					setCurrentCase(res.data)
				})
				.catch(e => handleError(e))
			setStatus(STATUS.NORMAL)
		} else {
			alert('Lütfen borçlu seçin')
		}
	}

	const completeClients = async () => {
		if (currentCase.clientIds.length > 0) {
			setStatus(STATUS.LOADING)
			await saveCase(currentCase.number, {
				isClientsCompleted: true,
			})
				.then(res => {
					setCurrentCase(res.data)
				})
				.catch(e => handleError(e))
			setStatus(STATUS.NORMAL)
		} else {
			alert('Lütfen müvekkil seçin')
		}
	}

	const completeLawyers = async () => {
		if (currentCase.lawyerIds.length > 0) {
			setStatus(STATUS.LOADING)
			await saveCase(currentCase.number, {
				isLawyersCompleted: true,
			})
				.then(res => setCurrentCase(res.data))
				.catch(e => handleError(e))
			setStatus(STATUS.NORMAL)
		} else {
			alert('Lütfen avukat seçin')
		}
	}

	const completeEnforcementRequest = async () => {
		setStatus(STATUS.LOADING)
		await saveCase(currentCase.number, {
			isEnforcementRequestPaperCreated: true,
		})
			.then(res => setCurrentCase(res.data))
			.catch(e => handleError(e))
		setStatus(STATUS.NORMAL)
	}

	const saveDate = async () => {
		setStatus(STATUS.LOADING)
		await saveCase(currentCase.number, { date })
			.then(res => setCurrentCase(res.data))
			.catch(handleError)
		setStatus(STATUS.NORMAL)
	}

	const onStatusChange = async val => {
		setStatus(STATUS.LOADING)
		await saveCase(currentCase.number, { status: val })
			.then(res => setCurrentCase(res.data))
			.catch(handleError)
		setStatus(STATUS.NORMAL)
	}

	return (
		<div className="case-form__details">
			<LoadingAnimation status={status} />
			<div
				className="case-form__case-details"
				disabled={!getCasePartOpacity(currentCase, 'details')}
			>
				<div>
					<div className="case-util-header">
						<span className="fw-500 orange">
							Detaylar (No: {currentCase.number})
						</span>
						<p className="orange bold  underline">
							{getDayCount(currentCase.date)}. Gün
						</p>
					</div>
				</div>
				{CASE_STATUS_REQUIRE_CANCEL.includes(currentCase.status) && (
					<Button theme="red" classes="w-100 mt-4 bold">
						TAKİBİ KAPAT
					</Button>
				)}
				<div className="flex my-4">
					<div className="mr-4">
						<p className="mb-1 fw-500">Takip Tarihi</p>
						<div>
							<Input
								value={toDateInputValue(new Date(date), 0)}
								onChange={e => setDate(e.target.value)}
								type="date"
							/>
						</div>
						{!checkDatesAreSame(new Date(date), new Date(currentCase.date)) && (
							<Button classes="blue bold mt-4" onClick={saveDate}>
								Kaydet
							</Button>
						)}
					</div>
					<div className="">
						<p className="nowrap mb-1 fw-500">Statü</p>
						<select
							className="input w-100"
							value={currentCase.status}
							onChange={e => onStatusChange(e.target.value)}
						>
							{CASE_STATUS.map(statusOption => {
								return (
									<option key={statusOption} value={statusOption}>
										{statusOption}
									</option>
								)
							})}
						</select>
					</div>
					<div className="ml-4">
						<span className="fw-500">Dosya No</span>
						<Input
							classes="mt-1"
							value={currentCase.executionFileNumber}
							onChange={e =>
								onCaseChange('executionFileNumber', e.target.value)
							}
						/>
					</div>
				</div>
				{currentCase.type === '2' && (
					<div className="column mb-4">
						<span className="fw-500 mb-2">Takip Yolu</span>
						<select
							className="input"
							value={currentCase.way}
							onChange={e => onCaseChange('way', e.target.value)}
						>
							<option value={''} disabled selected={!currentCase.way}>
								Seçiniz
							</option>
							{CASE_WAY['2'].map(way => {
								return (
									<option key={way.value} value={way.value}>
										{way.text}
									</option>
								)
							})}
						</select>
					</div>
				)}
				<ExecutionOffices
					currentCase={currentCase}
					caseExecutionOffice={executionOffice}
					setCaseExecutionOffice={setExecutionOffice}
					onCaseChange={onCaseChange}
				/>
				{!currentCase.isDetailsCompleted && (
					<>
						<Button
							theme="blue"
							classes="w-100 fw-600 mt-4"
							onClick={saveAndCompleteDetails}
						>
							KAYDET
						</Button>
						<Note
							type="zekiye"
							classes="teacher"
							blinking={isDetailsBlinking}
							onMouseOver={() => setIsDetailsBlinking(false)}
						>
							Öncelikle takip detaylarını doldurmanız gerekiyor
						</Note>
					</>
				)}
			</div>
			<div className="w-60">
				{(currentCase.type === '2' ||
					currentCase.type === '3' ||
					currentCase.type === '4' ||
					currentCase.type === '5' ||
					currentCase.type === '6') && <Writ />}
				<div className="flex al-start">
					<div
						className="case-form__case-utils"
						disabled={!getCasePartOpacity(currentCase, 'utils')}
					>
						<div className="flex al-center mb-4">
							<Button
								classes="mr-4 fw-600 fs-nm"
								theme={utilsTab === 1 ? 'orange' : ''}
								onClick={() => setUtilsTab(1)}
								disabled={!getCasePartOpacity(currentCase, 'clients')}
							>
								Müvekkiller
							</Button>
							<Button
								classes="fw-600 fs-nm"
								theme={utilsTab === 2 ? 'orange' : ''}
								onClick={() => setUtilsTab(2)}
								disabled={!getCasePartOpacity(currentCase, 'lawyers')}
							>
								Avukatlar
							</Button>
						</div>
						{utilsTab === 1 && (
							<CaseClients
								clients={clients}
								setClients={setClients}
								currentCase={currentCase}
							/>
						)}
						{utilsTab === 2 && (
							<CaseLawyers
								lawyers={lawyers}
								setLawyers={setLawyers}
								currentCase={currentCase}
							/>
						)}
						{currentCase.isDetailsCompleted &&
							currentCase.isWritDetailsCompleted &&
							(!currentCase.isLawyersCompleted ||
								!currentCase.isClientsCompleted) &&
							!currentCase.isDebtorsCompleted && (
								<>
									<Button
										theme="orange"
										classes="w-100 fw-600 mt-10"
										disabled={
											currentCase.isClientsCompleted
												? currentCase.lawyerIds.length === 0
												: currentCase.clientIds.length === 0
										}
										onClick={
											currentCase.isClientsCompleted
												? completeLawyers
												: completeClients
										}
									>
										KAYDET
										<FaCheck className="ml-2" />
									</Button>
									<Note
										type="zekiye"
										classes="teacher"
										blinking={
											currentCase.isClientsCompleted
												? isLawyersBlinking
												: isClientsBlinking
										}
										onMouseOver={() =>
											currentCase.isClientsCompleted
												? setIsLawyersBlinking(false)
												: setIsClientsBlinking(false)
										}
									>
										{!currentCase.isClientsCompleted
											? 'Bir sonraki aşamaya geçebilmek için dosya müvekkil/lerini  ekleyin'
											: 'Bir sonraki aşamaya geçebilmek için dosya avukat/larını ekleyin'}
										<Button
											classes="mt-4"
											onClick={() =>
												goPreviousStepOfTeacher(
													setStatus,
													currentCase,
													setCurrentCase,
												)
											}
										>
											<FaLongArrowAltLeft className="fs-xsm blue" />
											<span className="fw-500 fs-xsm blue">Önceki Adım</span>
										</Button>
									</Note>
								</>
							)}
					</div>
					<div
						className="case-form__case-utils ml-4"
						disabled={!getCasePartOpacity(currentCase, 'debtors')}
					>
						<CaseDebtors
							currentCase={currentCase}
							debtors={debtors}
							setDebtors={setDebtors}
						/>
						{currentCase.isLawyersCompleted && !currentCase.isDebtorsCompleted && (
							<>
								<Button
									theme="orange"
									classes="w-100 fw-600 mt-10"
									disabled={currentCase.debtorIds.length === 0}
									onClick={completeDebtors}
								>
									KAYDET
									<FaCheck className="ml-2" />
								</Button>
								<Note
									type="zekiye"
									classes="teacher"
									blinking={isDebtorsBlinking}
									onMouseOver={() => setIsDebtorsBlinking(false)}
								>
									Bir sonraki aşamaya geçebilmek için dosya borçlu/larını
									ekleyin
									<Button
										classes="mt-4"
										onClick={() =>
											goPreviousStepOfTeacher(
												setStatus,
												currentCase,
												setCurrentCase,
											)
										}
									>
										<FaLongArrowAltLeft className="fs-xsm blue" />
										<span className="fw-500 fs-xsm blue">Önceki Adım</span>
									</Button>
								</Note>
							</>
						)}
					</div>
				</div>
				{currentCase.type === '3' && <CaseChildren />}
				{currentCase.type === '8' && <Eight debtor={debtors[0]} />}
				{(currentCase.type === '6' || currentCase.type === '9') && (
					<Six debtor={debtors[0]} />
				)}
				{(currentCase.type === '13' || currentCase.type === '14') && <Rental />}
			</div>

			<Modal
				close={() => {}}
				visible={
					(CASE_TYPES_WITHOUT_DUE.includes(currentCase.type)
						? (currentCase.type === '3' && currentCase.isChildrenCompleted) ||
						  (currentCase.type === '14' &&
								currentCase.isRentalDetailsCompleted) ||
						  (currentCase.type === '2' && currentCase.isDebtorsCompleted)
						: currentCase.isDuesCompleted) &&
					!currentCase.isEnforcementRequestPaperCreated
				}
			>
				<div className="form-modal">
					<p className="ta-center">
						<FaCheckCircle
							className="green ta-center"
							style={{ fontSize: '4rem' }}
						/>
					</p>
					<p className="fs-xl green ta-center fw-600 mb-1">Neredeyse Hazırız</p>
					<p className="fs-md ta-center">
						Takibe Başlamak için son 1 adımımız kaldı.
					</p>
					<div className="w-50 mx-auto column al-center">
						<Printer
							onAfterPrint={completeEnforcementRequest}
							caseId={currentCase._id}
							title="Takip Talebi Yazdır"
							type={printer.ENFORCEMENT_REQUEST.value}
							paperDebtors={debtors.filter(d =>
								currentCase.debtorIds.includes(d._id),
							)}
						/>
						<Button
							icon={<FaLongArrowAltRight />}
							iconPosition="right"
							classes="al-center jst-center mt-8 blue fw-500"
							onClick={completeEnforcementRequest}
						>
							Yazdırmadan Devam Et
						</Button>
					</div>
				</div>
			</Modal>
		</div>
	)
}
