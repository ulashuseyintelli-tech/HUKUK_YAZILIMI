import React, { useEffect } from 'react'
import { SSI_SALARY_TYPE, TASK_TYPE } from '../../constants'
import Input from '../anBrains/Input'
import Button from '../anBrains/Button'
import useInpoundmentContext from '../../services/hooks/useInpoundmentContext'
import TaskField from '../task/TaskField'
import { validateNonZeroInteger } from '../../helpers/Helper'
import SsiCollectionTasks from './ssi/SsiCollectionTasks'

export default function GarnishmentForm({
	garnishmentDetails,
	setGarnishmentDetails,
	fieldName,
	customCurrentStep,
	type,
}) {
	const {
		assetProps: { updateAsset, visibleAsset, currentStep },
	} = useInpoundmentContext()

	useEffect(() => {
		if (visibleAsset && visibleAsset._id === visibleAsset._id) {
			setGarnishmentDetails(visibleAsset[fieldName])
		}
	}, [visibleAsset, currentStep, customCurrentStep])

	const setDetails = (property, value) => {
		garnishmentDetails[property] = value
		setGarnishmentDetails({ ...garnishmentDetails })
	}

	const change = (prop, val) => {
		if (
			prop === 'date' &&
			!new RegExp('^(3[01]|[12][0-9]|[1-9])$').test(val) &&
			val !== ''
		) {
			return
		}
		setDetails(prop, val)
	}

	const validate = () => {
		if (
			validateNonZeroInteger(garnishmentDetails.date) &&
			parseInt(garnishmentDetails.date) > 0 &&
			parseInt(garnishmentDetails.date) < 32
		) {
			if (garnishmentDetails.type === SSI_SALARY_TYPE.ALL.value) {
				if (validateNonZeroInteger(garnishmentDetails.amount)) {
					return true
				} else {
					alert('Lütfen maaş miktarını doğru girin')
				}
			} else if (garnishmentDetails.type === SSI_SALARY_TYPE.DIRECT.value) {
				if (validateNonZeroInteger(garnishmentDetails.amountToCollection)) {
					return true
				} else {
					alert('Lütfen tahsil edilecek miktarı doğru girin')
				}
			} else if (garnishmentDetails.type === SSI_SALARY_TYPE.PERCENTAGE.value) {
				if (!validateNonZeroInteger(garnishmentDetails.amount)) {
					alert('Lütfen maaş miktarını doğru girin')
				} else if (
					!validateNonZeroInteger(garnishmentDetails.percentageToCollection) ||
					parseInt(garnishmentDetails.percentageToCollection) < 1 ||
					parseInt(garnishmentDetails.percentageToCollection) > 100
				) {
					alert('Lütfen maaş haciz oranını doğru girin')
				} else {
					return true
				}
			}
		} else {
			alert('Lütfen geçerli bir gün girin')
		}
	}

	const submit = () => {
		if (validate() === true) {
			updateAsset(fieldName, { ...garnishmentDetails })
		}
	}

	return (
		<TaskField
			className="w-100"
			title="Haciz Tahsilat Bilgilerini Doldur"
			type={[
				TASK_TYPE.SSI_INPOUNDMENT_SALARY_INFO,
				TASK_TYPE.DE_FACTO_GARNISHMENT_DETAILS,
			]}
		>
			<div className="flex mt-4">
				<label>
					<p className="fs-sm fw-500">Tahsilat Türü</p>
					<select
						value={garnishmentDetails.type}
						onChange={e => change('type', e.target.value)}
						className="input mt-2"
					>
						{Object.keys(SSI_SALARY_TYPE).map(key => {
							return (
								<option value={SSI_SALARY_TYPE[key].value}>
									{SSI_SALARY_TYPE[key].text}
								</option>
							)
						})}
					</select>
				</label>
				{garnishmentDetails.type === SSI_SALARY_TYPE.DIRECT.value && (
					<label className="mx-4">
						<p className="fs-sm fw-500 mb-2">Her Ay Tahsil Edilecek Miktar</p>
						<Input
							placeholder="Tahsilat miktarı"
							classes="mt-2 fs-sm"
							value={garnishmentDetails.amountToCollection}
							onChange={e => change('amountToCollection', e.target.value)}
						/>
					</label>
				)}
				{(garnishmentDetails.type === SSI_SALARY_TYPE.ALL.value ||
					garnishmentDetails.type === SSI_SALARY_TYPE.PERCENTAGE.value) && (
					<label className="mx-4">
						<p className="fs-sm fw-500 mb-2">Maaş Miktarı</p>
						<Input
							placeholder="Tahsilat miktarı"
							classes="mt-2 fs-sm"
							value={garnishmentDetails.amount}
							onChange={e => change('amount', e.target.value)}
						/>
					</label>
				)}
				{garnishmentDetails.type === SSI_SALARY_TYPE.PERCENTAGE.value && (
					<label className="mr-4">
						<p className="fs-sm fw-500 mb-2">Maaş Haciz Oranı</p>
						<Input
							placeholder="Tahsilat miktarı"
							classes="mt-2 fs-sm"
							value={garnishmentDetails.percentageToCollection}
							onChange={e => change('percentageToCollection', e.target.value)}
						/>
					</label>
				)}
				<label>
					<p className="fs-sm fw-500">Her Ayın Kaçıncı Günü Tahsil Edilecek?</p>
					<Input
						placeholder="Tahsilat günü"
						classes="mt-2 fs-sm"
						value={garnishmentDetails.date}
						onChange={e => change('date', e.target.value)}
					/>
				</label>
			</div>
			{(garnishmentDetails.date !== visibleAsset[fieldName].date ||
				garnishmentDetails.amount !== visibleAsset[fieldName].amount ||
				garnishmentDetails.type !== visibleAsset[fieldName].type ||
				garnishmentDetails.percentageToCollection !==
					visibleAsset[fieldName].percentageToCollection ||
				garnishmentDetails.amountToCollection !==
					visibleAsset[fieldName].amountToCollection) && (
				<Button classes="fw-500 blue mt-2" onClick={submit}>
					Kaydet
				</Button>
			)}
			<div className="step-item-divider"></div>
			<SsiCollectionTasks fieldName={fieldName} type={type} />
		</TaskField>
	)
}
