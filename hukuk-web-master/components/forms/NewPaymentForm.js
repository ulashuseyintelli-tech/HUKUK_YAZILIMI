import React, { useState } from 'react'
import {
	STATUS,
	CURRENCIES,
	PAYMENT_TYPES,
	PAYEE_OPTIONS,
} from '../../constants'
import Input from '../anBrains/Input'
import Button from '../anBrains/Button'
import LoadingAnimation from '../anBrains/animations/LoadingAnimation/LoadingAnimation'
import { createPayment, updatePayment } from '../../services/paymentService'
import {
	getDebtorName,
	getPaymentType,
	handleError,
	toDateInputValue,
} from '../../helpers/Helper'
import useInpoundmentContext from '../../services/hooks/useInpoundmentContext'
import { FaLongArrowAltLeft } from 'react-icons/fa'
import { formatMoney } from '../../helpers/financeHelper'

export default function NewPaymentForm({
	close,
	payment,
	payments,
	setPayments,
	util,
}) {
	const { currentCase, debtors } = useInpoundmentContext()
	payment = payment || util

	const [status, setStatus] = useState(STATUS.NORMAL)
	const [type, setType] = useState(
		payment ? payment.type : PAYMENT_TYPES.NORMAL.value,
	)
	const [date, setDate] = useState(payment ? payment.date : new Date())
	const [amount, setAmount] = useState(payment ? payment.amount : 0)
	const [currency, setCurrency] = useState(payment ? payment.currency : 'TRY')
	const [selectedDebtor, setSelectedDebtor] = useState(
		payment ? payment.debtorId : debtors[0]?._id,
	)
	const [payee, setPayee] = useState(payment ? payment.payee : 'VEKİL')
	const [voucherSerialNumber, setVoucherSerialNumber] = useState(
		payment ? payment.voucherSerialNumber : '',
	)
	const [voucherRotationNumber, setVoucherRotationNumber] = useState(
		payment ? payment.voucherRotationNumber : '',
	)
	const [description, setDescription] = useState(
		payment ? payment.description : '',
	)

	const create = async e => {
		e.preventDefault()
		setStatus(STATUS.LOADING)
		const func = payment ? updatePayment : createPayment
		if (amount && selectedDebtor) {
			await func(payment ? payment._id : currentCase._id, {
				type,
				date,
				amount,
				currency,
				debtorId: selectedDebtor,
				payee,
				voucherSerialNumber,
				voucherRotationNumber,
				description,
			})
				.then(res => {
					if (payment) {
						payments[payments.findIndex(p => p._id === payment._id)] = res.data
					} else {
						payments.push(res.data)
					}
					setPayments([...payments])
					alert(`Ödeme başarıyla ${payment ? 'güncellendi' : 'oluşturuldu'}`)
					close()
				})
				.catch(e => handleError(e))
		} else {
			alert('Lütfen tutar ve ödeme yapan bilgisi girdiğinizden emin olun!')
		}
		setStatus(STATUS.NORMAL)
	}

	return (
		<form className="new-util-form" onSubmit={create}>
			<LoadingAnimation status={status} />
			<Button theme="basic" classes="py-1 mb-4" onClick={close}>
				<FaLongArrowAltLeft className="mr-2" /> Geri Dön
			</Button>
			{payment ? (
				<div className="flex al-center">
					<p className="mr-2 fs-lg">
						<span className="fw-500">
							{formatMoney(payment.amount)} {payment.currency}
						</span>{' '}
						-{' '}
						<span className="fs-sm">
							{new Date(payment.date).toLocaleDateString('tr-TR')}
						</span>
					</p>
					<div className="badge fs-xsm">{getPaymentType(payment)}</div>
				</div>
			) : (
				<span className="mb-4 fs-lg">Yeni Ödeme</span>
			)}
			<div className="step-item-divider"></div>
			<div className="flex al-center mt-4 bg br p-8">
				<div className="w-50 mr-4 column">
					<span className="fw-500">Borç Tipi</span>
					<select
						className="input mt-2"
						value={type}
						onChange={e => setType(e.target.value)}
					>
						{Object.values(PAYMENT_TYPES).map(value => {
							return (
								<option
									key={value.value}
									value={value.value}
									className="mr-2"
									onChange={e => setType(e.target.value)}
								>
									{value.text}
								</option>
							)
						})}
					</select>
				</div>
				<div className="w-50 mr-4">
					<span className="fw-500">Ödeme Tarihi</span>
					<Input
						placeholder="Ödeme Tarihi"
						classes="mt-2"
						value={toDateInputValue(new Date(date), 0)}
						type="date"
						onChange={e => setDate(e.target.value)}
					/>
				</div>
				<div className="w-50 mr-4">
					<span className="fw-500">Ödeme Tutarı</span>
					<div className="flex al-center mt-2">
						<Input
							placeholder="Ödeme Tutarı"
							value={amount}
							onChange={e => setAmount(e.target.value)}
						/>
						<select
							className="input"
							value={currency}
							onChange={e => setCurrency(e.target.value)}
						>
							{Object.keys(CURRENCIES).map(key => {
								return (
									<option
										key={key}
										value={key}
										className="mr-2"
										onChange={e => setCurrency(e.target.value)}
									>
										{key}
									</option>
								)
							})}
						</select>
					</div>
				</div>
			</div>
			<div className="flex al-center mt-4 bg br p-8">
				<div className="w-50 mr-4 column">
					<span className="fw-500">Ödeme Yapan</span>
					<select
						className="input mt-2"
						value={selectedDebtor ? selectedDebtor._id : null}
						onChange={e => setSelectedDebtor(e.target.value)}
					>
						{debtors.map(debtor => {
							return (
								<option
									key={debtor._id}
									value={debtor._id}
									className="mr-2"
									onChange={e => setSelectedDebtor(e.target.value)}
								>
									{getDebtorName(debtor)}
								</option>
							)
						})}
					</select>
				</div>
				<div className="w-50 mr-4 column">
					<span className="fw-500">Ödeme Yapılan</span>
					<select
						className="input mt-2"
						value={payee}
						onChange={e => setPayee(e.target.value)}
					>
						{PAYEE_OPTIONS.map(onAccountType => {
							return (
								<option
									key={onAccountType}
									value={onAccountType}
									className="mr-2"
								>
									{onAccountType}
								</option>
							)
						})}
					</select>
				</div>
				<div className="w-50 mr-4">
					<span className="fw-500">Makbuz Seri</span>
					<Input
						classes="mt-2"
						placeholder="Makbuz Seri numarası"
						value={voucherSerialNumber}
						onChange={e => setVoucherSerialNumber(e.target.value)}
					/>
				</div>
				<div className="w-50 mr-4">
					<span className="fw-500">Makbuz Sıra</span>
					<Input
						classes="mt-2"
						placeholder="Makbuz Sıra Numarası"
						value={voucherRotationNumber}
						onChange={e => setVoucherRotationNumber(e.target.value)}
					/>
				</div>
			</div>
			<div className="mt-4 bg br p-8">
				<span className="fw-500">Açıklama</span>
				<Input
					textarea
					classes="mt-2"
					placeholder="Açıklama"
					value={description}
					onChange={e => setDescription(e.target.value)}
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
				<Button type="submit" theme="blue" classes="w-50 bold py-3">
					{payment ? 'Güncelle' : 'Oluştur'}
				</Button>
			</div>
		</form>
	)
}
