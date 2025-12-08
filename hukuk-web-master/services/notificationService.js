import { NOTIFICATION_URL, headerWithToken } from '../config'
import Axios from 'axios'
import { NOTIFICATION_TYPE } from '../constants'

export const createNotification = (
	caseId,
	debtorId,
	address,
	assetType,
	assetId,
	type,
	level,
) => {
	const bodyObject = { address }
	if (assetType) bodyObject.assetType = assetType
	if (assetId) bodyObject.assetId = assetId
	if (level) bodyObject.level = level
	const url = `${NOTIFICATION_URL}/${caseId}/${debtorId}/${type}`
	return Axios.post(url, bodyObject, headerWithToken())
}

export const updateNotification = (notification, property, propertyValue) => {
	const url = `${NOTIFICATION_URL}/${notification._id}/${property}`
	return Axios.put(url, { propertyValue }, headerWithToken())
}

export const getNotifications = (
	type,
	caseId,
	debtorId,
	assetType,
	assetId,
) => {
	let url = `${NOTIFICATION_URL}/${type}/${caseId}/${debtorId}`
	url += `/${assetType}`
	url += `/${assetId}`
	return Axios.get(url, headerWithToken())
}

export const getCaseInitializationNotifications = caseId => {
	const url = `${NOTIFICATION_URL}/${caseId}/${NOTIFICATION_TYPE.CASE_INITIALIZATION}`
	return Axios.get(url, headerWithToken())
}

export const getNotificationById = notificationId => {
	const url = `${NOTIFICATION_URL}/byId/${notificationId}`
	return Axios.get(url, headerWithToken())
}
