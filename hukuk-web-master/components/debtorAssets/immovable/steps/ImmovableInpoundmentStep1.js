import InpoundmentStep from '../../../inpoundments/InpoundmentStep'
import useInpoundmentContext from '../../../../services/hooks/useInpoundmentContext'
import AssetSeizeStatus from '../../commonSteps/AssetSeizeStatus'

export default function ImmovableInpoundmentStep1() {
	return (
		<InpoundmentStep step={1}>
			<AssetSeizeStatus />
		</InpoundmentStep>
	)
}
