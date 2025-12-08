import React from 'react'
import InpoundmentStep from '../../../inpoundments/InpoundmentStep'
import AssetsAppraisalResult from '../../commonSteps/AssetsAppraisalResult'
import Assets100 from '../../commonSteps/Assets100'

export default function VehicleInpoundmentStep4() {
	return (
		<InpoundmentStep step={4}>
			<AssetsAppraisalResult />
			<div className="step-item-divider"></div>
			<div>
				<Assets100 />
			</div>
		</InpoundmentStep>
	)
}
