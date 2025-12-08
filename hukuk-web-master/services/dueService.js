import Axios from 'axios'
import { DUE_URL, headerWithToken } from '../config'

export const createDue = (caseId, due) => {
	return Axios.post(`${DUE_URL}/case/${caseId}`, due, headerWithToken())
}

export const getDues = caseId => {
	return Axios.get(`${DUE_URL}/case/${caseId}`, headerWithToken())
}

export const updateDue = (dueId, doc) => {
	return Axios.put(`${DUE_URL}/${dueId}`, doc, headerWithToken())
}
