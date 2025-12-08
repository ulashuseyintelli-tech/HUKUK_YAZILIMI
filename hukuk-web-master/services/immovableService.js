import { headerWithToken, IMMOVABLE_URL } from '../config'
import Axios from 'axios'

export const createImmovable = (caseId, debtorId, immovable, queryId) => {
	const url = `${IMMOVABLE_URL}/${caseId}/${debtorId}/${queryId}`
	return Axios.post(url, immovable, headerWithToken())
}

export const updateImmovable = (immovableId, property, propertyValue) => {
	const url = `${IMMOVABLE_URL}/${immovableId}/${property}`
	return Axios.put(url, { propertyValue }, headerWithToken())
}

export const getImmovableById = immovableId => {
	const url = `${IMMOVABLE_URL}/${immovableId}`
	return Axios.get(url, headerWithToken())
}
