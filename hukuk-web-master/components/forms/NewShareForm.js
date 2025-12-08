import { useContext, useState } from 'react'
import Input from '../anBrains/Input'
import Modal from '../anBrains/Modal'
import Button from '../anBrains/Button'
import { InpoundmentContext } from '../../pages/takip/CaseInpoundmentDetails'
import { handleError } from '../../helpers/Helper'
import ThirdPersonList from '../ThirdPersonList'
import { DEBTOR_TYPES, THIRD_PERSON_REASONS } from '../../constants'

export default function NewShareForm({ visible }) {
	const [companyId, setCompanyId] = useState(null)
	const [sharePercentage, setSharePercentage] = useState(0)

	const { assetProps, closeModal } = useContext(InpoundmentContext)
	const { createAsset } = assetProps

	const submitForm = e => {
		e.preventDefault()
		if (validate() === true) {
			createAsset({ sharePercentage, companyId })
			closeModal()
		}
	}

	const validate = () => {
		if (companyId) {
			if (
				sharePercentage &&
				!isNaN(parseInt(sharePercentage)) &&
				parseInt(sharePercentage) > 0 &&
				parseInt(sharePercentage) <= 100
			) {
				return true
			} else {
				handleError(
					null,
					'Lütfen geçerli bir hisse oranı girin. Yalnızca sayı bulunabilir ve en az 1 en fazla 100 olabilir.',
				)
			}
		} else {
			handleError(null, 'Lütfen bir şirket seçin veya yeni bir şirket ekleyin.')
		}
	}

	return (
		<Modal visible={visible} close={closeModal}>
			<div className="form-modal">
				<p className="bold fs-md mb-4">Yeni Hisse Haciz Sonucu</p>
				<div className="flex">
					<div className="w-50 mr-4">
						<p className="mb-4 fw-600 gray">
							Borçlunun Hissesinin Bulunduğu Şirket
						</p>
						<ThirdPersonList
							selectBoxText={'Şirket seç'}
							thirdPersonId={companyId}
							setId={setCompanyId}
							type={DEBTOR_TYPES.INSTITUTION}
							thirdPersonReason={THIRD_PERSON_REASONS.SHARE.value}
						/>
					</div>
					<div className="w-50">
						<p className="fw-600 gray">Hisse Oranı (%)</p>
						<Input
							value={sharePercentage}
							placeholder="Oran"
							classes="mt-2"
							onChange={e => setSharePercentage(e.target.value)}
						/>
					</div>
				</div>
				<Button theme="blue" classes="w-100 mt-8 bold " onClick={submitForm}>
					OLUŞTUR
				</Button>
			</div>
		</Modal>
	)
}
