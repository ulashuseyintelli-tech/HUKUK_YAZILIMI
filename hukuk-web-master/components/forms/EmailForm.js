import React from 'react'
import Button from '../anBrains/Button'
import { FaPlus, FaTrash } from 'react-icons/fa'
import Input from '../anBrains/Input'

export default function EmailForm({ emails, setEmails }) {
	const onChange = (e, index) => {
		emails[index] = e.target.value
		setEmails([...emails])
	}

	const remove = index => {
		emails.splice(index, 1)
		setEmails([...emails])
	}

	return (
		<div>
			<div className="flex al-center jst-between mb-4">
				<span className="fw-500">E-posta Adresleri</span>
				<Button
					type="button"
					theme="basic"
					classes="py-1 px-2 fw-500 ml-2"
					onClick={() => setEmails([...emails, ''])}
				>
					<FaPlus className="fs-xsm mr-2" />
					<span className="bold">Ekle</span>
				</Button>
			</div>
			{emails.map((email, index) => {
				return (
					<div key={'emails' + index} className="flex al-center w-100 mt-2">
						<Input
							placeholder="E-posta adresi"
							containerClasses="w-100"
							value={email}
							onChange={e => onChange(e, index)}
						/>
						<Button
							type="button"
							classes="ml-2 fw-500"
							theme="red"
							onClick={() => remove(index)}
						>
							<FaTrash className="fs-xsm" />
						</Button>
					</div>
				)
			})}
		</div>
	)
}
