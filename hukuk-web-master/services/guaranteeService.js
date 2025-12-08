import Axios from 'axios'
import { GUARANTEE_URL, headerWithToken } from '../config'

export const createGuarantee = (caseId, data) => {
	const url = `${GUARANTEE_URL}/${caseId}`
	return Axios.post(url, data, headerWithToken())
}

export const getGuaranteeById = guaranteeId => {
	const url = `${GUARANTEE_URL}/${guaranteeId}`
	return Axios.get(url, headerWithToken())
}

export const updateGuarantee = (guaranteeId, data) => {
	const url = `${GUARANTEE_URL}/${guaranteeId}`
	return Axios.put(url, data, headerWithToken())
}

export const getGuaranteesByCaseId = caseId => {
	const url = `${GUARANTEE_URL}/case/${caseId}`
	return Axios.get(url, headerWithToken())
}

export const getGuaranteeByThirdPerson = (caseId, thirdPersonId) => {
	const url = `${GUARANTEE_URL}/case/${caseId}/thirdPerson/${thirdPersonId}`
	return Axios.get(url, headerWithToken())
}
