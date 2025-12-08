import { PLEDGED_MOVABLE_URL, headerWithToken } from '../config'
import Axios from 'axios'

export const createPledgedMovable = (caseId, debtorId, movable) => {
	const url = `${PLEDGED_MOVABLE_URL}/${caseId}/${debtorId}`
	return Axios.post(url, movable, headerWithToken())
}

export const updatePledgedMovable = (movableId, property, propertyValue) => {
	const url = `${PLEDGED_MOVABLE_URL}/${movableId}/${property}`
	return Axios.put(url, { propertyValue }, headerWithToken())
}

export const getPledgedMovableById = movableId => {
	const url = `${PLEDGED_MOVABLE_URL}/${movableId}`
	return Axios.get(url, headerWithToken())
}

export const getPledgedMovablesByDebtorId = debtorId => {
	const url = `${PLEDGED_MOVABLE_URL}/byDebtor/${debtorId}`
	return Axios.get(url, headerWithToken())
}
