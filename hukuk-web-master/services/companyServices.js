import Axios from 'axios'
import { COMPANY_URL, headerWithToken } from '../config'

export const getCompaniesByLawOffice = () => {
	return Axios.get(COMPANY_URL, headerWithToken())
}

export const createCompany = data => {
	return Axios.post(COMPANY_URL, data, headerWithToken())
}

export const getCompanyById = companyId => {
	const url = `${COMPANY_URL}/${companyId}`
	return Axios.get(url, headerWithToken())
}
