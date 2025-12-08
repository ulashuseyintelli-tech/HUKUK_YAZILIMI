import React, { useEffect, useState } from 'react'
import { FaLongArrowAltRight } from 'react-icons/fa'
import { STATUS } from '../../constants'
import { handleError, toDateInputValue } from '../../helpers/Helper'
import {
	completeCaseClients,
	completeCaseDebtors,
	completeCaseDetails,
	completeCaseDues,
	completeCaseExecutionOffice,
} from '../../services/caseService'
import { useAppContext } from '../../services/hooks/useAppContext'
import useInpoundmentContext from '../../services/hooks/useInpoundmentContext'
import { changeUserCaseInitializationNoteVisibility } from '../../services/userService'
import LoadingAnimation from '../anBrains/animations/LoadingAnimation/LoadingAnimation'
import Button from '../anBrains/Button'
import CheckBox from '../anBrains/CheckBox'
import Input from '../anBrains/Input'
import InpoundmentStepper from '../inpoundments/InpoundmentStepper'
import Note from '../Note'
import CaseClients from './CaseClients'
import CaseDebtors from './CaseDebtors'
import CaseDues from './CaseDues'
import ExecutionOffices from './ExecutionOffices'

export default function CaseDetailsForm() {
	const { user, setUser } = useAppContext()
	const [status, setStatus] = useState(STATUS.NORMAL)
	const [currentStep, setCurrentStep] = useState(
		user.isCaseInitializationNoteVisible ? null : 1,
	)
	const { currentCase, setCurrentCase } = useInpoundmentContext()

	const stepsStatus = {
		STEP1: currentCase.isDetailsCompleted,
		STEP3: currentCase.isClientsCompleted,
		STEP4: currentCase.isDebtorsCompleted,
		STEP5: currentCase.isDuesCompleted,
	}

	useEffect(() => {
		if (stepsStatus.STEP1) {
			if (stepsStatus.STEP2) {
				if (stepsStatus.STEP3) {
					if (stepsStatus.STEP4) {
						setCurrentStep(5)
					} else setCurrentStep(4)
				} else setCurrentStep(3)
			} else setCurrentStep(2)
		} else setCurrentStep(user.isCaseInitializationNoteVisible ? null : 1)
	}, [])

	const [date, setDate] = useState(currentCase.date)
	const [executionFileNumber, setExecutionFileNumber] = useState(
		currentCase.executionFileNumber,
	)

	const [caseExecutionOffice, setCaseExecutionOffice] = useState(null)
	const [executionOfficeId, setExecutionOfficeId] = useState(
		currentCase.executionOfficeId,
	)

	const [caseClients, setCaseClients] = useState([])
	const [caseDebtors, setCaseDebtors] = useState([])
	const [caseDues, setCaseDues] = useState([])

	useEffect(() => {}, [caseClients])

	const [isDontShowAgainChecked, setIsDontShowAgainChecked] = useState(false)

	const save = async () => {
		setStatus(STATUS.LOADING)
		if (currentStep === 1) {
			await completeCaseDetails(currentCase.number, {
				date,
				executionFileNumber,
			})
				.then(res => {
					setCurrentCase({
						...currentCase,
						date: res.data.date,
						executionFileNumber: res.data.executionFileNumber,
						isDetailsCompleted: true,
					})
					setCurrentStep(2)
				})
				.catch(e => handleError(e))
		} else if (currentStep === 2) {
			await completeCaseExecutionOffice(currentCase.number, executionOfficeId)
				.then(res => {
					setCurrentCase({
						...currentCase,
						executionOfficeId: res.data.executionOfficeId,
						isExecutionOfficeCompleted: true,
					})
					setCurrentStep(3)
				})
				.catch(e => handleError(e))
		} else if (currentStep === 3) {
			await completeCaseClients(
				currentCase.number,
				caseClients.map(c => c._id),
			)
				.then(res => {
					setCurrentCase({
						...currentCase,
						clientIds: res.data.clientIds,
						isClientsCompleted: true,
					})
					setCurrentStep(4)
				})
				.catch(e => handleError(e))
		} else if (currentStep === 4) {
			await completeCaseDebtors(currentCase.number)
				.then(res => {
					setCurrentCase({
						...currentCase,
						debtorIds: res.data.debtorIds,
						isDebtorsCompleted: true,
					})
					setCurrentStep(5)
				})
				.catch(e => handleError(e))
		} else if (currentStep === 5) {
			await completeCaseDues(
				currentCase.number,
				caseDues.map(d => d._id),
			)
				.then(res => {
					setCurrentCase({
						...currentCase,
						dueIds: res.data.dueIds,
						isDuesCompleted: true,
					})
				})
				.catch(e => handleError(e))
		}
		setStatus(STATUS.NORMAL)
	}

	const handleButtonDisableState = () => {
		switch (currentStep) {
			case 1:
				return !date || !executionFileNumber || !executionOfficeId
			case 2:
				return caseClients.length === 0
			case 3:
				return caseDebtors.length === 0
			case 4:
				return caseDues.length === 0
		}
	}

	const startNow = async () => {
		if (isDontShowAgainChecked) {
			await dontShowAgain()
		}
		setCurrentStep(1)
	}

	const dontShowAgain = async () => {
		setStatus(STATUS.LOADING)
		await changeUserCaseInitializationNoteVisibility(false)
			.then(() => {
				setUser({ ...user, isCaseInitializationNoteVisible: false })
			})
			.catch(e => alert('Hata'))
		setStatus(STATUS.NORMAL)
	}

	return (
		<div className="task-desk">
			<LoadingAnimation status={status} />
			{currentStep === null ? (
				<div className="task-desk__welcome">
					<div className="fit-bg"></div>
					<p className="orange fs-xl mt-2 mb-4 fw-600">Selam ben Zekiye,</p>
					<p>
						Tüm takip aşamalarında senin yanında olacağım. Verdiğim görevler
						sayesinde başarılı bir takip gerçekleştirmiş olacaksın. Eğer
						hazırsan başlayalım.
					</p>
					<button className="btn-zekiye" onClick={startNow}>
						HEMEN BAŞLA
					</button>
					<CheckBox
						onChange={setIsDontShowAgainChecked}
						checked={isDontShowAgainChecked}
						classes="mt-4"
					>
						Bir daha gösterme
					</CheckBox>
				</div>
			) : (
				<div className="w-100">
					<Note type="zekiye" classes="mb-10">
						Aşağıdaki 5 aşamayı tamamladıktan sonra ilk görevlerinizi
						alacaksınız.
					</Note>
					<InpoundmentStepper
						customCurrentStep={currentStep}
						setCustomCurrentStep={setCurrentStep}
						customStepsStatus={stepsStatus}
						assetType="CASE_DETAILS"
					/>
				</div>
			)}
			{currentStep === 1 && (
				<div className="task-desk__form">
					<ExecutionOffices
						caseExecutionOffice={caseExecutionOffice}
						setCaseExecutionOffice={setCaseExecutionOffice}
						currentCase={currentCase}
						onCaseChange={(prop, val) => setExecutionOfficeId(val)}
						cancelUpdate
					/>
					<p className="mt-4 mb-2 fw-500">Takip Tarihi</p>
					<Input
						type="date"
						value={toDateInputValue(new Date(date), 0)}
						onChange={e => setDate(e.target.value)}
					/>
					<div className="my-4"></div>
					<span className="fw-500">İcra Dosya No</span>
					<Input
						classes="mt-2"
						value={executionFileNumber}
						onChange={e => setExecutionFileNumber(e.target.value)}
					/>
				</div>
			)}
			{currentStep === 2 && (
				<div className="task-desk__form  p-8 br">
					<CaseClients
						clients={caseClients}
						setClients={setCaseClients}
						currentCase={currentCase}
					/>
				</div>
			)}
			{currentStep === 3 && (
				<div className="task-desk__form  p-8 br">
					<CaseDebtors
						debtors={caseDebtors}
						setDebtors={setCaseDebtors}
						currentCase={currentCase}
					/>
				</div>
			)}
			{currentStep === 4 && (
				<div className="task-desk__form  p-8 br">
					<CaseDues
						dues={caseDues}
						setDues={setCaseDues}
						currentCase={currentCase}
					/>
				</div>
			)}
			{currentStep !== null && (
				<div className="w-100" disabled={handleButtonDisableState()}>
					<Button
						theme="blue"
						classes="fw-600 mt-8 py-3 mx-auto"
						onClick={save}
					>
						KAYDET VE DEVAM ET <FaLongArrowAltRight className="ml-2" />
					</Button>
				</div>
			)}
		</div>
	)
}
