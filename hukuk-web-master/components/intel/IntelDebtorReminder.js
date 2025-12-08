import React, { useState } from 'react'
import { FaPen } from 'react-icons/fa'
import { ADDRESS_TYPE, DEBTOR_TYPES } from '../../constants'
import {
	checkIdentityNumber,
	findFormalAddresses,
	handleError,
} from '../../helpers/Helper'
import { updateDebtor } from '../../services/deptorService'
import useInpoundmentContext from '../../services/hooks/useInpoundmentContext'
import Button from '../anBrains/Button'
import Input from '../anBrains/Input'
import AddressForm from '../forms/AddressForm'
import PhoneNumbersForm from '../forms/PhoneNumbersForm'
import TaskRadar from '../task/TaskRadar'
import TrueFalse from '../TrueFalse'

export default function IntelDebtorReminder({
	debtor,
	setDebtor,
	submit,
	setIntel,
	intel,
}) {
	const { currentCase } = useInpoundmentContext()

	const [isOpen, setIsOpen] = useState(!debtor.isInformationsAskedAgain)
	const [isIdentityNumberKnown, setIsIdentityNumberKnown] = useState(null)
	const [identityNumber, setIdentityNumber] = useState(
		debtor.type === DEBTOR_TYPES.INSTITUTION
			? debtor.taxNumber
			: debtor.identityNumber,
	)
	const [addresses, setAddresses] = useState(debtor.addresses)
	const [isAddressesKnown, setIsAddressesKnown] = useState(null)
	const [formalAddresses, setFormalAddresses] = useState(
		findFormalAddresses(debtor),
	)
	const [isFormalAddressKnown, setIsFormalAddressKnown] = useState(null)
	const [phoneNumbers, setPhoneNumbers] = useState(debtor.phoneNumbers)
	const [isPhoneNumbersKnown, setIsPhoneNumbersKnown] = useState(null)

	if (!isOpen) {
		return (
			<div className="intel-part flex al-center jst-between">
				<p>İstihbarat Detayları</p>
				<Button onClick={() => setIsOpen(!isOpen)}>
					<FaPen />
					Düzenle
				</Button>
			</div>
		)
	}

	const checkDebtorForm = () => {
		return (
			((debtor.type === DEBTOR_TYPES.INSTITUTION
				? debtor.taxNumber
				: debtor.identityNumber) ||
				isIdentityNumberKnown === false ||
				(identityNumber && identityNumber.length === 11)) &&
			(debtor.addresses.length > 0 ||
				isAddressesKnown === false ||
				addresses.length > 0) &&
			(debtor.addresses.length === 0
				? true
				: findFormalAddresses(debtor).length > 0 ||
				  isFormalAddressKnown === false ||
				  formalAddresses.length > 0) &&
			(debtor.phoneNumbers.length > 0 ||
				isPhoneNumbersKnown === false ||
				phoneNumbers.length > 0)
		)
	}

	const updateDebtorLastKnown = () => {
		const data = {}
		if (
			(debtor.type === DEBTOR_TYPES.INSTITUTION
				? !debtor.taxNumber
				: !debtor.identityNumber) &&
			identityNumber
		) {
			data.identityNumber = identityNumber
		}
		if (debtor.addresses.length === 0 && addresses.length > 0) {
			data.addresses = addresses
		}
		if (
			findFormalAddresses(debtor).length === 0 &&
			formalAddresses.length > 0
		) {
			data.addresses = Array.isArray(debtor.addresses)
				? [...debtor.addresses, ...formalAddresses]
				: [...formalAddresses]
		}
		if (debtor.phoneNumbers.length === 0 && phoneNumbers.length > 0) {
			data.phoneNumbers = phoneNumbers
		}
		data.isInformationsAskedAgain = true
		updateDebtor(currentCase._id, debtor._id, data)
			.then(res => {
				setDebtor({ ...res.data })
				if (debtor.addresses.length > 0) {
					intel.isCityKnown = true
					intel.isDistrictKnown = true
					submit()
				}
			})
			.catch(e => {
				handleError(e)
				console.log(e)
			})
	}

	return (
		<div>
			<div className="flex al-start">
				{!checkIdentityNumber(debtor) && (
					<TaskRadar
						containerClasses="w-100 intel-part br p-4"
						always={isIdentityNumberKnown === null}
					>
						<p className="fw-500">
							{`${
								debtor.type === DEBTOR_TYPES.INSTITUTION
									? 'Vergi Numarası'
									: 'T.C. Kimlik Numarası'
							}`}{' '}
							Biliniyor mu?
						</p>
						<TrueFalse
							object={{ isIdentityNumberKnown }}
							property="isIdentityNumberKnown"
							options={['Hayır', 'Evet, biliniyor']}
							change={(prop, val) => setIsIdentityNumberKnown(val)}
						/>
						{isIdentityNumberKnown && (
							<TaskRadar always={!identityNumber}>
								<div className="step-item-divider"></div>
								<p className="mb-2 fw-500">
									{debtor.type === DEBTOR_TYPES.INSTITUTION
										? 'Vergi Numarası'
										: 'T.C. Kimlik Numarası'}
								</p>
								<Input
									value={identityNumber}
									onChange={e => setIdentityNumber(e.target.value)}
									placeholder={
										debtor.type === DEBTOR_TYPES.INSTITUTION
											? 'Vergi Numarası'
											: 'T.C. Kimlik Numarası'
									}
								/>
							</TaskRadar>
						)}
					</TaskRadar>
				)}
				{debtor.addresses.length === 0 && (
					<TaskRadar
						always={isAddressesKnown === null}
						containerClasses="p-4 ml-4 w-100 intel-part br"
					>
						<p className="fw-500">Herhangi Bir Adres Biliniyor mu?</p>
						<TrueFalse
							object={{ isAddressesKnown }}
							property="isAddressesKnown"
							options={['Hayır', 'Evet, biliniyor']}
							change={(prop, val) => setIsAddressesKnown(val)}
						/>
						{isAddressesKnown && (
							<>
								<div className="step-item-divider"></div>

								<AddressForm
									addresses={addresses}
									setAddresses={setAddresses}
								/>
							</>
						)}
					</TaskRadar>
				)}
				{debtor.addresses.length > 0 &&
					findFormalAddresses(debtor).length === 0 && (
						<TaskRadar
							always={isFormalAddressKnown === null}
							containerClasses=" p-4 ml-4 w-100 intel-part br"
						>
							<p className="fw-500">Resmi Adresi Biliniyor mu?</p>
							<TrueFalse
								object={{ isFormalAddressKnown }}
								property="isFormalAddressKnown"
								options={['Hayır', 'Evet, biliniyor']}
								change={(prop, val) => setIsFormalAddressKnown(val)}
							/>
							{isFormalAddressKnown && (
								<TaskRadar always>
									<div className="step-item-divider"></div>
									<AddressForm
										exactType={ADDRESS_TYPE.FORMAL.value}
										addresses={formalAddresses}
										setAddresses={setFormalAddresses}
									/>
								</TaskRadar>
							)}
						</TaskRadar>
					)}
				{debtor.phoneNumbers.length === 0 && (
					<TaskRadar
						always={isPhoneNumbersKnown === null}
						containerClasses="p-4 ml-4 w-100 intel-part br"
					>
						<p className="fw-500">
							Herhangi Bir Telefon Numarası Biliniyor mu?
						</p>
						<TrueFalse
							object={{ isPhoneNumbersKnown }}
							property="isPhoneNumbersKnown"
							options={['Hayır', 'Evet, biliniyor']}
							change={(prop, val) => setIsPhoneNumbersKnown(val)}
						/>
						{isPhoneNumbersKnown && (
							<TaskRadar always right="95%">
								<div className="step-item-divider"></div>
								<PhoneNumbersForm
									phoneNumbers={phoneNumbers}
									setPhoneNumbers={setPhoneNumbers}
								/>
							</TaskRadar>
						)}
					</TaskRadar>
				)}
			</div>
			<Button
				theme="blue"
				classes="w-100 py-3 fw-600 mt-4"
				disabled={!checkDebtorForm()}
				onClick={updateDebtorLastKnown}
			>
				Kaydet
			</Button>
		</div>
	)
}
