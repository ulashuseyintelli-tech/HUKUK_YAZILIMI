import React from 'react'
import { FaTrash, FaPlus } from 'react-icons/fa'
import Input from '../anBrains/Input'
import Button from '../anBrains/Button'
import { PHONE_NUMBER } from '../../constants'

export default function PhoneNumbersForm({
	phoneNumbers,
	setPhoneNumbers,
	required = false,
}) {
	const onChange = (e, index, prop) => {
		phoneNumbers[index][prop] = e.target.value
		setPhoneNumbers([...phoneNumbers])
	}

	const remove = index => {
		phoneNumbers.splice(index, 1)
		setPhoneNumbers([...phoneNumbers])
	}

	return (
		<div>
			<div className="flex al-center jst-between mb-4">
				<span className="fw-500">Telefon Numaraları {required ? '*' : ''}</span>
				<Button
					type="button"
					theme="basic"
					classes="py-1 px-2 fw-500 ml-2"
					onClick={() =>
						setPhoneNumbers([...phoneNumbers, { ...PHONE_NUMBER }])
					}
				>
					<FaPlus className="fs-xsm mr-2" />
					<span className="bold">Ekle</span>
				</Button>
			</div>
			{phoneNumbers.map((phoneNumber, index) => {
				return (
					<div
						key={'phoneNumbers' + index}
						className="flex al-center w-100 mt-2"
					>
						<Input
							placeholder="Başlık"
							containerClasses="w-30 mr-2"
							value={phoneNumber.title}
							onChange={e => onChange(e, index, 'title')}
						/>
						<Input
							placeholder="Telefon Numarası"
							containerClasses="w-70"
							value={phoneNumber.number}
							onChange={e => onChange(e, index, 'number')}
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
