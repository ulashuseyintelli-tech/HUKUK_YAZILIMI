import React, { useState } from 'react'
import { TASK_TYPE } from '../../../constants'
import { calculateRemainingMonthsToSsiRestrictionComplete } from '../../../helpers/Helper'
import useInpoundmentContext from '../../../services/hooks/useInpoundmentContext'
import Button from '../../anBrains/Button'
import Input from '../../anBrains/Input'
import Note from '../../Note'
import TaskRadar from '../../task/TaskRadar'

export default function SsiSalaryAmount({ type }) {
	const {
		assetProps: { visibleAsset, updateAsset, checkTasksIncludes },
	} = useInpoundmentContext()

	const field = type === 'GARNISHMENT' ? 'garnishmentDetails' : 'salaryInfo'

	const [isLoading, setIsLoading] = useState(false)
	const [amount, setAmount] = useState(visibleAsset[field]?.amount || '')

	const save = async () => {
		setIsLoading(true)
		await updateAsset(field, { ...visibleAsset[field], amount })
		setIsLoading(false)
	}

	const taskIncludes = checkTasksIncludes(
		type === 'GARNISHMENT'
			? TASK_TYPE.DE_FACTO_GARNISHMENT_SALARY_INFO
			: TASK_TYPE.SSI_INPOUNDMENT_SALARY_AMOUNT,
	)

	return (
		<div>
			<div className="step-item-divider"></div>
			<Note type="zekiye" classes="mt-4 w-50">
				<TaskRadar always={taskIncludes} top="-2.5rem" right="100%">
					Maaş haczinde sıranın bize ne zaman geleceğinin hesaplanabilmesi için
					takyidat sırasındaki 1. olan alacaklıya her ay yatan para miktarı
					bildirilmesi gerekiyor
					<Input
						value={`${amount}`}
						onChange={e => setAmount(e.target.value)}
						classes="bg-white mt-4"
						placeholder="Her ay yatan para miktarı"
					/>
					<Button
						classes="blue bold mt-4"
						onClick={save}
						disabled={
							!amount || visibleAsset[field].amount === amount || isLoading
						}
					>
						Kaydet
					</Button>
					{!taskIncludes && (
						<Note type="success" classes="mt-4">
							Hatırlatıcı başarıyla oluşturuldu! Takyidat sırasının bize gelmesi{' '}
							{calculateRemainingMonthsToSsiRestrictionComplete(
								visibleAsset,
								type,
							)}{' '}
							ay sürecek.
						</Note>
					)}
				</TaskRadar>
			</Note>
		</div>
	)
}
