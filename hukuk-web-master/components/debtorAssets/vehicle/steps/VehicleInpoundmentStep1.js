import InpoundmentStep from '../../../inpoundments/InpoundmentStep'
import TrueFalse from '../../../TrueFalse'
import { TASK_TYPE, VEHICLE_NEGATIVE_REASONS } from '../../../../constants'
import useInpoundmentContext from '../../../../services/hooks/useInpoundmentContext'
import TaskField from '../../../task/TaskField'

export default function VehicleInpoundmentStep1() {
	const {
		assetProps: { visibleAsset, updateAsset },
	} = useInpoundmentContext()

	return (
		<InpoundmentStep step={1}>
			<TaskField type={TASK_TYPE.IS_SEIZED} title="Haciz Durumu">
				<TrueFalse
					options={['Olumsuz', 'Olumlu']}
					object={visibleAsset}
					property="isSeized"
					change={updateAsset}
				/>
			</TaskField>
			<div className="step-item-divider"></div>
			{visibleAsset.isSeized === false && (
				<TaskField
					title="Olumsuz Olma Nedeni"
					type={TASK_TYPE.REASON_FOR_NEGATIVE_REQUIRED}
				>
					<select
						className="input mt-4"
						onChange={e =>
							updateAsset('reasonForBeingNegative', e.target.value)
						}
						value={visibleAsset.reasonForBeingNegative}
					>
						{Object.keys(VEHICLE_NEGATIVE_REASONS).map(key => {
							return (
								<option value={VEHICLE_NEGATIVE_REASONS[key].value}>
									{VEHICLE_NEGATIVE_REASONS[key].text}
								</option>
							)
						})}
					</select>
				</TaskField>
			)}
		</InpoundmentStep>
	)
}
