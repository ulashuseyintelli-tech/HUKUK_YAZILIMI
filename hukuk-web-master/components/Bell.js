import React from 'react'
import { FaBell } from 'react-icons/fa'

export default function Bell({
	labelWith = 16,
	labelHeight = 16,
	size,
	withLabel = true,
	label,
	tasks,
	className,
}) {
	return (
		<div className={`flex al-center mr-4 ${className}`}>
			<FaBell
				size={size}
				className={tasks ? (tasks.length > 0 ? 'orange' : 'gray') : 'orange'}
			/>
			{withLabel && (
				<p
					className={`fs-xsm flex al-center jst-center white br-50 ${
						tasks && tasks.length > 0 ? 'bg-orange' : 'bg-gray'
					}`}
					style={{
						width: labelWith,
						height: labelHeight,
						marginLeft: -5,
						marginTop: -20,
					}}
				>
					{label || tasks.length}
				</p>
			)}
		</div>
	)
}
