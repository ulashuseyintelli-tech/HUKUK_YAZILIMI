import React, { useContext, useState } from 'react'
import { InpoundmentContext } from '../../../pages/takip/CaseInpoundmentDetails'
import Button from '../../anBrains/Button'
import Modal from '../../anBrains/Modal'
import CustomsOfficeSelect from '../../select/CustomsOfficeSelect'

export default function NewCustomsDueForm({ visible }) {
	const { assetProps, closeModal } = useContext(InpoundmentContext)
	const { createAsset } = assetProps

	const [customsOfficeId, setCustomsOfficeId] = useState(null)

	const submit = () => {
		if (customsOfficeId) {
			createAsset({ customsOfficeId })
		} else {
			alert(
				'Lütfen bir Gümrük Müdürlüğü seçin veya yeni bir Gümrük Müdürlüğü oluşturun',
			)
		}
	}

	return (
		<Modal visible={visible} close={closeModal}>
			<div className="form-modal">
				<p className="bold fs-md mb-4">Yeni Gümrük Alacağı</p>
				<div className="flex mb-2">
					<label className="mr-8">
						<p className="fw-600 dark-blue mb-4">Gümrük Müdürlüğü</p>
						<CustomsOfficeSelect
							selectedId={customsOfficeId}
							setSelectedId={setCustomsOfficeId}
						/>
					</label>
				</div>
				<Button theme="blue" classes="mt-4 bold" type="submit" onClick={submit}>
					Oluştur
				</Button>
			</div>
		</Modal>
	)
}
