import React, { useState } from 'react'
import { FaCheck } from 'react-icons/fa'

export default function CheckBox({
	onChange,
	children,
	checked,
	classes,
	boxClass = '',
}) {
	const handleChange = () => {
		onChange(!checked)
	}

	return (
		<button
			type="button"
			className={`checkbox-container ${classes || ''}`}
			onClick={handleChange}
		>
			<div className={boxClass}>{checked && <FaCheck />}</div>
			{children}
		</button>
	)
}
