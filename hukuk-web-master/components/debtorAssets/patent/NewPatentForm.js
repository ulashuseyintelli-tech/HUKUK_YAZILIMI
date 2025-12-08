import { useContext, useState } from 'react'
import Input from '../../anBrains/Input'
import Modal from '../../anBrains/Modal'
import Button from '../../anBrains/Button'
import { PATENT_TYPES } from '../../../constants'
import { InpoundmentContext } from '../../../pages/takip/CaseInpoundmentDetails'

export default function NewPatentForm({ visible }) {
	const [name, setName] = useState('')
	const [registrationNumber, setRegistrationNumber] = useState('')
	const [type, setType] = useState(PATENT_TYPES.BRAND.value)

	const { assetProps, closeModal } = useContext(InpoundmentContext)
	const { createAsset } = assetProps

	const submitForm = e => {
		e.preventDefault()
		if (
			name &&
			name !== '' &&
			registrationNumber &&
			registrationNumber !== ''
		) {
			createAsset({ name, type, registrationNumber })
			closeModal()
		} else {
			alert('Tüm alanları doldurmanız gerekiyor!')
		}
	}

	return (
		<Modal visible={visible} close={closeModal}>
			<form className="form-modal" onSubmit={submitForm}>
				<p className="bold fs-md mb-4">Yeni Patent Enstitüsü Kaydı</p>
				<label>
					<span className="fw-500">Marka, Patent veya Faydalı Tasarım Adı</span>
					<Input
						value={name}
						placeholder="Adı"
						classes="my-2"
						onChange={e => setName(e.target.value)}
					/>
				</label>
				<label>
					<span className="fw-500">Tescil Numarası</span>
					<Input
						value={registrationNumber}
						placeholder="Tescil no"
						classes="my-2"
						onChange={e => setRegistrationNumber(e.target.value)}
					/>
				</label>
				<label>
					<p className="fw-500">Tipi</p>
					<select
						value={type}
						className="input mt-2"
						type="input"
						onChange={e => setType(e.target.value)}
					>
						{Object.values(PATENT_TYPES).map(val => {
							return (
								<option key={val} value={val.value}>
									{val.text}
								</option>
							)
						})}
					</select>
				</label>
				<Button theme="blue" classes="w-100 mt-4" type="submit">
					Oluştur
				</Button>
			</form>
		</Modal>
	)
}
