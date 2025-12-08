import { headerWithToken, CUSTOMS_DUE_URL } from '../config'
import Axios from 'axios'

export const createCustomsDue = (
	caseId,
	debtorId,
	queryId,
	customsOfficeId,
) => {
	const url = `${CUSTOMS_DUE_URL}/${caseId}/${debtorId}/${queryId}`
	return Axios.post(url, { customsOfficeId }, headerWithToken())
}

export const updateCustomsDue = (customsDueId, property, propertyValue) => {
	const url = `${CUSTOMS_DUE_URL}/${customsDueId}/${property}`
	return Axios.put(url, { propertyValue }, headerWithToken())
}
