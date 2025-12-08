import React, { useState } from 'react'
import { STATUS, CURRENCIES } from '../../constants'
import Input from '../anBrains/Input'
import Button from '../anBrains/Button'
import LoadingAnimation from '../anBrains/animations/LoadingAnimation/LoadingAnimation'
import { createDue, updateDue } from '../../services/dueService'
import {
	getUsuryTypesByCurrency,
	handleError,
	toDateInputValue,
} from '../../helpers/Helper'
import useInpoundmentContext from '../../services/hooks/useInpoundmentContext'
import { FaLongArrowAltLeft } from 'react-icons/fa'
import Note from '../Note'
import CaseForm from './CaseForm'
import CauseOfDebtForm from './CauseOfDebtForm'
import { formatMoney } from '../../helpers/financeHelper'
import { getCauseOfDebt } from '../../constants/causesOfDebts'

export default function NewDueForm({ close, due, dues, setDues, util }) {
	const { currentCase } = useInpoundmentContext()
	due = due || util

	// ALL CASES
	const [status, setStatus] = useState(STATUS.NORMAL)
	const [causeOfDebt, setCauseOfDebt] = useState(
		due ? due.causeOfDebt : getCauseOfDebt(currentCase.type)[0],
	)
	const [expiryDate, setExpiryDate] = useState(
		due ? due.expiryDate : new Date(),
	)
	const [totalAmount, setTotalAmount] = useState(due ? due.totalAmount : 0)
	const [currency, setCurrency] = useState(due ? due.currency : 'TRY')
	const [description, setDescription] = useState(due ? due.description : '')

	// FOR CHECQUE
	const [beforeCaseUsury, setBeforeCaseUsury] = useState(
		due ? due.beforeCaseUsury : null,
	)
	const [afterCaseUsury, setAfterCaseUsury] = useState(
		due ? due.afterCaseUsury : null,
	)
	const [presentationDate, setPresentationDate] = useState(
		due ? due.presentationDate : new Date(),
	)
	const [checqueSerialNumber, setChecqueSerialNumber] = useState(
		due ? due.checqueSerialNumber : '',
	)
	const [bankAndBranch, setBankAndBranch] = useState(
		due ? due.bankAndBranch : '',
	)
	const [checquePersons, setChecquePersons] = useState(
		due ? due.checquePersons : [],
	)
	const [editIn, setEditIn] = useState(due ? due.editIn : '')
	const [accountNumber, setAccountNumber] = useState(
		due ? due.accountNumber : '',
	)

	// FOR INSTRUMENT
	const [placeOfDrawing, setPlaceOfDrawing] = useState(
		due ? due.placeOfDrawing : '',
	)
	const [instrumentNumber, setInstrumentnumber] = useState(
		due ? due.instrumentNumber : '',
	)

	// FOR OTHERS
	const [customerNumber, setCustomerNumber] = useState(
		due ? due.customerNumber : '',
	)
	const [documentDate, setDocumentDate] = useState(
		due ? due.documentDate : new Date(),
	)

	const create = async e => {
		e.preventDefault()
		if (validateForm()) {
			setStatus(STATUS.LOADING)
			const func = due ? updateDue : createDue
			await func(due ? due._id : currentCase._id, {
				causeOfDebt,
				expiryDate,
				totalAmount,
				currency,
				description,
				beforeCaseUsury,
				afterCaseUsury,
				presentationDate,
				checqueSerialNumber,
				bankAndBranch,
				checquePersons,
				editIn,
				accountNumber,
				placeOfDrawing,
				instrumentNumber,
				customerNumber,
				documentDate,
			})
				.then(res => {
					if (due) {
						const index = dues.findIndex(d => d._id === due._id)
						dues[index] = res.data
					} else {
						dues.push(res.data)
					}
					setDues([...dues])
					alert(
						`Alacak Kalemi başarıyla ${due ? 'güncellendi' : 'oluşturuldu'}`,
					)
					close()
				})
				.catch(e => {
					console.log(e)
					handleError(e)
				})
			setStatus(STATUS.NORMAL)
		}
	}

	const validateForm = () => {
		if (totalAmount === 0) {
			alert('Lütfen tutar girin.')
		} else if (expiryDate > new Date()) {
			alert('Vade/Keşide tarihi bugünden sonra olamaz!')
		} else {
			return true
		}
	}

	return (
		<form className="new-util-form" onSubmit={create}>
			<LoadingAnimation status={status} />
			<Button theme="basic" classes="py-1 mb-4" type="button" onClick={close}>
				<FaLongArrowAltLeft className="mr-2" /> Geri Dön
			</Button>
			{!due && <span className="fs-lg fw-600">Yeni Alacak Kalemi</span>}
			{due && (
				<div className="flex al-center">
					<p className="fw-600 fs-lg">
						{formatMoney(due.totalAmount)} {due.currency}
					</p>
					<div className="badge fs-sm ml-2 py-0">
						<span className="fw-600">{due.causeOfDebt}</span>
					</div>
				</div>
			)}
			<div className="flex al-center my-6 bg br p-8">
				<div className="w-50 mr-4 column">
					<span className="fw-500">Borcun Sebebi</span>
					<CauseOfDebtForm
						selectedValue={causeOfDebt}
						onChange={setCauseOfDebt}
					/>
				</div>
				<div className="w-50 mr-4">
					<span className="fw-500">Vade/Keşide Tarihi</span>
					<Input
						type="date"
						placeholder="Vade/Keşide Tarihi"
						classes="mt-2"
						value={
							expiryDate
								? toDateInputValue(new Date(expiryDate), 0)
								: expiryDate
						}
						onChange={e => {
							setExpiryDate(e.target.value)
						}}
					/>
				</div>
				<div className="w-50 mr-4">
					<span className="fw-500">Toplam Tutar</span>
					<div className="flex al-center mt-2">
						<Input
							placeholder="Toplam Tutar"
							value={totalAmount}
							onChange={e => setTotalAmount(e.target.value)}
							classes="mr-1"
						/>
						<select
							className="input"
							value={currency}
							onChange={e => setCurrency(e.target.value)}
						>
							{Object.keys(CURRENCIES).map(key => {
								return (
									<option key={key} value={key} className="mr-2">
										{key}
									</option>
								)
							})}
						</select>
					</div>
				</div>
			</div>
			{currentCase.type !== '10' && causeOfDebt === 'ÇEK' && (
				<Note type="zekiye" classes="mb-8">
					Çek alacakları için 10 Nolu Takip daha uygundur. Çek alacağı için 10
					Nolu takip başlatmak ister misiniz?
					<CaseForm exactType={10} btnClass="btn-green fw-600 mt-2 py-1" />
				</Note>
			)}
			<>
				{causeOfDebt === 'ÇEK' && (
					<div className="bg br p-8">
						<div className="flex al-center">
							<div className="w-50 mr-4">
								<span className="fw-500">İbraz Tarihi</span>
								<Input
									placeholder="İbraz Tarihi"
									classes="mt-2"
									value={toDateInputValue(new Date(presentationDate), 0)}
									type="date"
									onChange={e => setPresentationDate(e.target.value)}
								/>
							</div>
							<div className="w-50 mr-4">
								<span className="fw-500">Düzenleme Yeri</span>
								<Input
									placeholder="Düzenleme Yeri"
									classes="mt-2"
									value={editIn}
									onChange={e => setEditIn(e.target.value)}
								/>
							</div>
							<div className="w-50">
								<span className="fw-500">Çek Seri Numarası</span>
								<Input
									placeholder="Çek Seri Numarası"
									classes="mt-2"
									value={checqueSerialNumber}
									onChange={e => setChecqueSerialNumber(e.target.value)}
								/>
							</div>
						</div>
						<div className="flex al-center mt-4">
							<div className="w-50 mr-4">
								<span className="fw-500">Banka ve Şube</span>
								<Input
									classes="mt-2"
									placeholder="Banka ve Şube"
									value={bankAndBranch}
									onChange={e => setBankAndBranch(e.target.value)}
								/>
							</div>
							<div className="w-50 mr-4">
								<span className="fw-500">Hesap Numarası</span>
								<Input
									placeholder="Hesap Numarası"
									classes="mt-2"
									value={accountNumber}
									onChange={e => setAccountNumber(e.target.value)}
								/>
							</div>
							<div className="w-50 mr-4">
								<span className="fw-500">Keşide Yeri</span>
								<Input
									placeholder="Keşide Yeri"
									classes="mt-2"
									value={placeOfDrawing}
									onChange={e => setPlaceOfDrawing(e.target.value)}
								/>
							</div>
							<div className="w-50 mr-4">
								<span className="fw-500">Senet Numarası</span>
								<Input
									placeholder="Senet Numarası"
									classes="mt-2"
									value={instrumentNumber}
									onChange={e => setInstrumentnumber(e.target.value)}
								/>
							</div>
						</div>
						<div className="mt-4">
							<span className="fw-500">Çeki İmzalayanlar</span>
							<Input
								classes="mt-2"
								placeholder="Çeki İmzalayanlar"
								value={checquePersons}
								onChange={e => setChecquePersons(e.target.value)}
							/>
						</div>
					</div>
				)}
				{(causeOfDebt === 'CARİ HESAP' || causeOfDebt === 'FATURA') && (
					<div className="mt-4 flex al-center bg br p-8 mb-8">
						<div className="w-50 mr-4">
							<span className="fw-500">Alacak / Abone / Müşteri Numarası</span>
							<Input
								placeholder="Alacak / Abone / Müşteri Numarası"
								classes="mt-2"
								value={customerNumber}
								onChange={e => setCustomerNumber(e.target.value)}
							/>
						</div>
						<div className="w-50">
							<span className="fw-500">Fatura / Belge Tarihi</span>
							<Input
								placeholder="Fatura / Belge Tarihi"
								classes="mt-2"
								value={toDateInputValue(new Date(documentDate), 0)}
								onChange={e => setDocumentDate(e.target.value)}
								type="date"
							/>
						</div>
					</div>
				)}
				<div className="bg br p-8">
					<div className="mt-4 flex al-center">
						<div className="column w-50 mr-4">
							<span className="fw-500">Takip Öncesi Faiz Oranı</span>
							<select
								value={beforeCaseUsury}
								className="input mt-2"
								onChange={e => setBeforeCaseUsury(e.target.value)}
							>
								<option value={null}>Faiz Oranı Seçin</option>
								{getUsuryTypesByCurrency(currency).map(usury => {
									return (
										<option value={usury.value} key={usury.value + usury.name}>
											{usury.name} (%{usury.value})
										</option>
									)
								})}
							</select>
						</div>
						<div className="column w-50">
							<span className="fw-500">Takip Sonrası Faiz Oranı</span>
							<select
								value={afterCaseUsury}
								className="input mt-2"
								onChange={e => setAfterCaseUsury(e.target.value)}
							>
								<option value={null}>Faiz Oranı Seçin</option>

								{getUsuryTypesByCurrency(currency).map(usury => {
									return (
										<option value={usury.value} key={usury.value + usury.name}>
											{usury.name} (%{usury.value})
										</option>
									)
								})}
							</select>
						</div>
					</div>
					{causeOfDebt === 'ASIL ALACAK' && (
						<Note type="zekiye" classes="mt-4">
							Asıl alacak eğer borçluya ihtar edildiyse takip öncesi faiz
							uygulanabilir. İhtar edilmediyse uygulanamaz. Yine de faiz
							işletmek istiyorsanız Takip Öncesi Faiz alanını giriniz.
						</Note>
					)}
				</div>
			</>
			<div className="bg br p-8 mt-4">
				<span className="fw-500">Açıklama</span>
				<Input
					textarea
					classes="mt-2"
					placeholder="Açıklama"
					value={description}
					onChange={e => setDescription(e.target.value)}
				/>
			</div>
			<div className="flex al-center mt-10">
				<Button
					type="button"
					theme="basic"
					classes="w-50 mr-2 py-3"
					onClick={close}
				>
					Vazgeç
				</Button>
				<Button type="submit" theme="blue" classes="w-50 bold py-3">
					{due ? 'Güncelle' : 'Oluştur'}
				</Button>
			</div>
		</form>
	)
}
