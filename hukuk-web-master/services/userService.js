import Axios from 'axios'
import { USER_URL, headerWithToken } from '../config'

export const getAuthToken = () => {
	return localStorage.getItem('authToken')
}

export const checkUser = async () => {
	const returnValue = { status: false }
	const authToken = getAuthToken()
	// if (authToken && authToken !== 'undefined') {
	await Axios.get(`${USER_URL}/token`, headerWithToken())
		.then(response => {
			returnValue.status = true
			returnValue.user = response.data.user
		})
		.catch(() => {})
	// }
	return returnValue
}

export const signUp = ({ name, username, email, password }) => {
	return Axios.post(USER_URL, { name, username, email, password })
}

export const signIn = (email, password) => {
	const url = `${USER_URL}/signIn`
	let username = null
	if (!email.includes('@')) {
		username = email
		email = null
	}
	return Axios.post(url, { email, username, password })
}

export const getAllUsers = () => {
	const url = `${USER_URL}/person/list`
	return Axios.get(url, headerWithToken())
}

export const getAllLawyers = () => {
	const url = `${USER_URL}/lawyer/list`
	return Axios.get(url, headerWithToken())
}

export const createUser = user => {
	return Axios.post(USER_URL, user, headerWithToken())
}

export const changeUserCaseInitializationNoteVisibility =
	isCaseInitializationNoteVisible => {
		const url = `${USER_URL}/caseInitializationNoteVisibility`
		return Axios.put(
			url,
			{ isCaseInitializationNoteVisible },
			headerWithToken(),
		)
	}
