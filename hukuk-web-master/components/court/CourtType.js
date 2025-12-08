import { useState } from 'react'
import { FaChevronDown, FaChevronUp } from 'react-icons/fa'
import { TASK_TYPE } from '../../constants'
import useInpoundmentContext from '../../services/hooks/useInpoundmentContext'
import Button from '../anBrains/Button'
import TaskRadar from '../task/TaskRadar'
import Court from './Court'

export default function CourtType({
	type,
	reloadTasks,
	courts = [],
	setCourts,
	debtorTasks,
}) {
	const { queryCourtType } = useInpoundmentContext()
	const [isOpen, setIsOpen] = useState(queryCourtType === type.value)

	const shouldCreate = debtorTasks.some(
		t => t.type === TASK_TYPE.CREATE_COURT && t.extra.courtType === type.value,
	)

	const hasTask = debtorTasks.some(t => {
		return (
			(t.type === TASK_TYPE.JURIDICAL_DAY_RESPONSE_REQUIRED ||
				t.type === TASK_TYPE.NEXT_JURIDICAL_DAY_REQUIRED) &&
			t.extra.courtType === type.value
		)
	})

	return (
		<div>
			<TaskRadar
				always={shouldCreate || hasTask}
				containerClasses="mb-8"
				right="1rem"
				top="-.75rem"
			>
				<Button
					classes="blue jst-between w-100 fs-md mb-4"
					onClick={() => setIsOpen(!isOpen)}
				>
					<div className="flex al-center ">
						{type.text}
						<span className="gray fs-sm ml-2">
							({courts.filter(c => c.type === type.value).length})
						</span>
					</div>
					{shouldCreate && (
						<p className="orange fs-sm">Dava açılması gerekiyor!</p>
					)}
					{isOpen ? (
						<FaChevronUp className="fs-sm gray" />
					) : (
						<FaChevronDown className="fs-sm gray" />
					)}
				</Button>
				{isOpen && (
					<>
						{shouldCreate && (
							<Court
								courts={courts}
								type={type.value}
								reload={reloadTasks}
								debtorTasks={debtorTasks}
								setCourts={setCourts}
							/>
						)}
						{courts
							.filter(c => c.type === type.value)
							.map(court => {
								return (
									<Court
										courts={courts}
										type={type.value}
										reload={reloadTasks}
										item={court}
										debtorTasks={debtorTasks}
										setCourts={setCourts}
									/>
								)
							})}
					</>
				)}
			</TaskRadar>
		</div>
	)
}
