import { useEffect, useState } from 'react'
import { getCollectionsByAssetId } from '../collectionService'

export const useCollection = assetId => {
	const [loading, setLoading] = useState(true)
	const [collections, setCollections] = useState([])

	useEffect(() => {
		load()
	}, [assetId])

	const load = () => {
		if (assetId) {
			setLoading(true)
			getCollectionsByAssetId(assetId)
				.then(res => {
					setCollections(res.data)
				})
				.catch(e => console.log(e))
			setLoading(false)
		}
	}

	return { loading, collections, setCollections }
}
