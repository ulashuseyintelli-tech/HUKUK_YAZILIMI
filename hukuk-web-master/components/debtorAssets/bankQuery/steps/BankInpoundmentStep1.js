import React, { useEffect, useState } from 'react'
import {
	NOTIFICATION_STATUS,
	NOTIFICATION_TYPE,
	TASK_TYPE,
} from '../../../../constants'
import useInpoundmentContext from '../../../../services/hooks/useInpoundmentContext'
import InpoundmentStep from '../../../inpoundments/InpoundmentStep'
import Note from '../../../Note'
import AssetNotifications from '../../../notification/AssetNotifications'

import RadioSelect from '../../../RadioSelect'
import TaskField from '../../../task/TaskField'
import TrueFalse from '../../../TrueFalse'

export default function BankInpoundmentStep1() {
	const {
		assetProps: {
			visibleAsset,
			assets,
			setAssets,
			visibleAssetIndex,
			updateAsset,
		},
		selectedDebtor,
	} = useInpoundmentContext()

	const setNotifications = notifications => {
		assets[visibleAssetIndex].notifications = [...notifications]
		setAssets([...assets])
	}

	return (
		<InpoundmentStep step={1}>
			<div className="mt-4"></div>
			<div className="flex ">
				<div className="w-30 mr-4">
					{visibleAsset.notifications
						?.filter(n => n.status === NOTIFICATION_STATUS.DONE.value)
						.map(notification => {
							const { level } = notification
							const field =
								level === 1
									? 'firstResponse'
									: level === 2
									? 'secondResponse'
									: 'thirdResponse'
							const creationStateField =
								level === 1
									? 'secondNotificationCreated'
									: 'thirdNotificationCreated'
							return (
								<>
									<TaskField
										type={TASK_TYPE.INPOUNDMENT_RESPONSE}
										extraCondition={task => task.extra?.level === level}
										title={`89/${notification.level} Cevabı`}
									>
										<RadioSelect
											className="mt-4"
											options={['Sessiz Kaldı', 'Olumsuz', 'Olumlu']}
											values={[
												NOTIFICATION_STATUS.PENDING.value,
												NOTIFICATION_STATUS.REJECTED.value,
												NOTIFICATION_STATUS.DONE.value,
											]}
											value={visibleAsset[field]}
											onChange={val => updateAsset(field, val)}
										/>
									</TaskField>
									{level === 3 &&
										visibleAsset[field] ===
											NOTIFICATION_STATUS.PENDING.value && (
											<Note type="zekiye" classes="mt-4">
												Banka otomatik olarak borçlu eklendi. Görev listesini
												takip ederek haciz işlemlerini başlatabilirsiniz.
											</Note>
										)}
									{level !== 3 &&
										visibleAsset[field] ===
											NOTIFICATION_STATUS.PENDING.value && (
											<>
												<div className="step-item-divider"></div>
												<TaskField
													type={TASK_TYPE.CREATE_INPOUNDMENT}
													extraCondition={task => task.extra?.level === level}
													title={`89/${notification.level + 1} Hazırlandı Mı?`}
												>
													<TrueFalse
														options={['Hayır', 'Evet, hazırlandı']}
														object={visibleAsset}
														property={creationStateField}
														change={updateAsset}
													/>
												</TaskField>
											</>
										)}
									<div className="step-item-divider"></div>
								</>
							)
						})}
				</div>
				<div className="w-70">
					{visibleAsset && (
						<AssetNotifications
							title="Banka Haciz Müzekkereleri"
							notificationType={NOTIFICATION_TYPE.THIRD_PERSON}
							onNotificationsChange={setNotifications}
						/>
					)}
				</div>
			</div>
		</InpoundmentStep>
	)
}
