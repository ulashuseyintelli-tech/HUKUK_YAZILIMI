import React, { useContext } from 'react'
import { TASK_TYPE } from '../../../../constants'
import InpoundmentStep from '../../../inpoundments/InpoundmentStep'
import TrueFalse from '../../../TrueFalse'
import Printer from '../../../Printer'
import printer from '../../../../printer'
import Assets103 from '../../commonSteps/Assets103'
import { InpoundmentContext } from '../../../../pages/takip/CaseInpoundmentDetails'
import RestrictionTable from '../../../inpoundments/RestrictionTable'
import TaskField from '../../../task/TaskField'
import AssetSaleAdvance from '../../commonSteps/AssetSaleAdvance'

export default function VehicleInpoundmentStep2() {
	const { assetProps, selectedDebtor } = useContext(InpoundmentContext)
	const { visibleAsset, updateAsset } = assetProps

	if (visibleAsset && visibleAsset.restriction.isCancelledByThreshold) {
		return (
			<div className="mt-10">
				<RestrictionTable />
			</div>
		)
	}

	return (
		<InpoundmentStep step={2}>
			<RestrictionTable />
			<div className="step-item-divider"></div>
			<Assets103 />
			<div className="step-item-divider"></div>
			<AssetSaleAdvance />
			<div className="step-item-divider"></div>
			<TaskField
				title="Araç Yakalandı Mı?"
				type={TASK_TYPE.WARRANT_REQUIRED}
				titleButton={
					<Printer
						paperDebtors={[selectedDebtor]}
						type="requestPaper"
						request={printer.VEHICLE_WARRANT.value}
						caseId={visibleAsset.caseId}
						object={visibleAsset}
						title="Yakalama Kararı Yazdır"
					/>
				}
			>
				<TrueFalse
					options={['Yakalanmadı', 'Yakalandı']}
					object={visibleAsset}
					property="isWarranted"
					change={updateAsset}
				/>
			</TaskField>
		</InpoundmentStep>
	)
}
