import React, { useState } from 'react'
import Input from '../anBrains/Input'
import Button from '../anBrains/Button'
import { FaPlus, FaCheck, FaPen } from 'react-icons/fa'
import { RESTRICTION_DEBT_TYPE, TASK_TYPE } from '../../constants'
import CheckBox from '../anBrains/CheckBox'
import useInpoundmentContext from '../../services/hooks/useInpoundmentContext'
import CreditorSelect from '../select/CreditorSelect'
import { useRestrictionContext } from '../../services/hooks/useRestrictionContext'
import ExecutionOfficeSelect from '../select/ExecutionOfficeSelect'
import Restriction100 from './Restriction100'
import RestrictionAppraisalNotification from './RestrictionAppraisalNotification'
import { check100DocumentCreated } from '../../helpers/Helper'

export default function RestrictionRaw({
	withForm,
	restriction,
	restrictions,
	set,
	addNew,
	close,
	arrIndex,
	type,
}) {
	const { assetProps, currentCase } = useInpoundmentContext()
	const { customAsset, caseStatement } = useRestrictionContext()

	const visibleAsset = customAsset || assetProps.visibleAsset

	const [isEditing, setIsEditing] = useState(false)

	const [executionOfficeId, setExecutionOfficeId] = useState(
		restriction ? restriction.executionOfficeId : null,
	)
	const [caseNumber, setCaseNumber] = useState(
		restriction ? restriction.caseNumber : '',
	)
	const [creditorId, setCreditorId] = useState(
		restriction ? restriction.creditorId : null,
	)
	const [withoutCreditor, setWithoutCreditor] = useState(
		restriction ? restriction.withoutCreditor : false,
	)
	const [debtAmount, setDebtAmount] = useState(
		restriction ? restriction.debtAmount : null,
	)
	const [debtType, setDebtType] = useState(
		restriction ? restriction.debtType : '',
	)
	const [isSaleAdvancePaid, setIsSaleAdvancePaid] = useState(
		restriction ? restriction.isSaleAdvancePaid : false,
	)
	const [isSaleRequested, setIsSaleRequested] = useState(
		restriction ? restriction.isSaleRequested : false,
	)
	const [isContinue, setIsContinue] = useState(
		restriction ? restriction.isContinue : true,
	)
	const [claim100Status, setClaim100Status] = useState(
		restriction ? restriction.claim100Status : null,
	)
	const [garnishmentCollectionAmount, setGarnishmentCollectionAmount] =
		useState(restriction ? restriction.garnishmentCollectionAmount : '')
	const [notifications, setNotifications] = useState(
		restriction ? restriction.notifications : null,
	)
	const [appraisalNotificationStatus, setAppraisalNotificationStatus] =
		useState(restriction ? restriction.appraisalNotificationStatus : null)

	const addRestriction = () => {
		if (validateRestrictionCreation()) {
			addNew({
				executionOfficeId,
				caseNumber,
				creditorId,
				withoutCreditor,
				debtAmount,
				debtType,
				isSaleAdvancePaid,
				isSaleRequested,
				isContinue,
				claim100Status,
				garnishmentCollectionAmount,
				appraisalNotificationStatus,
				notifications,
			})
		}
	}

	const validateRestrictionCreation = () => {
		let returnValue = false
		if (caseNumber !== '' && caseNumber.includes('/')) {
			if (restrictions.filter(r => r.caseNumber === caseNumber).length === 0) {
				returnValue = true
			} else {
				alert('Bu dosya numarasına ait ait bir takyidat daha önce eklenmiş.')
			}
		} else {
			alert('Yanlış bir dosya numarası girdiniz.')
		}
		return returnValue
	}

	const setWithoutCreditorState = value => {
		if (
			value &&
			restrictions.some((r, index) => r.withoutCreditor && index !== arrIndex)
		) {
			alert('Bize ait olduğu belirtilen başka bir takyidat mevcut.')
		} else {
			setWithoutCreditor(value)
			setCreditorId(null)
			if (value === true) {
				setExecutionOfficeId(currentCase.executionOfficeId)
				setCaseNumber(currentCase.executionFileNumber)
				setDebtAmount(caseStatement)
			}
		}
	}

	const changeProperty = (property, value) => {
		restrictions[arrIndex][property] = value
		updateState(property)(value)
		set('table', [...restrictions])
	}

	const updateState = property => {
		switch (property) {
			case 'executionOfficeId':
				return setExecutionOfficeId
			case 'caseNumber':
				return setCaseNumber
			case 'creditorId':
				return setCreditorId
			case 'debtAmount':
				return setDebtAmount
			case 'debtType':
				return setDebtType
			case 'isSaleAdvancePaid':
				return setIsSaleAdvancePaid
			case 'isSaleRequested':
				return setIsSaleRequested
			case 'isContinue':
				return setIsContinue
			case 'withoutCreditor':
				return setWithoutCreditorState
			case 'claim100Status':
				return setClaim100Status
			case 'garnishmentCollectionAmount':
				return setGarnishmentCollectionAmount
			case 'appraisalNotificationStatus':
				return setAppraisalNotificationStatus
			case 'notifications':
				return setNotifications
		}
	}

	const save = () => {
		restrictions[arrIndex] = {
			executionOfficeId,
			caseNumber,
			creditorId,
			debtAmount,
			debtType,
			isSaleAdvancePaid,
			isSaleRequested,
			isContinue,
			claim100Status,
			garnishmentCollectionAmount,
			withoutCreditor,
			appraisalNotificationStatus,
			notifications,
		}
		set('table', [...restrictions])
		setIsEditing(false)
	}

	if (withForm || isEditing) {
		return (
			<React.Fragment>
				<tr>
					<td>{arrIndex + 1}</td>
					<td className="relative">
						<div disabled={withoutCreditor}>
							<ExecutionOfficeSelect
								selectedId={executionOfficeId}
								setSelectedId={id => setExecutionOfficeId(id)}
							/>
						</div>
					</td>
					<td>
						<Input
							disabled={withoutCreditor}
							placeholder="İcra Yılı / Dosya Numarası"
							value={caseNumber}
							onChange={e => setCaseNumber(e.target.value)}
						/>
					</td>
					<td className="relative">
						<div disabled={withoutCreditor}>
							<CreditorSelect
								selectedId={creditorId}
								setSelectedId={id => setCreditorId(id)}
							/>
						</div>
						<p className="fs-xsm my-2 fw-500 ta-center">veya</p>
						<CheckBox
							checked={withoutCreditor}
							boxClass="bg-white br shadow-sm mx-auto"
							onChange={() => setWithoutCreditorState(!withoutCreditor)}
						>
							<span className="fs-sm fw-500">Takyidat bize ait</span>
						</CheckBox>
					</td>
					<td>
						<Input
							disabled={withoutCreditor}
							placeholder="Borç miktarı"
							value={debtAmount}
							onChange={e => setDebtAmount(e.target.value)}
						/>
					</td>
					<td>
						<select
							value={debtType}
							className="input"
							onChange={e => setDebtType(e.target.value)}
						>
							{Object.values(RESTRICTION_DEBT_TYPE).map(v => {
								return <option value={v.value}>{v.text}</option>
							})}
						</select>
					</td>
					<td>
						<Input
							toggle
							value={isSaleAdvancePaid}
							onChange={v => setIsSaleAdvancePaid(v)}
						/>
					</td>
					<td>
						<Input
							toggle
							value={isSaleRequested}
							onChange={v => setIsSaleRequested(v)}
						/>
					</td>
					{check100DocumentCreated(visibleAsset, type) && (
						<td>
							<Input
								toggle
								value={isContinue}
								onChange={v => setIsContinue(v)}
							/>
						</td>
					)}
				</tr>
				<tr className="edit-raw">
					<div className="flex al-center my-2">
						<Button
							type="button"
							classes="fw-500 mr-4 red"
							onClick={isEditing ? () => setIsEditing(false) : close}
						>
							Vazgeç
						</Button>
						{isEditing ? (
							<Button type="button" theme="blue" classes="bold" onClick={save}>
								<FaCheck className="mr-1" />
								Kaydet
							</Button>
						) : (
							<Button
								type="button"
								theme="blue"
								classes="bold"
								onClick={addRestriction}
							>
								<FaPlus className="mr-1" />
								Oluştur
							</Button>
						)}
					</div>
				</tr>
			</React.Fragment>
		)
	}

	return (
		<tr
			className={`restriction-raw ${
				restriction.withoutCreditor ? 'bg-yellow-light' : ''
			}`}
		>
			<td>
				<div className="flex al-center">
					<button
						type="button"
						onClick={() => setIsEditing(true)}
						className="btn btn-cute p-2 mr-2 edit-hover"
					>
						<FaPen />
					</button>
					{arrIndex + 1}
				</div>
			</td>
			<td className="relative">
				<ExecutionOfficeSelect
					selectedId={executionOfficeId}
					setSelectedId={id => changeProperty('executionOfficeId', id)}
					disabled={restriction.withoutCreditor}
				/>
			</td>
			<td>{restriction.caseNumber}</td>
			{check100DocumentCreated(visibleAsset, type) && (
				<td>
					<Restriction100
						restriction={restriction}
						changeProperty={changeProperty}
					/>
				</td>
			)}
			{visibleAsset.appraisalNotificationCreated && (
				<td>
					<RestrictionAppraisalNotification
						restriction={restriction}
						changeProperty={changeProperty}
					/>
				</td>
			)}
			<td className="relative">
				{restriction.withoutCreditor ? (
					<p className="fw-500">Takyidat bize ait</p>
				) : (
					<CreditorSelect
						selectedId={creditorId}
						setSelectedId={id => changeProperty('creditorId', id)}
					/>
				)}
			</td>
			<td>{restriction.debtAmount}</td>
			<td>
				{
					Object.values(RESTRICTION_DEBT_TYPE).find(
						t => t.value === restriction.debtType,
					)?.text
				}
			</td>
			<td>
				<Input
					toggle
					value={restriction.isSaleAdvancePaid}
					onChange={v => changeProperty('isSaleAdvancePaid', v)}
				/>
			</td>
			<td>
				<Input
					toggle
					value={restriction.isSaleRequested}
					onChange={v => changeProperty('isSaleRequested', v)}
				/>
			</td>
			{check100DocumentCreated(visibleAsset, type) && (
				<td>
					<Input
						toggle
						value={restriction.isContinue}
						onChange={v => changeProperty('isContinue', v)}
					/>
				</td>
			)}
		</tr>
	)
}
