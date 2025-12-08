import TrueFalse from '../../../TrueFalse'
import InpoundmentStep from '../../../inpoundments/InpoundmentStep'
import printer from '../../../../printer'
import Printer from '../../../Printer'
import Assets103 from '../../commonSteps/Assets103'
import useInpoundmentContext from '../../../../services/hooks/useInpoundmentContext'
import RestrictionTable from '../../../inpoundments/RestrictionTable'
import AssetNotifications from '../../../notification/AssetNotifications'
import { NOTIFICATION_TYPE, TASK_TYPE } from '../../../../constants'
import TaskRadar from '../../../task/TaskRadar'
import AssetSaleAdvance from '../../commonSteps/AssetSaleAdvance'

export default function ImmovableInpoundmentStep2() {
	const { assetProps } = useInpoundmentContext()
	const { visibleAsset, updateAsset, checkTasksIncludes } = assetProps

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
			<div>
				<div className="flex al-center mb-4">
					<p className="mr-4 fw-600 blue">Belediye İmar Durumu</p>
					<Printer
						type="requestPaper"
						request={printer.IMMOVABLE_ZONE.value}
						caseId={visibleAsset.caseId}
						object={visibleAsset}
					/>
				</div>
				<div className="flex">
					<TaskRadar
						right="100%"
						top="-.75rem"
						always={checkTasksIncludes(TASK_TYPE.ZONING_STATUS_DOCUMENT_CREATE)}
						containerClasses="w-30"
					>
						<p className="fw-500 mr-4">
							Belediyeden İmar Durumu Talep Edildi Mi?
						</p>
						<TrueFalse
							options={['Hayır', 'Evet, talep edildi']}
							object={visibleAsset}
							property="isZoningStatusDocumentCreated"
							change={updateAsset}
						/>
					</TaskRadar>
					<div className="w-70">
						<AssetNotifications
							notificationType={NOTIFICATION_TYPE.ZONING_STATUS}
							title="İmar Durumu Talepleri"
							emptyText="Henüz imar durumu talep edilmemiş."
						/>
					</div>
				</div>
			</div>
			<div className="step-item-divider"></div>
			<div>
				<div className="flex al-center mb-4">
					<p className="fw-600 blue mr-4">Tapu Kadastro Çap Durumu</p>
					<Printer
						type="requestPaper"
						request={printer.IMMOVABLE_CADASTRE.value}
						caseId={visibleAsset.caseId}
						object={visibleAsset}
					/>
				</div>
				<div className="flex">
					<TaskRadar
						right="100%"
						top="-.75rem"
						always={checkTasksIncludes(TASK_TYPE.CADASTRE_DOCUMENT_CREATE)}
						containerClasses="w-30"
					>
						<p className="fw-500 mr-4">
							Tapu Kadastrodan Çap Durumu Talep Edildi Mi?
						</p>
						<TrueFalse
							options={['Hayır', 'Evet, talep edildi']}
							object={visibleAsset}
							property="isCadastreDocumentCreated"
							change={updateAsset}
						/>
					</TaskRadar>
					<div className="w-70">
						<AssetNotifications
							notificationType={NOTIFICATION_TYPE.CADASTRE}
							title="Çap Durumu Talepleri"
							emptyText="Henüz imar durumu talep edilmemiş."
						/>
					</div>
				</div>
			</div>
			<div className="step-item-divider"></div>
			<Assets103 />
			<div className="step-item-divider"></div>
			<AssetSaleAdvance />
		</InpoundmentStep>
	)
}
