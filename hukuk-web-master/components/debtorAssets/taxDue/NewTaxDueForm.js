import { useContext, useState } from 'react'
import Input from '../../anBrains/Input'
import Modal from '../../anBrains/Modal'
import Button from '../../anBrains/Button'
import TaxOfficeSelect from '../../select/TaxOfficeSelect'
import useInpoundmentContext from '../../../services/hooks/useInpoundmentContext'

export default function NewTaxDueForm({ visible }) {
	const [dueAmount, setDueAmount] = useState(0)
	const [taxOfficeId, setTaxOfficeId] = useState(null)

	const { assetProps, closeModal } = useInpoundmentContext()
	const { createAsset } = assetProps

	const submitForm = () => {
		if (!taxOfficeId) {
			alert(
				'Lütfen bir Vergi Dairesi seçin veya yeni bir Vergi Dairesi oluşturun',
			)
		} else if (!dueAmount) {
			alert('Lütfen Vergi Alacağı Tutarını doğru girin')
		} else {
			createAsset({ dueAmount, taxOfficeId })
			closeModal()
		}
	}

	return (
		<Modal visible={visible} close={closeModal}>
			<div className="form-modal">
				<p className="bold fs-md mb-4">Yeni Vergi Alacağı</p>
				<div className="flex mb-2">
					<label className="mr-8">
						<p className="fw-600 dark-blue mb-4">Vergi Dairesi</p>
						<TaxOfficeSelect
							selectedId={taxOfficeId}
							setSelectedId={setTaxOfficeId}
						/>
					</label>
					<label>
						<span className="fw-600 dark-blue">Vergi Alacağı Miktarı</span>
						<Input
							value={dueAmount}
							placeholder="Miktar"
							classes="mt-4"
							onChange={e => setDueAmount(e.target.value)}
						/>
					</label>
				</div>
				<Button
					theme="blue"
					classes="mt-4 bold"
					type="submit"
					onClick={submitForm}
				>
					Oluştur
				</Button>
			</div>
		</Modal>
	)
}
