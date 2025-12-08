import React, { useState } from 'react'
import {
	CLIENT_TYPES,
	STATUS,
	DEBTOR_KINDS,
	DEBTOR_TYPES,
} from '../../constants'
import Input from '../anBrains/Input'
import Button from '../anBrains/Button'
import { FaLongArrowAltLeft } from 'react-icons/fa'
import LoadingAnimation from '../anBrains/animations/LoadingAnimation/LoadingAnimation'
import { createThirdPerson, updateDebtor } from '../../services/deptorService'
import useInpoundmentContext from '../../services/hooks/useInpoundmentContext'
import { getDebtorName, handleError } from '../../helpers/Helper'
import AddressForm from './AddressForm'
import BankAccountInformationForm from './BankAccountInformationForm'
import EmailForm from './EmailForm'
import PhoneNumbersForm from './PhoneNumbersForm'

export default function NewThirdPersonForm({
	close,
	thirdPersons,
	setThirdPersons,
	thirdPersonReason,
	exactType,
	util = {},
	handleClickItem,
}) {
	const { currentCase } = useInpoundmentContext()

	const [status, setStatus] = useState(STATUS.NORMAL)
	const [type, setType] = useState(
		util?.type || exactType || CLIENT_TYPES.PERSON,
	)
	const [name, setName] = useState(util?.name || '')
	const [surname, setSurname] = useState(util?.surname || '')
	const [deputy, setDeputy] = useState(util?.deputy || '')
	const [kind, setKind] = useState(util?.kind || DEBTOR_KINDS[0])
	const [institutionName, setInstitutionName] = useState(
		util?.institutionName || '',
	)
	const [MERSISNumber, setMERSISNumber] = useState(util?.MERSISNumber || '')
	const [identityNumber, setIdentityNumber] = useState(
		util?.identityNumber || '',
	)
	const [gender, setGender] = useState(util?.gender || '')
	const [phoneNumbers, setPhoneNumbers] = useState(util?.phoneNumbers || [])
	const [emails, setEmails] = useState(util?.emails || [])
	const [notes, setNotes] = useState(util?.notes || '')
	const [taxOffice, setTaxOffice] = useState(util?.taxOffice || '')
	const [taxNumber, setTaxNumber] = useState(util?.taxNumber || '')
	const [addresses, setAddresses] = useState(util?.addresses || [])
	const [bankAccountInformations, setBankAccountInformations] = useState(
		util?.bankAccountInformations || [],
	)

	const create = async e => {
		if (validateFields() === true) {
			setStatus(STATUS.LOADING)
			await createThirdPerson({
				type,
				name,
				surname,
				deputy,
				kind,
				identityNumber,
				gender,
				phoneNumbers,
				emails,
				notes,
				taxOffice,
				taxNumber,
				addresses,
				bankAccountInformations,
				institutionName,
				MERSISNumber,
				thirdPersonReasons: thirdPersonReason ? [thirdPersonReason] : [],
			})
				.then(res => {
					if (handleClickItem) {
						handleClickItem(res.data, true)
					} else {
						setThirdPersons([res.data, ...thirdPersons])
					}
					close()
				})
				.catch(e => {
					handleError(e)
					console.log(e)
				})
			setStatus(STATUS.NORMAL)
		}
	}

	const save = async e => {
		if (validateFields() === true) {
			setStatus(STATUS.LOADING)
			await updateDebtor(currentCase._id, util?._id, {
				type,
				name,
				surname,
				deputy,
				kind,
				identityNumber,
				gender,
				phoneNumbers,
				emails,
				notes,
				taxOffice,
				taxNumber,
				addresses,
				bankAccountInformations,
				institutionName,
				MERSISNumber,
				thirdPersonReasons: thirdPersonReason ? [thirdPersonReason] : [],
			})
				.then(res => {
					setThirdPersons([res.data, ...thirdPersons])
					close()
				})
				.catch(handleError)
			setStatus(STATUS.NORMAL)
		}
	}

	const validateFields = () => {
		if (
			(type === DEBTOR_TYPES.PERSON && name && surname) ||
			(type === DEBTOR_TYPES.INSTITUTION && institutionName !== '')
		) {
			if (
				type === DEBTOR_TYPES.PERSON
					? identityNumber
						? identityNumber && identityNumber.length === 11
						: true
					: true
			) {
				if (!addresses.some(a => !a.type)) {
					if (type === DEBTOR_TYPES.INSTITUTION && addresses.length > 0) {
						return true
					} else {
						alert(
							'Üçüncü şahıs bir kurum eklerken en az 1 adres girmeniz gerekiyor.',
						)
					}
				} else {
					alert('Tüm adreslerin adres türünü girmeniz gerekiyor.')
				}
			} else {
				alert('T.C. Kimlik Numarası 11 haneli olmalıdır.')
			}
		} else {
			alert(
				type === DEBTOR_TYPES.PERSON
					? 'Lütfen isim ve soyisim alanlarını doldurun!'
					: 'Lütfen kurum adı girin',
			)
		}
	}

	const handleSubmit = () => {
		return util ? save() : create()
	}

	return (
		<div>
			<LoadingAnimation status={status} />
			<Button theme="basic" classes="py-1 mb-4" type="button" onClick={close}>
				<FaLongArrowAltLeft className="mr-2" /> Geri Dön
			</Button>
			<p className="fs-lg fw-600 ">
				{util ? getDebtorName(util) : 'Yeni Üçüncü Şahıs'}
			</p>
			<div className="bg br p-8 my-4">
				<div className="flex">
					<div className="w-50 mr-4">
						<span className="mr-2 fw-500">Üçüncü Şahıs Tipi</span>
						<div className="mt-4" disabled={exactType}>
							<label>
								<input
									type="radio"
									value={DEBTOR_TYPES.PERSON}
									checked={type === DEBTOR_TYPES.PERSON}
									className="mr-2"
									onChange={e => setType(e.target.value)}
								/>
								Şahıs
							</label>
							<label className="ml-4">
								<input
									type="radio"
									value={CLIENT_TYPES.INSTITUTION}
									checked={type === CLIENT_TYPES.INSTITUTION}
									className="mr-2"
									onChange={e => setType(e.target.value)}
								/>
								Kurum
							</label>
						</div>
					</div>
					<label className="w-50 mr-4">
						{type === DEBTOR_TYPES.PERSON ? (
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
					</label>
					<label className="w-50 mr-4">
						{type === DEBTOR_TYPES.PERSON ? (
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
					</label>
					<label className="w-50">
						<span className="fw-500">Vekili</span>
						<Input
							placeholder="Vekili"
							classes="mt-2"
							value={deputy}
							onChange={e => setDeputy(e.target.value)}
						/>
					</label>
				</div>
				<div className="flex mt-6">
					<label className="w-50 mr-4">
						{type === DEBTOR_TYPES.PERSON ? (
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
					</label>
					<label className="w-50 column mr-4">
						{type === DEBTOR_TYPES.PERSON ? (
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
					</label>
					<label className="w-50 column">
						<span className="fw-500">Tür</span>
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
			</div>
			<div className="flex al-start bg br p-8 mb-4">
				<div className="w-50 mr-8">
					<PhoneNumbersForm
						phoneNumbers={phoneNumbers}
						setPhoneNumbers={setPhoneNumbers}
					/>
				</div>
				<div className="w-50 mr-8">
					<EmailForm emails={emails} setEmails={setEmails} />
				</div>
				<div className="w-50">
					<BankAccountInformationForm
						bankAccountInformations={bankAccountInformations}
						setBankAccountInformations={setBankAccountInformations}
					/>
				</div>
			</div>{' '}
			<div className="bg br p-8 mb-4">
				<AddressForm addresses={addresses} setAddresses={setAddresses} />
			</div>
			<div className="flex bg br p-8 mb-4">
				<div className="w-100">
					<span className="fw-500 mb-4">Notlar</span>
					<Input
						textarea
						placeholder="Notlar"
						classes="mt-4"
						value={notes}
						onChange={e => setNotes(e.target.value)}
					/>
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
				<Button
					type="button"
					onClick={handleSubmit}
					theme="blue"
					classes="w-50 bold py-3"
				>
					{util?._id ? 'Kaydet' : 'Oluştur'}
				</Button>
			</div>
		</div>
	)
}
