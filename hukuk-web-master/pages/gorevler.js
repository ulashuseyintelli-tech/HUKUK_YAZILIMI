import React, { useEffect, useState } from 'react'
import Layout from '../components/Layout'
import TaskPanel from '../components/task/TaskPanel'
import WorkList from '../components/task/WorkList'
import { getDebtorsPure } from '../services/deptorService'
import { getOverdueTasks, getTodayTasks } from '../services/taskService'

export default function Gorevler(props) {
	const [debtors, setDebtors] = useState([])
	const [todayTasks, setTodayTasks] = useState([])
	const [overdueTasks, setOverdueTasks] = useState([])

	useEffect(() => {
		getDebtors()
		getTasks()
		_getOverdueTasks()
	}, [])

	const getDebtors = () => {
		getDebtorsPure()
			.then(res => {
				setDebtors(res.data)
			})
			.catch(e => handleError(e))
	}

	const getTasks = () => {
		getTodayTasks()
			.then(res => {
				setTodayTasks(res.data)
			})
			.catch(e => console.log(e))
	}

	const _getOverdueTasks = () => {
		getOverdueTasks()
			.then(res => setOverdueTasks(res.data))
			.catch(e => console.log(e))
	}

	return (
		<Layout {...props}>
			<div className="work-list">
				<h2>{new Date().toLocaleDateString('tr-TR')} İş Listesi</h2>
				<WorkList tasks={todayTasks} />
				<h3 className="mt-8">Gecikmiş Görevler ({overdueTasks.length})</h3>
				<WorkList tasks={overdueTasks} />
			</div>

			<TaskPanel debtors={debtors} />
		</Layout>
	)
}
