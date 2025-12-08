import React from 'react'
import {
	INPOUNDMENT_TYPE,
	NOTIFICATION_STATUS,
	NOTIFICATION_TYPE,
	TASK_TYPE,
} from '../../constants'
import { getAssetName } from '../../helpers/Helper'
import printer from '../../printer'
import useInpoundmentContext from '../../services/hooks/useInpoundmentContext'
import Note from '../Note'
import AssetNotifications from '../notification/AssetNotifications'
import NotificationObjectionDateNote from '../notification/NotificationObjectionDateNote'
import Printer from '../Printer'
import RadioSelect from '../RadioSelect'
import TaskField from '../task/TaskField'
import TrueFalse from '../TrueFalse'

export default function InpoundmentCreation({ customAddresses }) {
	const {
		assetProps: { assetType, visibleAsset, updateAsset },
		selectedDebtor,
		selectedForeclosableAddress,
	} = useInpoundmentContext()

	return (
		<div className="flex  mt-4">
			<TaskField
				type={[
					TASK_TYPE.CREATE_INPOUNDMENT,
					TASK_TYPE.DE_FACTO_GARNISHMENT_DOCUMENTS,
				]}
				className="w-30 mr-4"
				title={`${getAssetName(assetType)} hazırlandı mı?`}
				titleButton={
					<Printer
						paperDebtors={[selectedDebtor]}
						type="requestPaper"
						request={
							assetType === INPOUNDMENT_TYPE.SHARE
								? printer.SHARE_NOTIFICATION.value
								: printer.GARNISHMENT.value
						}
						caseId={
							selectedForeclosableAddress
								? selectedForeclosableAddress.caseId
								: visibleAsset.caseId
						}
						object={visibleAsset}
					/>
				}
			>
				<TrueFalse
					options={['Hayır', 'Evet, hazırlandı']}
					object={visibleAsset}
					property="isInpoundmentCreated"
					change={updateAsset}
				/>
				{visibleAsset.inpoundmentNotificationStatus ===
					NOTIFICATION_STATUS.DONE.value && (
					<>
						<div className="step-item-divider"></div>
						<TaskField
							title={`${getAssetName(assetType)} Cevabı`}
							type={[
								TASK_TYPE.INPOUNDMENT_RESPONSE,
								TASK_TYPE.DE_FACTO_GARNISHMENT_DOCUMENTS_RESPONSE,
							]}
						>
							<RadioSelect
								className="mt-4"
								options={['Sessiz Kaldı', 'Olumsuz', 'Olumlu']}
								values={[
									NOTIFICATION_STATUS.PENDING.value,
									NOTIFICATION_STATUS.REJECTED.value,
									NOTIFICATION_STATUS.DONE.value,
								]}
								value={visibleAsset.inpoundmentResponse}
								onChange={val => updateAsset('inpoundmentResponse', val)}
							/>
						</TaskField>
					</>
				)}
				{visibleAsset.inpoundmentResponse ===
					NOTIFICATION_STATUS.PENDING.value && (
					<>
						<div className="step-item-divider"></div>
						<TaskField
							type={TASK_TYPE.INPOUNDMENT_MEMORIAL}
							title="Şirkete Muhtıra Hazırlandı Mı?"
							titleButton={
								<Printer
									paperDebtors={[selectedDebtor]}
									type="requestPaper"
									request={printer.SHARE_NOTIFICATION.value}
									caseId={
										selectedForeclosableAddress
											? selectedForeclosableAddress.caseId
											: visibleAsset.caseId
									}
									object={visibleAsset}
								/>
							}
						>
							<TrueFalse
								options={['Hayır', 'Evet, hazırlandı']}
								object={visibleAsset}
								property="isMemorialCreated"
								change={updateAsset}
							/>
						</TaskField>
						{visibleAsset.memorialStatus === NOTIFICATION_STATUS.DONE.value && (
							<>
								<div className="step-item-divider"></div>
								<TaskField
									title="Muhtıra Cevabı"
									type={TASK_TYPE.INPOUNDMENT_MEMORIAL_RESPONSE}
								>
									<RadioSelect
										className="mt-4"
										options={['Sessiz Kaldı', 'Olumsuz', 'Olumlu']}
										values={[
											NOTIFICATION_STATUS.PENDING.value,
											NOTIFICATION_STATUS.REJECTED.value,
											NOTIFICATION_STATUS.DONE.value,
										]}
										value={visibleAsset.memorialResponse}
										onChange={val => updateAsset('memorialResponse', val)}
									/>
									{visibleAsset.memorialResponse === null && (
										<Note type="zekiye" classes="mt-4">
											<span>
												Muhtıraya sessiz kalınması durumunda şirket otomatik
												olarak borçlu hale gelecektir.
											</span>
										</Note>
									)}
								</TaskField>
							</>
						)}
					</>
				)}
				<NotificationObjectionDateNote />
			</TaskField>
			<div className="w-70">
				<AssetNotifications
					customAddresses={customAddresses}
					notificationType={
						assetType === 'SSI' || assetType === 'DE_FACTO'
							? NOTIFICATION_TYPE.GARNISHMENT
							: NOTIFICATION_TYPE.SHARE
					}
					title={`${getAssetName(assetType)} Tebligatları`}
					emptyText={`Henüz ${getAssetName(
						assetType,
					)} tebligatı hazırlanmamış.`}
				/>
			</div>
		</div>
	)
}
