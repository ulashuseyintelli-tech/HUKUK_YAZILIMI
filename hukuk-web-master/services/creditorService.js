import Axios from 'axios'
import { CREDITOR_URL, headerWithToken } from '../config'

export const createCreditor = creditor => {
	return Axios.post(`${CREDITOR_URL}`, creditor, headerWithToken())
}

export const getCreditorsByLawOffice = () => {
	return Axios.get(CREDITOR_URL, headerWithToken())
}

export const updateCreditor = (creditorId, creditor, assetType, assetId) => {
	const url = `${CREDITOR_URL}/${creditorId}?assetType=${assetType}&assetId=${assetId}`
	return Axios.put(url, creditor, headerWithToken())
}
