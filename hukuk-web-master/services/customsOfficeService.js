import Axios from 'axios'
import { CUSTOMS_OFFICE_URL, headerWithToken } from '../config'

export const createCustomsOffice = data => {
	return Axios.post(CUSTOMS_OFFICE_URL, data, headerWithToken())
}

export const getCustomsOffices = () => {
	return Axios.get(CUSTOMS_OFFICE_URL, headerWithToken())
}

export const updateCustomsOffice = (officeId, office) => {
	const url = `${CUSTOMS_OFFICE_URL}/${officeId}`
	return Axios.put(url, office, headerWithToken())
}
