import { useEffect, useState } from 'react'
import { STATUS } from '../../constants'
import {
	calculateRemainingDebt,
	formatMoney,
} from '../../helpers/financeHelper'
import { handleError } from '../../helpers/Helper'
import {
	getCaseCustodianInfoExpanditure,
	getCaseExpenseExpanditure,
	getCaseNotificationExpanditure,
} from '../caseService'
import { getDues } from '../dueService'
import { getPayments } from '../paymentService'
import useInpoundmentContext from './useInpoundmentContext'

export const useCaseStatement = () => {
	const { currentCase } = useInpoundmentContext()

	const [status, setStatus] = useState(STATUS.LOADING)
	const [dues, setDues] = useState([])
	const [payments, setPayments] = useState([])
	const [custodianInfoExpanditure, setCustodianInfoExpanditure] = useState(null)
	const [notificationExpanditure, setNotificationExpanditure] = useState(null)
	const [expenseExpanditure, setExpenseExpanditure] = useState(null)

	useEffect(() => {
		load()
	}, [])

	const load = async () => {
		await Promise.all([
			getCustodianInfoExp(),
			getNotificationExp(),
			getExpenseExp(),
			getCaseDues(),
			getCasePayments(),
		])
		setStatus(STATUS.NORMAL)
	}

	const getExpenseExp = async () => {
		return getCaseExpenseExpanditure(currentCase._id)
			.then(res => {
				setExpenseExpanditure(res.data)
				console.log({ expres: res.data })
			})
			.catch(handleError)
	}

	const getCustodianInfoExp = async () => {
		return getCaseCustodianInfoExpanditure(currentCase._id)
			.then(res => {
				setCustodianInfoExpanditure(res.data)
			})
			.catch(handleError)
	}

	const getNotificationExp = async () => {
		return getCaseNotificationExpanditure(currentCase._id)
			.then(res => {
				setNotificationExpanditure(res.data)
			})
			.catch(handleError)
	}

	const getCaseDues = async () => {
		return getDues(currentCase._id)
			.then(res => {
				setDues(res.data)
			})
			.catch(handleError)
	}

	const getCasePayments = async () => {
		return getPayments(currentCase._id)
			.then(res => {
				setPayments(res.data)
			})
			.catch(handleError)
	}

	console.log({
		custodianInfoExpanditure,
		notificationExpanditure,
		expenseExpanditure,
	})

	return {
		statementStatus: status,
		caseStatement:
			status === STATUS.NORMAL
				? formatMoney(
						calculateRemainingDebt(
							currentCase,
							payments,
							dues,
							custodianInfoExpanditure,
							notificationExpanditure,
							expenseExpanditure,
						),
				  )
				: 0,
	}
}
