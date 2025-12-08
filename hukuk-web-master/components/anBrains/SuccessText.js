import React from 'react'
import { FaCheckCircle } from 'react-icons/fa'

export default function SuccessText({ visible, text, nonSpace }) {
	return visible ? (
		<div
			className={`flex al-center brd brd-green ${
				nonSpace ? '' : 'mb-8'
			} py-2 px-4 br-xsm w-100`}
		>
			<div className="flex al-center jst-center mr-4">
				<FaCheckCircle className="green fs-sm" />
			</div>
			<p className="green fw-500">{text}</p>
		</div>
	) : null
}
