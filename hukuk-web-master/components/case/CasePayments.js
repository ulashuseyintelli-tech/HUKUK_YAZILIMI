import { useState, useEffect } from 'react'
import { STATUS } from '../../constants'
import { getPayments } from '../../services/paymentService'
import NewPaymentForm from '../forms/NewPaymentForm'
import CaseUtilsList from './CaseUtilsList'
import useInpoundmentContext from '../../services/hooks/useInpoundmentContext'
import { getPaymentType, handleError } from '../../helpers/Helper'

import { calculateTotalPayment, formatMoney } from '../../helpers/financeHelper'

import { getCaseCollections } from '../../services/collectionService'

export default function CasePayments({ setCaseTotalPayment, setPayments }) {
	const { currentCase } = useInpoundmentContext()

	const [status, setStatus] = useState(STATUS.NORMAL)
	const [allPayments, setAllPayments] = useState([])
	const [allCollections, setAllCollections] = useState([])

	useEffect(() => {
		load()
	}, [])

	const load = async () => {
		setStatus(STATUS.LOADING)
		await Promise.all([getAll(), getCollections()])
		setStatus(STATUS.NORMAL)
	}

	const getAll = async () => {
		await getPayments(currentCase._id)
			.then(res => {
				setAllPayments(res.data)
			})
			.catch(e => handleError(e))
	}

	const getCollections = async () => {
		await getCaseCollections(currentCase._id)
			.then(res => {
				setAllCollections(res.data)
			})
			.catch(handleError)
	}

	useEffect(() => {
		if (status === STATUS.NORMAL) {
			setCaseTotalPayment(
				calculateTotalPayment([...allPayments, ...allCollections]),
			)
			setPayments([...allPayments, ...allCollections])
		}
	}, [status])

	const ModalListBody = ({ item }) => {
		return (
			<div className="flex al-center">
				<p className="mr-2">
					<span className="fw-500">
						{formatMoney(item.amount)} {item.currency}
					</span>{' '}
					-{' '}
					<span className="fs-sm">
						{new Date(item.date).toLocaleDateString('tr-TR')}
					</span>
				</p>
				<div className="badge fs-xsm">{getPaymentType(item)}</div>
			</div>
		)
	}

	return (
		<CaseUtilsList
			title="Ödemeler ve Tahsilatlar"
			status={status}
			utils={[...allPayments, ...allCollections]}
			selectedUtils={[...allPayments, ...allCollections]}
			utilType="payment"
			modalListBody={<ModalListBody />}
			listBody={<ModalListBody />}
			utilItem={
				<NewPaymentForm payments={allPayments} setPayments={setAllPayments} />
			}
		/>
	)
}
