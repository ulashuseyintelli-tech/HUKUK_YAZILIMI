import React, { useState } from 'react'
import { CASE_TYPE, getDefaultCase, STATUS } from '../../constants'
import { createCase } from '../../services/caseService'
import Button from '../anBrains/Button'
import Modal from '../anBrains/Modal'
import Router from 'next/router'
import LoadingAnimation from '../anBrains/animations/LoadingAnimation/LoadingAnimation'
import { FaFolderPlus } from 'react-icons/fa'

export default function CaseForm({ exactType, btnClass }) {
	const [status, setStatus] = useState(STATUS.NORMAL)
	const [isOpen, setIsOpen] = useState(false)
	const [caseType, setCaseType] = useState(exactType || 2)

	const create = async () => {
		setStatus(STATUS.LOADING)
		await createCase(getDefaultCase(caseType))
			.then(res => {
				location.href = `/takip/${res.data.number}`
			})
			.catch(() => {
				alert('Dosya oluşturulurken hata meydana geldi')
				setStatus(STATUS.NORMAL)
			})
	}

	return (
		<div className="case-form">
			<LoadingAnimation status={status} />
			<Button
				onClick={() => setIsOpen(true)}
				classes={`btn-new-case ${btnClass || ''}`}
				type="button"
			>
				<FaFolderPlus />
				Yeni Takip
			</Button>
			<Modal visible={isOpen} close={() => setIsOpen(false)}>
				<div className="form-modal">
					<div className="bold fs-lg mb-4">Yeni Takip</div>
					<div className="fw-500 mb-2">Bir Takip Tipi Seçin</div>
					<select
						value={caseType}
						className="input"
						onChange={e => setCaseType(e.target.value)}
					>
						{Object.values(CASE_TYPE).map((value, index) => {
							return (
								<option key={value} value={Object.keys(CASE_TYPE)[index]}>
									{value}
								</option>
							)
						})}
					</select>
					<div className="flex al-center mt-4">
						<Button
							theme="basic"
							classes="mr-4"
							onClick={() => setIsOpen(false)}
						>
							Vazgeç
						</Button>
						<Button theme="blue" classes="fw-500" onClick={create}>
							Oluştur
						</Button>
					</div>
				</div>
			</Modal>
		</div>
	)
}
