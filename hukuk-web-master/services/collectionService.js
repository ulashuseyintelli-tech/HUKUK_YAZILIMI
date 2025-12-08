import Axios from 'axios'
import { COLLECTION_URL, headerWithToken } from '../config'

export const createCollection = collection => {
	const url = `${COLLECTION_URL}`
	return Axios.post(url, collection, headerWithToken())
}

export const getCollectionsByAssetId = assetId => {
	const url = `${COLLECTION_URL}/byAsset/${assetId}`
	return Axios.get(url, headerWithToken())
}

export const getCaseCollections = caseId => {
	const url = `${COLLECTION_URL}/byCase/${caseId}`
	return Axios.get(url, headerWithToken())
}

export const updateCollection = (collectionId, property, propertyValue) => {
	const url = `${COLLECTION_URL}/${collectionId}/${property}`
	return Axios.put(url, { propertyValue }, headerWithToken())
}
