import React, { useState } from 'react'
import Button from './Button'

export default function Input({
	icon,
	placeholder,
	name,
	onChange,
	type,
	classes,
	textarea,
	toggle,
	value,
	readOnly,
	error,
	containerClasses,
	disabled,
}) {
	const [isFocused, setIsFocused] = useState(false)

	const isErrorOccured = error ? error.type === name : false

	return (
		<div
			className={`${toggle ? '' : 'input-container'} ${containerClasses || ''}`}
		>
			{isErrorOccured && <p className="mb-2 red">{error.text}</p>}
			<div
				className={`input flex ${
					textarea ? 'al-start' : 'al-center'
				} px-2 py-2 ${classes ? classes : ''} ${
					isErrorOccured ? 'input-error' : ''
				} ${isFocused ? 'brd-blue' : ''} ${readOnly ? 'read-only' : ''}`}
			>
				{icon && <div className="flex al-center mr-2 red">{icon}</div>}
				{textarea && (
					<textarea
						readOnly={readOnly}
						placeholder={placeholder}
						onFocus={() => setIsFocused(true)}
						onBlur={() => setIsFocused(false)}
						name={name}
						onChange={onChange}
						value={value}
					/>
				)}
				{toggle && (
					<label class="switch">
						<input
							disabled={disabled}
							type="checkbox"
							checked={value}
							onChange={e => onChange(e.target.checked)}
						/>
						<span class="slider round"></span>
					</label>
				)}
				{!textarea && !toggle && (
					<input
						readOnly={readOnly}
						type={type}
						placeholder={placeholder}
						onFocus={() => setIsFocused(true)}
						onBlur={() => setIsFocused(false)}
						name={name}
						onChange={onChange}
						value={value}
						disabled={disabled}
					/>
				)}
			</div>
		</div>
	)
}
