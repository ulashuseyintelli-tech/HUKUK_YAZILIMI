import Axios from 'axios'
import { QUERY_URL, headerWithToken } from '../config'

export const createQuery = (caseId, debtorId, type, extra) => {
	const url = `${QUERY_URL}/${caseId}/${debtorId}`
	return Axios.post(url, { type, ...extra }, headerWithToken())
}

export const createQueryBulk = (caseId, debtorId, queryList) => {
	const url = `${QUERY_URL}/${caseId}/${debtorId}/bulk`
	return Axios.post(url, { queryList }, headerWithToken())
}

export const updateQuery = query => {
	const url = `${QUERY_URL}/${query._id}`
	return Axios.put(url, query, headerWithToken())
}
