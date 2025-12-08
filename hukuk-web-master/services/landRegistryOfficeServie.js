import Axios from 'axios'
import { LAND_REGISTRY_OFFICE_URL, headerWithToken } from '../config'

export const createLandRegistryOffice = data => {
	return Axios.post(LAND_REGISTRY_OFFICE_URL, data, headerWithToken())
}

export const getLandRegistryOffices = () => {
	return Axios.get(LAND_REGISTRY_OFFICE_URL, headerWithToken())
}

export const updateLandRegistryOffice = (officeId, office) => {
	const url = `${LAND_REGISTRY_OFFICE_URL}/${officeId}`
	return Axios.put(url, office, headerWithToken())
}
