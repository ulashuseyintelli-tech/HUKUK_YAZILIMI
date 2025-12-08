import React from 'react'
import { TASK_TYPE } from '../../constants'
import { findDistrainableDebtors, getAddressType } from '../../helpers/Helper'
import useInpoundmentContext from '../../services/hooks/useInpoundmentContext'
import CourtList from '../court/CourtList'
import InpoundmentPanel from '../inpoundments/InpoundmentPanel'
import Intel from '../intel/Intel'
import Note from '../Note'
import TaskRadar from '../task/TaskRadar'
import DebtorNotifications from './DebtorNotifications'

export default function DebtorInfo({
	debtor,
	setDebtor,
	debtorTasks,
	getTasks,
}) {
	const { currentCase, debtors } = useInpoundmentContext()

	const uniqueTaskTypes = Array.from(new Set(debtorTasks.map(t => t.type)))

	const intelRequired =
		uniqueTaskTypes.includes(TASK_TYPE.DEBTOR_NULL_ADDRESS) ||
		uniqueTaskTypes.includes(TASK_TYPE.DEBTOR_NULL_IDENTITY) ||
		uniqueTaskTypes.includes(TASK_TYPE.DEBTOR_NULL_FORMAL_ADDRESS) ||
		uniqueTaskTypes.includes(TASK_TYPE.ENTER_INTEL_ALIAS_RESPONSE) ||
		uniqueTaskTypes.includes(TASK_TYPE.ENTER_INTEL_INFO) ||
		uniqueTaskTypes.includes(TASK_TYPE.ENTER_INTEL_RESPONSE) ||
		uniqueTaskTypes.includes(TASK_TYPE.REQUEST_INTEL) ||
		uniqueTaskTypes.includes(TASK_TYPE.REQUEST_INTEL_ALIAS)
	uniqueTaskTypes.includes(TASK_TYPE.SELECT_INTEL_TYPES)
	uniqueTaskTypes.includes(TASK_TYPE.UPDATE_DEBTOR_BY_INTEL)

	const requiredCondition = task =>
		!task.extra ||
		((!task.extra.notificationAssetType ||
			task.extra.notificationAssetType === 'DEBTOR') &&
			(!task.extra.notificationAssetId ||
				task.extra.notificationAssetId === debtor._id))

	const notificationRequired = debtorTasks.some(task => {
		return (
			(task.type === TASK_TYPE.DEBTOR_NOTIFICATION_REQUIRED &&
				requiredCondition(task)) ||
			(task.type === TASK_TYPE.NOTIFICATION_STEP_1 &&
				requiredCondition(task)) ||
			(task.type === TASK_TYPE.NOTIFICATION_STEP_2 &&
				requiredCondition(task)) ||
			(task.type === TASK_TYPE.NOTIFICATION_STEP_3 &&
				requiredCondition(task)) ||
			(task.type === TASK_TYPE.NOTIFICATION_STEP_4 &&
				requiredCondition(task)) ||
			(task.type === TASK_TYPE.NOTIFICATION_BARCODE_NUMBER_REQUEST &&
				requiredCondition(task)) ||
			(task.type === TASK_TYPE.NOTIFICATION_BARCODE_NUMBER_REQUIRED &&
				requiredCondition(task)) ||
			(task.type === TASK_TYPE.NOTIFICATION_DONE_DATE &&
				requiredCondition(task)) ||
			(task.type === TASK_TYPE.NOTIFICATION_OBJECTION_DATE &&
				requiredCondition(task))
		)
	})

	const caseInitializationCourtRequired = uniqueTaskTypes.includes(
		TASK_TYPE.NOTIFICATION_OBJECTION,
	)

	return (
		<div className="flex al-start mb-4">
			<div className="w-30 mr-8">
				<div className="mb-4 bg p-4">
					<div className="flex al-center jst-between">
						<p className="fs-nm mb-2 fw-600">Adresler</p>
					</div>
					{debtor.addresses.length === 0 && <p>Adres bilinmiyor!</p>}
					{debtor.addresses.map((address, index) => {
						return (
							<div className="mb-4 bg-white p-4 br" key={index}>
								<div className="flex al-center mb-2">
									<p className="fw-500 fs-sm">
										{address.title} - {address.district}/{address.city}
									</p>
									<p className="badge fs-xsm ml-4">
										{getAddressType(address).text}
									</p>
								</div>
								<p className="fs-sm">{address.description}</p>
							</div>
						)
					})}
				</div>
				<div className="bg br p-4 mb-4">
					<div className="flex al-center jst-between">
						<p className="fs-nm mb-2 fw-600">Telefon Numaraları</p>
					</div>
					{debtor.phoneNumbers.length === 0 && (
						<p>Telefon numarası bilinmiyor</p>
					)}
					{debtor.phoneNumbers.map((phoneNumber, index) => {
						return (
							<p key={phoneNumber.number + index}>
								{phoneNumber.title} - {phoneNumber.number}
							</p>
						)
					})}
				</div>
				<div className="bg br p-4">
					<div className="flex al-center jst-between">
						<p className="fs-nm mb-2 fw-600">E-posta adresleri</p>
					</div>
					{debtor.emails.length === 0 && <p>E-posta adresi bilinmiyor</p>}
					{debtor.emails.map((email, index) => {
						return <p key={index + email}>{email}</p>
					})}
				</div>
			</div>
			<div className="w-70">
				<div className="w-100 flex al-stretch jst-between mb-4">
					<div className="w-100 mr-4">
						<TaskRadar always={intelRequired}>
							<Intel
								debtor={debtor}
								setDebtor={setDebtor}
								intelRequired={intelRequired}
							/>
						</TaskRadar>
					</div>
					<div className="w-100 mr-4">
						<TaskRadar always={caseInitializationCourtRequired}>
							<CourtList
								courtRequired={caseInitializationCourtRequired}
								requiredCourtType="case-initialization"
								type="caseInitialization"
								debtor={debtor}
								reloadTasks={getTasks}
								debtorTasks={debtorTasks}
							/>
						</TaskRadar>
					</div>
					<div className="w-100">
						<TaskRadar always={intelRequired} always={notificationRequired}>
							<DebtorNotifications
								notificationRequired={notificationRequired}
								debtor={debtor}
								getTasks={getTasks}
								setDebtor={setDebtor}
							/>
						</TaskRadar>
					</div>
				</div>
				{!findDistrainableDebtors(currentCase, debtors).find(d => {
					return d._id === debtor._id
				}) && (
					<Note type="zekiye" classes="mb-4">
						Haciz işlemlerini başlatabilmek için takibin kesinleşmesi gerekiyor
					</Note>
				)}
				<div
					className="w-100"
					disabled={
						!findDistrainableDebtors(currentCase, debtors).some(
							d => d._id === debtor._id,
						)
					}
				>
					<InpoundmentPanel />
				</div>
			</div>
		</div>
	)
}
