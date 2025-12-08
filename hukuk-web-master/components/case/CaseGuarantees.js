import Button from '../anBrains/Button'
import {
	FaPen,
	FaPlus,
	FaLongArrowAltLeft,
	FaLongArrowAltRight,
} from 'react-icons/fa'
import { useState, useEffect } from 'react'
import Modal from '../anBrains/Modal'
import { GUARANTEE_DETAILS, STATUS } from '../../constants'
import LoadingAnimation from '../anBrains/animations/LoadingAnimation/LoadingAnimation'
import Note from '../Note'
import { getGuaranteesByCaseId } from '../../services/guaranteeService'
import Guarantee from '../Guarantee'

export default function CaseGuarantees({ currentCase }) {
	const [status, setStatus] = useState(STATUS.NORMAL)
	const [guarantees, setGuarantees] = useState([])
	const [isEditing, setIsEditing] = useState(false)
	const [isFormOpen, setIsFormOpen] = useState(false)
	const [selectedGuaranteeIndex, setSelectedGuaranteeIndex] = useState(null)

	useEffect(() => {
		getAll()
	}, [])

	const getAll = async () => {
		setStatus(STATUS.LOADING)
		await getGuaranteesByCaseId(currentCase._id)
			.then(res => {
				setGuarantees(res.data)
			})
			.catch(e => alert('Hata'))
		setStatus(STATUS.NORMAL)
	}

	const createNew = async () => {
		guarantees.push({ ...GUARANTEE_DETAILS })
		setSelectedGuaranteeIndex(guarantees.length - 1)
	}

	const setGuarantee = guarantee => {
		guarantees[selectedGuaranteeIndex] = guarantee
		setGuarantees([...guarantees])
	}

	return (
		<div className="case-form__payments case-form__guarantees">
			<LoadingAnimation status={status} />
			<div className="case-util-header">
				<span>Kefiller</span>
				<Button onClick={() => setIsEditing(true)}>
					<FaPen />
				</Button>
			</div>
			<div>
				{guarantees.map((guarantee, index) => {
					return (
						<p
							key={guarantee._id}
							className={`${
								index === 0
									? 'mt-2 mb-2'
									: index === guarantees.length - 1
									? 'mb-2'
									: ''
							}`}
						>
							<div className="flex al-center">
								<p className="fs-sm">
									{guarantee.amount}
									{guarantee.currency}₺ tutarında kefil
								</p>
								{!guarantee._id && (
									<div className="badge fs-xsm ml-2">TASLAK</div>
								)}
							</div>
						</p>
					)
				})}
				{guarantees.length === 0 && (
					<Note>Bu dosyaya henüz kefil eklenmemiş.</Note>
				)}
			</div>
			<Modal
				visible={isEditing || isFormOpen}
				close={() => {
					setIsEditing(false)
					setIsFormOpen(false)
				}}
			>
				{selectedGuaranteeIndex !== null ? (
					<div className="case-form__modal p-10">
						<div className="flex al-center">
							<Button onClick={() => setSelectedGuaranteeIndex(null)}>
								<FaLongArrowAltLeft className="fs-lg" />
							</Button>
							<p className="fs-lg bold ml-4">Kefil</p>
							{guarantees[selectedGuaranteeIndex] &&
								!guarantees[selectedGuaranteeIndex]._id && (
									<div className="badge ml-4 fs-xsm">TASLAK</div>
								)}
						</div>
						<Guarantee
							guarantee={guarantees[selectedGuaranteeIndex]}
							setGuarantee={setGuarantee}
							caseId={currentCase._id}
						/>
					</div>
				) : (
					<div className="case-form__modal">
						<div className="flex al-center jst-between mb-6">
							<p className="bold">Kefiller</p>
							<Button theme="green" onClick={createNew}>
								<FaPlus className="mr-2 fs-xsm" />
								<span className="fw-500">Yeni Kefil</span>
							</Button>
						</div>
						{guarantees.map((item, index) => {
							return (
								<Button
									key={item._id}
									classes="case-form__modal__lawyer jst-between"
									onClick={() => setSelectedGuaranteeIndex(index)}
								>
									<div className="flex al-center">
										<p className="fw-500">
											{item.amount}
											{item.currency}₺ tutarında kefillik
										</p>
										{!item._id && (
											<div className="badge fs-xsm ml-2">TASLAK</div>
										)}
									</div>
									<FaLongArrowAltRight className="fs-nm" />
								</Button>
							)
						})}
						{guarantees.length === 0 && (
							<Note classes="my-4">Bu dosyaya henüz kefil eklenmemiş.</Note>
						)}
						<Button
							theme="blue"
							classes="w-100"
							onClick={() => setIsEditing(false)}
						>
							<span className="fw-500">Tamamla</span>
						</Button>
					</div>
				)}
			</Modal>
		</div>
	)
}
