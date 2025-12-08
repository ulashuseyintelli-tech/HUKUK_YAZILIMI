import { useContext, useState } from 'react'
import Input from '../../anBrains/Input'
import Modal from '../../anBrains/Modal'
import Button from '../../anBrains/Button'
import { InpoundmentContext } from '../../../pages/takip/CaseInpoundmentDetails'

export default function NewVehicleForm({ visible, add, close }) {
	const [licenseNumber, setLicenseNumber] = useState('')
	const [brand, setBrand] = useState('')
	const [model, setModel] = useState('')
	const [ownershipDate, setOwnershipDate] = useState('')
	const [kind, setKind] = useState('')
	const [type, setType] = useState('')
	const [color, setColor] = useState('')
	const [intendedUse, setIntendedUse] = useState('')
	const [motorNumber, setMotorNumber] = useState('')
	const [chassisNumber, setChassisNumber] = useState('')

	let { assetProps, closeModal } = useContext(InpoundmentContext)
	closeModal = close || closeModal
	const createAsset = add || assetProps.createAsset

	const submitForm = e => {
		e.preventDefault()
		createAsset({
			licenseNumber,
			brand,
			model,
			ownershipDate,
			kind,
			type,
			color,
			intendedUse,
			motorNumber,
			chassisNumber,
		})
		closeModal()
	}

	return (
		<Modal visible={visible} close={closeModal}>
			<form className="bg-white p-8 br" onSubmit={submitForm}>
				<p className="bold fs-md mb-4">Yeni Araç Oluştur</p>
				<div className="flex al-center mb-2">
					<label className="mr-4">
						<span>Plaka Numarası</span>
						<Input
							placeholder="Araç plakası"
							classes="mt-2"
							onChange={e => setLicenseNumber(e.target.value)}
						/>
					</label>
					<label>
						<span>Marka</span>
						<Input
							classes="mt-2"
							onChange={e => setBrand(e.target.value)}
							placeholder="Araç markası"
						/>
					</label>
				</div>
				<div className="flex al-center mb-2">
					<label className="mr-4">
						<span>Model</span>
						<Input
							classes="mt-2"
							onChange={e => setModel(e.target.value)}
							placeholder="Araç modeli"
						/>
					</label>
					<label>
						<span>Sahiplik Tarihi</span>
						<Input
							classes="mt-2"
							onChange={e => setOwnershipDate(e.target.value)}
							placeholder="Araç sahiplik tarihi"
						/>
					</label>
				</div>
				<div className="flex al-center mb-2">
					<label className="mr-4">
						<span>Cinsi</span>
						<Input
							classes="mt-2"
							onChange={e => setKind(e.target.value)}
							placeholder="Araç cinsi"
						/>
					</label>
					<label>
						<span>Tipi</span>
						<Input
							classes="mt-2"
							onChange={e => setType(e.target.value)}
							placeholder="Araç tipi"
						/>
					</label>
				</div>
				<div className="flex al-center mb-2">
					<label className="mr-4">
						<span>Renk</span>
						<Input
							classes="mt-2"
							onChange={e => setColor(e.target.value)}
							placeholder="Araç rengi"
						/>
					</label>
					<label>
						<span>Kullanım Amacı</span>
						<Input
							classes="mt-2"
							onChange={e => setIntendedUse(e.target.value)}
							placeholder="Aracın kullanım amacı"
						/>
					</label>
				</div>
				<div className="flex al-center mb-2">
					<label className="mr-4">
						<span>Motor Numarası</span>
						<Input
							classes="mt-2"
							onChange={e => setMotorNumber(e.target.value)}
							placeholder="Araç motor numarası"
						/>
					</label>
					<label>
						<span>Şasi Numarası</span>
						<Input
							classes="mt-2"
							onChange={e => setChassisNumber(e.target.value)}
							placeholder="Araç şasi numarası"
						/>
					</label>
				</div>
				<Button theme="blue" classes="w-100 mt-4 fw-600" type="submit">
					OLUŞTUR
				</Button>
			</form>
		</Modal>
	)
}
