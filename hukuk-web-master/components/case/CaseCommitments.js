import Button from '../anBrains/Button'
import {
	FaPen,
	FaPlus,
	FaLongArrowAltLeft,
	FaLongArrowAltRight,
} from 'react-icons/fa'
import { useState, useEffect } from 'react'
import Modal from '../anBrains/Modal'
import { COMMITMENT_DETAILS, STATUS } from '../../constants'
import LoadingAnimation from '../anBrains/animations/LoadingAnimation/LoadingAnimation'
import {
	createCommitment,
	getCommitmentsByCaseId,
} from '../../services/commitmentService'
import { handleError } from '../../helpers/Helper'
import Commitment from '../Commitment'
import Note from '../Note'

export default function CaseCommitments({ currentCase }) {
	const [status, setStatus] = useState(STATUS.NORMAL)
	const [commitments, setCommitments] = useState([])
	const [isEditing, setIsEditing] = useState(false)
	const [isFormOpen, setIsFormOpen] = useState(false)
	const [selectedCommitmentIndex, setSelectedCommitmentIndex] = useState(null)

	useEffect(() => {
		getAll()
	}, [])

	const getAll = async () => {
		setStatus(STATUS.LOADING)
		await getCommitmentsByCaseId(currentCase._id)
			.then(res => {
				setCommitments(res.data)
			})
			.catch(e => alert('Hata'))
		setStatus(STATUS.NORMAL)
	}

	const createNew = async () => {
		commitments.push({ ...COMMITMENT_DETAILS })
		setSelectedCommitmentIndex(commitments.length - 1)
	}

	const setCommitment = commitment => {
		commitments[selectedCommitmentIndex] = commitment
		setCommitments([...commitments])
	}

	return (
		<div className="case-form__dues case-form__commitments">
			<LoadingAnimation status={status} />
			<div className="case-util-header">
				<span>Taahhütler</span>
				<Button onClick={() => setIsEditing(true)}>
					<FaPen />
				</Button>
			</div>
			<div>
				{commitments.map((commitment, index) => {
					return (
						<p
							key={commitment._id}
							className={`${
								index === 0
									? 'mt-2 mb-2'
									: index === commitments.length - 1
									? 'mb-2'
									: ''
							}`}
						>
							<div className="flex al-center">
								<p className="fs-sm">
									{commitment.totalAmount}
									{commitment.currency}₺ tutarında taahhüt
								</p>
								{!commitment._id && (
									<div className="badge fs-xsm ml-2">TASLAK</div>
								)}
							</div>
						</p>
					)
				})}
				{commitments.length === 0 && (
					<Note>Bu dosyaya henüz taahhüt eklenmemiş.</Note>
				)}
			</div>
			<Modal
				visible={isEditing || isFormOpen}
				close={() => {
					setIsEditing(false)
					setIsFormOpen(false)
				}}
			>
				{selectedCommitmentIndex !== null ? (
					<div className="case-form__modal p-10">
						<div className="flex al-center">
							<Button onClick={() => setSelectedCommitmentIndex(null)}>
								<FaLongArrowAltLeft className="fs-lg" />
							</Button>
							<p className="fs-lg bold ml-4">Taahhüt</p>
							{commitments[selectedCommitmentIndex] &&
								!commitments[selectedCommitmentIndex]._id && (
									<div className="badge ml-4 fs-xsm">TASLAK</div>
								)}
						</div>
						<Commitment
							commitment={commitments[selectedCommitmentIndex]}
							setCommitment={setCommitment}
							caseId={currentCase._id}
							currentCase={currentCase}
						/>
					</div>
				) : (
					<div className="case-form__modal">
						<div className="flex al-center jst-between mb-6">
							<p className="bold">Taahhütler</p>
							<Button theme="green" onClick={createNew}>
								<FaPlus className="mr-2 fs-xsm" />
								<span className="fw-500">Yeni Taahhüt</span>
							</Button>
						</div>
						{commitments.map((item, index) => {
							return (
								<Button
									key={item._id}
									classes="case-form__modal__lawyer jst-between"
									onClick={() => setSelectedCommitmentIndex(index)}
								>
									<div className="flex al-center">
										<p className="fw-500">
											{item.totalAmount}
											{item.currency}₺ tutarında taahhüt
										</p>
										{!item._id && (
											<div className="badge fs-xsm ml-2">TASLAK</div>
										)}
									</div>
									<FaLongArrowAltRight className="fs-nm" />
								</Button>
							)
						})}
						{commitments.length === 0 && (
							<Note classes="my-4">Bu dosyaya henüz taahhüt eklenmemiş.</Note>
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
