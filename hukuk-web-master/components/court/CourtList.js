import React, { useEffect, useState } from 'react'
import { FaGavel, FaLongArrowAltRight, FaTimes } from 'react-icons/fa'
import {
	COURT_TASK_TYPES,
	COURT_TYPE,
	STATUS,
	TASK_TYPE,
} from '../../constants'
import { handleError } from '../../helpers/Helper'
import {
	getDebtorCourtCountByCase,
	getDebtorCourtsByCase,
} from '../../services/courtService'
import { useDebtorContext } from '../../services/hooks/useDebtorContext'
import useInpoundmentContext from '../../services/hooks/useInpoundmentContext'
import LoadingCircle from '../anBrains/animations/LoadingCircle'
import Button from '../anBrains/Button'
import Modal from '../anBrains/Modal'
import TaskRadar from '../task/TaskRadar'
import Court from './Court'
import CourtType from './CourtType'

export default function CourtList({
	reloadTasks,
	courtRequired,
	requiredCourtType,
}) {
	const { currentCase, selectedDebtor, queryCourtType } =
		useInpoundmentContext()
	const { debtorTasks } = useDebtorContext()

	const [status, setStatus] = useState(STATUS.LOADING)
	const [isOpen, setIsOpen] = useState(queryCourtType ? true : false)
	const [totalCourtCount, setTotalCourtCount] = useState(0)
	const [courts, setCourts] = useState([])

	useEffect(() => {
		load()
	}, [])

	const load = async () => {
		await getCourtsCount()
		await getCourts()
		setStatus(STATUS.NORMAL)
	}

	const getCourts = async () => {
		await getDebtorCourtsByCase(currentCase._id, selectedDebtor._id)
			.then(res => {
				setCourts(res.data)
			})
			.catch(handleError)
	}

	const getCourtsCount = async () => {
		await getDebtorCourtCountByCase(currentCase._id, selectedDebtor._id)
			.then(res => {
				setTotalCourtCount(res.data.count)
			})
			.catch(e => handleError(e))
	}

	if (status === STATUS.LOADING) {
		return <LoadingCircle />
	}

	const hasTask = debtorTasks.some(t => {
		return COURT_TASK_TYPES.includes(t.type)
	})

	return (
		<>
			<TaskRadar
				containerClasses="court-list-banner mb-4"
				always={hasTask}
				type="deneme"
			>
				<div className="flex al-center">
					<div className="icon icon-blue bg-white mr-2">
						<FaGavel />
					</div>
					<p className="fw-500 fs-md">Davalar</p>
				</div>

				<div className="mt-2 fs-sm">
					{totalCourtCount === 0
						? 'Henüz dava açılmamış.'
						: `${totalCourtCount} adet açılmış dava mevcut`}
				</div>
				{courtRequired && (
					<div className="mt-2 fs-sm">
						{
							Object.values(COURT_TYPE).find(t => t.value === requiredCourtType)
								.text
						}{' '}
						açılması gerekiyor
					</div>
				)}
				<Button
					onClick={() => setIsOpen(true)}
					icon={<FaLongArrowAltRight />}
					iconPosition="right"
					classes="blue mt-1 fw-500"
				>
					Dava Detayları
				</Button>
			</TaskRadar>
			<Modal visible={isOpen} close={() => setIsOpen(false)}>
				<div className="form-modal">
					<div className="flex al-center jst-between">
						<div className="flex al-center">
							<div className="icon icon-blue bg-white mr-2">
								<FaGavel />
							</div>
							<p className="fw-500 fs-lg">Davalar</p>
						</div>
						<Button
							theme="basic"
							icon={<FaTimes />}
							onClick={() => setIsOpen(false)}
						>
							Kapat
						</Button>
					</div>
					{
						<div className="mt-2 mb-4">
							{totalCourtCount === 0
								? 'Henüz dava açılmamış.'
								: `${totalCourtCount} adet açılmış dava mevcut`}
						</div>
					}
					{Object.values(COURT_TYPE)
						.filter(c => !c.condition || c.condition(currentCase))
						.map(v => {
							return (
								<CourtType
									key={v}
									type={v}
									debtorTasks={debtorTasks}
									reloadTasks={reloadTasks}
									courts={courts}
									setCourts={setCourts}
								/>
							)
						})}
				</div>
			</Modal>
		</>
	)
}
