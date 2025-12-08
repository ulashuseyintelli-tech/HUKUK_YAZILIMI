import React from 'react'
import TaskField from './TaskField'

export default function TaskRow({
	types = [],
	titles = [],
	titleButtons = [],
	children = [],
	conditions = [],
	condition = true,
	customAssetId,
}) {
	if (types.length > 0 && conditions.length === 0) {
		conditions = new Array(types.length)
		conditions.fill(true, 0, types.length)
	}

	if (!condition) {
		return null
	}

	return (
		<div className="flex">
			{types.map((type, index) => {
				return conditions[index] ? (
					<TaskField
						customAssetId={customAssetId}
						titleButton={titleButtons[index]}
						type={type}
						key={Array.isArray(type) ? type[0] : type + index}
						title={titles[index]}
						className={`w-50 ${index !== types.length - 1 ? 'mr-4' : ''}`}
					>
						{children[index]}
					</TaskField>
				) : null
			})}
		</div>
	)
}
