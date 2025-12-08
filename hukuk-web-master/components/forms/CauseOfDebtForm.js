import React, { useState } from 'react'
import { FaCheck, FaPlus } from 'react-icons/fa'
import { getCauseOfDebt } from '../../constants/causesOfDebts'
import { useAppContext } from '../../services/hooks/useAppContext'
import useInpoundmentContext from '../../services/hooks/useInpoundmentContext'
import { updateLawOffice } from '../../services/lawOfficeService'
import Button from '../anBrains/Button'
import Input from '../anBrains/Input'

export default function CauseOfDebtForm({ selectedValue, onChange }) {
	const { currentCase } = useInpoundmentContext()
	const { user, setUser } = useAppContext()

	const [extraCausesOfDebt, setExtraCausesOfDebt] = useState(
		user.lawOffice[0].extraCausesOfDebt || [],
	)
	const [isFormVisible, setIsFormVisible] = useState(false)
	const [newCause, setNewCause] = useState({ title: '', description: '' })

	const addNewCauseOfDebt = e => {
		e.preventDefault()
		e.stopPropagation()
		if (newCause) {
			updateLawOffice({
				...user.lawOffice[0],
				extraCausesOfDebt: [...extraCausesOfDebt, newCause],
			}).then(res => {
				setUser({ ...user, lawOffice: [res.data] })
				onChange(newCause)
				setNewCause('')
				setIsFormVisible(false)
				setExtraCausesOfDebt(res.data.extraCausesOfDebt)
			})
		} else {
			alert('Yeni Borç Sebeb için lütfen bir isim girin')
		}
	}

	return (
		<div className="w-100 relative">
			<select
				className="input mt-2 w-100 "
				value={selectedValue}
				onChange={e => onChange(e.target.value)}
			>
				{getCauseOfDebt(currentCase.type).map(cause => {
					return (
						<option key={cause} value={cause} className="mr-2">
							{cause}
						</option>
					)
				})}
				{extraCausesOfDebt.map(cause => {
					return (
						<option key={cause.title} value={cause.title} className="mr-2">
							{cause.title} ({cause.description})
						</option>
					)
				})}
			</select>
			<Button
				type="button"
				classes="absolute blue"
				style={{ bottom: '-1.75rem' }}
				onClick={() => setIsFormVisible(!isFormVisible)}
			>
				<FaPlus className="fs-xxsm mr-1" />
				Yeni Sebep Ekle{' '}
			</Button>
			{isFormVisible && (
				<form
					className="absolute br p-4 shadow bg-white"
					style={{ top: '120%', left: '8rem', zIndex: 5, width: '250px' }}
					onSubmit={addNewCauseOfDebt}
				>
					<p className="fs-xsm fw-500 mb-1">Borcun Sebebi</p>
					<Input
						classes="mb-2 fs-xsm"
						onChange={e => setNewCause({ ...newCause, title: e.target.value })}
						value={newCause.title}
						placeholder="Borcun sebebi"
					/>
					<p className="fs-xsm fw-500 mb-1 nowrap">Borcun Sebebi Açıklaması</p>
					<Input
						classes="fs-xsm"
						onChange={e =>
							setNewCause({ ...newCause, description: e.target.value })
						}
						value={newCause.description}
						placeholder="Borcun sebebi açıklaması"
					/>
					<div className="flex al-center jst-between mt-4">
						<Button
							type="button"
							classes="red fs-xsm"
							onClick={() => setIsFormVisible(!isFormVisible)}
						>
							Vazgeç{' '}
						</Button>
						<Button type="submit" classes="blue fw-500">
							<FaCheck className="fs-xsm mr-1" />
							Oluştur{' '}
						</Button>
					</div>
				</form>
			)}
		</div>
	)
}
