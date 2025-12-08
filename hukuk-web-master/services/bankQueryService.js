import { BANK_QERY_URL, headerWithToken } from '../config'
import Axios from 'axios'

export const updateBankQuery = (bankQueryId, property, propertyValue) => {
	const url = `${BANK_QERY_URL}/${bankQueryId}/${property}`
	return Axios.put(url, { propertyValue }, headerWithToken())
}
