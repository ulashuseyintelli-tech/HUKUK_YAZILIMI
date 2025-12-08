import React from 'react'
import Router from 'next/router'
import { FaLongArrowAltLeft } from 'react-icons/fa'

export default function Button({
	children,
	icon,
	type = 'button',
	theme,
	onClick,
	classes,
	back,
	iconPosition,
	disabled,
	style,
}) {
	return (
		<button
			style={style}
			disabled={disabled !== undefined ? disabled : false}
			className={`btn ${classes ? classes : ''} ${
				theme ? 'btn-' + theme : ''
			} ${iconPosition === 'right' ? 'flex-reverse' : ''}`}
			type={type}
			onClick={
				back
					? () => {
							Router.back()
					  }
					: onClick
			}
		>
			{(icon || back) && (
				<div
					className={`flex al-center ${
						iconPosition === 'right' ? 'ml-2' : 'mr-2'
					}`}
				>
					{back ? <FaLongArrowAltLeft /> : icon}
				</div>
			)}
			{back && !children ? 'Geri' : children}
		</button>
	)
}
