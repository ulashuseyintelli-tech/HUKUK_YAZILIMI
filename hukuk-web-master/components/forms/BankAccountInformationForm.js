import React from 'react'
import Button from '../anBrains/Button'
import { FaPlus, FaTrash } from 'react-icons/fa'
import Input from '../anBrains/Input'
import { BANK_ACCOUNT_INFORMATION } from '../../constants'

export default function BankAccountInformationForm({
	bankAccountInformations,
	setBankAccountInformations,
}) {
	const onChange = (e, index, prop) => {
		bankAccountInformations[index][prop] = e.target.value
		setBankAccountInformations([...bankAccountInformations])
	}

	const remove = index => {
		bankAccountInformations.splice(index, 1)
		setBankAccountInformations([...bankAccountInformations])
	}

	return (
		<div>
			<div className="flex al-center jst-between mb-4">
				<span className="fw-500">Banka Hesap Bilgileri</span>
				<Button
					type="button"
					theme="basic"
					classes="py-1 px-2 fw-500 ml-2"
					onClick={() =>
						setBankAccountInformations([
							...bankAccountInformations,
							{ ...BANK_ACCOUNT_INFORMATION },
						])
					}
				>
					<FaPlus className="fs-xsm mr-2" />
					<span className="bold">Ekle</span>
				</Button>
			</div>
			{bankAccountInformations.map((bankAccountInformation, index) => {
				return (
					<div
						key={'bankAccountInformation' + index}
						className="flex al-center w-100 mt-2"
					>
						<Input
							placeholder="Banka Adı"
							containerClasses="w-30 mr-2"
							onChange={e => onChange(e, index, 'bankName')}
						/>
						<Input
							placeholder="IBAN"
							containerClasses="w-70"
							onChange={e => onChange(e, index, 'IBAN')}
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
