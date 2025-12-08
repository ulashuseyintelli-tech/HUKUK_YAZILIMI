import { useContext, useState } from 'react'
import Input from '../../anBrains/Input'
import Modal from '../../anBrains/Modal'
import Button from '../../anBrains/Button'
import { toDateInputValue } from '../../../helpers/Helper'
import CompanyList from '../../CompanyList'
import { InpoundmentContext } from '../../../pages/takip/CaseInpoundmentDetails'
import ThirdPersonList from '../../ThirdPersonList'
import { DEBTOR_TYPES, THIRD_PERSON_REASONS } from '../../../constants'

const NewSsiForm = ({ visible }) => {
	const [registrationDate, setRegistrationDate] = useState(toDateInputValue())
	const [companyId, setCompanyId] = useState(null)

	const { assetProps, closeModal } = useContext(InpoundmentContext)
	const { createAsset } = assetProps

	const submitForm = e => {
		e.preventDefault()
		if (companyId) {
			createAsset({ registrationDate, companyId })
			closeModal()
		} else {
			alert('Lütfen bir şirket girin.')
		}
	}

	return (
		<Modal visible={visible} close={closeModal}>
			<form className="form-modal" onSubmit={submitForm}>
				<p className="bold fs-md mb-4">Yeni Sigorta Kaydı</p>
				<label>
					<span className="mb-2 fw-500">Son Sigorta Aktif Olma Tarihi</span>
					<Input
						value={registrationDate}
						classes="mt-2"
						type="date"
						onChange={e => setRegistrationDate(e.target.value)}
					/>
				</label>
				<p className="fw-500 mt-4 mb-2">Borçlunun Çalıştığı Şirket (İşyeri)</p>
				<ThirdPersonList
					thirdPersonId={companyId}
					setId={setCompanyId}
					type={DEBTOR_TYPES.INSTITUTION}
					thirdPersonReason={THIRD_PERSON_REASONS.SSI.value}
				/>
				<Button theme="blue" classes="w-100 mt-8" type="submit">
					Oluştur
				</Button>
			</form>
		</Modal>
	)
}

export default NewSsiForm
