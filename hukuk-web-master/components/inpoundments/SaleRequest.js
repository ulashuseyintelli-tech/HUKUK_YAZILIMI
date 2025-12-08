import React, { useState } from 'react'
import ReactDatePicker from 'react-datepicker'
import { FaCheckCircle, FaChevronCircleDown } from 'react-icons/fa'
import {
	locale,
	NOTIFICATION_STATUS,
	RESTRICTION_UPDATE_REQUIRED_ASSET_TYPES,
	TASK_TYPE,
} from '../../constants'
import { findSaleRequestPrinterTypeByAsset } from '../../helpers/Helper'
import { useAppContext } from '../../services/hooks/useAppContext'
import useInpoundmentContext from '../../services/hooks/useInpoundmentContext'
import Button from '../anBrains/Button'
import Note from '../Note'
import Printer from '../Printer'
import TaskRadar from '../task/TaskRadar'
import TrueFalse from '../TrueFalse'
import SaleRequestDay from './SaleRequestDay'

export default function SaleRequest({
	saleRequest,
	changeProperty,
	changeDayProperty,
	reqIndex,
	sale,
}) {
	const {
		assetProps: {
			visibleAsset,
			updateAsset,
			checkTasksIncludes,
			assetType,
			updateRestriction,
		},
		selectedDebtor,
		currentCase,
	} = useInpoundmentContext()

	const isSaleSuccessfull = saleRequest.days.some(
		day =>
			day.saleStatus === true &&
			day.saleNotificationStatus === NOTIFICATION_STATUS.DONE.value,
	)
	const areBothDaysStatusFalse =
		saleRequest.days.filter(day => day.saleStatus === false).length === 2

	const [isRequestDone, setIsRequestDone] = useState(
		isSaleSuccessfull || areBothDaysStatusFalse,
	)

	const [trackingNumber, setTrackingNumber] = useState(
		saleRequest.trackingNumber,
	)

	const onSaleDateChange = (dayIndex, value) => {
		if (dayIndex === 1) {
			if (
				saleRequest.days[0].saleDate &&
				new Date(saleRequest.days[0].saleDate) >= new Date(value)
			) {
				alert('2. satış günü 1. satış gününden önce olamaz!')
			} else {
				changeDayProperty(dayIndex, 'saleDate', value)
			}
		} else {
			if (
				saleRequest.days[1].saleDate &&
				new Date(saleRequest.days[1].saleDate) <= new Date(value)
			) {
				alert('1. satış günü 2. satış gününden sonra olamaz!')
			} else {
				changeDayProperty(dayIndex, 'saleDate', value)
			}
		}
	}

	const save = () => {
		changeProperty('trackingNumber', trackingNumber)
	}

	return (
		<div className="inpoundment-sale-request">
			<div className="flex al-center jst-between mb-8">
				<div className="flex al-center">
					<p className="fw-600 mr-4 fs-md">{reqIndex + 1}. Satış Talebi</p>
					<Printer
						paperDebtors={[selectedDebtor]}
						type="requestPaper"
						request={findSaleRequestPrinterTypeByAsset(sale.assetType)}
						caseId={currentCase._id}
					/>
				</div>
				<Button
					classes={`badge p-2 br-50 fs-nm ${!isRequestDone ? 'rot-180' : ''}`}
					onClick={() => setIsRequestDone(!isRequestDone)}
				>
					<FaChevronCircleDown />
				</Button>
			</div>
			{isSaleSuccessfull && (
				<Note type="success">
					<p className="fw-500">Satış gerçekleştirildi</p>
				</Note>
			)}
			{areBothDaysStatusFalse && (
				<Note className="flex al-center red" type="error">
					<p className="ml-2 fw-500">İki satış gününde de satış yapılamadı</p>
				</Note>
			)}
			{!isRequestDone && (
				<div className="mt-4">
					<div className="w-100 flex">
						{(sale.assetType === 'VEHICLE' ||
							sale.assetType === 'IMMOVABLE') && (
							<div className="w-100 mr-4 bg-white p-4 br">
								<TaskRadar
									always={checkTasksIncludes(
										TASK_TYPE.RESTRICTIONS_UPDATE_REQUIRED,
									)}
								>
									<p className="fw-500">Takyidat Kayıtları Güncellendi Mi?</p>
								</TaskRadar>
								<TrueFalse
									options={['Güncellenmedi', 'Güncellendi']}
									object={visibleAsset.restriction}
									property="updated"
									change={updateRestriction}
								/>
							</div>
						)}
						<TaskRadar
							always={checkTasksIncludes(
								TASK_TYPE.SALE_REQUEST_DAY_DATES_REQUIRED,
							)}
							containerClasses="w-100 flex al-center bg-white p-4 br"
						>
							<div className="w-100 mr-4">
								<p className="fw-500 mb-4">1. Satış Gününün Tarihi</p>
								<ReactDatePicker
									selected={
										saleRequest.days[0].saleDate
											? new Date(saleRequest.days[0].saleDate)
											: new Date()
									}
									onChange={date => onSaleDateChange(0, date)}
									showTimeSelect
									timeFormat="HH:mm"
									dateFormat="MM/dd/yyyy h:mm"
									locale={locale}
									wrapperClassName="w-100"
									className="input p-2 w-100"
								/>
							</div>
							<div className="w-100">
								<p className="fw-500 mb-4">2. Satış Gününün Tarihi</p>
								<ReactDatePicker
									selected={
										saleRequest.days[1].saleDate
											? new Date(saleRequest.days[1].saleDate)
											: new Date()
									}
									onChange={date => onSaleDateChange(1, date)}
									showTimeSelect
									timeFormat="HH:mm"
									dateFormat="MM/dd/yyyy h:mm "
									locale={locale}
									wrapperClassName="w-100"
									className="input p-2 w-100"
								/>
							</div>
						</TaskRadar>
					</div>

					{(!RESTRICTION_UPDATE_REQUIRED_ASSET_TYPES.includes(assetType) ||
						visibleAsset.restriction.updated) &&
						saleRequest.days[0].saleDate &&
						saleRequest.days[1].saleDate &&
						saleRequest.days.map((day, dayIndex) => {
							if (
								dayIndex !== 1 ||
								(dayIndex === 1 && saleRequest.days[0].saleStatus === false)
							) {
								return (
									<SaleRequestDay
										saleRequest={saleRequest}
										day={day}
										changeProperty={changeDayProperty}
										dayIndex={dayIndex}
									/>
								)
							}
						})}
				</div>
			)}
		</div>
	)
}
