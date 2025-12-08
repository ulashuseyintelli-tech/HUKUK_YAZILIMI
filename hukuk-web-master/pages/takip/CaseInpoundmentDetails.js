import React, { useState, useEffect, useContext, createContext } from 'react'
import { createQuery, updateQuery } from '../../services/queryService'
import Layout from '../../components/Layout'
import CaseNav from '../../components/case/CaseNav'
import LoadingCircle from '../../components/anBrains/animations/LoadingCircle'
import { getCaseByNumber } from '../../services/caseService'
import { getDebtorsByCaseId } from '../../services/deptorService'
import InpoundmentQueries from '../../components/inpoundments/InpoundmentQueries'
import InpoundmentForms from '../../components/inpoundments/InpoundmentForms'
import { findDistrainableDebtors, handleError } from '../../helpers/Helper'
import Three from '../../components/case/numbers/Three'
import FourAndFive from '../../components/case/numbers/FourAndFive'
import Seven from '../../components/case/numbers/Seven'
import Two from '../../components/case/numbers/Two'
import CurrentTask from '../../components/task/CurrentTask'

import { useAssets } from '../../services/hooks/useAssets'
import AssetList from '../../components/debtorAssets/AssetList'
import InpoundmentPanel from '../../components/inpoundments/InpoundmentPanel'
import {
	getTasksByFilters,
	getTasksForTasker,
} from '../../services/taskService'
import { useSocketContext } from '../../services/socket'
export const InpoundmentContext = createContext()

export default function CaseInpoundmentDetails(props) {
	const {
		number,
		queryDebtorId,
		queryAssetType,
		queryAssetId,
		user,
		queryTaskId,
	} = props

	let selectedDebtor
	let visibleQueries

	const [loading, setLoading] = useState(true)
	const [currentCase, setCurrentCase] = useState(null)
	const [debtors, setDebtors] = useState([])
	const [tasks, setTasks] = useState([])

	const [selectedDebtorId, setSelectedDebtorId] = useState(null)
	const [visibleInpoundment, setVisibleInpoundment] = useState(null)
	const [visibleModal, setVisibleModal] = useState(null)
	const [selectedQueryId, setSelectedQueryId] = useState(null)

	const [isAvailableForAll, setIsAvailableForAll] = useState(false)

	const assetProps = useAssets(
		currentCase,
		selectedQueryId,
		visibleInpoundment,
		queryAssetId,
		selectedDebtorId,
		tasks,
	)

	const socket = useSocketContext()

	useEffect(() => {
		if (selectedDebtorId && currentCase && socket) {
			socket.on(`${selectedDebtorId} ${currentCase._id} assets task`, () => {
				getDebtorTasks()
			})
			return () => {
				socket.off(`${selectedDebtorId} ${currentCase._id} assets task`)
			}
		}
	}, [socket, selectedDebtorId])

	useEffect(() => {
		if (queryDebtorId && currentCase) {
			getDebtorTasks()
		}
	}, [queryDebtorId, currentCase])

	const getDebtorTasks = () => {
		getTasksForTasker(queryDebtorId, currentCase._id)
			.then(res => {
				setTasks(res.data)
			})
			.catch(handleError)
	}

	useEffect(() => {
		preapare()
	}, [])

	const preapare = async () => {
		await getCase()
		setLoading(false)
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
		await getDebtorsByCaseId(currentCase._id)
			.then(res => {
				const distrainableDebtors = findDistrainableDebtors(
					currentCase,
					res.data,
				)
				setDebtors([...distrainableDebtors])
				setSelectedDebtorId(
					queryDebtorId ||
						(distrainableDebtors.length > 0
							? distrainableDebtors[0]._id
							: null),
				)
				setVisibleInpoundment(
					queryAssetType
						? queryAssetType === 'NOTIFICATION'
							? 'BANK'
							: queryAssetType
						: null,
				)
			})
			.catch(e => {
				alert('Hata')
				console.log(e)
			})
	}

	const doQuery = async (extra, cb) => {
		await createQuery(
			currentCase._id,
			selectedDebtorId,
			visibleInpoundment,
			extra,
		)
			.then(res => {
				if (visibleInpoundment === 'BANK') {
					debtors[findSelectedDebtorIndex()].queries.push(res.data.query)
					cb(res)
				} else {
					debtors[findSelectedDebtorIndex()].queries.push(res.data)
				}
				setDebtors([...debtors])
			})
			.catch(e => {
				alert('Hata')
				console.log(e)
			})
	}

	const findSelectedDebtorIndex = () => {
		return debtors.findIndex(debtor => debtor._id === selectedDebtorId)
	}

	const changeQueryProperty = (queryId, property, value, cb) => {
		updateQuery({ _id: queryId, [property]: value }).then(res => {
			const queryIndex = debtors[findSelectedDebtorIndex()].queries.findIndex(
				q => q._id === queryId,
			)
			debtors[findSelectedDebtorIndex()].queries[queryIndex][property] = value
			if (cb) {
				cb()
			}
			setDebtors([...debtors])
		})
	}

	const updateSelectedDebtorField = (field, list) => {
		debtors[findSelectedDebtorIndex()][field] = [...list]
		setDebtors([...debtors])
	}

	const closeModal = () => setVisibleModal(null)

	if (loading) return <LoadingCircle />

	if (!loading) {
		selectedDebtor = debtors.filter(
			debtor => debtor._id === selectedDebtorId,
		)[0]
		if (selectedDebtor) {
			visibleQueries = selectedDebtor.queries.filter(
				q => q.caseId === currentCase._id && q.type === visibleInpoundment,
			)
		}
	}

	return (
		<InpoundmentContext.Provider
			value={{
				assetProps,
				queryDebtorId,
				queryAssetId,
				queryAssetType,
				selectedDebtor,
				currentCase,
				doQuery,
				visibleInpoundment,
				setVisibleInpoundment,
				visibleQueries,
				user,
				isAvailableForAll,
				debtors,
				updateSelectedDebtorField,
				visibleModal,
				closeModal,
				changeQueryProperty,
				selectedQueryId,
				setSelectedQueryId,
				setVisibleModal,
				selectedDebtorId,
				setSelectedDebtorId,
				debtorTasks: tasks,
				reloadDebtorTasks: getDebtorTasks,
				selectedForeclosableAddress: selectedDebtor
					? selectedDebtor.foreclosableAddresses.filter(
							a => a._id === selectedQueryId,
					  )[0]
					: null,
			}}
		>
			<Layout {...props}>
				<div className="case-inpoundment-details">
					{queryTaskId && <CurrentTask queryTaskId={queryTaskId} />}
					<CaseNav />
					{!selectedDebtor ? (
						'Haciz işlemi başlatılacak borçlu bulunamadı'
					) : visibleInpoundment ? (
						<div className="inpoundments">
							<InpoundmentForms />
							{currentCase.type === '2' && (
								<Two
									currentCase={currentCase}
									setCurrentCase={setCurrentCase}
									debtor={selectedDebtor}
								/>
							)}
							{currentCase.type === '3' && (
								<Three
									currentCase={currentCase}
									setCurrentCase={setCurrentCase}
									debtor={selectedDebtor}
								/>
							)}
							{currentCase.type === '4' && (
								<FourAndFive setAvailability={setIsAvailableForAll} />
							)}
							{(currentCase.type === '6' || currentCase.type === '9') && (
								<AssetList />
							)}
							{(currentCase.type === '7' || currentCase.type === '10') && (
								<Seven setAvailability={setIsAvailableForAll} />
							)}
							{currentCase.type === '8' && <AssetList />}
							{isAvailableForAll && (
								<div className="inpoundments-content">
									{/* {visibleInpoundment !== 'BANK' && <InpoundmentQueries />} */}
									<InpoundmentQueries />
									<AssetList />
								</div>
							)}
						</div>
					) : (
						<InpoundmentPanel />
					)}
				</div>
			</Layout>
		</InpoundmentContext.Provider>
	)
}

CaseInpoundmentDetails.getInitialProps = ({ query }) => {
	return {
		number: query.number,
		queryDebtorId: query.debtorId,
		queryAssetType: query.assetType,
		queryAssetId: query.assetId,
		queryTaskId: query.taskId,
	}
}
