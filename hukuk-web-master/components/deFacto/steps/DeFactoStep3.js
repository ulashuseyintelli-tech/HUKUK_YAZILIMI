import React, { useEffect, useState } from 'react'
import InpoundmentStep from '../../inpoundments/InpoundmentStep'
import TrueFalse from '../../TrueFalse'
import { GUARANTEE_DETAILS, STATUS, TASK_TYPE } from '../../../constants'
import Commitment from '../../Commitment'
import LoadingCircle from '../../anBrains/animations/LoadingCircle'
import { getGuaranteeById } from '../../../services/guaranteeService'
import Guarantee from '../../Guarantee'
import useInpoundmentContext from '../../../services/hooks/useInpoundmentContext'
import TaskRadar from '../../task/TaskRadar'

export default function DeFactoStep3() {
	const {
		assetProps: { visibleAsset, updateAsset, checkTasksIncludes },
		selectedDebtor,
		currentCase,
	} = useInpoundmentContext()

	const [status, setStatus] = useState(STATUS.LOADING)
	const [guarantee, setGuarantee] = useState(null)
	useEffect(() => {
		load()
	}, [])

	const load = async () => {
		await getGuarantee()
		setStatus(STATUS.NORMAL)
	}

	const getGuarantee = async () => {
		if (visibleAsset.guaranteeId) {
			await getGuaranteeById(visibleAsset.guaranteeId)
				.then(res => {
					setGuarantee(res.data)
				})
				.catch(e => alert('Kefil getirilirken hata meydana geldi!'))
		} else {
			setGuarantee({
				...GUARANTEE_DETAILS,
				assetId: visibleAsset._id,
				assetType: 'DE_FACTO',
			})
		}
	}

	return (
		<div>
			<TaskRadar
				always={checkTasksIncludes(TASK_TYPE.DE_FACTO_IS_GUARANTEED)}
				containerClasses="w-auto"
				right="99%"
				top="-.75rem"
			>
				<p className="fw-500 mt-4">Kefillik Var Mı?</p>
				<TrueFalse
					options={['Yok', 'Var']}
					object={visibleAsset}
					property="isGuaranteed"
					change={updateAsset}
				/>
			</TaskRadar>
			{visibleAsset.isGuaranteed &&
				(status === STATUS.LOADING ? (
					<LoadingCircle />
				) : (
					<Guarantee
						size="large"
						caseId={currentCase._id}
						debtorId={selectedDebtor._id}
						guarantee={guarantee}
						setGuarantee={setGuarantee}
						changeProperty={_id => updateAsset('guaranteeId', _id)}
						taskRadarAlways={checkTasksIncludes(
							TASK_TYPE.DE_FACTO_GUARANTEE_DETAILS,
						)}
					/>
				))}
		</div>
	)
}
