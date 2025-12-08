import React, { useContext, useState } from 'react'
import { NOTIFICATION_TYPE, TASK_TYPE } from '../../../constants'
import { InpoundmentContext } from '../../../pages/takip/CaseInpoundmentDetails'
import printer from '../../../printer'
import Note from '../../Note'
import AssetNotifications from '../../notification/AssetNotifications'
import NotificationObjectionDateNote from '../../notification/NotificationObjectionDateNote'
import Printer from '../../Printer'
import TaskField from '../../task/TaskField'
import TrueFalse from '../../TrueFalse'

export default function Assets103() {
	const { assetProps, selectedDebtor, visibleInpoundment, currentCase } =
		useContext(InpoundmentContext)
	const { visibleAsset, updateAsset } = assetProps

	const [objectionDateCheck, setObjectionDateCheck] = useState(false)

	const printerType =
		visibleInpoundment === 'VEHICLE'
			? printer.VEHICLE_103
			: visibleInpoundment === 'IMMOVABLE'
			? printer.IMMOVABLE_103
			: printer.MOVABLE_103

	if (
		visibleInpoundment === 'DE_FACTO' &&
		(visibleAsset.isDebtorExist || visibleAsset.is103LeftToPlace)
	) {
		return (
			<Note type="zekiye">
				Mahalde 103 bırakıldığı için bu adımı geçebilirsiniz
			</Note>
		)
	}

	return (
		<div>
			<div className="flex al-center">
				<p className="fw-600 blue mr-4">103 Davetiyesi</p>
				<Printer
					paperDebtors={[selectedDebtor]}
					type="requestPaper"
					request={printerType.value}
					caseId={currentCase._id}
					object={visibleAsset}
				/>
			</div>
			<NotificationObjectionDateNote />
			<div className="flex mt-4">
				<TaskField
					className="w-30 mr-10"
					type={TASK_TYPE.CLAIM_103_DOCUMENT_CREATE}
					title="103. Davetiyesi Gönderildi Mi?"
				>
					<p className="fw-500 mb-2"></p>
					<TrueFalse
						options={['Edilmedi', 'Evet, gönderildi']}
						object={visibleAsset}
						property="claim103DocumentCreated"
						change={updateAsset}
					/>
				</TaskField>

				<div className="w-70">
					<AssetNotifications
						notificationType={NOTIFICATION_TYPE[103]}
						title="103 Davetiyeleri"
						emptyText="Henüz 103 davetiyesi gönderilmemiş"
						setObjectionDateCheck={setObjectionDateCheck}
					/>
				</div>
			</div>
		</div>
	)
}
