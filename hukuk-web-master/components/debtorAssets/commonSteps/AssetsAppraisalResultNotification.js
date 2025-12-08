import { NOTIFICATION_TYPE, TASK_TYPE } from '../../../constants'
import printer from '../../../printer'
import useInpoundmentContext from '../../../services/hooks/useInpoundmentContext'
import RestrictionTable from '../../inpoundments/RestrictionTable'
import Note from '../../Note'

import AssetNotifications from '../../notification/AssetNotifications'
import NotificationObjectionDateNote from '../../notification/NotificationObjectionDateNote'

import Printer from '../../Printer'
import TaskField from '../../task/TaskField'
import TrueFalse from '../../TrueFalse'

export default function AssetsAppraisalResultNotification({
	customAsset,
	customUpdate,
	customUpdateRestriction,
	customType,
}) {
	let {
		assetProps: { visibleAsset, updateAsset, checkTasksIncludes },
		selectedDebtor,
		visibleInpoundment,
		currentCase,
		debtorTasks,
	} = useInpoundmentContext()

	visibleAsset = customAsset || visibleAsset
	updateAsset = customUpdate || updateAsset

	const printerType =
		visibleInpoundment === 'VEHICLE'
			? printer.VEHICLE_103
			: visibleInpoundment === 'IMMOVABLE'
			? printer.IMMOVABLE_103
			: printer.MOVABLE_103

	return (
		<div>
			<div className="flex">
				<TaskField
					className="w-30 mr-10"
					customAssetId={customAsset?._id}
					title="Kıymet Takdiri Tebligatı Hazırlandı Mı?"
					type={TASK_TYPE.APPRAISAL_NOTIFICATION_REQUIRED}
					titleButton={
						<Printer
							paperDebtors={[selectedDebtor]}
							type="requestPaper"
							request={printerType.value}
							caseId={currentCase._id}
							object={visibleAsset}
						/>
					}
				>
					<TrueFalse
						options={['Hayır', 'Evet, hazırlandı']}
						object={visibleAsset}
						property="appraisalNotificationCreated"
						change={updateAsset}
					/>
					<NotificationObjectionDateNote />
				</TaskField>
				<div className="w-70">
					<AssetNotifications
						customAsset={customAsset}
						customAssetType={customType}
						notificationType={NOTIFICATION_TYPE.APPRAISAL_RESULT}
						title="Borçluya Kıymet Takdiri Tebligatları"
						emptyText="Henüz kıymet takdiri tebligatı gönderilmemiş"
					/>
				</div>
			</div>
			{visibleAsset.appraisalNotificationCreated && (
				<>
					<div className="step-item-divider"></div>
					<RestrictionTable
						withQuestion={false}
						customAsset={customAsset}
						customUpdate={customUpdateRestriction}
						disableCloseOnClick={customAsset}
					/>
				</>
			)}
			{/* {visibleAsset.appraisalNotificationCreated && (
					<TaskField
						title="Kıymet Takdiri Tebligat Durumu"
						type={TASK_TYPE.APPRAISAL_NOTIFICATION_DONE_REQUIRED}
					>
						<NotificationStatus
							value={visibleAsset.appraisalNotificationStatus}
							change={v => updateAsset('appraisalNotificationStatus', v)}
						/>
					</TaskField>
				)} */}
		</div>
	)
}
