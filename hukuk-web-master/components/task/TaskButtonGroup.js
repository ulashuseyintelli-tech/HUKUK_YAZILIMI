import Link from 'next/link'
import React from 'react'
import { getTaskButtons } from '../../helpers/taskHelper'

export default function TaskButtonGroup({ task }) {
	return getTaskButtons(task).map(button => {
		return (
			<Link href={button.link}>
				<a className="btn btn-blue w-100 fw-500 mb-2 ta-center fs-sm">
					{button.text}
				</a>
			</Link>
		)
	})
}
