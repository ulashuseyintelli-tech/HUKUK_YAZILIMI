import Layout from '../../components/Layout'
import {
	CASE_TYPE,
	CASE_TYPES_WITHOUT_DUE,
	STATUS,
	TASK_SORT_OPTIONS,
	TASK_STATUS,
} from '../../constants'
import { useState, useEffect } from 'react'
import CaseStatement from '../../components/case/CaseStatement'
import LoadingAnimation from '../../components/anBrains/animations/LoadingAnimation/LoadingAnimation'
import { getCaseByNumber } from '../../services/caseService'
import CaseNav from '../../components/case/CaseNav'
import CaseCommitments from '../../components/case/CaseCommitments'
import CurrentTask from '../../components/task/CurrentTask'
import CaseGuarantees from '../../components/case/CaseGuarantees'
import { InpoundmentContext } from './CaseInpoundmentDetails'
import CaseDetails from '../../components/case/CaseDetails'
import TaskColumn from '../../components/task/TaskColumn'
import CaseDebtors from '../../components/case/CaseDebtors'
import { useAssets } from '../../services/hooks/useAssets'

export default function NewCaseForm(props) {
	const {
		number,
		queryDebtorId,
		queryTaskId,
		queryAssetType,
		queryCourtId,
		queryCourtType,
	} = props

	const [selectedDebtorId, setSelectedDebtorId] = useState(
		queryDebtorId || null,
	)
	const [loading, setLoading] = useState(true)
	const [currentCase, setCurrentCase] = useState(null)
	const [debtors, setDebtors] = useState(currentCase ? currentCase.debtors : [])
	const [visibleList, setVisibleList] = useState(null)

	useEffect(() => {
		setSelectedDebtorId(queryDebtorId)
	}, [queryDebtorId])

	const declareAssetTypeByHypotecInfo = () => {
		if (currentCase?.hypotecInfo?.assetType) {
			return currentCase.type === '8'
				? 'PLEDGED_MOVABLE'
				: currentCase.hypotecInfo.assetType
		} else {
			return null
		}
	}

	const assetProps = useAssets(
		currentCase,
		null,
		declareAssetTypeByHypotecInfo(),
		currentCase ? currentCase.hypotecInfo.assetId : null,
		debtors[0] ? debtors[0]._id : null,
		[],
	)

	useEffect(() => {
		preapare()
	}, [])

	const preapare = async () => {
		await getCase()
		setLoading(false)
	}

	const getCase = async () => {
		await getCaseByNumber(number)
			.then(res => {
				setCurrentCase(res.data)
			})
			.catch(e => alert('Hata'))
	}

	return (
		<InpoundmentContext.Provider
			value={{
				assetProps,
				currentCase,
				setCurrentCase,
				debtors,
				setDebtors,
				visibleList,
				setVisibleList,
				queryDebtorId,
				queryTaskId,
				queryAssetType,
				selectedDebtorId,
				setSelectedDebtorId,
				selectedDebtor: selectedDebtorId
					? debtors.find(d => d._id === selectedDebtorId)
					: null,
				queryCourtId,
				queryCourtType,
				debtorTasks: [],
			}}
		>
			<Layout {...props}>
				<div className="case-inpoundment-details">
					<LoadingAnimation status={loading ? STATUS.LOADING : STATUS.NORMAL} />
					{currentCase && (
						<div>
							<CurrentTask queryTaskId={queryTaskId} />
							<CaseNav currentCase={currentCase} debtors={debtors} />
							{selectedDebtorId || queryDebtorId ? (
								<CaseDebtors debtors={debtors} setDebtors={setDebtors} />
							) : (
								<div className="case-form">
									<div className="case-form__content">
										<CaseDetails />
										<div
											className="bg-white br p-8 flex tasker__column-list"
											disabled={!currentCase.isDuesCompleted}
										>
											<TaskColumn
												taskStatus={TASK_STATUS.PENDING}
												caseId={currentCase._id}
											/>
											<TaskColumn
												taskStatus={TASK_STATUS.OVERDUE}
												caseId={currentCase._id}
											/>
											<TaskColumn
												taskStatus={TASK_STATUS.FUTURE}
												caseId={currentCase._id}
											/>
											<TaskColumn
												taskStatus={TASK_STATUS.DONE}
												caseId={currentCase._id}
											/>
										</div>
										<div
											className="case-form__finance mt-4"
											disabled={!currentCase.isDuesCompleted}
										>
											<CaseCommitments currentCase={currentCase} />
											{/* <CaseGuarantees currentCase={currentCase} /> */}
										</div>
									</div>

									<CaseStatement />
								</div>
							)}
						</div>
					)}
				</div>
			</Layout>
		</InpoundmentContext.Provider>
	)
}

NewCaseForm.getInitialProps = ({ query, search }) => {
	return {
		number: query.number,
		queryDebtorId: query.debtorId,
		queryTaskId: query.taskId,
		queryAssetType: query.assetType,
		queryCourtId: query.courtId,
		queryCourtType: query.courtType,
	}
}
