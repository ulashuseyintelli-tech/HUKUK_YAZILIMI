import Axios from 'axios'
import { TAX_OFFICE_URL, headerWithToken } from '../config'

export const createTaxOffice = data => {
	return Axios.post(TAX_OFFICE_URL, data, headerWithToken())
}

export const getTaxOffices = () => {
	return Axios.get(TAX_OFFICE_URL, headerWithToken())
}

export const updateTaxOffice = (officeId, office) => {
	const url = `${TAX_OFFICE_URL}/${officeId}`
	return Axios.put(url, office, headerWithToken())
}
