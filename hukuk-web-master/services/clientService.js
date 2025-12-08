import Axios from 'axios'
import { CLIENT_URL, headerWithToken } from '../config'

export const createClient = client => {
	return Axios.post(CLIENT_URL, client, headerWithToken())
}

export const getClients = () => {
	return Axios.get(CLIENT_URL, headerWithToken())
}

export const getClientList = () => {
	return Axios.get(`${CLIENT_URL}/list`, headerWithToken())
}

export const updateClient = (clientId, data) => {
	const url = `${CLIENT_URL}/${clientId}`
	return Axios.put(url, { ...data }, headerWithToken())
}
