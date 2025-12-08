import React from 'react'
import InpoundmentStep from '../../../inpoundments/InpoundmentStep'
import useInpoundmentContext from '../../../../services/hooks/useInpoundmentContext'
import RestrictionTable from '../../../inpoundments/RestrictionTable'
import AssetSaleAdvance from '../../commonSteps/AssetSaleAdvance'
import Assets103 from '../../commonSteps/Assets103'

export default function PatentInpoundmentStep2() {
	const {
		assetProps: { visibleAsset },
	} = useInpoundmentContext()

	if (visibleAsset && visibleAsset.restriction.isCancelledByThreshold) {
		return (
			<div className="mt-10">
				<RestrictionTable />
			</div>
		)
	}

	return (
		<InpoundmentStep step={2}>
			<RestrictionTable />
			<div className="step-item-divider"></div>
			<Assets103 />
			<div className="step-item-divider"></div>
			<AssetSaleAdvance />
		</InpoundmentStep>
	)
}
