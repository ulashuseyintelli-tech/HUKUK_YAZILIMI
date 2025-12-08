import React, { useContext, useEffect, useState } from 'react'
import Modal from '../../anBrains/Modal'
import Input from '../../anBrains/Input'
import ThirdPersonList from '../../ThirdPersonList'
import Button from '../../anBrains/Button'
import { InpoundmentContext } from '../../../pages/takip/CaseInpoundmentDetails'
import { STATUS } from '../../../constants'
import { getExecutionOffices } from '../../../services/executionOfficeService'
import { handleError, validateNonZeroInteger } from '../../../helpers/Helper'
import LoadingCircle from '../../anBrains/animations/LoadingCircle'
import LoadingAnimation from '../../anBrains/animations/LoadingAnimation/LoadingAnimation'
import ExecutionOfficeSelect from '../../select/ExecutionOfficeSelect'

export default function NewCreditorCaseForm({ visible }) {
	const [status, setStatus] = useState(STATUS.LOADING)

	const [executionOfficeId, setExecutionOfficeId] = useState(null)
	const [executionFileNumber, setExecutionFileNumber] = useState(null)
	const [dueAmount, setDueAmount] = useState('')
	const [thirdPersonId, setThirdPersonId] = useState(null)
	const [executionOffices, setExecutionOffices] = useState([])

	const [isSubmitting, setIsSubmitting] = useState(false)

	const { assetProps, closeModal } = useContext(InpoundmentContext)
	const { createAsset } = assetProps

	useEffect(() => {
		load()
	}, [])

	const load = async () => {
		await getExecutionOffices()
			.then(res => {
				setExecutionOffices(res.data)
				setExecutionOfficeId(res.data[0]._id)
			})
			.catch(e => handleError(e))
		setStatus(STATUS.NORMAL)
	}

	const submitForm = async e => {
		e.preventDefault()
		setIsSubmitting(true)
		if (
			thirdPersonId &&
			executionFileNumber &&
			executionOfficeId &&
			validateNonZeroInteger(dueAmount)
		) {
			await createAsset({
				dueAmount,
				thirdPersonId,
				executionFileNumber,
				executionOfficeId,
			})
			closeModal()
		} else {
			alert('Lütfen tüm alanları doldurun ve doğru girdiğinizden emin olun.')
			setIsSubmitting(false)
		}
	}

	return (
		<Modal visible={visible} close={closeModal}>
			<LoadingAnimation loading={isSubmitting} />
			{status === STATUS.LOADING ? (
				<LoadingCircle />
			) : (
				<form className="form-modal" onSubmit={submitForm}>
					<p className="bold fs-md mb-4">Yeni Alacaklı Olduğu Dosya Kaydı</p>
					<div className="flex al-center mb-4">
						<label className="w-50 mr-4">
							<span className="mb-2 fw-500">İcra Dairesi</span>
							<ExecutionOfficeSelect
								selectedId={executionOfficeId}
								setSelectedId={setExecutionOfficeId}
								offices={executionOffices}
								setOffices={setExecutionOffices}
							/>
						</label>
						<label className="w-50 ">
							<span className="mb-2 fw-500">Dosya Numarası</span>
							<Input
								placeholder="xxx/xxx"
								value={executionFileNumber}
								classes="mt-2"
								onChange={e => setExecutionFileNumber(e.target.value)}
							/>
						</label>
					</div>
					<label>
						<span className="mb-2 fw-500">Alacak Miktarı</span>
						<Input
							placeholder="Türk Lirası"
							value={dueAmount}
							classes="mt-2"
							onChange={e => setDueAmount(e.target.value)}
						/>
					</label>
					<p className="fw-500 mt-4 mb-2">Borçlunun Alacaklı Olduğu 3.Şahıs</p>
					<ThirdPersonList
						thirdPersonId={thirdPersonId}
						setId={setThirdPersonId}
					/>
					<Button theme="blue" classes="w-100 mt-8 bold" type="submit">
						OLUŞTUR
					</Button>
				</form>
			)}
		</Modal>
	)
}
