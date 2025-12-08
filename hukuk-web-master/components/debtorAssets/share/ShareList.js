import React, { useState, useEffect } from 'react'
import useInpoundmentContext from '../../../services/hooks/useInpoundmentContext'
import ShareItem from './ShareItem'

export default function ShareList() {
	const {
		assetProps: { assets, visibleAsset },
	} = useInpoundmentContext()

	if (visibleAsset) {
		return <ShareItem share={visibleAsset} />
	}

	return (
		<div>
			{assets.map(asset => {
				return <ShareItem key={asset._id} share={asset} />
			})}
		</div>
	)
}
