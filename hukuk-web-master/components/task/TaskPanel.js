import { useState } from 'react'
import { TASK_SORT_OPTIONS, TASK_STATUS } from '../../constants'
import { getDebtorName } from '../../helpers/Helper'
import Layout from '../Layout'
import TaskColumn from './TaskColumn'

export default function TaskPanel(props) {
	const { debtors, title, caseId } = props

	const [sortBy, setSortBy] = useState(
		Object.values(TASK_SORT_OPTIONS)[0].value,
	)
	const [debtorIdFilter, setDebtorIdFilter] = useState(null)
	return (
		<div className="tasker-page">
			<div className="tasker-page__header">
				<h1 className="fs-xl">{title || 'Görevler'}</h1>
				<div className="flex al-center">
					<div className="mr-4 fs-sm">
						<p className="fw-500 mb-1">Borçlu</p>
						<select
							className="input"
							onChange={e => setDebtorIdFilter(e.target.value)}
						>
							<option value="">Tüm Borçlular</option>
							{debtors.map(debtor => {
								return (
									<option value={debtor._id}>{getDebtorName(debtor)}</option>
								)
							})}
						</select>
					</div>
					<div className="mr-4 fs-sm">
						<p className="fw-500 mb-1">Sıralama</p>
						<select className="input" onChange={e => setSortBy(e.target.value)}>
							{Object.values(TASK_SORT_OPTIONS).map(val => {
								return <option value={val.value}>{val.text}</option>
							})}
						</select>
					</div>
				</div>
			</div>
			<div className="tasker__column-list">
				{Object.values(TASK_STATUS).map(taskStatus => {
					return (
						<TaskColumn
							sortBy={sortBy}
							taskStatus={taskStatus}
							debtorIdFilter={debtorIdFilter}
							caseId={caseId}
						/>
					)
				})}
			</div>
		</div>
	)
}
