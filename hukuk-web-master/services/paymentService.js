import Axios from 'axios'
import { PAYMENT_URL, headerWithToken } from '../config'

export const createPayment = (caseId, payment) => {
	return Axios.post(`${PAYMENT_URL}/case/${caseId}`, payment, headerWithToken())
}

export const getPayments = caseId => {
	return Axios.get(`${PAYMENT_URL}/case/${caseId}`, headerWithToken())
}

export const updatePayment = (paymentId, doc) => {
	return Axios.put(`${PAYMENT_URL}/${paymentId}`, doc, headerWithToken())
}
