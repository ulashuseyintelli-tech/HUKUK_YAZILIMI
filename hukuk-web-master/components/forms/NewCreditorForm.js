import React, { useState } from 'react'
import {
	CLIENT_TYPES,
	INSTITUTION_TYPES,
	STATUS,
	DEBTOR_KINDS,
	DEBTOR_TYPES,
} from '../../constants'
import Input from '../anBrains/Input'
import Button from '../anBrains/Button'
import { FaLongArrowAltLeft } from 'react-icons/fa'
import LoadingAnimation from '../anBrains/animations/LoadingAnimation/LoadingAnimation'
import { createCreditor, updateCreditor } from '../../services/creditorService'
import { getDebtorName } from '../../helpers/Helper'
import EmailForm from './EmailForm'
import BankAccountInformationForm from './BankAccountInformationForm'
import PhoneNumbersForm from './PhoneNumbersForm'
import AddressForm from './AddressForm'
import useInpoundmentContext from '../../services/hooks/useInpoundmentContext'
import { useRestrictionContext } from '../../services/hooks/useRestrictionContext'

export default function NewCreditorForm({ close, creditor, util }) {
	creditor = creditor || util

	const { creditors, setCreditors, onSortEnd } = useRestrictionContext()
	const {
		assetProps: { assetType, visibleAssetId },
	} = useInpoundmentContext()

	const [status, setStatus] = useState(STATUS.NORMAL)
	const [type, setType] = useState(
		creditor ? creditor.type : CLIENT_TYPES.PERSON,
	)
	const [name, setName] = useState(creditor ? creditor.name : '')
	const [surname, setSurname] = useState(creditor ? creditor.surname : '')
	const [deputy, setDeputy] = useState(creditor ? creditor.deputy : '')
	const [kind, setKind] = useState(creditor ? creditor.kind : DEBTOR_KINDS[0])
	const [institutionName, setInstitutionName] = useState(
		creditor ? creditor.institutionName : '',
	)
	const [MERSISNumber, setMERSISNumber] = useState(
		creditor ? creditor.MERSISNumber : '',
	)
	const [identityNumber, setIdentityNumber] = useState(
		creditor ? creditor.identityNumber : '',
	)
	const [gender, setGender] = useState(creditor ? creditor.gender : '')
	const [phoneNumbers, setPhoneNumbers] = useState(
		creditor ? creditor.phoneNumbers : [],
	)
	const [emails, setEmails] = useState(creditor ? creditor.emails : [])
	const [notes, setNotes] = useState(creditor ? creditor.notes : '')
	const [taxOffice, setTaxOffice] = useState(creditor ? creditor.taxOffice : '')
	const [taxNumber, setTaxNumber] = useState(creditor ? creditor.taxNumber : '')
	const [addresses, setAddresses] = useState(creditor ? creditor.addresses : [])
	const [bankAccountInformations, setBankAccountInformations] = useState(
		creditor ? creditor.bankAccountInformations : [],
	)

	const create = async e => {
		e.preventDefault()
		setStatus(STATUS.LOADING)
		await createCreditor({
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
		})
			.then(res => {
				setCreditors([res.data, ...creditors])
				close()
			})
			.catch(e => alert('Hata'))
		setStatus(STATUS.NORMAL)
	}

	const save = async e => {
		e.preventDefault()
		setStatus(STATUS.LOADING)
		await updateCreditor(
			creditor._id,
			{
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
			},
			assetType,
			visibleAssetId,
		)
			.then(res => {
				setCreditors([res.data, ...creditors])
				//TODO: burası aslında backendde tetiklenmeli!, claim100Status durumuna bakılması için gerçek olmayan bir update yapıyoruz
				onSortEnd(0, 0)
				close()
			})
			.catch(e => alert('Hata'))
		setStatus(STATUS.NORMAL)
	}

	return (
		<form className="" onSubmit={creditor ? save : create}>
			<LoadingAnimation status={status} />
			<Button theme="basic" classes="py-1 mb-4" type="button" onClick={close}>
				<FaLongArrowAltLeft className="mr-2" /> Geri Dön
			</Button>
			<p className="fs-lg fw-600 ">
				{creditor ? getDebtorName(creditor) : 'Yeni Alacaklı'}
			</p>
			<div className="bg br p-8 my-4">
				<div className="flex">
					<div className="w-50 mr-4">
						<span className="mr-2 fw-500">Alacaklı Tipi</span>
						<div className="mt-4">
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
							value={gender}
							onChange={e => setGender(e.target.value)}
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
				<Button type="submit" theme="blue" classes="w-50 bold py-3">
					{creditor?._id ? 'Kaydet' : 'Oluştur'}
				</Button>
			</div>
		</form>
	)
}
