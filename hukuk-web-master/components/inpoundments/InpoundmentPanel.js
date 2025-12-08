import Link from 'next/link'
import Router from 'next/router'
import { useContext } from 'react'
import { INPOUNDMENT_PROPERTIES, TASK_TYPE } from '../../constants'

import { InpoundmentContext } from '../../pages/takip/CaseInpoundmentDetails'
import { useDebtorContext } from '../../services/hooks/useDebtorContext'
import Eight from '../case/numbers/Eight'
import Eleven from '../case/numbers/Eleven'
import Six from '../case/numbers/Six'
import Three from '../case/numbers/Three'
import Two from '../case/numbers/Two'
import Rental from '../case/Rental'
import TaskRadar from '../task/TaskRadar'

export default function InpoundmentPanel() {
	const { debtorTasks } = useDebtorContext()
	const { currentCase, selectedDebtor } = useContext(InpoundmentContext)

	const checkAlways = type =>
		debtorTasks.some(
			t =>
				new Date(t.startDate) < new Date() &&
				(t.assetType === type ||
					t.extra?.assetType === type ||
					t.extra?.queryType === type),
		)

	const getQueryCountByType = type =>
		selectedDebtor.queries.filter(
			q => q.type === type && q.caseId === currentCase._id,
		).length

	const getAssetCountByProperty = property =>
		selectedDebtor[property]
			? selectedDebtor[property].filter(v => v.caseId === currentCase._id)
					.length
			: 0

	return (
		<TaskRadar
			right="0"
			top="-.25rem"
			always={debtorTasks.some(
				t =>
					t.type === TASK_TYPE.NOTIFICATION_DONE &&
					new Date(t.startDate) < new Date(),
			)}
		>
			{currentCase.type === '2' && <Two />}
			{currentCase.type === '3' && <Three />}
			{(currentCase.type === '6' || currentCase.type === '9') && (
				<Six debtor={selectedDebtor} />
			)}
			{currentCase.type === '8' && <Eight debtor={selectedDebtor} />}
			{(currentCase.type === '11' || currentCase.type === '12') && <Eleven />}
			{(currentCase.type === '13' || currentCase.type === '14') && (
				<Rental debtor={selectedDebtor} />
			)}
			{(currentCase.type === '7' ||
				currentCase.type === '10' ||
				currentCase.type === '13') && (
				<div className="inpoundment-panel">
					<div className="inpoundment-panel__main">
						<p className="orange fs-lg fw-600 black mb-4">Haciz İşlemleri</p>
						{selectedDebtor && (
							<div className="inpoundment-card-list">
								{Object.values(INPOUNDMENT_PROPERTIES).map(inpoundment => {
									if (
										!inpoundment.condition ||
										inpoundment.condition(selectedDebtor)
									) {
										return (
											<TaskRadar
												key={inpoundment.key}
												containerClasses="inpoundment-card"
												always={checkAlways(inpoundment.key)}
											>
												<Link
													href={`/takip/${currentCase.number}/haciz?debtorId=${selectedDebtor._id}&assetType=${inpoundment.key}`}
												>
													<a className="w-100 h-100 column white-space-normal">
														<div className=" mb-2">
															{React.cloneElement(inpoundment.icon, {
																className: 'orange',
															})}
															<p className="fw-600 black">{inpoundment.text}</p>
														</div>
														<p className="black">
															{getQueryCountByType(inpoundment.key)}{' '}
															<span className="fw-500">sorgu</span>
														</p>
														<p className="black">
															{getAssetCountByProperty(inpoundment.field)} araç
														</p>
													</a>
												</Link>
											</TaskRadar>
										)
									} else {
										return null
									}
								})}
							</div>
						)}
					</div>
				</div>
			)}
		</TaskRadar>
	)
}
