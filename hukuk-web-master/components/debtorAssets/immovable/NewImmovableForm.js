import { useContext, useState } from 'react'
import Modal from '../../anBrains/Modal'
import { cities, getDistrictsByCity } from '../../../services/cities'
import Input from '../../anBrains/Input'
import Button from '../../anBrains/Button'
import { InpoundmentContext } from '../../../pages/takip/CaseInpoundmentDetails'
import LandRegistryOfficeSelect from '../../select/LandRegistryOfficeSelect'

export default function NewImmovableForm({ visible, add, close }) {
	const [registrationStatus, setRegistrationStatus] = useState('')
	const [typeOfSoil, setTypeOfSoil] = useState('')
	const [soilNumber, setSoilNumber] = useState('')
	const [volumeNumber, setVolumeNumber] = useState('')
	const [pageNumber, setPageNumber] = useState('')
	const [associationName, setAssociationName] = useState('')
	const [city, setCity] = useState(cities[0].name)
	const [district, setDistrict] = useState('')
	const [street, setStreet] = useState('')
	const [local, setLocal] = useState('')
	const [cityBlock, setCityBlock] = useState('')
	const [parcel, setParcel] = useState('')
	const [area, setArea] = useState('')
	const [mainQuailification, setMainQuailification] = useState('')
	const [secondQualification, setSecondQualification] = useState('')
	const [block, setBlock] = useState('')
	const [floor, setFloor] = useState('')
	const [bbNo, setBbNo] = useState('')
	const [landShareAndDenominator, setLandShareAndDenominator] = useState('')
	const [landRegistryOfficeId, setLandRegistryOfficeId] = useState(null)

	let { assetProps, closeModal } = useContext(InpoundmentContext)
	closeModal = close || closeModal
	const createAsset = add || assetProps.createAsset

	const submitForm = e => {
		e.preventDefault()
		createAsset({
			landRegistryOfficeId,
			registrationStatus,
			typeOfSoil,
			soilNumber,
			volumeNumber,
			pageNumber,
			associationName,
			city,
			district,
			street,
			local,
			cityBlock,
			parcel,
			area,
			mainQuailification,
			secondQualification,
			block,
			floor,
			bbNo,
			landShareAndDenominator,
		})
		closeModal()
	}

	return (
		<Modal visible={visible} close={closeModal}>
			<div className="br p-8 bg-white">
				<p className="fw-600 fs-md mb-4">Yeni Gayrimenkul Oluştur</p>
				<label className="mr-8">
					<p className="fw-600 dark-blue mb-4">Tapu Sicil Müdürlüğü</p>
					<LandRegistryOfficeSelect
						selectedId={landRegistryOfficeId}
						setSelectedId={setLandRegistryOfficeId}
					/>
				</label>
				{/* <div className="flex al-center mb-4">
					<label className="mr-4">
						<span className="fw-500 gray">Kayıt Durumu</span>
						<Input
							classes="mt-2"
							onChange={e => setRegistrationStatus(e.target.value)}
						/>
					</label>
					<label className="mr-4">
						<span className="fw-500 gray">Zemin Tipi</span>
						<Input
							classes="mt-2"
							onChange={e => setTypeOfSoil(e.target.value)}
						/>
					</label>
					<label className="mr-4">
						<span className="fw-500 gray">Zemin No</span>
						<Input
							classes="mt-2"
							onChange={e => setSoilNumber(e.target.value)}
						/>
					</label>
					<label>
						<span className="fw-500 gray">Kurum Adı</span>
						<Input
							classes="mt-2"
							onChange={e => setAssociationName(e.target.value)}
						/>
					</label>
				</div> */}
				<div className="flex al-center mb-4">
					{/* <label className="mr-4">
						<span className="fw-500 gray">Cilt No</span>
						<Input
							classes="mt-2"
							onChange={e => setVolumeNumber(e.target.value)}
						/>
					</label>
					<label className="mr-4">
						<span className="fw-500 gray">Sayfa No</span>
						<Input
							classes="mt-2"
							onChange={e => setPageNumber(e.target.value)}
						/>
					</label> */}
					<label className="mr-4 column w-50">
						<span className="fw-500 gray">İl</span>
						<select
							className="input mt-2"
							value={city}
							onChange={e => setCity(e.target.value)}
						>
							{cities.map(city => {
								return (
									<option key={city.name} value={city.name} className="dark">
										{city.name}
									</option>
								)
							})}
						</select>
					</label>
					<label className="column w-50">
						<span className="fw-500 gray">İlçe</span>
						<select
							className="input mt-2"
							value={district}
							onChange={e => setDistrict(e.target.value)}
						>
							{getDistrictsByCity(city).map(district => {
								return (
									<option
										key={district.districtName}
										value={district.districtName}
									>
										{district.districtName}
									</option>
								)
							})}
						</select>
					</label>
				</div>
				<div className="flex al-center mb-4">
					<label className="mr-4">
						<span className="fw-500 gray">Mahalle / Köy</span>
						<Input classes="mt-2" onChange={e => setStreet(e.target.value)} />
					</label>
					{/* <label className="mr-4">
						<span className="fw-500 gray">Mevkii</span>
						<Input classes="mt-2" onChange={e => setLocal(e.target.value)} />
					</label> */}
					<label className="mr-4">
						<span className="fw-500 gray">Ada</span>
						<Input
							classes="mt-2"
							onChange={e => setCityBlock(e.target.value)}
						/>
					</label>
					<label>
						<span className="fw-500 gray">Parsel</span>
						<Input classes="mt-2" onChange={e => setParcel(e.target.value)} />
					</label>
				</div>
				<div className="flex al-center mb-4">
					<label className="mr-4 w-50">
						<span className="fw-500 gray">Yüz Ölçüm</span>
						<Input classes="mt-2" onChange={e => setArea(e.target.value)} />
					</label>
					<label className="w-50">
						<span className="fw-500 gray">Ana Taş. Nitelik</span>
						<Input
							classes="mt-2"
							onChange={e => setMainQuailification(e.target.value)}
						/>
					</label>
					{/* <label className="mr-4">
						<span className="fw-500 gray">Blok</span>
						<Input classes="mt-2" onChange={e => setBlock(e.target.value)} />
					</label>
					<label>
						<span className="fw-500 gray">Kat</span>
						<Input classes="mt-2" onChange={e => setFloor(e.target.value)} />
					</label> */}
				</div>
				<div className="flex al-center jst-between mb-4">
					<label className="mr-4 w-30">
						<span className="fw-500 gray">Giriş-BBNo</span>
						<Input classes="mt-2" onChange={e => setBbNo(e.target.value)} />
					</label>
					<label className="mr-2 w-30">
						<span className="fw-500 gray">Bağ. Böl. Nitelik</span>
						<Input
							classes="mt-2"
							onChange={e => setSecondQualification(e.target.value)}
						/>
					</label>
					<label className="w-30">
						<span className="fw-500 gray">Hisse</span>
						<Input
							classes="mt-2"
							onChange={e => setLandShareAndDenominator(e.target.value)}
						/>
					</label>
				</div>
				<Button
					theme="blue"
					classes="w-100 mt-8 py-3 bold"
					onClick={submitForm}
				>
					OLUŞTUR
				</Button>
			</div>
		</Modal>
	)
}
