import React, { useEffect, useState } from 'react'
import { FaPen } from 'react-icons/fa'
import { cities, getDistrictsByCity } from '../../services/cities'
import Button from '../anBrains/Button'
import Input from '../anBrains/Input'
import TrueFalse from '../TrueFalse'

export default function IntelInfo({ debtor, intel, changeIntel, submitIntel }) {
	const [isOpen, setIsOpen] = useState(intel.areTypesSelected ? false : true)
	const [isEdited, setIsEdited] = useState(false)

	useEffect(() => {
		if (!isEdited) {
			if (intel.areTypesSelected === true || debtor.addresses.length > 0) {
				setIsOpen(false)
			}
		}
	}, [intel])

	const _changeIntel = (prop, val) => {
		setIsEdited(true)
		changeIntel(prop, val)
	}

	const checkForm = () => {
		return (
			debtor.addresses.length > 0 ||
			((intel.isCityKnown === false ||
				(intel.isCityKnown && intel.knownCity)) &&
				(intel.isCityKnown
					? intel.isDistrictKnown === false ||
					  (intel.isDistrictKnown && intel.knownDistrict)
					: true))
		)
	}

	if (!isOpen) {
		return (
			<div className="intel-part flex al-center jst-between my-4">
				<p className="fw-500">İstihbarata Yarar Bilgiler</p>
				<Button classes="blue" theme="basic" onClick={() => setIsOpen(!isOpen)}>
					<FaPen className="mr-2" />
					Düzenle
				</Button>
			</div>
		)
	}

	return (
		<div>
			<div className="flex al-start mt-4">
				{debtor.addresses.length === 0 && (
					<>
						<div className="p-4 mr-4 w-100 intel-part br">
							<p className="fw-500">Borçlunun Olduğu İl Biliniyor mu?</p>
							<TrueFalse
								object={intel}
								property="isCityKnown"
								options={['Hayır', 'Evet, biliniyor']}
								change={_changeIntel}
							/>
							{intel.isCityKnown && (
								<div>
									<div className="step-item-divider"></div>
									<p className="fw-500 mb-2">Bir İl Seçin</p>
									<select
										className="input w-100"
										value={intel.knownCity}
										onChange={e => _changeIntel('knownCity', e.target.value)}
									>
										{cities.map(city => {
											return <option value={city.name}>{city.name}</option>
										})}
									</select>
								</div>
							)}
						</div>
						{intel.isCityKnown && (
							<div className="p-4 w-100 intel-part br">
								<p className="fw-500">Borçlunun Olduğu İlçe Biliniyor mu?</p>
								<TrueFalse
									object={intel}
									property="isDistrictKnown"
									options={['Hayır', 'Evet, biliniyor']}
									change={_changeIntel}
								/>
								{intel.isDistrictKnown && (
									<>
										<div className="step-item-divider"></div>
										<p className="fw-500 mb-2">Bir İlçe Seçin</p>
										{intel.isCityKnown && intel.knownCity ? (
											<select
												className="input w-100"
												value={intel.knownDistrict}
												onChange={e =>
													_changeIntel('knownDistrict', e.target.value)
												}
											>
												{getDistrictsByCity(intel.knownCity).map(district => {
													return (
														<option value={district.districtName}>
															{district.districtName}
														</option>
													)
												})}
											</select>
										) : (
											<Input
												value={intel.knownDistrict}
												placeholder="İlçe adı"
												onChange={e =>
													_changeIntel('knownDistrict', e.target.value)
												}
											/>
										)}
									</>
								)}
							</div>
						)}
					</>
				)}
			</div>
			<div className="flex al-center jst-center mt-8">
				<Button
					theme="basic"
					classes="w-25 py-3"
					onClick={() => setIsOpen(false)}
				>
					Vazgeç
				</Button>
				<Button
					theme="blue"
					classes="ml-4 fw-600 w-25 py-3"
					disabled={!checkForm()}
					onClick={() => {
						submitIntel()
						setIsOpen(false)
					}}
				>
					Kaydet
				</Button>
			</div>
		</div>
	)
}
