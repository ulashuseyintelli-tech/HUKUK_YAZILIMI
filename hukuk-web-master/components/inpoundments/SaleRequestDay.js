import React from 'react'
import { FaFileAlt } from 'react-icons/fa'
import { TASK_TYPE, VEHICLE_NEGATIVE_REASONS } from '../../constants'
import { useAppContext } from '../../services/hooks/useAppContext'
import useInpoundmentContext from '../../services/hooks/useInpoundmentContext'
import Button from '../anBrains/Button'
import Note from '../Note'
import NotificationStatus from '../notification/NotificationStatus'
import TaskRadar from '../task/TaskRadar'
import TaskRow from '../task/TaskRow'
import TrueFalse from '../TrueFalse'

export default function SaleRequestDay({
	saleRequest,
	day,
	changeProperty,
	dayIndex,
}) {
	const { user } = useAppContext()
	const {
		debtorTasks,
		assetProps: { assetType, visibleAsset },
	} = useInpoundmentContext()

	const checkTasksIncludesByDay = type => {
		return debtorTasks.some(
			t =>
				t.type === type &&
				t.assetId === visibleAsset._id &&
				t.extra &&
				t.extra.dayIndex === dayIndex,
		)
	}

	const newspaperMandatory =
		user.lawOffice[0].saleNewspaperMandatoryAssetTypes.includes(assetType)

	return (
		<div className="inpoundment-sale-day bg-white p-8 br mt-8">
			<p className="fw-500 mb-2">{dayIndex + 1}. Satış Günü</p>
			{newspaperMandatory && (
				<>
					<div className="step-item-divider"></div>
					<div className="flex al-center">
						<div className="w-50 mr-4">
							<p>Satış günü için gazete ilanının yayınlanması gerekiyor</p>

							<Button classes="blue fw-500 mt-2 fs-sm">
								<FaFileAlt className="mr-1" />
								Satış İçin Gazete İlanı Yazdır
							</Button>
						</div>
						<div className="w-50">
							<TaskRadar
								always={checkTasksIncludesByDay(
									TASK_TYPE.SALE_REQUEST_DAY_NEWSPAPER_ANNOUNCE_REQUIRED,
									dayIndex,
								)}
							>
								<p className="fw-500 mt-4 ">Gazet İlanı Yayınlandı Mı?</p>
							</TaskRadar>
							<TrueFalse
								options={['Hayır', 'Evet, yayınlandı']}
								object={day}
								property="isSaleAnnouncedAtNewspaper"
								change={(prop, val) => changeProperty(dayIndex, prop, val)}
							/>
						</div>
					</div>
				</>
			)}
			<div className="step-item-divider"></div>
			{new Date(day.saleDate) < new Date() &&
			(day.isSaleAnnouncedAtNewspaper || !newspaperMandatory) ? (
				<>
					<div className="flex al-center">
						<div className="w-50 mr-4">
							<TaskRadar
								right="100%"
								top="-.75rem"
								always={checkTasksIncludesByDay(
									TASK_TYPE.SALE_REQUEST_DAY_RESPONSE,
								)}
							>
								<p className="fw-500 mb-2">Satış Yapıldı Mı?</p>
							</TaskRadar>
							<TrueFalse
								object={day}
								property="saleStatus"
								change={(prop, val) => changeProperty(dayIndex, prop, val)}
								options={['Yapılmadı', 'Yapıldı']}
							/>
						</div>
						{day.saleStatus && (
							<div className="w-50">
								<TaskRadar
									right="100%"
									top="-.75rem"
									always={checkTasksIncludesByDay(
										TASK_TYPE.SALE_REQUEST_COMPLETED_NOTIFICATION_REQUIRED,
									)}
								>
									<p className="fw-500">Satışın Taraflara Tebliğ Durumu</p>
									<NotificationStatus
										withObjection
										value={day.saleNotificationStatus}
										change={v =>
											changeProperty(dayIndex, 'saleNotificationStatus', v)
										}
									/>
								</TaskRadar>
							</div>
						)}
					</div>
					{day.saleStatus === false && (
						<div className="step-item-divider"></div>
					)}
					<TaskRow
						titles={['Satış Yapılamama Nedeni', 'Şikayet Davası']}
						types={[TASK_TYPE.SALE_REQUEST_DAY_REASON_FOR_NEGATIVE, '']}
						condition={day.saleStatus === false}
						conditions={[
							true,
							day.reasonForBeingNegative ===
								VEHICLE_NEGATIVE_REASONS.ASSET_NOT_EXIST.value,
						]}
						children={[
							<select
								className="input mt-4"
								onChange={e =>
									changeProperty(
										dayIndex,
										'reasonForBeingNegative',
										e.target.value,
									)
								}
								value={day.reasonForBeingNegative}
							>
								<option value={null} disabled>
									Bir neden seçin
								</option>
								{Object.keys(VEHICLE_NEGATIVE_REASONS).map(key => {
									return (
										<option value={VEHICLE_NEGATIVE_REASONS[key].value}>
											{VEHICLE_NEGATIVE_REASONS[key].text}
										</option>
									)
								})}
							</select>,
							<div>
								<Note type="zekiye" classes="mt-4">
									Yedieminliği suistimalden ceza davası açabilirsiniz
									<Button theme="blue fw-600 mt-2">Ceza Davası Aç</Button>
								</Note>
							</div>,
						]}
					/>
				</>
			) : (
				(day.isSaleAnnouncedAtNewspaper || !newspaperMandatory) &&
				(dayIndex === 0 ||
					(dayIndex === 1 && saleRequest.days[0].saleStatus === false)) && (
					<Note classes="mt-8" type="zekiye">
						Satış günü (
						{new Date(saleRequest.days[dayIndex].saleDate).toLocaleDateString(
							'tr-TR',
						)}{' '}
						{new Date(saleRequest.days[dayIndex].saleDate).toLocaleTimeString()}
						) geldiğinde bu alan aktif olacaktır. Satış günü için görevleri
						takip edin.
					</Note>
				)
			)}
		</div>
	)
}
