import Axios from 'axios'
import { DEBTOR_URL, headerWithToken } from '../config'
import { DEBTOR_TYPES } from '../constants'

export const createDebtor = (caseId, debtor) => {
	return Axios.post(`${DEBTOR_URL}/${caseId}`, debtor, headerWithToken())
}

export const getDebtors = () => {
	return Axios.get(DEBTOR_URL, headerWithToken())
}

export const getDebtorsList = () => {
	return Axios.get(`${DEBTOR_URL}/list`, headerWithToken())
}

export const getDebtorsPure = () => {
	return Axios.get(DEBTOR_URL, headerWithToken())
}

export const getDebtorsByCaseId = caseId => {
	const url = `${DEBTOR_URL}/case/${caseId}`
	return Axios.get(url, headerWithToken())
}

export const updateDebtor = (caseId, debtorId, data) => {
	const url = `${DEBTOR_URL}/${caseId}/${debtorId}`
	return Axios.put(url, { ...data }, headerWithToken())
}

export const updateThirdPerson = (caseId, debtorId, debtor) => {
	const url = `${DEBTOR_URL}/${caseId}`
}

export const createThirdPerson = thirdPerson => {
	const url = `${DEBTOR_URL}/null/thirdPerson`
	return Axios.post(url, thirdPerson, headerWithToken())
}

export const getThirdPersonById = thirdPersonId => {
	const url = `${DEBTOR_URL}/thirdPerson/${thirdPersonId}`
	return Axios.get(url, headerWithToken())
}

export const getAllThirdPersons = () => {
	const url = `${DEBTOR_URL}/thirdPerson`
	return Axios.get(url, headerWithToken())
}

export const getThirdPersonsByType = type => {
	const url = `${DEBTOR_URL}/thirdPerson/type/${type}`
	return Axios.get(url, headerWithToken())
}

export const searchSameDebtors = (name, surname, institutionName, type) => {
	const url = `${DEBTOR_URL}/search/same`
	let bodyObject = {}
	if (type === DEBTOR_TYPES.INSTITUTION) {
		bodyObject.institutionName = institutionName
	} else {
		bodyObject.name = name
		bodyObject.surname = surname
	}
	return Axios.post(url, bodyObject, headerWithToken())
}
