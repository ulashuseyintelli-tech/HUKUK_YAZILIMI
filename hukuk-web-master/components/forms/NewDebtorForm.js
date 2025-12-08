import React, { useState } from 'react'
import {
	CLIENT_TYPES,
	INSTITUTION_TYPES,
	BANK_ACCOUNT_INFORMATION,
	STATUS,
	DEBTOR_KINDS,
	DEBTOR_TYPES,
} from '../../constants'
import Input from '../anBrains/Input'
import Button from '../anBrains/Button'
import LoadingAnimation from '../anBrains/animations/LoadingAnimation/LoadingAnimation'
import {
	createDebtor,
	searchSameDebtors,
	updateDebtor,
} from '../../services/deptorService'
import PhoneNumbersForm from './PhoneNumbersForm'
import BankAccountInformationForm from './BankAccountInformationForm'
import AddressForm from './AddressForm'
import EmailForm from './EmailForm'
import { FaCheck, FaLongArrowAltLeft, FaPlus } from 'react-icons/fa'
import useInpoundmentContext from '../../services/hooks/useInpoundmentContext'
import {
	getDebtorIdentityString,
	getDebtorName,
	getDebtorType,
	handleError,
} from '../../helpers/Helper'
import Modal from '../anBrains/Modal'
import Note from '../Note'

export default function NewDebtorForm({
	close,
	debtor,
	allDebtors,
	setAllDebtors,
	addDebtor,
	setDebtor,
	util,
	handleClickItem,
}) {
	const { currentCase } = useInpoundmentContext()
	debtor = util || debtor

	const [status, setStatus] = useState(STATUS.NORMAL)
	const [type, setType] = useState(debtor ? debtor.type : CLIENT_TYPES.PERSON)
	const [name, setName] = useState(debtor ? debtor.name : '')
	const [surname, setSurname] = useState(debtor ? debtor.surname : '')
	const [deputy, setDeputy] = useState(debtor ? debtor.deputy : '')
	const [kind, setKind] = useState(debtor ? debtor.kind : DEBTOR_KINDS[0])
	const [institutionName, setInstitutionName] = useState(
		debtor ? debtor.institutionName : '',
	)
	const [instutionType, setInstutionType] = useState(
		debtor ? debtor.instutionType : INSTITUTION_TYPES.PUBLIC,
	)
	const [MERSISNumber, setMERSISNumber] = useState(
		debtor ? debtor.MERSISNumber : '',
	)
	const [identityNumber, setIdentityNumber] = useState(
		debtor ? debtor.identityNumber : '',
	)
	const [gender, setGender] = useState(debtor ? debtor.gender : '')
	const [phoneNumbers, setPhoneNumbers] = useState(
		debtor ? debtor.phoneNumbers : [],
	)
	const [emails, setEmails] = useState(debtor ? debtor.emails : [])
	const [notes, setNotes] = useState(debtor ? debtor.notes : '')
	const [taxOffice, setTaxOffice] = useState(debtor ? debtor.taxOffice : '')
	const [taxNumber, setTaxNumber] = useState(debtor ? debtor.taxNumber : '')
	const [addresses, setAddresses] = useState(debtor ? debtor.addresses : [])
	const [bankAccountInformations, setBankAccountInformations] = useState(
		debtor ? debtor.bankAccountInformations : [],
	)

	const [similarDebtors, setSimilarDebtors] = useState([])

	const create = async (e, withoutSearch) => {
		e.preventDefault()
		if (validateFields() === true) {
			setStatus(STATUS.LOADING)
			if (!withoutSearch) {
				let similarDebtors = []
				await searchSameDebtors(name, surname, institutionName, type)
					.then(res => {
						similarDebtors = res.data
						setSimilarDebtors([...similarDebtors])
					})
					.catch(e => handleError(e))
				if (similarDebtors.length > 0) {
					return setStatus(STATUS.NORMAL)
				}
			}
			await createDebtor(currentCase._id, {
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
					addDebtor(res.data)
					setSimilarDebtors([])
					close()
				})
				.catch(e => {
					console.log(e)
					alert('Hata')
				})
			setStatus(STATUS.NORMAL)
		}
	}

	const save = async e => {
		e.preventDefault()
		if (validateFields() === true) {
			setStatus(STATUS.LOADING)
			await updateDebtor(currentCase._id, debtor._id, {
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
					const index = allDebtors.findIndex(d => d._id === debtor._id)
					allDebtors[index] = res.data
					setAllDebtors([...allDebtors])
					setDebtor({ ...res.data })
					alert('Borçlu başarıyla güncellendi.')
				})
				.catch(e => {
					alert('Hata')
					console.log(e)
				})

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
					return true
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

	const addSimilarDebtorToCase = similarDebtor => {
		handleClickItem(similarDebtor)
		close()
	}

	return (
		<>
			<LoadingAnimation status={status} />
			<Modal visible={similarDebtors.length > 0} close={close}>
				<div className="form-modal" style={{ maxWidth: '500px' }}>
					<Note type="zekiye" classes="mb-8">
						Benzer kimliğe sahip daha önce eklediğiniz borçlu bulundu.
						Dilerseniz bu borçluyu takibe ekleyebilir veya yine de yeni bir
						borçlu oluşturabilirsiniz.
					</Note>
					<p className="fw-600 fs-md mb-4">Daha Önce Oluşturulmuş Borçlular</p>
					<div className="bg br p-4">
						{similarDebtors.map(similarDebtor => {
							const alreadyAddedToCase = currentCase.debtorIds.includes(
								similarDebtor._id,
							)
							return (
								<div className="bg-white br p-4 mb-4 flex al-center jst-between">
									<div>
										<p className="fw-500 mb-2">
											{getDebtorName(similarDebtor)}
											<span className="badge fs-xsm ml-2">
												{getDebtorType(similarDebtor)}
											</span>
										</p>
										<p>{getDebtorIdentityString(similarDebtor)}</p>
									</div>
									{alreadyAddedToCase ? (
										<div className="flex al-center fs-sm blue bg-white p-2 br">
											<FaCheck className="mr-2" />
											<p className="fw-500">Takibe Eklenmiş</p>
										</div>
									) : (
										<Button
											theme="green fw-600 mr-4 flex"
											icon={<FaPlus />}
											onClick={() => addSimilarDebtorToCase(similarDebtor)}
										>
											Takibe Ekle
										</Button>
									)}
								</div>
							)
						})}
					</div>

					<div className="flex al-cente mt-8">
						<Button theme="red w-100 fw-500 py-3 mr-4" onClick={close}>
							Vazgeç
						</Button>
						<Button
							icon={<FaPlus />}
							theme="blue w-100 fw-500 py-3"
							onClick={e => create(e, true)}
						>
							Yine de yeni borçlu oluştur
						</Button>
					</div>
				</div>
			</Modal>
			<div className="flex al-center mb-8 mt-4">
				{(!debtor || util) && (
					<Button
						theme="basic"
						classes="py-1 mr-4"
						type="button"
						onClick={close}
					>
						<FaLongArrowAltLeft className="mr-2" /> Geri Dön
					</Button>
				)}
				<p className="fs-lg fw-600 ">
					{debtor ? getDebtorName(debtor) : 'Yeni Borçlu'}
				</p>
			</div>
			<form className="new-util-form" onSubmit={debtor ? save : create}>
				<div className="bg br p-8 mb-4">
					<div className="flex">
						<div className="w-50">
							<span className="mr-2 fw-500 ">Borçlu Tipi</span>
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
					<div className="flex mt-4">
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
									<span className="fw-500 mb-2">MERSIS Numarası</span>
									<Input
										placeholder="MERSIS Numarası"
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
				</div>
				<div className="bg br p-8 mb-4">
					<AddressForm
						addresses={addresses}
						setAddresses={setAddresses}
						withKind
						debtorType={type}
					/>
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
					{debtor ? (
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
		</>
	)
}
