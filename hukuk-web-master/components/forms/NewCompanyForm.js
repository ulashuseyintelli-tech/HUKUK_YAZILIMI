import React, { useState } from 'react'
import {
	CLIENT_TYPES,
	PHONE_NUMBER,
	BANK_ACCOUNT_INFORMATION,
	STATUS,
	DEBTOR_ADDRESS,
	DEBTOR_KINDS,
	DEBTOR_TYPES,
} from '../../constants'
import Input from '../anBrains/Input'
import Button from '../anBrains/Button'
import { FaPlus, FaTrash } from 'react-icons/fa'
import { cities, getDistrictsByCity } from '../../services/cities'
import LoadingAnimation from '../anBrains/animations/LoadingAnimation/LoadingAnimation'
import { createCompany } from '../../services/companyServices'

export default function NewCompanyForm({ close, companies, setCompanies }) {
	const [status, setStatus] = useState(STATUS.NORMAL)
	const [name, setName] = useState('')
	const [kind, setKind] = useState(DEBTOR_KINDS[0])
	const [MERSISNumber, setMERSISNumber] = useState('')
	const [phoneNumbers, setPhoneNumbers] = useState([])
	const [emails, setEmails] = useState([])
	const [notes, setNotes] = useState('')
	const [taxOffice, setTaxOffice] = useState('')
	const [taxNumber, setTaxNumber] = useState('')
	const [addresses, setAddresses] = useState([])
	const [bankAccountInformations, setBankAccountInformations] = useState([])

	const onPhoneNumberChange = (e, index, property) => {
		phoneNumbers[index][property] = e.target.value
		setPhoneNumbers([...phoneNumbers])
	}

	const onEmailChange = (e, index) => {
		emails[index] = e.target.value
		setEmails([...emails])
	}

	const onAddressChange = (e, index, property) => {
		addresses[index][property] = e.target ? e.target.value : e
		setAddresses([...addresses])
	}

	const removePhoneNumber = index => {
		phoneNumbers.splice(index, 1)
		setPhoneNumbers([...phoneNumbers])
	}

	const removeEmail = index => {
		emails.splice(index, 1)
		setEmails([...emails])
	}

	const removeAddress = index => {
		addresses.splice(index, 1)
		setAddresses([...addresses])
	}

	const removeBankAccountInformation = index => {
		bankAccountInformations.splice(index, 1)
		setBankAccountInformations([...bankAccountInformations])
	}

	const create = async e => {
		e.preventDefault()
		setStatus(STATUS.LOADING)
		await createCompany({
			name,
			kind,
			MERSISNumber,
			phoneNumbers,
			emails,
			notes,
			taxOffice,
			taxNumber,
			addresses,
			bankAccountInformations,
		})
			.then(res => {
				setCompanies([res.data, ...companies])
				close()
			})
			.catch(e => alert('Hata'))
		setStatus(STATUS.NORMAL)
	}

	return (
		<form className="new-client-form form-modal" onSubmit={create}>
			<LoadingAnimation status={status} />
			<span className="mb-4 fs-lg">Yeni Şirket</span>
			<div className="flex my-4">
				<label className="w-50 mr-4">
					<React.Fragment>
						<span>Kurum Adı</span>
						<Input
							placeholder="Kurum Adı"
							classes="mt-2"
							value={name}
							onChange={e => setName(e.target.value)}
						/>
					</React.Fragment>
				</label>
				<label className="w-50 mr-4">
					<React.Fragment>
						<span>Vergi Dairesi</span>
						<Input
							placeholder="Vergi Dairesi"
							classes="mt-2"
							value={taxOffice}
							onChange={e => setTaxOffice(e.target.value)}
						/>
					</React.Fragment>
				</label>
			</div>
			<div className="flex my-4">
				<label className="w-50 mr-4">
					<React.Fragment>
						<span>Vergi Numarası</span>
						<Input
							placeholder="Vergi Numarası"
							classes="mt-2"
							value={taxNumber}
							onChange={e => setTaxNumber(e.target.value)}
						/>
					</React.Fragment>
				</label>
				<label className="w-50 column mr-4">
					<React.Fragment>
						<span>MERSIS Numarası</span>
						<Input
							placeholder="MERSIS Numarası"
							classes="mt-2"
							value={MERSISNumber}
							onChange={e => setMERSISNumber(e.target.value)}
						/>
					</React.Fragment>
				</label>
				<label className="w-50 column">
					<span>Tür</span>
					<select
						className="input mt-2"
						value={kind}
						onChange={e => setKind(e.target.value)}
					>
						{DEBTOR_KINDS.map(debtorKind => {
							return (
								<option key={debtorKind} value={debtorKind}>
									{debtorKind}
								</option>
							)
						})}
					</select>
				</label>
			</div>
			<div className="flex al-start">
				<div className="w-50 mr-4">
					<div className="my-4">
						<div className="flex al-center">
							<span>Telefon Numaraları</span>
							<Button
								type="button"
								theme="basic"
								classes="py-1 px-2 fw-500 ml-2"
								onClick={() =>
									setPhoneNumbers([...phoneNumbers, { ...PHONE_NUMBER }])
								}
							>
								<FaPlus className="fs-xsm mr-2" />
								<span className="bold">Ekle</span>
							</Button>
						</div>
						{phoneNumbers.map((phoneNumber, index) => {
							return (
								<div
									key={'phoneNumbers' + index}
									className="flex al-center w-100 mt-2"
								>
									<Input
										placeholder="Başlık"
										containerClasses="w-30 mr-2"
										value={phoneNumber.title}
										onChange={e => onPhoneNumberChange(e, index, 'title')}
									/>
									<Input
										placeholder="Telefon Numarası"
										containerClasses="w-70"
										value={phoneNumber.number}
										onChange={e => onPhoneNumberChange(e, index, 'number')}
									/>
									<Button
										type="button"
										classes="ml-2 fw-500"
										theme="red"
										onClick={() => removePhoneNumber(index)}
									>
										<FaTrash className="mr-1 fs-xsm" />
										Sil
									</Button>
								</div>
							)
						})}
					</div>
				</div>
				<div className="w-50">
					<div className="my-4">
						<div className="flex al-center">
							<span>E-posta Adresleri</span>

							<Button
								type="button"
								theme="basic"
								classes="py-1 px-2 fw-500 ml-2"
								onClick={() => setEmails([...emails, ''])}
							>
								<FaPlus className="fs-xsm mr-2" />
								<span className="bold">Ekle</span>
							</Button>
						</div>
						{emails.map((email, index) => {
							return (
								<div
									key={'emails' + index}
									className="flex al-center w-100 mt-2"
								>
									<Input
										placeholder="E-posta adresi"
										containerClasses="w-100"
										value={email}
										onChange={e => onEmailChange(e, index)}
									/>
									<Button
										type="button"
										classes="ml-2 fw-500"
										theme="red"
										onClick={() => removeEmail(index)}
									>
										<FaTrash className="mr-1 fs-xsm" />
										Sil
									</Button>
								</div>
							)
						})}
					</div>
				</div>
			</div>
			<div className="my-4">
				<div className="flex al-center">
					<span>Adresler</span>
					<Button
						type="button"
						theme="basic"
						classes="py-1 px-2 fw-500 ml-2"
						onClick={() => setAddresses([...addresses, { ...DEBTOR_ADDRESS }])}
					>
						<FaPlus className="fs-xsm mr-2" />
						<span className="bold">Ekle</span>
					</Button>
				</div>
				{addresses.map((address, index) => {
					return (
						<div key={'addresses' + index} className="mt-2">
							<div className="flex al-center mb-2">
								<Input
									placeholder="Adres Başlığı"
									containerClasses="w-100 mr-2"
									value={address.title}
									onChange={e => onAddressChange(e, index, 'title')}
								/>
								<select
									className="input mr-2"
									value={address.city}
									onChange={e => onAddressChange(e, index, 'city')}
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
								<select
									className="input mr-4"
									value={address.district}
									onChange={e => onAddressChange(e, index, 'district')}
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
							<Input
								textarea
								placeholder="Adres Açıklaması"
								value={address.description}
								onChange={e => onAddressChange(e, index, 'description')}
							/>
							<Button
								type="button"
								classes="mt-2 fw-500"
								theme="red"
								onClick={() => removeAddress(index)}
							>
								<FaTrash className="mr-1 fs-xsm" />
								Sil
							</Button>
						</div>
					)
				})}
			</div>
			<div className="flex al-start">
				<div className="w-50 mr-4">
					<div className="my-4">
						<div className="flex al-center">
							<span>Banka Hesap Bilgileri</span>
							<Button
								type="button"
								theme="basic"
								classes="py-1 px-2 fw-500 ml-2"
								onClick={() =>
									setBankAccountInformations([
										...bankAccountInformations,
										{ ...BANK_ACCOUNT_INFORMATION },
									])
								}
							>
								<FaPlus className="fs-xsm mr-2" />
								<span className="bold">Ekle</span>
							</Button>
						</div>
						{bankAccountInformations.map((bankAccountInformation, index) => {
							return (
								<div
									key={'bankAccountInformation' + index}
									className="flex al-center w-100 mt-2"
								>
									<Input placeholder="Banka Adı" containerClasses="w-30 mr-2" />
									<Input placeholder="IBAN" containerClasses="w-70" />
									<Button
										type="button"
										classes="ml-2 fw-500"
										theme="red"
										onClick={() => removeBankAccountInformation(index)}
									>
										<FaTrash className="mr-1 fs-xsm" />
										Sil
									</Button>
								</div>
							)
						})}
					</div>
				</div>
				<div className="w-50">
					<div className="my-4">
						<span>Notlar</span>
						<Input
							textarea
							placeholder="Notlar"
							classes="mt-4"
							value={notes}
							onChange={e => setNotes(e.target.value)}
						/>
					</div>
				</div>
			</div>
			<div className="flex al-center mt-8">
				<Button
					type="button"
					theme="basic"
					classes="w-50 mr-2 py-3"
					onClick={close}
				>
					Vazgeç
				</Button>
				<Button type="submit" theme="blue" classes="w-50 bold py-3">
					Oluştur
				</Button>
			</div>
		</form>
	)
}
