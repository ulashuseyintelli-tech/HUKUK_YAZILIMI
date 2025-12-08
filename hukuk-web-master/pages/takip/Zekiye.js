import React, { useEffect, useState } from 'react'

import { ActiveLink } from '../../components/anBrains/ActiveLink'
import LoadingCircle from '../../components/anBrains/animations/LoadingCircle'
import Button from '../../components/anBrains/Button'
import CaseDetailsForm from '../../components/case/CaseDetailsForm'
import Layout from '../../components/Layout'
import Note from '../../components/Note'
import TaskPanel from '../../components/task/TaskPanel'
import { CASE_TYPE } from '../../constants'
import { handleError } from '../../helpers/Helper'
import { getCaseByNumber } from '../../services/caseService'
import { getDebtorsPure } from '../../services/deptorService'
import { InpoundmentContext } from './CaseInpoundmentDetails'

export default function Zekiye(props) {
	const { number } = props

	const [loading, setLoading] = useState(true)
	const [currentCase, setCurrentCase] = useState(null)
	const [caseDebtors, setCaseDebtors] = useState(null)

	useEffect(() => {
		preapare()
	}, [])

	const preapare = async () => {
		getCase()
		getDebtors()
		setLoading(false)
	}

	const getCase = async () => {
		await getCaseByNumber(number)
			.then(res => {
				setCurrentCase(res.data)
			})
			.catch(e => handleError(e))
	}

	const getDebtors = async () => {
		await getDebtorsPure(number)
			.then(res => {
				setCaseDebtors(res.data)
			})
			.catch(e => handleError(e))
	}

	if (!currentCase || !caseDebtors) {
		return <LoadingCircle />
	}

	return (
		<InpoundmentContext.Provider
			value={{
				currentCase,
				setCurrentCase,
				debtors: caseDebtors,
				setDebtors: setCaseDebtors,
				assetProps: { visibleAsset: null },
			}}
		>
			<Layout {...props}>
				<div className="zekiye">
					{!currentCase.isDetailsCompleted ||
					!currentCase.isExecutionOfficeCompleted ||
					!currentCase.isClientsCompleted ||
					!currentCase.isDebtorsCompleted ||
					!currentCase.isDuesCompleted ? (
						<CaseDetailsForm />
					) : (
						<>
							<div className="zekiye-header">
								<div className="flex al-center">
									<h1>
										{currentCase.executionFileNumber} nolu dosya{' '}
										{CASE_TYPE[currentCase.type]}
									</h1>
									<div className="badge fw-600 ml-4 fs-sm">
										{currentCase.status}
									</div>
								</div>
								<div className="zekiye-header__nav">
									<ActiveLink className="mr-6" href={`/takip/${number}`}>
										Görevler
									</ActiveLink>
									<ActiveLink className="mr-6" href={`/takip/${number}`}>
										Genel Bakış
									</ActiveLink>
									<ActiveLink className="mr-6" href={`/takip/${number}/haciz`}>
										Haciz İşlemleri
									</ActiveLink>
								</div>
							</div>
							<Note type="zekiye" className="zekiye-banner">
								<p className="ml-0">
									Takip süreçlerinin tümünde senin yanında olacağım. Aşağıdaki
									panelden sana verdiğim görevleri takip etmen yeterli.
								</p>
							</Note>
							<TaskPanel
								debtors={caseDebtors.filter(d =>
									currentCase.debtorIds.includes(d._id),
								)}
								title="Takip Görevleri"
								caseId={currentCase._id}
							/>
						</>
					)}
				</div>
			</Layout>
		</InpoundmentContext.Provider>
	)
}

Zekiye.getInitialProps = ({ query }) => {
	return {
		number: query.number,
		queryDebtorId: query.debtorId,
		queryTaskId: query.taskId,
	}
}
