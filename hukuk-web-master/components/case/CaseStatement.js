import React, { useEffect, useState } from 'react'
import { FaCheck, FaLongArrowAltLeft } from 'react-icons/fa'
import {
	CASE_TYPES_WITHOUT_DUE,
	EXACT_EXPENDITURES,
	STATUS,
} from '../../constants'
import {
	getAssetName,
	getCasePartOpacity,
	goPreviousStepOfTeacher,
	handleError,
} from '../../helpers/Helper'

import {
	calculateAdvanceFee,
	calculateInpoundmentFees,
	calculateCounselFee,
	formatMoney,
	calculateCollectionFee,
	calculateRemainingDebt,
} from '../../helpers/financeHelper'

import {
	saveCase,
	getCaseCustodianInfoExpanditure,
	getCaseNotificationExpanditure,
	getCaseExpenseExpanditure,
} from '../../services/caseService'
import useInpoundmentContext from '../../services/hooks/useInpoundmentContext'
import Button from '../anBrains/Button'
import Note from '../Note'
import CaseDues from './CaseDues'
import CasePayments from './CasePayments'
import LoadingCircle from '../anBrains/animations/LoadingCircle'

export default function CaseStatement() {
	const { currentCase, setCurrentCase } = useInpoundmentContext()

	const [status, setStatus] = useState(STATUS.NORMAL)
	const [badCheckFee, setBadCheckFee] = useState(0)
	const [dues, setDues] = useState([])
	const [caseTotalDue, setCaseTotalDue] = useState(0)
	const [payments, setPayments] = useState([])
	const [caseTotalPayment, setCaseTotalPayment] = useState(0)

	const [custodianInfoExpanditure, setCustodianInfoExpanditure] = useState(0)
	const [notificationExpanditure, setNotificationExpanditure] = useState(0)
	const [expenseExpanditure, setExpenseExpanditure] = useState(0)

	const [blinking, setBlinking] = useState(
		getCasePartOpacity(currentCase, 'dues'),
	)

	useEffect(() => {
		load()
	}, [])

	const load = () => {
		getCustodianInfoExp()
		getNotificationExp()
		getExpenseExp()
	}

	const getCustodianInfoExp = () => {
		getCaseCustodianInfoExpanditure(currentCase._id)
			.then(res => {
				setCustodianInfoExpanditure(res.data)
			})
			.catch(e => alert('Hata'))
	}

	const getNotificationExp = () => {
		getCaseNotificationExpanditure(currentCase._id)
			.then(res => {
				setNotificationExpanditure(res.data)
			})
			.catch(e => alert('Hata'))
	}

	const getExpenseExp = () => {
		getCaseExpenseExpanditure(currentCase._id)
			.then(res => {
				setExpenseExpanditure(res.data)
			})
			.catch(e => alert('Hata'))
	}

	useEffect(() => {
		setBlinking(getCasePartOpacity(currentCase, 'dues'))
	}, [currentCase])

	const makeDuesCompleted = () => {
		if (caseTotalDue > 0) {
			saveCase(currentCase.number, { ...currentCase, isDuesCompleted: true })
				.then(res => {
					setCurrentCase({ ...res.data })
				})
				.catch(handleError)
		} else {
			alert('Lütfen alacak kalemlerini girin!')
		}
	}

	return (
		<div
			className="case-form__statement"
			disabled={
				!currentCase.isClientsCompleted ||
				CASE_TYPES_WITHOUT_DUE.includes(currentCase.type)
			}
		>
			{getCasePartOpacity(currentCase, 'dues') && !currentCase.isDuesCompleted && (
				<Note
					type="zekiye"
					classes="teacher"
					blinking={blinking}
					onMouseOver={() => setBlinking(false)}
				>
					Takip oluşturma aşamasını tamamlamak için alacak kalemlerini ekleyin
					<Button
						classes="mt-4"
						onClick={() =>
							goPreviousStepOfTeacher(setStatus, currentCase, setCurrentCase)
						}
					>
						<FaLongArrowAltLeft className="fs-xsm blue" />
						<span className="fw-500 fs-xsm blue">Önceki Adım</span>
					</Button>
				</Note>
			)}
			<div
				className="case-dues"
				disabled={!getCasePartOpacity(currentCase, 'dues')}
			>
				<p className="bold fs-md mb-2">Hesap Özeti</p>
				<CaseDues
					setDues={setDues}
					setCaseTotalDue={setCaseTotalDue}
					setBadCheckFee={setBadCheckFee}
				/>
			</div>
			{getCasePartOpacity(currentCase, 'dues') && !currentCase.isDuesCompleted && (
				<Button
					theme="cute"
					classes="w-100 bold mt-4"
					disabled={caseTotalDue === 0}
					onClick={makeDuesCompleted}
				>
					KAYDET
					<FaCheck className="ml-2" />
				</Button>
			)}
			<div className="step-item-divider"></div>
			<div className="case-fees" disabled={!currentCase.isDuesCompleted}>
				{EXACT_EXPENDITURES.map((exactExpenditure, index) => {
					return (
						<div className="flex al-center" key={exactExpenditure + index}>
							<p className="w-50 fw-500 underline">{exactExpenditure.name}</p>
							<p className="w-50">{exactExpenditure.amount} ₺</p>
						</div>
					)
				})}
				<div className="flex al-center">
					<p className="w-50 fw-500 underline">Peşin Harç:</p>
					<p className="w-50">
						{calculateAdvanceFee(caseTotalDue).toFixed(2)} ₺
					</p>
				</div>
				{badCheckFee > 0 && (
					<div className="flex al-center">
						<p className="w-50 fw-500 underline">Karşılıksız Çek Tazminatı</p>
						<p className="w-50">{badCheckFee} ₺</p>
					</div>
				)}
				{notificationExpanditure?.expanditure > 0 && (
					<div className="flex al-center">
						<p className="w-50 fw-500 underline">Tebligat Masrafı</p>
						<p className="w-50">{notificationExpanditure?.expanditure} ₺</p>
					</div>
				)}
				{console.log({ custodianInfoExpanditure })}
				{custodianInfoExpanditure?.expanditure > 0 && (
					<div className="flex al-center">
						<p className="w-50 fw-500 underline">Yediemin Masrafı</p>
						<p className="w-50">{custodianInfoExpanditure?.expanditure} ₺</p>
					</div>
				)}
				<p className="bold mt-4">
					İcra Masrafları ={' '}
					{formatMoney(
						calculateInpoundmentFees(
							parseInt(dues[0]?.totalAmount),
							notificationExpanditure?.expanditure,
							custodianInfoExpanditure?.expanditure,
							expenseExpanditure?.officialExpanditure,
						),
					)}{' '}
					₺
				</p>
				<div className="step-item-divider"></div>
				{expenseExpanditure?.officialExpanditure > 0 && (
					<>
						{expenseExpanditure.officialList?.map(item => {
							return (
								<div className="flex al-center">
									<div className="w-70">
										<p className="fw-500 underline">
											{item.title}{' '}
											<span className="fs-xsm blue">
												({getAssetName(item.assetType)})
											</span>
										</p>
										<p className="fs-xsm">{item.description}</p>
									</div>
									<p className="w-30">{item.expanditure} ₺</p>
								</div>
							)
						})}
						<p className="bold mt-4">
							Eklenen Resmi Masraflar = {expenseExpanditure.officialExpanditure}{' '}
							₺
						</p>
						<div className="step-item-divider"></div>
					</>
				)}
				{expenseExpanditure?.unofficialExpanditure > 0 && (
					<>
						{expenseExpanditure.unofficialList?.map(item => {
							return (
								<div className="flex al-center">
									<div className="w-70">
										<p className="fw-500 underline">{item.title}</p>
										<p className="fs-xsm">{item.description}</p>
									</div>
									<p className="w-30">{item.expanditure} ₺</p>
								</div>
							)
						})}
						<p className="bold mt-4">
							Eklenen Gayri Resmi Masraflar ={' '}
							{expenseExpanditure.unofficialExpanditure} ₺
						</p>
						<div className="step-item-divider"></div>
					</>
				)}

				<p className="fw-500 mt-4">
					Tahsil Harcı ={' '}
					{formatMoney(calculateCollectionFee(parseInt(dues[0]?.totalAmount)))}{' '}
					₺
				</p>
				<div className="step-item-divider"></div>
				<p className="fw-500 mt-4">
					Vekalet Ücreti ={' '}
					{formatMoney(calculateCounselFee(parseInt(dues[0]?.totalAmount)))} ₺
				</p>
				<div className="step-item-divider"></div>
				<p className="bold ">
					Toplam Borç Tutarı ={' '}
					{formatMoney(
						caseTotalDue +
							calculateInpoundmentFees(
								caseTotalDue,
								custodianInfoExpanditure?.expanditure,
								notificationExpanditure?.expanditure,
								expenseExpanditure.officialExpanditure,
							) +
							calculateCounselFee(parseInt(dues[0]?.totalAmount)) +
							calculateCollectionFee(parseInt(dues[0]?.totalAmount)),
					)}{' '}
					₺
				</p>
				<div className="step-item-divider"></div>
				<CasePayments
					setPayments={setPayments}
					setCaseTotalPayment={setCaseTotalPayment}
				/>
				<div className="step-item-divider"></div>
				<p className="bold mt-4">
					Son Borç Tutarı ={' '}
					{custodianInfoExpanditure &&
					notificationExpanditure &&
					expenseExpanditure ? (
						formatMoney(
							calculateRemainingDebt(
								currentCase,
								payments,
								dues,
								custodianInfoExpanditure,
								notificationExpanditure,
								expenseExpanditure,
							),
						)
					) : (
						<LoadingCircle />
					)}
				</p>
			</div>
		</div>
	)
}
