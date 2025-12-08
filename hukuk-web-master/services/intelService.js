import Axios from 'axios'
import { headerWithToken, INTEL_URL } from '../config'

export const createIntel = (caseId, debtorId, data) => {
	const url = `${INTEL_URL}/${caseId}/${debtorId}`
	return Axios.post(url, data, headerWithToken())
}

export const getDebtorIntel = (caseId, debtorId) => {
	const url = `${INTEL_URL}/${caseId}/${debtorId}`
	return Axios.get(url, headerWithToken())
}

export const updateIntelById = (intelId, data) => {
	const url = `${INTEL_URL}/${intelId}`
	return Axios.put(url, data, headerWithToken())
}

export const updateIntelPropertyById = (
	intelId,
	property,
	propertyValue,
	innerProperty,
) => {
	const url = `${INTEL_URL}/${intelId}/${property}/${innerProperty}`
	return Axios.put(url, { propertyValue }, headerWithToken())
}
