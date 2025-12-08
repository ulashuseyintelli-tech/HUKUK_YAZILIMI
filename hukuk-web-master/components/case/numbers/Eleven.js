import React, { useState } from 'react'
import { STATUS, TASK_TYPE } from '../../../constants'
import { handleError } from '../../../helpers/Helper'
import printer from '../../../printer'
import {
	saveCase,
	updateCasePropertyByNumber,
} from '../../../services/caseService'
import { useDebtorContext } from '../../../services/hooks/useDebtorContext'
import useInpoundmentContext from '../../../services/hooks/useInpoundmentContext'
import LoadingAnimation from '../../anBrains/animations/LoadingAnimation/LoadingAnimation'
import Button from '../../anBrains/Button'
import Printer from '../../Printer'
import TaskRadar from '../../task/TaskRadar'
import TrueFalse from '../../TrueFalse'

export default function Eleven() {
	const {
		currentCase,
		setCurrentCase,
		selectedDebtor,
	} = useInpoundmentContext()

	const { debtorTasks } = useDebtorContext()

	const [status, setStatus] = useState(STATUS.NORMAL)

	const update = async (property, value) => {
		setStatus(STATUS.LOADING)
		currentCase.bankruptcyInfo[property] = value
		await updateCasePropertyByNumber(
			currentCase.number,
			'bankruptcyInfo',
			currentCase.bankruptcyInfo,
		)
			.then(res => {
				setCurrentCase({ ...res.data })
			})
			.catch(handleError)
		setStatus(STATUS.NORMAL)
	}

	return (
		<div className="inpoundment-asset-card mt-4">
			<LoadingAnimation status={status} />
			<p className="orange fw-600 fs-md">İflas Detayları</p>
			<div className="step-item-divider my-4"></div>
			<TaskRadar
				always={debtorTasks.some(t => t.type === TASK_TYPE.REQUEST_BANKRUPTCY)}
			>
				<div className="flex al-center mb-4 ">
					<p className="fw-500 mr-4">İflas kararı istenmesi gerekiyor</p>
					<Printer
						type={printer[21].value}
						paperDebtors={[selectedDebtor]}
						caseId={currentCase._id}
					/>
				</div>
				<TrueFalse
					options={['İstenmedi', 'İflas kararı istendi']}
					object={currentCase.bankruptcyInfo}
					property="isRequested"
					change={update}
				/>
			</TaskRadar>
			{currentCase.bankruptcyInfo.isRequested && (
				<>
					<TaskRadar
						always={debtorTasks.some(
							t => t.type === TASK_TYPE.ENTER_BANKRUPTCY_RESPONSE,
						)}
					>
						<div className="step-item-divider"></div>
						<p className="fw-500">İflas Kararının Sonucu</p>
						<TrueFalse
							options={['İflas Etmedi', 'İflas Etti']}
							object={currentCase.bankruptcyInfo}
							property="response"
							change={update}
						/>
					</TaskRadar>
					{currentCase.bankruptcyInfo.response && (
						<>
							<TaskRadar
								always={debtorTasks.some(
									t => t.type === TASK_TYPE.MAKE_BANKRUPTCY_WRITTEN_TO_ESTATE,
								)}
							>
								<div className="step-item-divider"></div>
								<p className="fw-500">
									Kararın İflas Masasına Yazdırılması Gerekiyor
								</p>
								<TrueFalse
									options={['Yazdırılmadı', 'Yazdırıldı']}
									object={currentCase.bankruptcyInfo}
									property="isWrittenToEstate"
									change={update}
								/>
							</TaskRadar>
						</>
					)}
				</>
			)}
		</div>
	)
}
