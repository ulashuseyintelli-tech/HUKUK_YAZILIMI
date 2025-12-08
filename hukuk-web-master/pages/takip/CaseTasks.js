import React, { useEffect, useState } from 'react'
import LoadingCircle from '../../components/anBrains/animations/LoadingCircle'
import CaseNav from '../../components/case/CaseNav'
import Layout from '../../components/Layout'
import { STATUS } from '../../constants'
import { findDistrainableDebtors } from '../../helpers/Helper'
import { getTaskTextByType } from '../../helpers/taskHelper'
import { getCaseByNumber } from '../../services/caseService'
import { getDebtors } from '../../services/deptorService'
import { getTasksByCaseNumber } from '../../services/taskService'

export default function CaseTasks(props) {
	const { number } = props
	const [status, setStatus] = useState(STATUS.LOADING)
	const [currentCase, setCurrentCase] = useState(null)
	const [debtors, setDebtors] = useState([])
	const [tasks, setTasks] = useState([])

	useEffect(() => {
		preapare()
	}, [])

	const preapare = async () => {
		await getCase()
		await getTasks()
		setStatus(STATUS.NORMAL)
	}

	const getCase = async () => {
		await getCaseByNumber(number)
			.then(async res => {
				setCurrentCase(res.data)
				await _getDebtors(res.data)
			})
			.catch(e => {
				console.log(e)
				alert('Hata')
			})
	}

	const _getDebtors = async currentCase => {
		await getDebtors()
			.then(res => {
				const distrainableDebtors = findDistrainableDebtors(
					currentCase,
					res.data,
				)
				setDebtors([...distrainableDebtors])
			})
			.catch(e => {
				console.log(e)
				alert('Hata')
			})
	}

	const getTasks = async () => {
		await getTasksByCaseNumber(props.number)
			.then(res => {
				setTasks(res.data)
			})
			.catch(e => {
				console.log(e)
				alert('Hata')
			})
	}

	if (status === STATUS.LOADING) {
		return <LoadingCircle />
	}

	return (
		<Layout {...props}>
			<CaseNav currentCase={currentCase} debtors={debtors} />
			<div>
				{tasks.map(task => {
					return getTaskTextByType(task)
				})}
			</div>
		</Layout>
	)
}

CaseTasks.getInitialProps = ({ query }) => {
	return {
		number: query.number,
	}
}
