import React from 'react'
import useInpoundmentContext from '../../../../services/hooks/useInpoundmentContext'
import Button from '../../../anBrains/Button'
import InpoundmentStep from '../../../inpoundments/InpoundmentStep'
import RestrictionTable from '../../../inpoundments/RestrictionTable'
import TrueFalse from '../../../TrueFalse'

export default function BankInpoundmentStep3() {
	const {
		assetProps: { visibleAsset, updateAsset },
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
		</InpoundmentStep>
	)
}
