import { NORMAL_ASSET_URL, headerWithToken } from '../config'
import Axios from 'axios'

export const createNormalAsset = (
	caseId,
	debtorId,
	normalAsset,
	withoutTasks,
) => {
	const url = `${NORMAL_ASSET_URL}/${caseId}/${debtorId}?withoutTasks=${withoutTasks}`
	return Axios.post(url, normalAsset, headerWithToken())
}

export const updateNormalAsset = (normalAssetId, property, propertyValue) => {
	const url = `${NORMAL_ASSET_URL}/${normalAssetId}/${property}`
	return Axios.put(url, { propertyValue }, headerWithToken())
}

export const getNormalAssetById = normalAssetId => {
	const url = `${NORMAL_ASSET_URL}/${normalAssetId}`
	return Axios.get(url, headerWithToken())
}

export const getNormalAssetsByDebtorId = debtorId => {
	const url = `${NORMAL_ASSET_URL}/byDebtor/${debtorId}`
	return Axios.get(url, headerWithToken())
}

export const getNormalAssetsByParentAssetId = parentAssetId => {
	const url = `${NORMAL_ASSET_URL}/byParentAsset/${parentAssetId}`
	return Axios.get(url, headerWithToken())
}
