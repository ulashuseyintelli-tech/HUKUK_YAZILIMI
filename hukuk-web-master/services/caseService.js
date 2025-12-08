import Axios from 'axios'
import { CASE_URL, headerWithToken } from '../config'

export const createCase = doc => {
	return Axios.post(CASE_URL, doc, headerWithToken())
}

export const getCaseByNumber = number => {
	return Axios.get(`${CASE_URL}/${number}`, headerWithToken())
}

export const getCaseByNumberWithDetails = (number, caseId) => {
	return Axios.get(
		`${CASE_URL}/${number}/details?caseId=${caseId}`,
		headerWithToken(),
	)
}

export const getCaseExpenseExpanditure = caseId => {
	return Axios.get(
		`${CASE_URL}/${caseId}/expanditure/expense`,
		headerWithToken(),
	)
}

export const getCaseCustodianInfoExpanditure = caseId => {
	return Axios.get(
		`${CASE_URL}/${caseId}/expanditure/custodianInfo`,
		headerWithToken(),
	)
}

export const getCaseNotificationExpanditure = caseId => {
	return Axios.get(
		`${CASE_URL}/${caseId}/expanditure/notification`,
		headerWithToken(),
	)
}

export const getCases = () => {
	return Axios.get(CASE_URL, headerWithToken())
}

export const saveCase = (number, doc) => {
	return Axios.put(`${CASE_URL}/${number}`, doc, headerWithToken())
}

export const updateCasePropertyByNumber = (number, property, propertyValue) => {
	return Axios.put(
		`${CASE_URL}/${number}/${property}`,
		{ propertyValue },
		headerWithToken(),
	)
}

export const addDebtorToCase = (number, debtorId) => {
	const url = `${CASE_URL}/${number}/addDebtor`
	return Axios.put(url, { debtorId }, headerWithToken())
}

export const removeDebtorFromCase = (number, debtorId) => {
	const url = `${CASE_URL}/${number}/removeDebtor`
	return Axios.put(url, { debtorId }, headerWithToken())
}

export const completeCaseDetails = (number, details) => {
	const url = `${CASE_URL}/${number}/complete/details`
	return Axios.put(url, details, headerWithToken())
}

export const completeCaseExecutionOffice = (number, executionOfficeId) => {
	const url = `${CASE_URL}/${number}/complete/executionOffice`
	return Axios.put(url, { executionOfficeId }, headerWithToken())
}

export const completeCaseClients = (number, clientIds) => {
	const url = `${CASE_URL}/${number}/complete/clients`
	return Axios.put(url, { clientIds }, headerWithToken())
}

export const completeCaseDebtors = number => {
	const url = `${CASE_URL}/${number}/complete/debtors`
	return Axios.put(url, {}, headerWithToken())
}

export const completeCaseDues = (number, dueIds) => {
	const url = `${CASE_URL}/${number}/complete/dues`
	return Axios.put(url, { dueIds }, headerWithToken())
}
