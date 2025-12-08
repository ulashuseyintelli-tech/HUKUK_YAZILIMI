import React from 'react'
import { FaTimesCircle } from 'react-icons/fa'

export default function ErrorText({ visible, text, nonSpace }) {
	return visible ? (
		<div
			className={`flex al-center brd brd-red ${
				nonSpace ? '' : 'my-6'
			} py-2 px-4 br-xsm w-100`}
		>
			<div className="flex al-center jst-center mr-4">
				<FaTimesCircle className="red fs-sm" />
			</div>
			<p className="red fs-sm">{text}</p>
		</div>
	) : null
}
