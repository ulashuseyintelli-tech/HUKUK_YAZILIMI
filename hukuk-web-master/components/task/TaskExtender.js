import React, { useState } from 'react'
import Input from '../anBrains/Input'
import Button from '../anBrains/Button'

export default function TaskExtender({ extend, close }) {
	const [extensionDays, setExtensionDays] = useState(1)
	const [causeOfExtension, setCauseOfExtension] = useState('')

	const _extend = async () => {
		await extend(extensionDays, causeOfExtension)
		setExtensionDays(1)
		setCauseOfExtension('')
	}

	return (
		<div className="w-100">
			<div className="divider my-4"></div>
			<p className="fw-500 fs-sm mb-2">Uzatılacak Gün Sayısı</p>
			<select
				value={extensionDays}
				className="input w-100"
				onChange={e => setExtensionDays(e.target.value)}
			>
				<option value={1}>1</option>
				<option value={2}>2</option>
				<option value={3}>3</option>
			</select>
			<p className="fw-500 fs-sm my-2">Uzatma Sebebi</p>
			<Input
				textarea
				value={causeOfExtension}
				placeholder="Görevin süresini uzatabilmek için bir sebep girmeniz gerekiyor."
				onChange={e => setCauseOfExtension(e.target.value)}
			/>
			<div className="flex al-center mt-4">
				<Button classes="w-50 fw-500" onClick={close}>
					Vazgeç
				</Button>
				<Button theme="blue" classes="w-50 fw-500" onClick={_extend}>
					Görevin Süresini Uzat
				</Button>
			</div>
		</div>
	)
}
