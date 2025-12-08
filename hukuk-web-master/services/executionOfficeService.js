import Axios from 'axios'
import { EXECUTION_OFFICE_URL, headerWithToken } from '../config'

export const createExecutionOffice = data => {
	return Axios.post(EXECUTION_OFFICE_URL, data, headerWithToken())
}

export const getExecutionOffices = () => {
	return Axios.get(EXECUTION_OFFICE_URL, headerWithToken())
}

export const updateExecutionOffice = (officeId, office) => {
	const url = `${EXECUTION_OFFICE_URL}/${officeId}`
	return Axios.put(url, office, headerWithToken())
}
