import { useState } from 'react'
import Input from '../../anBrains/Input'
import Modal from '../../anBrains/Modal'
import Button from '../../anBrains/Button'
import RestrictionTable from '../../inpoundments/RestrictionTable'
import { createNormalAsset } from '../../../services/normalAssetService'
import useInpoundmentContext from '../../../services/hooks/useInpoundmentContext'
import { handleError } from '../../../helpers/Helper'
import { DEFAULT_RESTRICTION } from '../../../constants'

export default function NewNormalAssetForm({
	visible,
	close,
	add,
	withCreate,
	parentAssetId,
	parentAssetType,
}) {
	const { currentCase, selectedDebtorId, debtors } = useInpoundmentContext()

	const [isLoading, setIsLoading] = useState(false)
	const [name, setName] = useState('')
	const [type, setType] = useState('')
	const [brand, setBrand] = useState('')
	const [size, setSize] = useState('')
	const [color, setColor] = useState('')
	const [appraisalResult, setAppraisalResult] = useState('')
	const [restriction, setRestriction] = useState({ ...DEFAULT_RESTRICTION })

	const submitForm = async e => {
		e.preventDefault()
		setIsLoading(true)
		if (validate() === true) {
			const asset = {
				name,
				brand,
				type,
				color,
				size,
				appraisalResult,
				restriction,
				parentAssetType,
				parentAssetId,
			}
			if (withCreate) {
				await createNormalAsset(
					currentCase._id,
					selectedDebtorId || debtors[0]._id,
					asset,
				)
					.then(res => {
						add(res.data)
						close()
					})
					.catch(handleError)
			} else {
				await add(asset)
				close()
			}
		}
		setIsLoading(false)
	}

	const validate = () => {
		if (name) {
			if (currentCase.type === '8') {
				return true
			} else {
				if (restriction.exist === null) {
					alert('Takyidat olup olmadığını belirtmeniz gerekiyor!')
				} else if (restriction.exist && restriction.table.length === 0) {
					alert('Takyidatları girmeniz gerekiyor!')
				} else {
					return true
				}
			}
		} else {
			alert('Haczedilen mala ait bir ad girmeniz gerekiyor!')
		}
	}

	return (
		<Modal visible={visible} close={close}>
			<form className="de-facto__asset-form " onSubmit={submitForm}>
				<p className="fw-600 mb-4 fs-lg">Yeni Haczedilen Mal</p>
				<div className="flex al-center">
					<div className="w-50 mr-4">
						<span className="fw-500 gray">Adı</span>
						<Input
							containerClasses="w-100"
							classes="mt-2 mb-2 w-100"
							placeholder="Malın adı"
							onChange={e => setName(e.target.value)}
							value={name}
						/>
					</div>
					<div className="w-50 mr-4">
						<span className="fw-500 gray">Cinsi</span>
						<Input
							containerClasses="w-100"
							classes="mt-2 mb-2 "
							placeholder="Malın cinsi"
							onChange={e => setType(e.target.value)}
							value={type}
						/>
					</div>
					<div className="w-50">
						<span className="fw-500 gray">Markası</span>
						<Input
							containerClasses="w-100"
							classes="mt-2 mb-2 "
							placeholder="Malın markası"
							onChange={e => setBrand(e.target.value)}
							value={brand}
						/>
					</div>
				</div>
				<div className="flex al-center mb-4">
					<div className="w-50 mr-4">
						<span className="fw-500 gray">Boyutu</span>
						<Input
							containerClasses="w-100"
							classes="mt-2 mb-2 "
							placeholder="Malın boyutu"
							onChange={e => setSize(e.target.value)}
							value={size}
						/>
					</div>
					<div className="w-50">
						<span className="fw-500 gray">Kıymet Takdiri</span>
						<Input
							containerClasses="w-100"
							classes="mt-2 mb-2 w-100"
							placeholder="Mala ait kıymet takdiri"
							onChange={e => setAppraisalResult(e.target.value)}
							value={appraisalResult}
						/>
					</div>
				</div>
				<div className="step-item-divider"></div>
				<RestrictionTable
					customAsset={{ restriction }}
					customUpdate={(field, val) =>
						setRestriction({ ...restriction, [field]: val })
					}
					customCheckTaskIncludes={() => {}}
				/>

				<Button theme="blue" classes="w-100 mt-8 bold fs-nm" type="submit">
					EKLE
				</Button>
			</form>
		</Modal>
	)
}
