import Axios from 'axios'
import { ASSET_URL, headerWithToken } from '../config'

export const updateAssetRestriction = (
	assetType,
	assetId,
	property,
	propertyValue,
) => {
	const url = `${ASSET_URL}/${assetType}/${assetId}/restriction/${property}`
	return Axios.put(url, { propertyValue }, headerWithToken())
}

export const getAssetsWithRestriction = (caseId, debtorId) => {
	const url = `${ASSET_URL}/${caseId}/${debtorId}/withRestriction`
	return Axios.get(url, headerWithToken())
}

export const copyAssetRestrictions = (
	assetType,
	assetId,
	targetAssetType,
	targetAssetId,
) => {
	const url = `${ASSET_URL}/copyRestriction/${assetType}/${assetId}/${targetAssetType}/${targetAssetId}`
	return Axios.get(url, headerWithToken())
}
