import { isDate, parse } from 'date-fns'
import React, { useEffect, useState } from 'react'
import { FaCheck, FaEdit, FaPlus, FaPlusCircle, FaTrash } from 'react-icons/fa'
import { COLLECTION_TYPE, STATUS } from '../constants'
import { calculateRemainingDebt } from '../helpers/financeHelper'
import {
	calculateCommitmentInstallments,
	getDebtorName,
	handleError,
	toDateInputValue,
} from '../helpers/Helper'
import {
	getCaseCustodianInfoExpanditure,
	getCaseExpenseExpanditure,
	getCaseNotificationExpanditure,
} from '../services/caseService'
import { getCaseCollections } from '../services/collectionService'
import {
	createCommitment,
	updateCommitment,
} from '../services/commitmentService'
import { getDebtorsByCaseId } from '../services/deptorService'
import { getDues } from '../services/dueService'
import { useCollection } from '../services/hooks/useCollection'
import { getPayments } from '../services/paymentService'
import LoadingCircle from './anBrains/animations/LoadingCircle'
import Button from './anBrains/Button'
import CheckBox from './anBrains/CheckBox'
import Input from './anBrains/Input'
import CollectionList from './collection/CollectionList'
import Note from './Note'
import TaskRadar from './task/TaskRadar'

export default function Commitment({
	commitment,
	setCommitment,
	debtorId,
	caseId,
	changeProperty,
	size = 'small',
	taskRadarAlways = false,
	currentCase,
}) {
	const {
		collections,
		setCollections,
		loading: collectionsLoading,
	} = useCollection(commitment ? commitment._id : null)

	const [status, setStatus] = useState(STATUS.LOADING)
	const [installments, setInstallments] = useState([
		{
			date: new Date(),
			amount: 0,
			isPaid: false,
		},
	])
	const [editingInstallmentLineIndex, setEditingInstallmentLineIndex] =
		useState(null)

	const [custodianInfoExpanditure, setCustodianInfoExpanditure] = useState(0)
	const [notificationExpanditure, setNotificationExpanditure] = useState(0)
	const [expenseExpanditure, setExpenseExpanditure] = useState(0)
	const [dues, setDues] = useState([])
	const [payments, setPayments] = useState([])
	const [allCollections, setAllCollections] = useState([])
	const [debtors, setDebtors] = useState([])
	const [error, setError] = useState(null)

	useEffect(() => {
		load()
	}, [])

	const load = async () => {
		let func1 = debtorId ? () => {} : getDebtors
		if (commitment._id) {
			setInstallments(commitment.calculatedInstallments)
		} else {
			setInstallments(calculateCommitmentInstallments(commitment))
		}
		await Promise.all([
			func1(),
			getExpenseExp,
			getCustodianInfoExp(),
			getNotificationExp(),
			_getDues(),
			_getPayments(),
			getAllCollections(),
		])
		setStatus(STATUS.NORMAL)
	}

	const getDebtors = async () => {
		await getDebtorsByCaseId(caseId)
			.then(res => {
				setDebtors(res.data)
				if (!commitment._id) {
					setCommitment({ ...commitment, debtorId: res.data[0]._id })
				}
			})
			.catch(e => handleError(e))
		setStatus(STATUS.NORMAL)
	}

	const getExpenseExp = async () => {
		await getCaseExpenseExpanditure(caseId)
			.then(res => {
				setExpenseExpanditure(res.data)
			})
			.catch(e => alert('Hata'))
	}

	const getCustodianInfoExp = async () => {
		await getCaseCustodianInfoExpanditure(caseId)
			.then(res => {
				setCustodianInfoExpanditure(res.data)
			})
			.catch(e => alert('Hata'))
	}

	const getNotificationExp = async () => {
		await getCaseNotificationExpanditure(caseId)
			.then(res => {
				setNotificationExpanditure(res.data)
			})
			.catch(e => alert('Hata'))
	}

	const _getDues = async () => {
		await getDues(caseId)
			.then(res => {
				setDues(res.data)
			})
			.catch(e => alert('Hata'))
	}

	const _getPayments = async () => {
		await getPayments(caseId)
			.then(res => {
				setPayments(res.data)
			})
			.catch(e => alert('Hata'))
	}

	const getAllCollections = async () => {
		await getCaseCollections(caseId)
			.then(res => {
				setAllCollections(res.data)
			})
			.catch(e => alert('Hata'))
	}

	const handleCommitment = (property, value) => {
		commitment[property] = value
		setCommitment({ ...commitment })
	}

	const submit = () => {
		if (validateSubmission()) {
			if (commitment._id) {
				update()
			} else {
				create()
			}
		}
	}

	const validateSubmission = () => {
		if (!commitment.debtorId) {
			setError('Lütfen bir borçlu seçin!')
			return false
		}
		if (!validateNonZeroInteger(commitment.totalAmount)) {
			setError('Toplam Taahhüt Miktarı Girilmeden Taahhüt Planı Kaydedilemez')
			return false
		} else if (
			commitment.isSplittedToInstallments &&
			!commitment.areInstallmentsFree &&
			(!commitment.firstInstallmentDate ||
				!validateNonZeroInteger(commitment.installmentsCount) ||
				!validateNonZeroInteger(commitment.installmentsIntervalByDays))
		) {
			setError('Lütfen tüm bilgileri doldurun')
			return false
		} else if (
			commitment.isSplittedToInstallments &&
			commitment.areInstallmentsFree
		) {
			if (installments.some(i => !validateNonZeroFloat(i.amount))) {
				setError('Lütfen tüm ödeme tutarlarını doğru girin.')
				return false
			} else {
				let sum = 0
				installments.map(i => {
					sum += parseFloat(i.amount)
				})
				const diff = parseFloat(commitment.totalAmount) - sum
				if (diff <= -1 || diff >= 1) {
					setError(
						'Taksitlerin toplam tutarı, taahhüt edilen miktara eşit olmalıdır',
					)
					return false
				} else {
					return true
				}
			}
		} else {
			return true
		}
	}

	const validateNonZeroInteger = value => {
		return value && !isNaN(parseInt(value)) && parseInt(value) > 0
	}

	const validateNonZeroFloat = value => {
		return value && !isNaN(parseFloat(value)) && parseFloat(value) > 0
	}

	const create = async () => {
		setStatus(STATUS.LOADING)
		await createCommitment(caseId, {
			...commitment,
			calculatedInstallments: installments,
		})
			.then(res => {
				setError(null)
				setEditingInstallmentLineIndex(null)
				alert('Taahhüt başarıyla güncellendi.')
				if (changeProperty) {
					changeProperty(res.data._id)
				}
				setCommitment(res.data)
			})
			.catch(e => handleError(e))
		setStatus(STATUS.NORMAL)
	}

	const update = async () => {
		setStatus(STATUS.LOADING)
		await updateCommitment(commitment._id, {
			...commitment,
			calculatedInstallments: installments,
		})
			.then(res => {
				setCommitment(res.data)
				alert('Taahhüt başarıyla güncellendi.')
				setError(null)
				setEditingInstallmentLineIndex(null)
			})
			.catch(e => alert('Hata meydana geldi!'))
		setStatus(STATUS.NORMAL)
	}

	const onChangeInstallmentPaidStatus = (installmentIndex, value) => {
		installments[installmentIndex].isPaid = value
		setInstallments([...installments])
	}

	const addNewInstallmentLine = () => {
		setInstallments([
			...installments,
			{
				date: new Date(),
				amount: 0,
				isPaid: false,
			},
		])
		setEditingInstallmentLineIndex(installments.length)
	}

	const deleteInstallmentLine = index => {
		installments.splice(index, 1)
		setInstallments([...installments])
	}

	const editInstallmentLine = (index, property, value) => {
		installments[index][property] = value
		setInstallments([...installments])
	}

	useEffect(() => {
		if (!commitment.areInstallmentsFree) {
			setInstallments(calculateCommitmentInstallments(commitment))
		}
	}, [commitment])

	if (status === STATUS.LOADING) {
		return <LoadingCircle classes="mt-10" />
	}

	return (
		<TaskRadar always={taskRadarAlways}>
			<div className="step-item-divider"></div>
			<div className={`${size === 'large' ? 'flex' : ''}`}>
				<div className={`${size === 'large' ? 'flex' : ''}`}></div>
				{!debtorId && (
					<div className="w-50 mr-10">
						<p className="fw-500 mt-4 mb-4">Taahhüt Veren Borçlu</p>
						<select
							value={commitment?.debtorId}
							className="input w-100"
							onChange={e => handleCommitment('debtorId', e.target.value)}
						>
							{debtors.map(debtor => {
								return (
									<option key={debtor._id} value={debtor._id}>
										{getDebtorName(debtor)}
									</option>
								)
							})}
						</select>
						{size === 'large' && (
							<Note classes="my-8" type="zekiye">
								{commitment._id
									? 'Taahhüt detayları güncellendiğinde bu taahhüte ait tahsilat görevlerinin tümü sistem tarafından otomatik olarak iptal edilecek, güncel taahhüt detaylarına göre yeni görevler oluşturulacaktır.'
									: "Taahhüt detayları kaydedildiğinde bu taahhüte ait tahsilat görevi oluşturulacaktır. Belirlenen tarihte ödeme yapılmaması durumunda otomatik olarak 'Taahhüdü İhlal Davası' için görev oluşturulur. Eğer ödeme yapılırsa bir sonraki taksit için otomatik olarak görev oluşturulacaktır."}
							</Note>
						)}
					</div>
				)}
				<div className={`${size === 'large' ? 'w-50' : ''}`}>
					{size !== 'large' && <div className="step-item-divider"></div>}
					<p className="fw-500 mb-4">Ödeme Detayları</p>
					<div className="flex al-center mb-4 fs-sm">
						<div className="mr-4 w-50">
							<p className="fw-500 mb-2 gray">Toplam Taahhüt Edilen Miktar</p>
							<Input
								onChange={e => handleCommitment('totalAmount', e.target.value)}
								value={commitment.totalAmount}
								classes="mt-2"
							/>
						</div>
						<div className="w-50">
							<p className="fw-500 mb-2 gray">Taahhüt Edilen Ödeme Tarihi</p>
							<Input
								type="date"
								onChange={e =>
									handleCommitment('commitmentDate', e.target.value)
								}
								value={toDateInputValue(new Date(commitment.commitmentDate), 0)}
								classes="mt-2"
							/>
						</div>
					</div>
					<div
						className="flex mt-4 al-center fs-sm"
						disabled={!commitment.totalAmount}
					>
						<CheckBox
							boxClass="bg-white br-sm"
							classes="bg-light py-2 px-2 w-50 mr-4 br-sm fw-500"
							onChange={v => handleCommitment('isSplittedToInstallments', v)}
							checked={commitment.isSplittedToInstallments}
						>
							Taksitlendir
						</CheckBox>
						{commitment.isSplittedToInstallments && (
							<CheckBox
								boxClass="bg-white br-sm"
								classes="bg-light py-2 px-2 w-50 mr-4 br-sm fw-500"
								onChange={v => handleCommitment('areInstallmentsFree', v)}
								checked={commitment.areInstallmentsFree}
							>
								Serbest Taksit Planı
							</CheckBox>
						)}
					</div>
					{commitment.isSplittedToInstallments &&
						!commitment.areInstallmentsFree && (
							<React.Fragment>
								<div className="my-8 flex al-center">
									<div className="mr-4 w-50">
										<p className="fw-500 mb-2 gray">İlk Taksit Tarihi</p>
										<Input
											type="date"
											onChange={e =>
												handleCommitment('firstInstallmentDate', e.target.value)
											}
											value={toDateInputValue(
												new Date(commitment.firstInstallmentDate),
												0,
											)}
											classes="mt-2"
										/>
									</div>
									<div className="mr-4 w-50">
										<p className="fw-500 mb-2 gray">Taksit Sayısı</p>
										<Input
											onChange={e =>
												handleCommitment('installmentsCount', e.target.value)
											}
											value={commitment.installmentsCount}
											classes="mt-2"
										/>
									</div>
									<div className="w-50">
										<p className="fw-500 mb-2 gray">Taksit Aralığı</p>
										<div className="flex al-center">
											<Input
												onChange={e =>
													handleCommitment(
														'installmentsIntervalByDays',
														e.target.value,
													)
												}
												value={commitment.installmentsIntervalByDays}
											/>
											<p className="ml-2">gün</p>
										</div>
									</div>
								</div>
							</React.Fragment>
						)}
					<div className="step-item-divider"></div>
					<div disabled={commitment.totalAmount === 0}>
						<p className="fw-500 mb-4">Ödeme Planı</p>
						<table className="restriction-list mt-4">
							<tr>
								<th className="fw-500">Ödeme Tarihi</th>
								<th className="fw-500">Ödeme Tutarı</th>
								<th className="fw-500">
									{commitment._id ? 'Ödenme Durumu' : 'Kalan Borç'}
								</th>
								{(commitment.areInstallmentsFree ||
									(Array.isArray(commitment.calculatedInstallments) &&
										commitment.calculatedInstallments.filter(
											i =>
												new Date().setDate(new Date().getDate() - 1) >
													new Date(i.date) && !i.isPaid,
										).length > 0)) && <th className="fw-500">Aksiyon</th>}
							</tr>
							{installments.map((detail, index) => {
								return (
									<tr>
										{editingInstallmentLineIndex === index ? (
											<React.Fragment>
												<th>
													<Input
														value={toDateInputValue(
															isDate(detail.date)
																? detail.date
																: new Date(detail.date),
															0,
														)}
														type="date"
														onChange={e =>
															editInstallmentLine(
																index,
																'date',
																new Date(e.target.value),
															)
														}
													/>
												</th>
												<th>
													<div className="flex al-center">
														<Input
															classes="mr-2"
															value={detail.amount}
															onChange={e =>
																editInstallmentLine(
																	index,
																	'amount',
																	e.target.value,
																)
															}
														/>{' '}
														TL
													</div>
												</th>
												<th></th>
											</React.Fragment>
										) : (
											<React.Fragment>
												<th>
													{new Date(detail.date).toLocaleDateString('tr-TR')}
												</th>
												<th>{detail.amount} TL</th>
												<th>
													{!commitment._id &&
														custodianInfoExpanditure?.list &&
														notificationExpanditure?.list &&
														expenseExpanditure?.officialList &&
														calculateRemainingDebt(
															currentCase,
															[
																...payments,
																...allCollections,
																...installments.filter((i, ii) => ii <= index),
															],
															dues,
															custodianInfoExpanditure,
															notificationExpanditure,
															expenseExpanditure,
															new Date(detail.date),
														)}
												</th>
												<th>
													{commitment._id &&
														new Date().setDate(new Date().getDate() - 1) >
															new Date(detail.date) &&
														!detail.isPaid && (
															<p className="red fw-500 fs-xsm mt-1">
																Ödeme tarihi geçti.
															</p>
														)}
												</th>
											</React.Fragment>
										)}
										<th>
											{commitment.areInstallmentsFree && (
												<div className="flex al-center">
													{editingInstallmentLineIndex === index ? (
														<Button
															theme="blue"
															classes="mr-2"
															onClick={() =>
																setEditingInstallmentLineIndex(null)
															}
														>
															<FaCheck />
														</Button>
													) : (
														<Button
															classes="mr-8 blue fs-md"
															onClick={() =>
																setEditingInstallmentLineIndex(index)
															}
														>
															<FaEdit />
														</Button>
													)}
													{index !== 0 && (
														<Button
															classes="red"
															onClick={() => deleteInstallmentLine(index)}
														>
															<FaTrash />
														</Button>
													)}
												</div>
											)}
										</th>
									</tr>
								)
							})}
							{commitment.areInstallmentsFree && (
								<Button
									classes="fw-500 mt-4 blue"
									onClick={addNewInstallmentLine}
								>
									<FaPlusCircle className="mr-2" />
									Yeni Taksit Ekle
								</Button>
							)}
							{/* {commitment._id &&
						new Date().setDate(new Date().getDate() - 1) >
							new Date(detail.date) &&
						!detail.isPaid && (
							<Button theme="red fw-600 fs-xsm">Taahhüdü İhlal Davası</Button>
						)} */}
						</table>
						{commitment._id && (
							<>
								<div className="step-item-divider"></div>
								<CollectionList
									exactType={COLLECTION_TYPE.COMMITMENT.value}
									customAsset={commitment}
									customCollections={collections}
									customLoading={collectionsLoading}
									customSetFunction={setCollections}
								/>
								<div className="step-item-divider"></div>
							</>
						)}
					</div>
				</div>
			</div>
			{error && (
				<Note type="error" classes="my-4">
					{error}
				</Note>
			)}
			{(size !== 'large' || debtorId) && (
				<Note classes="my-8" type="zekiye">
					{commitment._id
						? 'Taahhüt detayları güncellendiğinde bu taahhüte ait tahsilat görevlerinin tümü sistem tarafından otomatik olarak iptal edilecek, güncel taahhüt detaylarına göre yeni görevler oluşturulacaktır.'
						: "Taahhüt detayları kaydedildiğinde bu taahhüte ait tahsilat görevi oluşturulacaktır. Belirlenen tarihte ödeme yapılmaması durumunda otomatik olarak 'Taahhüdü İhlal Davası' için görev oluşturulur. Eğer ödeme yapılırsa bir sonraki taksit için otomatik olarak görev oluşturulacaktır."}
				</Note>
			)}
			<Button
				theme="blue"
				classes="mt-4 fw-600 blue w-100 py-3"
				onClick={submit}
				disabled={
					commitment.totalAmount === 0 ||
					(commitment.areInstallmentsFree && installments.length === 0)
				}
			>
				Kaydet
			</Button>
		</TaskRadar>
	)
}
