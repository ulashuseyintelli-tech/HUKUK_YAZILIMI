import React from 'react'
import useInpoundmentContext from '../../../services/hooks/useInpoundmentContext'
import Patent from './Patent'

export default function PatentList() {
	const {
		assetProps: { assets, visibleAsset },
	} = useInpoundmentContext()

	if (visibleAsset) {
		return <Patent patent={visibleAsset} />
	}

	return (
		<div>
			{assets.map(asset => {
				return <Patent key={asset._id} patent={asset} />
			})}
		</div>
	)
}
