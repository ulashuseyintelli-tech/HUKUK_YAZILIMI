import React from 'react'
import Button from '../anBrains/Button'
import { FaPlus, FaTrash, FaBaseballBall } from 'react-icons/fa'
import Input from '../anBrains/Input'
import { cities, getDistrictsByCity } from '../../services/cities'
import CheckBox from '../anBrains/CheckBox'
import {
	DEBTOR_ADDRESS,
	ADDRESS_TYPE,
	DEBTOR_TYPES,
	INSTITUTION_ADDRESS_KIND,
	PERSON_ADDRESS_KIND,
} from '../../constants'
import Note from '../Note'

export default function AddressForm({
	addresses,
	setAddresses,
	exactType,
	withoutHeader,
	title,
	titleClassName = '',
	addressFooterButton,
	required = false,
	withKind = false,
	debtorType,
}) {
	const onChange = (e, index, property) => {
		addresses[index][property] = e.target ? e.target.value : e
		setAddresses([...addresses])
	}

	const remove = index => {
		addresses.splice(index, 1)
		setAddresses([...addresses])
	}

	const newAddress = exactType
		? { ...DEBTOR_ADDRESS, type: exactType }
		: { ...DEBTOR_ADDRESS, type: '' }

	return (
		<div>
			{!withoutHeader && (
				<div className="flex al-center mb-4 jst-between">
					<span className={`fw-500 fs-md ${titleClassName}`}>
						{title || 'Adresler'} {required ? '*' : ''}
					</span>
					<Button
						type="button"
						theme="basic"
						classes="py-1 px-2 fw-500 ml-2"
						onClick={() => setAddresses([...addresses, { ...newAddress }])}
					>
						<FaPlus className="fs-xsm mr-2" />
						<span className="bold">Ekle</span>
					</Button>
				</div>
			)}
			{addresses.map((address, index) => {
				return (
					<div key={'addresses' + index} className="mt-2 mb-4">
						<div className="flex al-center mb-2">
							<div className="w-100 mr-4">
								<p className="fw-500 mb-2">Başlık</p>
								<Input
									placeholder="Adres Başlığı"
									containerClasses="w-100"
									value={address.title}
									onChange={e => onChange(e, index, 'title')}
								/>
							</div>
							<div className="w-100 mr-4">
								<p className="fw-500 mb-2">İl</p>
								<select
									className="input w-100"
									value={address.city}
									onChange={e => onChange(e, index, 'city')}
								>
									{cities.map(city => {
										return (
											<option
												key={city.name}
												value={city.name}
												className="dark"
											>
												{city.name}
											</option>
										)
									})}
								</select>
							</div>
							<div className="w-100 mr-4">
								<p className="fw-500 mb-2">İlçe</p>
								<select
									className="input w-100"
									value={address.district}
									onChange={e => onChange(e, index, 'district')}
								>
									{getDistrictsByCity(address.city).map(district => {
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
							</div>
							<div className="w-100">
								<p className="fw-500 mb-2">Adres Tipi</p>
								{!exactType && (
									<select
										disabled={exactType}
										className="input w-100"
										value={address.type}
										onChange={e => onChange(e, index, 'type')}
									>
										<option value="" disabled>
											Adres Tipi Seçin
										</option>
										{Object.values(ADDRESS_TYPE).map(val => {
											return (
												<option key={val.value} value={val.value}>
													{val.getText(null, debtorType)}
												</option>
											)
										})}
									</select>
								)}
							</div>
							{withKind && debtorType && (
								<div className="w-100 ml-4">
									<p className="fw-500 mb-2">Adres Türü</p>
									<select
										className="input w-100"
										value={address.kind}
										onChange={e => onChange(e, index, 'kind')}
									>
										<option value="" disabled>
											Adres Türü Seçin
										</option>
										{Object.values(
											debtorType === DEBTOR_TYPES.INSTITUTION
												? INSTITUTION_ADDRESS_KIND
												: PERSON_ADDRESS_KIND,
										).map(val => {
											return (
												<option key={val.value} value={val.value}>
													{val.text}
												</option>
											)
										})}
									</select>
								</div>
							)}
						</div>
						<Input
							textarea
							placeholder="Adres Açıklaması"
							value={address.description}
							onChange={e => onChange(e, index, 'description')}
						/>
						{address.type === '' && (
							<Note type="warn" classes="mt-2">
								Adres türü seçmeyi unutmayın
							</Note>
						)}
						<div className="flex al-center jst-between mt-2">
							<Button
								type="button"
								classes="fw-500"
								theme="red"
								onClick={() => remove(index)}
							>
								<FaTrash className="fs-xsm" />
							</Button>
							{addressFooterButton &&
								React.cloneElement(addressFooterButton, { address })}
						</div>
					</div>
				)
			})}
		</div>
	)
}
