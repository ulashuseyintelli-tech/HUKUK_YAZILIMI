import React from 'react'
import { NOTIFICATION_TYPE, TASK_TYPE } from '../../../../constants'
import TrueFalse from '../../../TrueFalse'
import InpoundmentStep from '../../../inpoundments/InpoundmentStep'
import printer from '../../../../printer'
import Printer from '../../../Printer'
import Assets103 from '../../commonSteps/Assets103'
import useInpoundmentContext from '../../../../services/hooks/useInpoundmentContext'
import RestrictionTable from '../../../inpoundments/RestrictionTable'
import AssetSaleAdvance from '../../commonSteps/AssetSaleAdvance'
import TaskField from '../../../task/TaskField'
import AssetNotifications from '../../../notification/AssetNotifications'

export default function ShareInpoundmentStep2() {
	const {
		assetProps: { visibleAsset, updateAsset },
		selectedDebtor,
	} = useInpoundmentContext()

	if (visibleAsset && visibleAsset.restriction.isCancelledByThreshold) {
		return (
			<div className="mt-10">
				<RestrictionTable />
			</div>
		)
	}

	return (
		<InpoundmentStep step={2}>
			<div className="step-item-divider"></div>
			<React.Fragment>
				<RestrictionTable />
			</React.Fragment>
			<div className="step-item-divider"></div>
			<Assets103 />
			<div className="step-item-divider"></div>
			<div className="flex">
				<TaskField
					title="Ticaret Odasına Haciz Tebligatı Hazırlandı Mı?"
					titleButton={
						<Printer
							paperDebtors={[selectedDebtor]}
							type="requestPaper"
							request={printer.SHARE_NOTIFICATION.value}
							caseId={visibleAsset.caseId}
							object={visibleAsset}
						/>
					}
					type={TASK_TYPE.CHAMBER_OF_COMMERCE_DOCUMENT}
					className="w-30 mr-10"
				>
					<TrueFalse
						options={['Hayır', 'Evet, hazırlandı.']}
						object={visibleAsset}
						property="chamberOfCommerceDocumentCreated"
						change={updateAsset}
					/>
					,
				</TaskField>
				<div className="w-70">
					<AssetNotifications
						notificationType={NOTIFICATION_TYPE.CHAMBER_OF_COMMERCE}
						title="Ticaret Odası Haciz Tebligatları"
						emptyText="Henüz ticaret odasına hisse haczi tebligatı hazırlanmamış."
					/>
				</div>
			</div>

			<div className="step-item-divider"></div>
			<AssetSaleAdvance />
		</InpoundmentStep>
	)
}
