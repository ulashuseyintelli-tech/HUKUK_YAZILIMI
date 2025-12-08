import React from 'react'
import InpoundmentStep from '../../../inpoundments/InpoundmentStep'
import AssetsAppraisalResult from '../../commonSteps/AssetsAppraisalResult'
import Assets100 from '../../commonSteps/Assets100'
import AssetsAppraisalResultNotification from '../../commonSteps/AssetsAppraisalResultNotification'
import useInpoundmentContext from '../../../../services/hooks/useInpoundmentContext'

export default function PatentInpoundmentStep3() {
	const {
		assetProps: { visibleAsset, updateAsset },
	} = useInpoundmentContext()

	return (
		<InpoundmentStep step={3}>
			<div className="mt-4"></div>
			<AssetsAppraisalResult />
			<div className="step-item-divider"></div>
			<div disabled={!visibleAsset.appraisalResult}>
				<Assets100 />
			</div>

			<div className="step-item-divider"></div>
			<div>
				<AssetsAppraisalResultNotification />
			</div>
		</InpoundmentStep>
	)
}
