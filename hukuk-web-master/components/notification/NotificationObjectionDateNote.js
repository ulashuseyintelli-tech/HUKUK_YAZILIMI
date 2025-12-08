import React from 'react'
import { TASK_TYPE } from '../../constants'
import useInpoundmentContext from '../../services/hooks/useInpoundmentContext'
import Note from '../Note'

export default function NotificationObjectionDateNote() {
	const {
		debtorTasks,
		assetProps: { visibleAsset },
	} = useInpoundmentContext()

	return debtorTasks.some(
		t =>
			t.type === TASK_TYPE.NOTIFICATION_OBJECTION_REMAINING_TIME &&
			t.extra?.notificationAssetId === visibleAsset._id,
	) ? (
		<Note type="zekiye" classes="mt-4">
			Haciz işlemlerine devam edebilmek için itiraz süresi bekleniyor.
		</Note>
	) : null
}
