import React, { useState } from 'react'
import { NOTIFICATION_STATUS } from '../../../../constants'
import useInpoundmentContext from '../../../../services/hooks/useInpoundmentContext'
import InpoundmentStep from '../../../inpoundments/InpoundmentStep'
import TrueFalse from '../../../TrueFalse'
import Assets100 from '../../commonSteps/Assets100'
import AssetsAppraisalResult from '../../commonSteps/AssetsAppraisalResult'

export default function ImmovableInpoundmentStep4() {
	const { assetProps } = useInpoundmentContext()
	const { visibleAsset, updateAsset } = assetProps

	return (
		<InpoundmentStep step={3}>
			<div className="mt-4"></div>
			<AssetsAppraisalResult />
			<div className="step-item-divider"></div>
			<Assets100 />
		</InpoundmentStep>
	)
}
