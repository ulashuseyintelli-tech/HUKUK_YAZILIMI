import { useState, useEffect } from 'react'
import { STATUS } from '../../constants'
import LoadingAnimation from '../anBrains/animations/LoadingAnimation/LoadingAnimation'
import { getExecutionOffices } from '../../services/executionOfficeService'
import Button from '../anBrains/Button'
import Modal from '../anBrains/Modal'
import { FaPlus, FaPen } from 'react-icons/fa'
import NewExecutionOfficeForm from '../forms/NewExecutionOfficeForm'
import { updateCasePropertyByNumber } from '../../services/caseService'
import { handleError } from '../../helpers/Helper'
import Note from '../Note'

export default function ExecutionOffices({
	caseExecutionOffice,
	setCaseExecutionOffice,
	currentCase,
	onCaseChange,
	cancelUpdate,
}) {
	const [status, setStatus] = useState(STATUS.LOADING)
	const [isEditing, setIsEditing] = useState(false)
	const [isFormOpen, setIsFormOpen] = useState(false)
	const [offices, setOffices] = useState([])

	const [isNoteBlinking, setIsNoteBlinking] = useState(
		!currentCase.isDetailsCompleted,
	)

	useEffect(() => {
		getAll()
	}, [currentCase])

	const getAll = async () => {
		await getExecutionOffices()
			.then(res => {
				setOffices(res.data)
				setCaseExecutionOffice(
					res.data.filter(
						office => office._id === currentCase.executionOfficeId,
					)[0],
				)
			})
			.catch(e => alert('Hata'))
		setStatus(STATUS.NORMAL)
	}

	const handleClickItem = async item => {
		setStatus(STATUS.LOADING)
		const index = offices.findIndex(office => office._id === item._id)
		const officeId = caseExecutionOffice
			? caseExecutionOffice._id === item._id
				? null
				: item._id
			: item._id
		if (cancelUpdate) {
			setCaseExecutionOffice(
				(caseExecutionOffice && caseExecutionOffice._id) === item._id
					? null
					: item,
			)
			onCaseChange('executionOfficeId', officeId)
		} else {
			await updateCasePropertyByNumber(
				currentCase.number,
				'executionOfficeId',
				officeId,
			)
				.then(() => {
					setCaseExecutionOffice(
						(caseExecutionOffice && caseExecutionOffice._id) === item._id
							? null
							: item,
					)
					onCaseChange('executionOfficeId', officeId)
				})
				.catch(handleError)
		}
		setIsEditing(false)
		setStatus(STATUS.NORMAL)
	}

	return (
		<div className="column al-start case-execution-offices">
			<LoadingAnimation status={status} />
			{!currentCase.isDetailsCompleted && (
				<Note
					type="zekiye"
					blinking={isNoteBlinking}
					onMouseOver={() => setIsNoteBlinking(false)}
				>
					Herhangi bir icra dairesi ile çalışmıyorsanız icra dairesi ve dosya
					numarası seçmeden devam edebilirsiniz
				</Note>
			)}
			<div className="flex al-center jst-between w-100">
				<span className="fw-500">İcra Dairesi</span>
			</div>
			<div className="input p-2 w-100 mt-2 flex al-center jst-between fs-sm">
				{caseExecutionOffice ? (
					<div className="flex al-center ">
						<p className="fw-500 mr-2">
							{caseExecutionOffice.city} {caseExecutionOffice.name}
						</p>
					</div>
				) : (
					<p>Henüz İcra Dairesi seçilmemiş.</p>
				)}
				<Button theme="blue" classes="p-2" onClick={() => setIsEditing(true)}>
					<FaPen className="white fs-xsm" />
				</Button>
			</div>
			{isFormOpen && (
				<NewExecutionOfficeForm
					close={() => setIsFormOpen(false)}
					offices={offices}
					setOffices={setOffices}
				/>
			)}
			{isEditing && !isFormOpen && (
				<Modal visible close={() => setIsEditing(false)}>
					<LoadingAnimation status={status} />
					<div className="form-modal">
						<div className="flex al-center jst-between mb-6">
							<p className="bold">İcra Daireleri</p>
							<Button theme="green" onClick={() => setIsFormOpen(true)}>
								<FaPlus className="mr-2 fs-xsm" />
								<span className="fw-500">Yeni İcra Dairesi</span>
							</Button>
						</div>
						{offices.map(office => {
							return (
								<Button
									key={office._id}
									theme={
										caseExecutionOffice &&
										caseExecutionOffice._id === office._id
											? 'blue'
											: 'basic'
									}
									classes="fs-nm mb-4 w-100"
									onClick={() => handleClickItem(office)}
								>
									<p className="fw-500 mr-2">{office.name}</p>
									<p className="mr-2">{office.city}</p>
									<p className="mr-2">{office.district}</p>
									<p className="mr-2">{office.bankName}</p>
									<p className="">{office.IBAN}</p>
								</Button>
							)
						})}
					</div>
				</Modal>
			)}
		</div>
	)
}
