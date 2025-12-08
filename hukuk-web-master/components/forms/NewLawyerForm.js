import React, { useState, useEffect } from 'react'
import {
	PHONE_NUMBER,
	ADDRESS,
	BANK_ACCOUNT_INFORMATION,
	STATUS,
	LAWYER_TYPE,
	LAWYER_DEPUTY_TYPE,
	USER_TYPE,
	GENDER_OPTIONS,
} from '../../constants'
import Input from '../anBrains/Input'
import Button from '../anBrains/Button'
import { FaLongArrowAltLeft } from 'react-icons/fa'
import LoadingAnimation from '../anBrains/animations/LoadingAnimation/LoadingAnimation'
import { createUser } from '../../services/userService'
import PhoneNumbersForm from './PhoneNumbersForm'
import BankAccountInformationForm from './BankAccountInformationForm'
import AddressForm from './AddressForm'
import Note from '../Note'
import { validateAddresses, validatePhoneNumbers } from '../../helpers/Helper'

export default function NewLawyerForm({
	close,
	lawyers,
	setLawyers,
	lawyer,
	util,
}) {
	lawyer = lawyer || util

	const [status, setStatus] = useState(STATUS.NORMAL)
	const [type, setType] = useState(
		lawyer ? lawyer.type : LAWYER_TYPE.INSTITUTION,
	)
	const [name, setName] = useState(lawyer ? lawyer.name : '')
	const [surname, setSurname] = useState(lawyer ? lawyer.surname : '')
	const [email, setEmail] = useState(lawyer ? lawyer.email : '')
	const [password, setPassword] = useState('')
	const [identityNumber, setIdentityNumber] = useState(
		lawyer ? lawyer.identityNumber : '',
	)
	const [gender, setGender] = useState(
		lawyer ? lawyer.gender : GENDER_OPTIONS.MALE.value,
	)
	const [registrationNumber, setRegistrationNumber] = useState(
		lawyer ? lawyer.registrationNumber : '',
	)
	const [tbbNumber, setTbbNumber] = useState(lawyer ? lawyer.tbbNumber : '')
	const [taxOffice, setTaxOffice] = useState(lawyer ? lawyer.taxOffice : '')
	const [taxNumber, setTaxNumber] = useState(lawyer ? lawyer.taxNumber : '')
	const [deputyType, setDeputyType] = useState(
		lawyer ? lawyer.deputyType : LAWYER_DEPUTY_TYPE.BARO,
	)
	const [phoneNumbers, setPhoneNumbers] = useState(
		lawyer ? lawyer.phoneNumbers : [],
	)
	const [notes, setNotes] = useState(lawyer ? lawyer.notes : '')
	const [addresses, setAddresses] = useState(lawyer ? lawyer.addresses : [])
	const [bankAccountInformations, setBankAccountInformations] = useState([
		lawyer ? lawyer.bankAccountInformations : { ...BANK_ACCOUNT_INFORMATION },
	])

	const create = async e => {
		e.preventDefault()
		if (!lawyer) {
			if (
				name &&
				surname &&
				identityNumber &&
				gender &&
				taxNumber &&
				validatePhoneNumbers(phoneNumbers) &&
				validateAddresses(addresses) &&
				email
			) {
				setStatus(STATUS.LOADING)
				await createUser({
					type: USER_TYPE.LAWYER,
					name,
					password,
					surname,
					identityNumber,
					gender,
					email,
					phoneNumbers,
					notes,
					addresses,
					bankAccountInformations,
					lawyerDetails: {
						registrationNumber,
						tbbNumber,
						taxNumber,
						taxOffice,
						deputyType,
						type,
					},
				})
					.then(res => {
						setLawyers([res.data, ...lawyers])
						close()
					})
					.catch(e => alert('Hata'))
				setStatus(STATUS.NORMAL)
			} else {
				alert(
					'Lütfen tüm zorunlu alanları doldurun. Zorunlu alanlar yıldız (*) ile işaretlenmiştir',
				)
			}
		}
	}

	return (
		<form className="new-util-form" onSubmit={create}>
			<LoadingAnimation status={status} />
			<Button theme="basic" classes="py-1 mb-4" onClick={close}>
				<FaLongArrowAltLeft className="mr-2" /> Geri Dön
			</Button>
			<span className="fs-lg fw-600">
				{lawyer ? `${lawyer.name} ${lawyer.surname}` : 'Yeni Avukat'}
			</span>
			<Note type="zekiye" classes="mt-4">
				Avukat güncelleme özelliği henüz aktif değil.
			</Note>
			<div className="bg br p-8 mt-4">
				<div className="flex mb-4">
					<div className="w-50 mr-4">
						<span className="fw-500">Ad *</span>
						<Input
							placeholder="Ad"
							classes="mt-2"
							value={name}
							onChange={e => setName(e.target.value)}
						/>
					</div>
					<div className="w-50 mr-4">
						<span className="fw-500">Soyad *</span>
						<Input
							placeholder="Soyad"
							classes="mt-2"
							value={surname}
							onChange={e => setSurname(e.target.value)}
						/>
					</div>
					<div className="w-50 mr-4">
						<span className="fw-500">T.C. Kimlik Numarası *</span>
						<Input
							placeholder="T.C. Kimlik Numarası"
							classes="mt-2"
							value={identityNumber}
							onChange={e => setIdentityNumber(e.target.value)}
						/>
					</div>
					<div className="w-50 column">
						<span className="fw-500">Cinsiyet</span>
						<select
							className="input mt-2"
							value={gender}
							onChange={e => setGender(e.target.value)}
						>
							<option value="Erkek">Erkek</option>
							<option value="Kadın">Kadın</option>
						</select>
					</div>
				</div>
				<div className="flex my-4">
					<div className="w-50 mr-4">
						<span className="fw-500">E-posta *</span>
						<Input
							placeholder="E-posta"
							classes="mt-2"
							value={email}
							onChange={e => setEmail(e.target.value)}
						/>
					</div>
					<div className="w-50">
						<span className="fw-500">Parola</span>
						<Input
							placeholder="Parola"
							classes="mt-2"
							value={password}
							onChange={e => setPassword(e.target.value)}
						/>
					</div>
				</div>
				<div className="flex my-4">
					<div className="w-50 column mr-4">
						<span className="fw-500">Vekil Tipi</span>
						<select
							className="input mt-2"
							value={deputyType}
							onChange={e => setDeputyType(e.target.value)}
						>
							{Object.keys(LAWYER_DEPUTY_TYPE).map(key => {
								return (
									<option key={key} value={LAWYER_DEPUTY_TYPE[key]}>
										{LAWYER_DEPUTY_TYPE[key]}
									</option>
								)
							})}
						</select>
					</div>
					<div className="w-50 column">
						<span className="fw-500">Türü</span>
						<select
							className="input mt-2"
							value={type}
							onChange={e => setType(e.target.value)}
						>
							{Object.keys(LAWYER_TYPE).map(key => {
								return (
									<option key={key} value={LAWYER_TYPE[key]}>
										{LAWYER_TYPE[key]}
									</option>
								)
							})}
						</select>
					</div>
				</div>
			</div>
			<div className="bg br p-8 mt-8">
				<div className="flex al-start mb-4">
					<div className="w-50 mr-4">
						<PhoneNumbersForm
							required
							phoneNumbers={phoneNumbers}
							setPhoneNumbers={setPhoneNumbers}
						/>
					</div>
					<div className="w-50">
						<BankAccountInformationForm
							bankAccountInformations={bankAccountInformations}
							setBankAccountInformations={setBankAccountInformations}
						/>
					</div>
				</div>
				<div className="step-item-divider"></div>
				<AddressForm
					required={true}
					addresses={addresses}
					setAddresses={setAddresses}
				/>
			</div>

			<div className="flex al-start bg br p-8 mt-8">
				<div className="w-50 mr-4">
					<span className="fw-500">Vergi Dairesi</span>
					<Input
						placeholder="Vergi Dairesi"
						classes="mt-2"
						value={taxOffice}
						onChange={e => setTaxOffice(e.target.value)}
					/>
				</div>
				<div className="w-50 mr-4">
					<span className="fw-500">Vergi Numarası *</span>
					<Input
						placeholder="Vergi Numarası"
						classes="mt-2"
						value={taxNumber}
						onChange={e => setTaxNumber(e.target.value)}
					/>
				</div>
				<div className="w-50 mr-4">
					<span className="fw-500">Sicil Numarası</span>
					<Input
						placeholder="Sicil Numarası"
						classes="mt-2"
						value={registrationNumber}
						onChange={e => setRegistrationNumber(e.target.value)}
					/>
				</div>
				<div className="w-50">
					<span className="fw-500">TBB Numarası</span>
					<Input
						placeholder="TBB Numarası"
						classes="mt-2"
						value={tbbNumber}
						onChange={e => setTbbNumber(e.target.value)}
					/>
				</div>
			</div>
			<div className="bg br p-8 mt-8">
				<span className="fw-500">Notlar</span>
				<Input
					textarea
					placeholder="Notlar"
					classes="mt-4"
					value={notes}
					onChange={e => setNotes(e.target.value)}
				/>
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
				<Button
					type="submit"
					theme="blue"
					classes="w-50 bold py-3"
					disabled={lawyer}
				>
					{lawyer ? 'Güncelle' : 'Oluştur'}
				</Button>
			</div>
		</form>
	)
}
