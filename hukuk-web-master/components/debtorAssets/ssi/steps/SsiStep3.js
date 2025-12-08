import React, { useEffect, useState } from 'react'
import { SALARY_INFO, SSI_SALARY_TYPE, TASK_TYPE } from '../../../../constants'
import { validateNonZeroInteger } from '../../../../helpers/Helper'
import useInpoundmentContext from '../../../../services/hooks/useInpoundmentContext'
import Button from '../../../anBrains/Button'
import Input from '../../../anBrains/Input'
import InpoundmentStep from '../../../inpoundments/InpoundmentStep'
import AssetNotifications from '../../../notification/AssetNotifications'
import TaskField from '../../../task/TaskField'
import SsiCollectionTasks from '../SsiCollectionTasks'

export default function SsiStep3() {
	const {
		assetProps: { visibleAsset, updateAsset, currentStep },
	} = useInpoundmentContext()

	const [salaryInfo, setSalaryInfo] = useState({ ...SALARY_INFO })

	useEffect(() => {
		if (visibleAsset && visibleAsset._id === visibleAsset._id) {
			setSalaryInfo(visibleAsset.salaryInfo)
		}
	}, [visibleAsset, currentStep])

	const changeSalaryInfo = (prop, val) => {
		if (
			prop === 'date' &&
			!new RegExp('^(3[01]|[12][0-9]|[1-9])$').test(val) &&
			val !== ''
		) {
			return
		}
		salaryInfo[prop] = val
		setSalaryInfo({ ...salaryInfo })
	}

	const validate = () => {
		if (
			validateNonZeroInteger(salaryInfo.date) &&
			parseInt(salaryInfo.date) > 0 &&
			parseInt(salaryInfo.date) < 32
		) {
			if (salaryInfo.type === SSI_SALARY_TYPE.ALL.value) {
				if (validateNonZeroInteger(salaryInfo.amount)) {
					return true
				} else {
					alert('Lütfen maaş miktarını doğru girin')
				}
			} else if (salaryInfo.type === SSI_SALARY_TYPE.DIRECT.value) {
				if (validateNonZeroInteger(salaryInfo.amountToCollection)) {
					return true
				} else {
					alert('Lütfen tahsil edilecek miktarı doğru girin')
				}
			} else if (salaryInfo.type === SSI_SALARY_TYPE.PERCENTAGE.value) {
				if (!validateNonZeroInteger(salaryInfo.amount)) {
					alert('Lütfen maaş miktarını doğru girin')
				} else if (
					!validateNonZeroInteger(salaryInfo.percentageToCollection) ||
					parseInt(salaryInfo.percentageToCollection) < 1 ||
					parseInt(salaryInfo.percentageToCollection) > 100
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

	return (
		<InpoundmentStep step={4}>
			<TaskField
				title="Haciz Tahsilat Bilgilerini Doldur"
				type={TASK_TYPE.SSI_INPOUNDMENT_SALARY_INFO}
			>
				<div className="flex mt-2">
					<label>
						<p className="fw-500 gray">Tahsilat Türü</p>
						<select
							value={salaryInfo.type}
							onChange={e => changeSalaryInfo('type', e.target.value)}
							className="input mt-2"
						>
							{Object.keys(SSI_SALARY_TYPE).map(key => {
								return (
									<option key={key} value={SSI_SALARY_TYPE[key].value}>
										{SSI_SALARY_TYPE[key].text}
									</option>
								)
							})}
						</select>
					</label>
					{salaryInfo.type === SSI_SALARY_TYPE.DIRECT.value && (
						<label className="mx-4">
							<p className="gray fw-500 mb-2">Her Ay Tahsil Edilecek Miktar</p>
							<Input
								placeholder="Tahsilat miktarı"
								classes="mt-2 fs-sm"
								value={salaryInfo.amountToCollection}
								onChange={e =>
									changeSalaryInfo('amountToCollection', e.target.value)
								}
							/>
						</label>
					)}
					{(salaryInfo.type === SSI_SALARY_TYPE.ALL.value ||
						salaryInfo.type === SSI_SALARY_TYPE.PERCENTAGE.value) && (
						<label className="mx-4">
							<p className="gray fw-500 mb-2">Maaş Miktarı</p>
							<Input
								placeholder="Maaş miktarı"
								classes="mt-2 fs-sm"
								value={salaryInfo.amount}
								onChange={e => changeSalaryInfo('amount', e.target.value)}
							/>
						</label>
					)}
					{salaryInfo.type === SSI_SALARY_TYPE.PERCENTAGE.value && (
						<label className="mr-4">
							<p className="gray fw-500 mb-2">Maaş Haciz Oranı</p>
							<Input
								placeholder="Haciz oranı"
								classes="mt-2 fs-sm"
								value={salaryInfo.percentageToCollection}
								onChange={e =>
									changeSalaryInfo('percentageToCollection', e.target.value)
								}
							/>
						</label>
					)}
					<label>
						<p className="gray fw-500">
							Her Ayın Kaçıncı Günü Tahsil Edilecek?
						</p>
						<Input
							placeholder="Tahsilat günü"
							classes="mt-2 fs-sm"
							value={salaryInfo.date}
							onChange={e => changeSalaryInfo('date', e.target.value)}
						/>
					</label>
				</div>
			</TaskField>
			{(salaryInfo.date !== visibleAsset.salaryInfo.date ||
				salaryInfo.amount !== visibleAsset.salaryInfo.amount ||
				salaryInfo.type !== visibleAsset.salaryInfo.type ||
				salaryInfo.percentageToCollection !==
					visibleAsset.salaryInfo.percentageToCollection ||
				salaryInfo.amountToCollection !==
					visibleAsset.salaryInfo.amountToCollection) && (
				<Button
					classes="fw-500 mt-2"
					theme="blue"
					onClick={() => {
						if (validate() === true) {
							updateAsset('salaryInfo', { ...salaryInfo })
						}
					}}
				>
					Kaydet
				</Button>
			)}
			<div className="step-item-divider"></div>
			<SsiCollectionTasks salaryInfo={salaryInfo} />
		</InpoundmentStep>
	)
}
