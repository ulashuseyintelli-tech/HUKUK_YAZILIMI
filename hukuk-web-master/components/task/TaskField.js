import React from 'react'
import useInpoundmentContext from '../../services/hooks/useInpoundmentContext'
import TaskRadar from './TaskRadar'

export default function TaskField({
	type,
	title,
	titleButton,
	children,
	className = '',
	containerProps = {},
	extraCondition,
	customAssetId,
	right,
}) {
	const {
		assetProps: { checkTasksIncludes },
	} = useInpoundmentContext()

	let taskExist = false
	if (Array.isArray(type)) {
		type.map(t => {
			if (checkTasksIncludes(t, null, extraCondition, customAssetId)) {
				taskExist = true
			}
		})
	} else {
		taskExist = checkTasksIncludes(type, null, extraCondition, customAssetId)
	}

	return (
		<div className={`column al-start ${className}`} {...containerProps}>
			<TaskRadar
				containerClasses="flex al-center"
				always={taskExist}
				top="-1rem"
				right={right || '-3rem'}
			>
				{title && <p className="fw-500 mr-4">{title}</p>}
				{titleButton}
			</TaskRadar>
			{children}
		</div>
	)
}
