import React, { forwardRef, useImperativeHandle, useState } from 'react'
import { COLLECTION_TYPE, CURRENCIES, PAYEE_OPTIONS } from '../../constants'
import {
	getDebtorName,
	handleError,
	toDateInputValue,
	validateNonZeroFloat,
} from '../../helpers/Helper'
import { createCollection } from '../../services/collectionService'
import useInpoundmentContext from '../../services/hooks/useInpoundmentContext'
import Button from '../anBrains/Button'
import Input from '../anBrains/Input'
import Modal from '../anBrains/Modal'
import Note from '../Note'

function CollectionForm(props, ref) {
	const {
		exactType,
		addCollection,
		customAsset,
		withoutButton,
		exactAmount,
		extra,
	} = props

	const {
		assetProps,
		currentCase,
		debtors,
		visibleInpoundment,
		selectedDebtorId,
	} = useInpoundmentContext()

	const [isOpen, setIsOpen] = useState(false)

	useImperativeHandle(ref, () => ({
		open() {
			setIsOpen(true)
		},
	}))

	const [payee, setPayee] = useState(PAYEE_OPTIONS[0])
	const [amount, setAmount] = useState(exactAmount || 0)
	const [receivedMoneyCurrency, setReceivedMoneyCurrency] = useState('TRY')
	const [
		receivedMoneyCurrencyExcangeRate,
		setReceivedMoneyCurrencyExcangeRate,
	] = useState(1)
	const [date, setDate] = useState(new Date())
	const [debtorId, setDebtorId] = useState(
		exactType === COLLECTION_TYPE.COMMITMENT.value
			? customAsset.debtorId
			: selectedDebtorId || debtors[0]._id,
	)
	const [description, setDescription] = useState('')

	const [error, setError] = useState(null)

	const validateFields = () => {
		if (!validateNonZeroFloat(amount)) {
			setError('Tahsil Edilen Tutar boş bırakılamaz!')
		} else if (new Date(date) > new Date()) {
			setError('Tahsilat Yapılan Tarih, bugünden daha sonra olamaz!')
		} else {
			return true
		}
	}

	const create = e => {
		e.preventDefault()
		if (validateFields()) {
			const collectionObject = {
				type: exactType || COLLECTION_TYPE.GENERAL.value,
				payee,
				caseId: currentCase._id,
				debtorId,
				amount,
				receivedMoneyCurrency,
				date,
				description,
				assetId: customAsset ? customAsset._id : assetProps.visibleAsset._id,
				assetType: exactType || visibleInpoundment || null,
				extra,
			}
			createCollection(collectionObject)
				.then(res => {
					addCollection(res.data)
					setIsOpen(false)
					setError(null)
					alert('Tahsilat başarıyla oluşturuldu')
				})
				.catch(e => {
					handleError(e)
					console.log(e)
				})
		}
	}

	return (
		<>
			{isOpen ? (
				<Modal close={() => setIsOpen(false)} visible={isOpen}>
					<form onSubmit={create} className="bg-white p-8 br">
						<p className="fs-md fw-600">Yeni Tahsilat Oluştur</p>
						<div className="step-item-divider"></div>
						<div className="flex al-center mb-4">
							<label className="w-50 fw-500 gray mr-4">
								<span>Tahsil Edilen Tutar</span>
								<div className="flex al-center mt-2">
									<Input
										classes="mr-2"
										placeholder="Tahsil Edilen Tutar"
										readOnly={exactAmount}
										value={amount}
										onChange={e => setAmount(e.target.value)}
									/>
									<select
										className="input"
										value={receivedMoneyCurrency}
										onChange={e => setReceivedMoneyCurrency(e.target.value)}
									>
										{Object.keys(CURRENCIES).map(key => {
											return (
												<option key={key} value={key}>
													{key}
												</option>
											)
										})}
									</select>
								</div>
							</label>
							<label className="w-50 fw-500 gray mr-4">
								<span>Tahsilat Tarihi</span>
								<Input
									classes="mt-2"
									type="date"
									onChange={e => setDate(e.target.value)}
									value={toDateInputValue(new Date(date), 0)}
								/>
							</label>
							<label className="w-50 fw-500 gray mr-4">
								<p className="mb-2">Ödeme Yapılan Kişi</p>
								<select
									className="input w-100"
									value={payee}
									onChange={e => setPayee(e.target.value)}
								>
									{PAYEE_OPTIONS.map(payee => {
										return (
											<option key={payee} value={payee}>
												{payee}
											</option>
										)
									})}
								</select>
							</label>
						</div>
						<div className="flex al-center mb-4">
							{!selectedDebtorId && !exactType && (
								<label className="w-50 fw-500 gray">
									<span>Ödeme Yapan Borçlu</span>
									<select
										className="input"
										onChange={e => setDebtorId(e.target.value)}
										value={debtorId}
									>
										{debtors.map(debtor => {
											return (
												<option key={debtor._id} value={debtor._id}>
													{getDebtorName(debtor)}
												</option>
											)
										})}
									</select>
								</label>
							)}
						</div>
						{receivedMoneyCurrency !== 'TRY' && (
							<div className="mb-4">
								<label className="w-50 fw-500 gray mb-4">
									<p className="mb-2">Döviz Kuru ({receivedMoneyCurrency})</p>
									<Input
										placeholder="Tahsil Edilen Tutar"
										// readOnly={exactAmount}
										value={receivedMoneyCurrencyExcangeRate}
										onChange={e =>
											setReceivedMoneyCurrencyExcangeRate(e.target.value)
										}
									/>
								</label>
							</div>
						)}
						<label>
							<span className="fw-500 gray">Ödeme Açıklaması</span>
							<Input
								textarea
								classes="mt-2"
								placeholder="Açıklama"
								onChange={e => setDescription(e.target.value)}
							/>
						</label>
						{error && (
							<Note type="error" classes="mt-4">
								{error}
							</Note>
						)}
						<Button theme="green" type="submit" classes="bold w-100 mt-8 py-3">
							Tahsilat Oluştur
						</Button>
					</form>
				</Modal>
			) : (
				<>
					{!withoutButton && (
						<Button
							theme="green"
							classes="bold"
							onClick={() => setIsOpen(true)}
						>
							Tahsilat Oluştur
						</Button>
					)}
				</>
			)}
		</>
	)
}

export default forwardRef(CollectionForm)
