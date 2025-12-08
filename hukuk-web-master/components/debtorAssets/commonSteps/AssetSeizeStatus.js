import React from 'react'
import { TASK_TYPE, VEHICLE_NEGATIVE_REASONS } from '../../../constants'
import useInpoundmentContext from '../../../services/hooks/useInpoundmentContext'
import Button from '../../anBrains/Button'
import TaskRow from '../../task/TaskRow'
import TrueFalse from '../../TrueFalse'

export default function AssetSeizeStatus() {
	const {
		assetProps: { visibleAsset, updateAsset },
	} = useInpoundmentContext()

	return (
		<TaskRow
			conditions={[true, visibleAsset.isSeized === false]}
			titleButtons={[
				null,
				<Button classes="fw-500 red">Memur İşlemini Şikayet Davası Aç</Button>,
			]}
			titles={['Haciz Durumu', 'Olumsuz Olma Nedeni']}
			types={[TASK_TYPE.IS_SEIZED, TASK_TYPE.REASON_FOR_NEGATIVE_REQUIRED]}
			children={[
				<TrueFalse
					options={['Olumsuz', 'Olumlu']}
					object={visibleAsset}
					property="isSeized"
					change={updateAsset}
				/>,
				<>
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
				</>,
			]}
		/>
	)
}
