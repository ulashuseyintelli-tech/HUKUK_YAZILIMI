import React from 'react'
import InpoundmentStep from '../../../inpoundments/InpoundmentStep'

import AssetsAppraisalResult from '../../commonSteps/AssetsAppraisalResult'
import Assets100 from '../../commonSteps/Assets100'
import AssetsAppraisalResultNotification from '../../commonSteps/AssetsAppraisalResultNotification'
import useInpoundmentContext from '../../../../services/hooks/useInpoundmentContext'
import { NOTIFICATION_STATUS } from '../../../../constants'

export default function ShareInpoundmentStep3() {
	const {
		assetProps: { visibleAsset, updateAsset },
	} = useInpoundmentContext()

	return (
		<InpoundmentStep step={3}>
			<div className="mt-4"></div>
			<AssetsAppraisalResult />
			<div className="step-item-divider"></div>
			<Assets100 />
			<div className="step-item-divider"></div>
			<div
				disabled={
					visibleAsset.claim100Status !== NOTIFICATION_STATUS.DONE.value
				}
			>
				<AssetsAppraisalResultNotification />
			</div>
		</InpoundmentStep>
	)
}
