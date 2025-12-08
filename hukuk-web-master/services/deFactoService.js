import { DE_FACTO_URL, headerWithToken } from '../config'
import Axios from 'axios'

export const getDebtorDeFactos = (caseId, debtorId) => {
	const url = `${DE_FACTO_URL}/${caseId}/${debtorId}`
	return Axios.get(url, headerWithToken())
}

export const createForeclosableAddress = (caseId, debtorId, address) => {
	const url = `${DE_FACTO_URL}/${caseId}/${debtorId}/address`
	return Axios.post(url, address, headerWithToken())
}

export const createDeFacto = (foreclosableAddressId, deFacto) => {
	const url = `${DE_FACTO_URL}/${foreclosableAddressId}`
	return Axios.post(url, deFacto, headerWithToken())
}

export const updateDeFacto = (deFactoId, property, propertyValue) => {
	const url = `${DE_FACTO_URL}/${deFactoId}/${property}`
	return Axios.put(url, { propertyValue }, headerWithToken())
}

export const updateDeFactoIntel = (taskId, isForeclosable) => {
	const url = `${DE_FACTO_URL}/intel/${taskId}`
	return Axios.put(url, { isForeclosable }, headerWithToken())
}
