import React, { useEffect, useState } from 'react'
import { FaMoneyBill } from 'react-icons/fa'
import { CURRENCIES, EXPENSE_TYPE } from '../../constants'
import { handleError, toDateInputValue } from '../../helpers/Helper'
import { createExpense, getExpenses } from '../../services/expenseService'
import useInpoundmentContext from '../../services/hooks/useInpoundmentContext'
import LoadingAnimation from '../anBrains/animations/LoadingAnimation/LoadingAnimation'
import LoadingCircle from '../anBrains/animations/LoadingCircle'
import Button from '../anBrains/Button'
import Input from '../anBrains/Input'
import Modal from '../anBrains/Modal'

export default function ExpenseForm({
	customAssetType = null,
	customAssetId = null,
	expenseType = null,
	customTitle = '',
	onCreate = () => {},
}) {
	const {
		assetProps: { assetId: defaultAssetId, assetType: defaultAssetType },
	} = useInpoundmentContext()

	const { currentCase } = useInpoundmentContext()
	const [isLoading, setIsLoading] = useState(true)
	const [isSubmitting, setIsSubmitting] = useState(false)
	const [expenses, setExpenses] = useState([])

	const [isOpen, setIsOpen] = useState(false)

	const [type, setType] = useState(EXPENSE_TYPE.OFFICIAL.value)
	const [amount, setAmount] = useState('')
	const [currency, setCurrency] = useState('TRY')
	const [title, setTitle] = useState(customTitle)
	const [description, setDescription] = useState('')
	const [date, setDate] = useState(new Date())

	const assetType = customAssetType || defaultAssetType
	const assetId = customAssetId || defaultAssetId

	useEffect(() => {
		load()
	}, [])

	const load = () => {
		getExpenses(currentCase._id, assetId, expenseType)
			.then(res => {
				setExpenses(res.data)
			})
			.catch(handleError)
		setIsLoading(false)
	}

	const create = async e => {
		e.preventDefault()
		if (validate() === true) {
			setIsSubmitting(true)
			await createExpense(currentCase._id, {
				type,
				amount,
				currency,
				date,
				assetType,
				assetId,
				description,
				title,
			})
				.then(res => {
					alert('Başarılı')
					setExpenses([...expenses, res.data])
					onCreate(res.data)
					setIsOpen(false)
				})
				.catch(handleError)
			setIsSubmitting(false)
		}
	}

	const validate = () => {
		if (!amount) {
			alert('Lütfen masraf tutarını girin!')
		} else if (!title) {
			alert('Lütfen masraf başlığı girin!')
		} else if (!description) {
			alert('Lütfen masraf açıklaması girin!')
		} else {
			return true
		}
	}

	if (isLoading) {
		return <LoadingCircle />
	}

	return (
		<>
			<div className="flex al-center">
				<Button
					theme="orange"
					classes="bold mr-4"
					icon={<FaMoneyBill />}
					onClick={() => setIsOpen(true)}
				>
					Masraf Ekle
				</Button>
				<p className="fw-500 fs-sm nowrap">Toplam {expenses.length} masraf</p>
			</div>
			<Modal visible={isOpen} close={() => setIsOpen(false)}>
				<LoadingAnimation loading={isSubmitting} />
				<form className="form-modal new-util-form" onSubmit={create}>
					<span className="mb-4 fs-lg fw-600">Yeni Masraf</span>
					<div className="flex al-center mt-4 bg br p-8">
						<div className="w-50 mr-4 column">
							<span className="fw-500">Masraf Tipi</span>
							<select
								className="input mt-2"
								value={type}
								onChange={e => setType(e.target.value)}
							>
								{Object.keys(EXPENSE_TYPE).map(key => {
									return (
										<option
											key={key}
											value={EXPENSE_TYPE[key].value}
											className="mr-2"
											onChange={e => setType(e.target.value)}
										>
											{EXPENSE_TYPE[key].text}
										</option>
									)
								})}
							</select>
						</div>
						<div className="w-50 mr-4">
							<span className="fw-500">Masraf Tarihi</span>
							<Input
								placeholder="Masraf Tarihi"
								classes="mt-2"
								value={toDateInputValue(new Date(date), 0)}
								type="date"
								onChange={e => setDate(e.target.value)}
							/>
						</div>
						<div className="w-50 mr-4">
							<span className="fw-500">Masraf Tutarı</span>
							<div className="flex al-center mt-2">
								<Input
									placeholder="Masraf Tutarı"
									value={amount}
									classes="mr-2"
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
					<div className="mt-4 bg br p-8">
						<span className="fw-500">Masraf Başlığı</span>
						<Input
							classes="mt-2"
							placeholder="Başlık"
							value={title}
							onChange={e => setTitle(e.target.value)}
						/>
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
							Oluştur
						</Button>
					</div>
				</form>
			</Modal>
		</>
	)
}
