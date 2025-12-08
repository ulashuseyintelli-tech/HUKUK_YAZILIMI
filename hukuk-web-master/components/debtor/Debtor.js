import React, { createContext, useContext, useEffect, useState } from 'react'
import { TASK_SORT_OPTIONS, TASK_STATUS } from '../../constants'
import { handleError } from '../../helpers/Helper'
import useInpoundmentContext from '../../services/hooks/useInpoundmentContext'
import { useSocketContext } from '../../services/socket'
import {
	getDebtorTasksByCase,
	getTasksByFilters,
	getTasksForTasker,
} from '../../services/taskService'
import NewDebtorForm from '../forms/NewDebtorForm'
import TaskColumn from '../task/TaskColumn'
import DebtorHeader from './DebtorHeader'
import DebtorInfo from './DebtorInfo'
export const DebtorContext = createContext()

export default function Debtor({
	close,
	util,
	allDebtors,
	setAllDebtors,
	addDebtor,
}) {
	const [tasks, setTasks] = useState([])
	const { currentCase, selectedDebtor, debtors, setDebtors } =
		useInpoundmentContext()

	const [isEditing, setIsEditing] = useState(false)

	const debtor = selectedDebtor || util
	const socket = useSocketContext()

	useEffect(() => {
		getTasks()
	}, [])

	useEffect(() => {
		if (debtor && currentCase && socket) {
			socket.on(`${debtor._id} ${currentCase._id} task`, () => {
				getTasks()
			})
			return () => {
				socket.off(`${debtor._id} ${currentCase._id} task`)
			}
		}
	}, [debtor, socket])

	const getTasks = async () => {
		if (debtor) {
			await getTasksForTasker(debtor._id, currentCase._id)
				.then(res => {
					console.log({ abc: res.data })
					setTasks(res.data)
				})
				.catch(e => handleError(e))
		}
	}

	const setDebtor = updatedDebtor => {
		const debtorIndex = debtors.findIndex(d => d._id === debtor._id)
		debtors[debtorIndex] = { ...updatedDebtor }
		setDebtors([...debtors])
	}

	return debtor ? (
		<DebtorContext.Provider
			value={{ debtor, setDebtor, debtorTasks: tasks, getTasks }}
		>
			<div className="debtor">
				<div className="debtor-details">
					<DebtorHeader setIsEditing={setIsEditing} debtor={debtor} />
					<div className="step-item-divider"></div>
					{isEditing ? (
						<>
							<NewDebtorForm
								close={() => setIsEditing(false)}
								debtor={debtor}
								setDebtor={setDebtor}
								allDebtors={allDebtors}
								setAllDebtors={setAllDebtors}
							/>
							<div className="step-item-divider my-10"></div>
						</>
					) : (
						<DebtorInfo
							debtor={debtor}
							setDebtor={setDebtor}
							debtorTasks={tasks}
							getTasks={getTasks}
						/>
					)}
				</div>
				<TaskColumn
					sortBy={TASK_SORT_OPTIONS.START_DATE.value}
					taskStatus={TASK_STATUS.PENDING}
					debtorIdFilter={debtor._id}
					caseId={currentCase._id}
					exactTasks={tasks}
				/>
			</div>
		</DebtorContext.Provider>
	) : (
		<NewDebtorForm
			close={close}
			allDebtors={allDebtors}
			setAllDebtors={setAllDebtors}
			addDebtor={addDebtor}
		/>
	)
}
