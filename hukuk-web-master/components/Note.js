import React from 'react'
import {
	FaCheckCircle,
	FaExclamationTriangle,
	FaInfoCircle,
	FaTimesCircle,
} from 'react-icons/fa'

export default function Note({
	type,
	children,
	classes,
	blinking,
	onMouseOver,
	inline,
	containerClass = '',
	imageWidth = '2rem',
	imageHeight = '2rem',
}) {
	return (
		<div
			className={`note note-${type}${
				classes ? ` ${classes}` : ''
			} ${containerClass}`}
			blinking={blinking}
			blinking={`${blinking}`}
			onMouseOver={onMouseOver}
		>
			<div className="flex al-center">
				{!type && <FaInfoCircle />}
				{type === 'warn' && <FaExclamationTriangle />}
				{type === 'error' && <FaTimesCircle />}
				{type === 'success' && <FaCheckCircle />}
				{type === 'zekiye' && (
					<div>
						<div
							className="fit-bg"
							style={{ width: imageWidth, height: imageHeight }}
						></div>
					</div>
				)}
			</div>
			{type === 'zekiye' ? (
				<div className={`${inline ? 'flex' : 'column'}`}>
					<p className={`orange fw-600 ml-0 mr-2 ${inline ? '' : 'mb-1'}`}>
						Zekiye:
					</p>
					{children}
				</div>
			) : (
				children
			)}
		</div>
	)
}
