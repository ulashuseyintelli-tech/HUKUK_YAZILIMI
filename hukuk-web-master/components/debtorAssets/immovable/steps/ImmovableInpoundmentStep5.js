import InpoundmentStep from '../../../inpoundments/InpoundmentStep'
import AssetsAppraisalResultNotification from '../../commonSteps/AssetsAppraisalResultNotification'

export default function ImmovableInpoundmentStep5() {
	return (
		<InpoundmentStep step={4}>
			<div className="mt-4"></div>
			<AssetsAppraisalResultNotification />
		</InpoundmentStep>
	)
}
