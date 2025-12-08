import InpoundmentStep from '../../../inpoundments/InpoundmentStep'
import AssetsAppraisalResultNotification from '../../../debtorAssets/commonSteps/AssetsAppraisalResultNotification'

export default function VehicleInpoundmentStep5() {
	return (
		<InpoundmentStep step={5}>
			<AssetsAppraisalResultNotification />
		</InpoundmentStep>
	)
}
