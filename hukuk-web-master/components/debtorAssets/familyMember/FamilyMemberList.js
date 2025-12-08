import React from 'react'
import useInpoundmentContext from '../../../services/hooks/useInpoundmentContext'
import FamilyMember from './FamilyMember'

export default function FamilyMemberList() {
	const {
		assetProps: { assets, visibleAsset },
	} = useInpoundmentContext()

	if (visibleAsset) {
		return <FamilyMember familyMember={visibleAsset} />
	}

	return (
		<div>
			{assets.map(asset => {
				return <FamilyMember key={asset._id} familyMember={asset} />
			})}
		</div>
	)
}
