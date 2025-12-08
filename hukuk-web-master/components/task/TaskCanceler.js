import React, { useState } from 'react'
import Input from '../anBrains/Input'
import Button from '../anBrains/Button'

export default function TaskCanceler({ close, cancel }) {
	const [causeOfCancel, setCauseOfCancel] = useState('')

	return (
		<div className="w-100">
			<div className="divider my-4"></div>
			<Input
				textarea
				value={causeOfCancel}
				placeholder="Görevi iptal edebilmek için bir iptal sebebi girmeniz gerekiyor."
				onChange={e => setCauseOfCancel(e.target.value)}
			/>
			<div className="flex al-center mt-4">
				<Button classes="w-50 fw-500" onClick={close}>
					Vazgeç
				</Button>
				<Button
					theme="red"
					classes="w-50 fw-500"
					onClick={() => cancel(causeOfCancel)}
				>
					Görevi İptal Et
				</Button>
			</div>
		</div>
	)
}
