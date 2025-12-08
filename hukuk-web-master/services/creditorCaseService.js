import { headerWithToken, CREDITOR_CASE_URL } from '../config'
import Axios from 'axios'

export const createCreditorCase = (caseId, debtorId, creditorCase, queryId) => {
	const url = `${CREDITOR_CASE_URL}/${caseId}/${debtorId}/${queryId}`
	return Axios.post(url, creditorCase, headerWithToken())
}

export const updateCreditorCase = (creditorCaseId, property, propertyValue) => {
	const url = `${CREDITOR_CASE_URL}/${creditorCaseId}/${property}`
	return Axios.put(url, { propertyValue }, headerWithToken())
}
