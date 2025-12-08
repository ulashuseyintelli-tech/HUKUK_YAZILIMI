import React, { useEffect, useState } from 'react'
import {
	FaCheck,
	FaChevronCircleDown,
	FaChevronDown,
	FaChevronUp,
	FaEye,
	FaFingerprint,
	FaIdCard,
} from 'react-icons/fa'
import { DEBTOR_TYPES, INTEL_TYPE, TASK_TYPE } from '../../constants'
import {
	checkIdentityNumber,
	declareAreAddressesSame,
	handleError,
} from '../../helpers/Helper'
import { updateDebtor } from '../../services/deptorService'
import { useDebtorContext } from '../../services/hooks/useDebtorContext'
import useInpoundmentContext from '../../services/hooks/useInpoundmentContext'

import Button from '../anBrains/Button'
import CheckBox from '../anBrains/CheckBox'
import Input from '../anBrains/Input'
import AddressForm from '../forms/AddressForm'
import Note from '../Note'
import Printer from '../Printer'
import TaskRadar from '../task/TaskRadar'
import TrueFalse from '../TrueFalse'

export default function IntelType({
	type,
	intel,
	update,
	printerProps,
	debtor,
	visibleType,
	setVisibleType,
	inSidebar,
}) {
	const { debtorTasks, setDebtor } = useDebtorContext()
	const { currentCase } = useInpoundmentContext()
	const typeObject = { ...intel[type.entityName] }

	const [addresses, setAddresses] = useState(
		typeObject.response.addresses || [],
	)
	const [identityNumber, setIdentityNumber] = useState(
		typeObject.response.identityNumber || '',
	)
	const [taxNumber, setTaxNumber] = useState(
		typeObject.response.taxNumber || '',
	)

	useEffect(() => {
		setAddresses(typeObject.response.addresses || [])
		setIdentityNumber(typeObject.response.identityNumber || [])
		setTaxNumber(typeObject.response.taxNumber || [])
	}, [visibleType])

	const _update = (prop, val, innerProp) => {
		return update(prop, val, innerProp)
	}

	const updateResponse = (innerProp, val) => {
		if (
			(innerProp === 'isAddressGiven' &&
				val === false &&
				(typeObject.response.isIdentityNumberGiven === false ||
					typeObject.response.isTaxNumberGiven === false)) ||
			((innerProp === 'isIdentityNumberGiven' ||
				innerProp === 'isTaxNumberGiven') &&
				val === false &&
				typeObject.response.isAddressGiven === false)
		) {
			return alert(
				"Yarar bilgi geldi dediğiniz için iki bilgi türünü de 'Gelmedi' olarak işaretleyemezsiniz",
			)
		}
		return _update('response', val, innerProp)
	}

	const saveAddresses = async () => {
		await _update('response', addresses, 'addresses')
		const newAddresses = [
			...addresses.filter(
				a => !debtor.addresses.some(b => declareAreAddressesSame(a, b)),
			),
		]
		debtor.addresses = [...debtor.addresses, ...newAddresses]
		updateDebtor(currentCase._id, debtor._id, { ...debtor })
			.then(res => {
				setDebtor({ ...res.data })
				alert('Adresler borçluya başarıyla eklendi')
			})
			.catch(e => handleError(e))
	}

	const saveIdentityNumber = async () => {
		await _update('response', identityNumber, 'identityNumber')
		debtor.identityNumber = identityNumber
		updateDebtor(currentCase._id, debtor._id, { ...debtor })
			.then(res => {
				setDebtor({ ...res.data })
				alert('T.C. Kimlik Numarası başarıyla eklendi')
			})
			.catch(e => handleError(e))
	}

	const saveTaxNumber = async () => {
		await _update('response', taxNumber, 'taxNumber')
		debtor.identityNumber = identityNumber
		updateDebtor(currentCase._id, debtor._id, { ...debtor })
			.then(res => {
				setDebtor({ ...res.data })
				alert('Vergi Numarası başarıyla eklendi')
			})
			.catch(e => handleError(e))
	}

	const hasTask = debtorTasks.some(
		t => t.extra && t.extra.intelType === type.entityName,
	)

	const checkTaskExist = taskType => {
		return debtorTasks.some(
			t => t.extra?.intelType === type.entityName && t.type === taskType,
		)
	}

	const isOpen = visibleType === type.entityName

	const newAddresses = [
		...addresses.filter(
			a => !debtor.addresses.some(b => declareAreAddressesSame(a, b)),
		),
	]

	const AddressFooterButton = ({ address }) => {
		return debtor.addresses.some(ad => declareAreAddressesSame(address, ad)) ? (
			<div className="badge-cyan fs-sm">Adres borçluya kaydedilmiş</div>
		) : (
			<div></div>
		)
	}

	return (
		<>
			{inSidebar && (
				<TaskRadar
					containerClasses="mb-4 w-100"
					always={hasTask && !isOpen}
					right="95%"
				>
					<Button
						classes="flex al-center jst-start w-100 px-2"
						onClick={() => setVisibleType(isOpen ? null : type.entityName)}
						theme={isOpen ? 'cute' : 'basic'}
					>
						<FaFingerprint className="mr-2 blue" />
						<p className="fw-600 fs-nm dark-blue">{type.name}</p>
						{/* <div className="flex al-center">
					{type.entityName !== 'client' && (
						<Printer {...printerProps} request={type.value} />
					)}
					<div
						className={`btn btn-cute br-50 p-2 ml-4 ${
							hasTask && !isOpen ? 'mr-8' : ''
						}`}
					>
						{isOpen ? <FaChevronUp /> : <FaChevronDown />}
					</div>
				</div> */}
					</Button>
				</TaskRadar>
			)}
			{isOpen && !inSidebar && (
				<TaskRadar
					containerClasses="intel-part w-100 py-8"
					always={hasTask && !isOpen}
					right="95%"
				>
					<Button
						classes="flex al-center jst-start w-100 px-2"
						onClick={() => setVisibleType(isOpen ? null : type.entityName)}
					>
						<FaFingerprint className="mr-2 blue" />
						<p className="fw-600 fs-md dark-blue">{type.name}</p>
					</Button>
					<div className="step-item-divider"></div>
					<div id="request-intel">
						<div className="flex">
							<TaskRadar
								containerClasses="w-50 bg br p-4 mr-4"
								always={checkTaskExist(TASK_TYPE.REQUEST_INTEL)}
							>
								<p className="fw-600 dark-blue">
									{type.entityName === INTEL_TYPE.CLIENT.entityName
										? 'Müvekkile istihbarata dair bilgiler soruldu mu?'
										: 'Müzekkere Gönderildi Mi?'}
								</p>
								<TrueFalse
									options={['Hayır', 'Evet']}
									property="isRequested"
									object={typeObject}
									change={_update}
								/>
							</TaskRadar>
							{typeObject.isRequested && (
								<TaskRadar
									always={checkTaskExist(TASK_TYPE.ENTER_INTEL_RESPONSE)}
									containerClasses="w-50 bg br p-4"
								>
									<p className="fw-600 dark-blue">
										{type.entityName === INTEL_TYPE.CLIENT.entityName
											? 'Müvekkilden cevap geldi mi?'
											: 'Müzekkere Cevabı Geldi Mi?'}
									</p>
									<TrueFalse
										options={['Hayır', 'Evet']}
										property="isResponsed"
										object={typeObject}
										change={_update}
									/>
								</TaskRadar>
							)}
						</div>
						{typeObject.isRequested && (
							<>
								{typeObject.isResponsed === false &&
									type.entityName !== INTEL_TYPE.CLIENT.entityName && (
										<div className="flex mt-4">
											<TaskRadar
												always={checkTaskExist(TASK_TYPE.REQUEST_INTEL_ALIAS)}
												containerClasses="w-50 bg br p-4 mr-4"
											>
												<div className="flex al-center jst-between">
													<p className="fw-600 dark-blue">
														Tekid Müzekkeresi Gönderildi Mi?
													</p>
													<Printer
														{...printerProps}
														request={`${type.value}_ALIAS`}
													/>
												</div>
												<TrueFalse
													options={['Hayır', 'Evet']}
													property="aliasRequested"
													object={typeObject}
													change={_update}
												/>
											</TaskRadar>
											{typeObject.aliasRequested === true && (
												<TaskRadar
													always={checkTaskExist(
														TASK_TYPE.ENTER_INTEL_ALIAS_RESPONSE,
													)}
													containerClasses="w-50 bg br p-4"
												>
													<>
														<p className="fw-600 dark-blue">
															Müzekkere Cevabı Geldi Mi?
														</p>
														<TrueFalse
															options={['Hayır', 'Evet']}
															property="aliasResponsed"
															object={typeObject}
															change={_update}
														/>
													</>
												</TaskRadar>
											)}
										</div>
									)}
							</>
						)}
						{(typeObject.isResponsed || typeObject.aliasResponsed) && (
							<>
								<div className="bg br p-4 my-4">
									<TaskRadar
										always={checkTaskExist(TASK_TYPE.IS_INTEL_RESPONSE_USEFUL)}
									>
										<p className="fw-600 mb-4 dark-blue">
											Gelen Cevapta Yarar Bilgi Var Mı?
										</p>
										<TrueFalse
											options={['Hayır, yok', 'Evet, var']}
											property="isResponseUseful"
											object={typeObject}
											change={_update}
										/>
									</TaskRadar>
									<div className="step-item-divider"></div>
									<div>
										{typeObject.isResponseUseful && (
											<>
												<p className="fw-600 mb-4 dark-blue">
													Gelen yarar bilgileri seçin
												</p>
												<div className="flex">
													<TaskRadar
														containerClasses="w-50 mb-4 mr-4"
														always={typeObject.response.isAddressGiven === null}
													>
														<p>Adres bilgisi geldi mi?</p>
														<TrueFalse
															object={typeObject.response}
															property="isAddressGiven"
															change={updateResponse}
															options={['Gelmedi', 'Geldi']}
														/>
													</TaskRadar>
													{!checkIdentityNumber(debtor) && (
														<TaskRadar
															containerClasses="w-50 mb-4 mr-4"
															always={
																typeObject.response.isIdentityNumberGiven ===
																null
															}
														>
															{debtor.type === DEBTOR_TYPES.INSTITUTION
																? 'Vergi numarası'
																: 'T.C. kimlik numarası geldi'}
															<TrueFalse
																object={typeObject.response}
																property={
																	debtor.type === DEBTOR_TYPES.INSTITUTION
																		? 'isTaxNumberGiven'
																		: 'isIdentityNumberGiven'
																}
																change={updateResponse}
																options={['Gelmedi', 'Geldi']}
															/>
														</TaskRadar>
													)}
												</div>
											</>
										)}
									</div>
								</div>

								{typeObject.isResponseUseful && (
									<>
										{typeObject.response.isAddressGiven && (
											<div className="bg br p-4 mb-4">
												<div className="flex al-center jst-between">
													<div className="mr-4">
														<p className="fw-600 dark-blue">
															İstihbarattan Elde Edilen Adresleri Girin
														</p>
														<p className="fs-sm">
															Burada girdiğiniz adresler borçlunun mevcut
															adreslerinin üzerine eklenecektir
														</p>
													</div>
													{debtor.addresses.length > 0 && (
														<Button
															theme="orange"
															classes="fs-sm fw-500"
															icon={<FaEye />}
														>
															Borçlunun {debtor.addresses.length} adresi mevcut
														</Button>
													)}
												</div>
												<div className="step-item-divider"></div>
												<AddressForm
													title="İstihbarattan Elde Edilen Adresler"
													titleClassName="dark-blue"
													addresses={addresses}
													setAddresses={setAddresses}
													addressFooterButton={<AddressFooterButton />}
												/>
												{addresses.length !== 0 && (
													<Button
														theme="cute"
														classes="fw-600 w-100 py-3"
														icon={<FaCheck />}
														disabled={
															!addresses ||
															addresses.length === 0 ||
															addresses.some(
																a => !a.title || !a.description || !a.type,
															) ||
															newAddresses.length === 0
														}
														onClick={saveAddresses}
													>
														Adresleri Borçluya Kaydet
													</Button>
												)}
											</div>
										)}
										{typeObject.response.isIdentityNumberGiven &&
											debtor.type === DEBTOR_TYPES.PERSON && (
												<div className="bg br p-4">
													<p className="fw-600 mb-2 dark-blue">
														İstihbarattan Elde Edilen T.C. Kimlik Numarasını
														Girin
													</p>
													{debtor.identityNumber === identityNumber && (
														<Note type="success" classes="fw-500 mb-4">
															T.C. Kimlik numarası kaydedildi!
														</Note>
													)}
													<Input
														icon={<FaIdCard />}
														classes="bg-white"
														onChange={e => setIdentityNumber(e.target.value)}
														placeholder="T.C. kimlik numarası"
														value={identityNumber}
													/>
													{identityNumber.length !== 0 && (
														<Button
															theme="cute"
															classes="fw-600 w-100 py-3 mt-4"
															icon={<FaCheck />}
															disabled={
																identityNumber.length !== 11 ||
																identityNumber === debtor.identityNumber
															}
															onClick={saveIdentityNumber}
														>
															T.C. Kimlik Numarasını Kaydet
														</Button>
													)}
												</div>
											)}
										{typeObject.response.isTaxNumberGiven &&
											debtor.type === DEBTOR_TYPES.INSTITUTION && (
												<div className="bg br p-4">
													<p className="fw-600 mb-2 dark-blue">
														İstihbarattan Elde Edilen Vergi Numarasını Girin
													</p>
													<Input
														value={taxNumber}
														icon={<FaIdCard />}
														classes="bg-white"
														onChange={e => setTaxNumber(e.target.value)}
														placeholder="Vergi numarası"
													/>
													{taxNumber.length !== 0 && (
														<Button
															theme="cute"
															classes="fw-600 w-100 py-3 mt-4"
															icon={<FaCheck />}
															onClick={saveTaxNumber}
														>
															Vergi Numarasını Kaydet
														</Button>
													)}
												</div>
											)}
									</>
								)}
							</>
						)}
					</div>
				</TaskRadar>
			)}
		</>
	)
}
