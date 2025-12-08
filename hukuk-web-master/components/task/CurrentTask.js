import React, { useEffect, useState } from 'react'
import { FaTimes } from 'react-icons/fa'
import { QUERY_LIST, STATUS } from '../../constants'
import { getAssetName, getDebtorName, handleError } from '../../helpers/Helper'
import { getTaskById } from '../../services/taskService'
import LoadingCircle from '../anBrains/animations/LoadingCircle'
import Button from '../anBrains/Button'

export default function CurrentTask({ queryTaskId, debtor }) {
	const [isVisible, setIsVisible] = useState(queryTaskId ? true : false)
	const [status, setStatus] = useState(STATUS.LOADING)
	const [queryTask, setQueryTask] = useState(null)

	useEffect(() => {
		getTask()
	}, [])

	const getTask = async () => {
		if (queryTaskId) {
			await getTaskById(queryTaskId)
				.then(res => {
					setQueryTask(res.data)
				})
				.catch(e => handleError(e))
		}
		setStatus(STATUS.NORMAL)
	}

	return null

	if (isVisible && queryTask) {
		return (
			<div className="relative" style={{ marginBottom: '3rem' }}>
				<div className="note current-task">
					{status === STATUS.NORMAL ? (
						<div className="w-100">
							<div className="flex al-center jst-between mb-2">
								<p className="fs-md bold ">Şu anda yapılan görev</p>
								<Button classes="btn-close" onClick={() => setIsVisible(false)}>
									<FaTimes />
								</Button>
							</div>
							<div className="flex al-center">
								<div className="badge">
									<span className="fw-500">
										<span className="fw-500">
											{getDebtorName(queryTask.debtor[0])}
										</span>{' '}
										adlı borçlunun{' '}
										{queryTask &&
											queryTask.extra &&
											queryTask.extra.queryType &&
											QUERY_LIST[queryTask.extra.queryType].text}
										{queryTask.assetType && getAssetName(queryTask.assetType)}
									</span>{' '}
								</div>
								<p className="ml-2">{getTaskTextByType(queryTask)}</p>
							</div>
						</div>
					) : (
						<LoadingCircle />
					)}
				</div>
			</div>
		)
	} else {
		return null
	}
}
