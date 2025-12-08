import { SALE_URL, headerWithToken } from '../config'
import Axios from 'axios'

export const getSaleByAsset = assetId => {
	const url = `${SALE_URL}/byAsset/${assetId}`
	return Axios.get(url, headerWithToken())
}

export const createSaleRequest = saleId => {
	const url = `${SALE_URL}/${saleId}/request`
	return Axios.post(url, {}, headerWithToken())
}

export const updateSale = (saleId, property, propertyValue) => {
	const url = `${SALE_URL}/${saleId}/${property}`
	return Axios.put(url, { propertyValue }, headerWithToken())
}

export const updateSaleRequest = (
	requestId,
	property,
	propertyValue,
	dayProperty,
	dayPropertyValue,
	dayIndex,
) => {
	let url = `${SALE_URL}/request/${requestId}/${property}`
	let bodyObject = { propertyValue }
	if (dayProperty !== undefined && dayPropertyValue !== undefined) {
		bodyObject = { ...bodyObject, dayProperty, dayPropertyValue, dayIndex }
	}
	return Axios.put(url, bodyObject, headerWithToken())
}
