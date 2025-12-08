import React, { useEffect, useState } from 'react'
import TrueFalse from '../../TrueFalse'
import { STATUS, TASK_TYPE } from '../../../constants'
import Commitment from '../../Commitment'
import { getCommitmentById } from '../../../services/commitmentService'
import { COMMITMENT_DETAILS } from '../../../constants'
import LoadingCircle from '../../anBrains/animations/LoadingCircle'
import useInpoundmentContext from '../../../services/hooks/useInpoundmentContext'
import TaskRadar from '../../task/TaskRadar'
import TaskField from '../../task/TaskField'

export default function DeFactoStep4() {
	const {
		assetProps: { visibleAsset, updateAsset, checkTasksIncludes },
		selectedDebtor,
		currentCase,
	} = useInpoundmentContext()

	const [status, setStatus] = useState(STATUS.LOADING)
	const [commitment, setCommitment] = useState(null)
	useEffect(() => {
		load()
	}, [])

	const load = async () => {
		await getCommitment()
		setStatus(STATUS.NORMAL)
	}

	const getCommitment = async () => {
		if (visibleAsset.commitmentId) {
			await getCommitmentById(visibleAsset.commitmentId)
				.then(res => {
					setCommitment(res.data)
				})
				.catch(e => alert('Taahhüt getirilirken hata meydana geldi!'))
		} else {
			setCommitment({
				...COMMITMENT_DETAILS,
				assetId: visibleAsset._id,
				assetType: 'DE_FACTO',
			})
		}
	}

	return (
		<div>
			<TaskField
				type={TASK_TYPE.DE_FACTO_IS_COMMITMENT_RECEIVED}
				title="Taahhüt Alındı Mı?"
			>
				<TrueFalse
					options={['Alınmadı', 'Alındı']}
					object={visibleAsset}
					property="isCommitmentReceived"
					change={updateAsset}
				/>
			</TaskField>
			{visibleAsset.isCommitmentReceived &&
				(status === STATUS.LOADING ? (
					<LoadingCircle />
				) : (
					<Commitment
						size="large"
						taskRadarAlways={checkTasksIncludes(
							TASK_TYPE.DE_FACTO_COMMITMENT_DETAILS,
						)}
						caseId={currentCase._id}
						commitment={commitment}
						setCommitment={setCommitment}
						changeProperty={_id => updateAsset('commitmentId', _id)}
						currentCase={currentCase}
					/>
				))}
		</div>
	)
}
