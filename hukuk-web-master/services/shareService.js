import { SHARE_URL, headerWithToken } from '../config'
import Axios from 'axios'

export const createShare = (caseId, debtorId, share, queryId) => {
	const url = `${SHARE_URL}/${caseId}/${debtorId}/${queryId}`
	return Axios.post(url, share, headerWithToken())
}

export const updateShare = (shareId, property, propertyValue) => {
	const url = `${SHARE_URL}/${shareId}/${property}`
	return Axios.put(url, { propertyValue }, headerWithToken())
}
