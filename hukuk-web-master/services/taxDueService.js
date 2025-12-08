import { headerWithToken, TAX_DUE_URL } from '../config'
import Axios from 'axios'

export const createTaxDue = (caseId, debtorId, taxDue, queryId) => {
	const url = `${TAX_DUE_URL}/${caseId}/${debtorId}/${queryId}`
	return Axios.post(url, taxDue, headerWithToken())
}

export const updateTaxDue = (taxDueId, property, propertyValue) => {
	const url = `${TAX_DUE_URL}/${taxDueId}/${property}`
	return Axios.put(url, { propertyValue }, headerWithToken())
}
