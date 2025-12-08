import Axios from 'axios'
import { COMMITMENT_URL, headerWithToken } from '../config'

export const createCommitment = (caseId, data) => {
	const url = `${COMMITMENT_URL}/${caseId}`
	return Axios.post(url, data, headerWithToken())
}

export const getCommitmentById = commitmentId => {
	const url = `${COMMITMENT_URL}/${commitmentId}`
	return Axios.get(url, headerWithToken())
}

export const updateCommitment = (commitmentId, data) => {
	const url = `${COMMITMENT_URL}/${commitmentId}`
	return Axios.put(url, data, headerWithToken())
}

export const getCommitmentsByCaseId = caseId => {
	const url = `${COMMITMENT_URL}/case/${caseId}`
	return Axios.get(url, headerWithToken())
}
