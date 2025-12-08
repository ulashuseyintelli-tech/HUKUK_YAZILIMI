import React, { useState } from 'react'
import {
	POWERS_FOR_CLIENT,
	CLIENT_TYPES,
	INSTITUTION_TYPES,
	PHONE_NUMBER,
	ADDRESS,
	BANK_ACCOUNT_INFORMATION,
	STATUS,
	DEBTOR_TYPES,
} from '../../constants'
import Input from '../anBrains/Input'
import Button from '../anBrains/Button'
import { FaLongArrowAltLeft } from 'react-icons/fa'
import CheckBox from '../anBrains/CheckBox'
import { createClient, updateClient } from '../../services/clientService'
import LoadingAnimation from '../anBrains/animations/LoadingAnimation/LoadingAnimation'
import { getDebtorName } from '../../helpers/Helper'
import EmailForm from './EmailForm'
import BankAccountInformationForm from './BankAccountInformationForm'
import PhoneNumbersForm from './PhoneNumbersForm'
import AddressForm from './AddressForm'

export default function NewClientForm({
	close,
	clients,
	setClients,
	client,
	util,
	editingUtilId,
	utils,
}) {
	client = client || util || clients.find(c => c._id === editingUtilId)
	const [status, setStatus] = useState(STATUS.NORMAL)
	const [type, setType] = useState(client ? client.type : CLIENT_TYPES.PERSON)
	const [name, setName] = useState(client ? client.name : '')
	const [surname, setSurname] = useState(client ? client.surname : '')
	const [institutionName, setInstitutionName] = useState(
		client ? client.institutionName : '',
	)
	const [instutionType, setInstutionType] = useState(
		client ? client.instutionType : INSTITUTION_TYPES.PUBLIC,
	)
	const [MERSISNumber, setMERSISNumber] = useState(
		client ? client.MERSISNumber : '',
	)
	const [identityNumber, setIdentityNumber] = useState(
		client ? client.identityNumber : '',
	)
	const [gender, setGender] = useState(client ? client.gender : '')
	const [instution, setInstution] = useState(client ? client.instution : '')
	const [phoneNumbers, setPhoneNumbers] = useState([])
	const [emails, setEmails] = useState(client ? client.emails : [])
	const [notes, setNotes] = useState(client ? client.notes : '')
	const [taxOffice, setTaxOffice] = useState(client ? client.taxOffice : '')
	const [taxNumber, setTaxNumber] = useState(client ? client.taxNumber : '')
	const [socialSecurityNumber, setSocialSecurityNumber] = useState(
		client ? client.socialSecurityNumber : '',
	)
	const [tradeRegisterNumber, setTradeRegisterNumber] = useState(
		client ? client.tradeRegisterNumber : '',
	)
	const [deputationNumber, setDeputationNumber] = useState(
		client ? client.deputationNumber : '',
	)
	const [addresses, setAddresses] = useState(client ? client.addresses : [])
	const [powers, setPowers] = useState(
		client ? client.powers : [...POWERS_FOR_CLIENT],
	)
	const [bankAccountInformations, setBankAccountInformations] = useState(
		client ? client.bankAccountInformations : [],
	)

	const handlePowers = power => {
		const index = powers.findIndex(item => item === power)
		if (index) {
			powers.splice(index, 1)
			setPowers([...powers])
		} else {
			setPowers([...powers, power])
		}
	}

	const validate = () => {
		if (type === DEBTOR_TYPES.INSTITUTION) {
			if (!institutionName) {
				alert('Lütfen Kurum Adını doldurun!')
			} else if (addresses.length === 0) {
				alert('Lütfen en az bir adres girin!')
			} else if (!taxNumber) {
				alert('Lütfen vergi numarası girin!')
			} else return true
		} else {
			if (!name) {
				alert('Lütfen Ad girin!')
			} else if (!surname) {
				alert('Lütfen Soyad girin!')
			} else if (addresses.length === 0) {
				alert('Lütfen en az bir adres girin!')
			} else if (!identityNumber) {
				alert('Lütfen T.C. Kimlik numarası girin!')
			} else return true
		}
	}

	const create = async e => {
		e.preventDefault()
		if (validate()) {
			setStatus(STATUS.LOADING)
			await createClient({
				type,
				name,
				surname,
				identityNumber,
				gender,
				phoneNumbers,
				emails,
				notes,
				taxOffice,
				taxNumber,
				socialSecurityNumber,
				tradeRegisterNumber,
				deputationNumber,
				addresses,
				powers,
				bankAccountInformations,
				MERSISNumber,
				institutionName,
			})
				.then(res => {
					setClients([res.data, ...clients])
					close()
				})
				.catch(e => alert('Hata'))
			setStatus(STATUS.NORMAL)
		}
	}

	const save = async e => {
		e.preventDefault()
		if (validate()) {
			setStatus(STATUS.LOADING)
			await updateClient(client._id, {
				type,
				name,
				surname,
				identityNumber,
				gender,
				phoneNumbers,
				emails,
				notes,
				taxOffice,
				taxNumber,
				socialSecurityNumber,
				tradeRegisterNumber,
				deputationNumber,
				addresses,
				bankAccountInformations,
				MERSISNumber,
				institutionName,
			})
				.then(res => {
					const index = clients.findIndex(d => d._id === client._id)
					clients[index] = res.data
					setClients([...clients])
					alert('Müvekkil başarıyla güncellendi.')
				})
				.catch(e => alert('Hata'))
			setStatus(STATUS.NORMAL)
		}
	}

	return (
		<form className="new-util-form" onSubmit={client ? save : create}>
			<LoadingAnimation status={status} />
			<div className="flex al-center mb-8">
				<Button theme="basic" classes="py-1 mr-4" onClick={close}>
					<FaLongArrowAltLeft className="mr-2" /> Geri Dön
				</Button>
				<span className="fs-lg fw-600">
					{client ? getDebtorName(client) : 'Yeni Müvekkil'}
				</span>
				<div className="badge-cyan fs-xsm ml-2 px-4 py-0 ">
					{client && client.type === DEBTOR_TYPES.INSTITUTION
						? 'Kurum'
						: 'Şahıs'}
				</div>
			</div>
			<div className="bg br p-8 mt-4">
				<p className="mb-4 fw-500">Müvekkil Tipi</p>
				<div className="flex al-center">
					<div>
						<input
							type="radio"
							value={CLIENT_TYPES.PERSON}
							checked={type === CLIENT_TYPES.PERSON}
							className="mr-2"
							onChange={e => setType(e.target.value)}
						/>
						Şahıs
					</div>
					<div className="ml-4">
						<input
							type="radio"
							value={CLIENT_TYPES.INSTITUTION}
							checked={type === CLIENT_TYPES.INSTITUTION}
							className="mr-2"
							onChange={e => setType(e.target.value)}
						/>
						Kurum
					</div>
				</div>
			</div>
			<div className="bg br p-8 mt-8">
				<div className="flex my-4">
					<div className="w-50 mr-4">
						{type === CLIENT_TYPES.PERSON ? (
							<React.Fragment>
								<span className="fw-500">Ad</span>
								<Input
									placeholder="Ad"
									classes="mt-2"
									value={name}
									onChange={e => setName(e.target.value)}
								/>
							</React.Fragment>
						) : (
							<React.Fragment>
								<span className="fw-500">Kurum Adı</span>
								<Input
									placeholder="Kurum Adı"
									classes="mt-2"
									value={institutionName}
									onChange={e => setInstitutionName(e.target.value)}
								/>
							</React.Fragment>
						)}
					</div>
					<div className="w-50">
						{type === CLIENT_TYPES.PERSON ? (
							<React.Fragment>
								<span className="fw-500">Soyad</span>
								<Input
									placeholder="Soyad"
									classes="mt-2"
									value={surname}
									onChange={e => setSurname(e.target.value)}
								/>
							</React.Fragment>
						) : (
							<React.Fragment>
								<span className="fw-500">Vergi Dairesi</span>
								<Input
									placeholder="Vergi Dairesi"
									classes="mt-2"
									value={taxOffice}
									onChange={e => setTaxOffice(e.target.value)}
								/>
							</React.Fragment>
						)}
					</div>
				</div>
				<div className="flex my-4">
					<div className="w-50 mr-4">
						{type === CLIENT_TYPES.PERSON ? (
							<React.Fragment>
								<span className="fw-500">T.C. Kimlik Numarası</span>
								<Input
									placeholder="T.C. Kimlik Numarası"
									classes="mt-2"
									value={identityNumber}
									onChange={e => setIdentityNumber(e.target.value)}
								/>
							</React.Fragment>
						) : (
							<React.Fragment>
								<span className="fw-500">Vergi Numarası</span>
								<Input
									placeholder="Vergi Numarası"
									classes="mt-2"
									value={taxNumber}
									onChange={e => setTaxNumber(e.target.value)}
								/>
							</React.Fragment>
						)}
					</div>
					<div className="w-50 column">
						{type === CLIENT_TYPES.PERSON ? (
							<React.Fragment>
								<span className="fw-500">Cinsiyet</span>
								<select
									className="input mt-2"
									value={gender}
									onChange={e => setGender(e.target.value)}
								>
									<option value="Erkek">Erkek</option>
									<option value="Kadın">Kadın</option>
								</select>
							</React.Fragment>
						) : (
							<React.Fragment>
								<span className="fw-500">MERSIS Numarası</span>
								<Input
									placeholder="MERSIS Numarası"
									classes="mt-2"
									value={MERSISNumber}
									onChange={e => setMERSISNumber(e.target.value)}
								/>
							</React.Fragment>
						)}
					</div>
				</div>
				<div className="flex al-start">
					<div className="w-50 mr-4">
						<span className="fw-500">Sigorta Sicil Numarası</span>
						<Input
							placeholder="Sigorta Sicil Numarası"
							classes="my-2"
							value={socialSecurityNumber}
							onChange={e => setSocialSecurityNumber(e.target.value)}
						/>
					</div>
					<div className="w-50 mr-4">
						<span className="fw-500">Ticaret Sicil Numarası</span>
						<Input
							placeholder="Ticaret Sicil Numarası"
							classes="my-2"
							value={tradeRegisterNumber}
							onChange={e => setTradeRegisterNumber(e.target.value)}
						/>
					</div>
					<div className="w-50 mr-4">
						<span className="fw-500">Vekalet Numarası</span>
						<Input
							placeholder="Vekalet Numarası"
							classes="mt-2"
							value={deputationNumber}
							onChange={e => setDeputationNumber(e.target.value)}
						/>
					</div>
				</div>
			</div>
			<div className="bg br p-8 mt-8">
				<div className="flex al-start mb-4">
					<div className="w-50 mr-4">
						<PhoneNumbersForm
							phoneNumbers={phoneNumbers}
							setPhoneNumbers={setPhoneNumbers}
						/>
					</div>
					<div className="w-50">
						<EmailForm emails={emails} setEmails={setEmails} />
					</div>
				</div>
				<div className="step-item-divider"></div>
				<AddressForm addresses={addresses} setAddresses={setAddresses} />
			</div>
			<div className="flex al-start bg br p-8 mt-8">
				<div className="w-50 mr-4">
					<BankAccountInformationForm
						bankAccountInformations={bankAccountInformations}
						setBankAccountInformations={setBankAccountInformations}
					/>
				</div>
				<div className="w-50">
					<span className="fw-500">Notlar</span>
					<Input
						textarea
						placeholder="Notlar"
						classes="mt-4"
						value={notes}
						onChange={e => setNotes(e.target.value)}
					/>
				</div>
			</div>
			<div className="my-8 bg br p-8">
				<span className="fw-500">Yetkiler</span>
				<div className="flex al-center mt-4">
					{POWERS_FOR_CLIENT.map(power => {
						return (
							<CheckBox
								key={power}
								checked={powers.includes(power)}
								onChange={() => handlePowers(power)}
								classes="brd py-2 px-4 br mr-4 fw-500"
							>
								{power}
							</CheckBox>
						)
					})}
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
				{client ? (
					<Button type="submit" theme="blue" classes="w-50 bold py-3">
						Kaydet
					</Button>
				) : (
					<Button type="submit" theme="blue" classes="w-50 bold py-3">
						Oluştur
					</Button>
				)}
			</div>
		</form>
	)
}
