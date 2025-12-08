import { COURT_URL, headerWithToken } from '../config'
import Axios from 'axios'

export const createCourt = (caseId, debtorId, court) => {
	const url = `${COURT_URL}/${caseId}/${debtorId}`
	return Axios.post(url, court, headerWithToken())
}

export const updateCourt = (courtId, data) => {
	const url = `${COURT_URL}/${courtId}`
	return Axios.put(url, data, headerWithToken())
}

export const updateCourtByProperty = (courtId, property, propertyValue) => {
	const url = `${COURT_URL}/${courtId}/${property}`
	return Axios.put(url, { propertyValue }, headerWithToken())
}

export const getDebtorCourtCountByCase = (caseId, debtorId) => {
	const url = `${COURT_URL}/${caseId}/${debtorId}/count`
	return Axios.get(url, headerWithToken())
}

export const getDebtorCourtByTypeAndCase = (caseId, debtorId, type) => {
	const url = `${COURT_URL}/${caseId}/${debtorId}/${type}`
	return Axios.get(url, headerWithToken())
}

export const getDebtorCourtsByCase = (caseId, debtorId) => {
	const url = `${COURT_URL}/${caseId}/${debtorId}`
	return Axios.get(url, headerWithToken())
}
