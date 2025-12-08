import { headerWithToken, PATENT_URL } from '../config'
import Axios from 'axios'

export const createPatent = (caseId, debtorId, patent, queryId) => {
	const url = `${PATENT_URL}/${caseId}/${debtorId}/${queryId}`
	return Axios.post(url, patent, headerWithToken())
}

export const updatePatent = (patentId, property, propertyValue) => {
	const url = `${PATENT_URL}/${patentId}/${property}`
	return Axios.put(url, { propertyValue }, headerWithToken())
}
