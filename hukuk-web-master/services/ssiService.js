import { headerWithToken, SSI_URL } from '../config'
import Axios from 'axios'

export const createSsi = (caseId, debtorId, ssi, queryId) => {
	const url = `${SSI_URL}/${caseId}/${debtorId}/${queryId}`
	return Axios.post(url, ssi, headerWithToken())
}

export const updateSsi = (ssiId, property, propertyValue) => {
	const url = `${SSI_URL}/${ssiId}/${property}`
	return Axios.put(url, { propertyValue }, headerWithToken())
}
