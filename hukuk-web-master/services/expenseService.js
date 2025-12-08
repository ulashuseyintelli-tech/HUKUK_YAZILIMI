import Axios from 'axios'
import { EXPENSE_URL, headerWithToken } from '../config'

export const createExpense = (caseId, expense) => {
	return Axios.post(`${EXPENSE_URL}/${caseId}`, expense, headerWithToken())
}

export const getExpenses = (caseId, assetId, type) => {
	let url = `${EXPENSE_URL}/${caseId}`
	if (assetId) {
		url += `?assetId=${assetId}`
		if (type) url += `&expenseType=${type}`
	} else if (type) {
		url += `?expenseType=${type}`
	}
	return Axios.get(url, headerWithToken())
}
