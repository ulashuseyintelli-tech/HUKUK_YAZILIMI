import InpoundmentStep from '../../../inpoundments/InpoundmentStep'
import TrueFalse from '../../../TrueFalse'
import { TASK_TYPE, VEHICLE_NEGATIVE_REASONS } from '../../../../constants'
import useInpoundmentContext from '../../../../services/hooks/useInpoundmentContext'
import TaskRow from '../../../task/TaskRow'
import AssetSeizeStatus from '../../commonSteps/AssetSeizeStatus'

export default function PatentInpoundmentStep1() {
	const {
		assetProps: { visibleAsset, updateAsset },
	} = useInpoundmentContext()

	return (
		<InpoundmentStep step={1}>
			<AssetSeizeStatus />
		</InpoundmentStep>
	)
}
