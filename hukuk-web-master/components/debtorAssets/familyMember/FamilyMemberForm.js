import React, { useState } from 'react'
import {
	DEATH_OPTIONS,
	FAMILY_MEMBER,
	GENDER_OPTIONS,
	MARITAL_OPTIONS,
	PROXIMITY_OPTIONS,
} from '../../../constants'
import { toDateInputValue } from '../../../helpers/Helper'
import useInpoundmentContext from '../../../services/hooks/useInpoundmentContext'
import Button from '../../anBrains/Button'
import Input from '../../anBrains/Input'
import Modal from '../../anBrains/Modal'
import Note from '../../Note'

export default function FamilyMemberForm({ visible }) {
	const {
		assetProps: { createAsset },
		closeModal,
		currentCase,
		selectedQueryId,
		selectedDebtorId,
	} = useInpoundmentContext()

	const [familyMember, setFamilyMember] = useState({ ...FAMILY_MEMBER })
	const [error, setError] = useState(null)

	const change = (prop, val) => {
		familyMember[prop] = val
		setFamilyMember({ ...familyMember })
	}

	const submitForm = e => {
		e.preventDefault()
		if (validate() === true) {
			createAsset({
				caseId: currentCase._id,
				queryId: selectedQueryId,
				debtorId: selectedDebtorId,
				...familyMember,
			})
				.then(member => {
					setFamilyMember({ ...FAMILY_MEMBER })
				})
				.catch(e => console.log(e))
			closeModal()
		}
	}

	const validate = () => {
		if (!familyMember.name) {
			setError('Aile bireyi adı boş bırakılamaz')
		} else if (!familyMember.surname) {
			setError('Aile bireyi soyadı boş bırakılamaz')
		} else if (!familyMember.identityNumber) {
			setError('Aile bireyi T.C. kimlik numarası boş bırakılamaz')
		} else if (!familyMember.proximity) {
			setError('Aile bireyi yakınlık derecesi boş bırakılamaz')
		} else if (!familyMember.death) {
			setError('Aile bireyi ölüm durumu boş bırakılamaz')
		} else if (
			familyMember.death === DEATH_OPTIONS.DEAD.value &&
			!familyMember.deathDate
		) {
			setError('Aile bireyi ölüm tarihi boş bırakılamaz')
		} else {
			setError(null)
			return true
		}
	}

	return (
		<Modal visible={visible} close={closeModal}>
			<form className="form-modal" onSubmit={submitForm}>
				<p className="fw-600 fs-md mb-4">Yeni Aile Bireyi</p>
				<div className="flex al-center mb-4">
					<label className="w-100">
						<span className="fw-500 gray">Adı</span>
						<Input
							value={familyMember.name}
							placeholder="Adı"
							classes="my-2 mr-4"
							onChange={e => change('name', e.target.value)}
						/>
					</label>
					<label className="w-100">
						<span className="fw-500 gray">Soyadı</span>
						<Input
							value={familyMember.surname}
							placeholder="Soyadı"
							classes="my-2 mr-4"
							onChange={e => change('surname', e.target.value)}
						/>
					</label>
					<label className="w-100">
						<span className="fw-500 gray">T.C. Kimlik Numarası</span>
						<Input
							value={familyMember.identityNumber}
							placeholder="T.C. Kimlik Numarası"
							classes="my-2 w-100"
							onChange={e => change('identityNumber', e.target.value)}
						/>
					</label>
				</div>
				<div className="flex mb-4">
					<label className="mr-8">
						<span className="fw-500 gray">BSN</span>
						<Input
							value={familyMember.BSN}
							placeholder="BSN"
							classes="my-2"
							onChange={e => change('BSN', e.target.value)}
						/>
					</label>
					<label className="mr-8">
						<span className="fw-500 gray">Yakınlık</span>
						<div className="mt-2">
							<select
								className="input"
								onChange={e => change('proximity', e.target.value)}
							>
								{Object.values(PROXIMITY_OPTIONS).map(val => {
									return (
										<option value={val.value} key={val.value}>
											{val.text}
										</option>
									)
								})}
							</select>
						</div>
					</label>
					<label className="w-100 mr-4">
						<span className="fw-500 gray">Ana Adı</span>
						<Input
							value={familyMember.mothersName}
							placeholder="Ana Adı"
							classes="my-2"
							onChange={e => change('mothersName', e.target.value)}
						/>
					</label>
					<label className="w-100">
						<span className="fw-500 gray">Baba Adı</span>
						<Input
							value={familyMember.fathersName}
							placeholder="Baba Adı"
							classes="my-2"
							onChange={e => change('fathersName', e.target.value)}
						/>
					</label>
				</div>
				<div className="flex mb-4">
					<label className="w-100 mr-4">
						<span className="fw-500 gray">Doğum Yeri ve Tarihi</span>
						<Input
							value={familyMember.placeAndDateOfBirth}
							placeholder="Adı"
							classes="my-2"
							onChange={e => change('placeAndDateOfBirth', e.target.value)}
						/>
					</label>
					<label className="w-100 mr-4">
						<span className="fw-500 gray">Medeni Hali</span>
						<div className="mt-2 w-100">
							<select
								className="input w-100"
								onChange={e => change('maritalStatus', e.target.value)}
							>
								{Object.values(MARITAL_OPTIONS).map(val => {
									return (
										<option value={val.value} key={val.value}>
											{val.text}
										</option>
									)
								})}
							</select>
						</div>
					</label>
					<label className="w-100 mr-4">
						<span className="fw-500 gray">Dini</span>
						<Input
							value={familyMember.religion}
							placeholder="Dini"
							classes="my-2"
							onChange={e => change('religion', e.target.value)}
						/>
					</label>
				</div>
				<div className="flex">
					<label className="mb-4 w-100 mr-4">
						<span className="fw-500 gray">Tescil Tarihi</span>
						<Input
							value={familyMember.registryDate}
							placeholder="Tescil tarihi"
							type="date"
							classes="my-2"
							onChange={e => change('registryDate', e.target.value)}
						/>
					</label>
					<label className="w-100">
						<span className="fw-500 gray">Cinsiyet</span>
						<div className="mt-2 w-100">
							<select
								className="input w-100"
								onChange={e => change('gender', e.target.value)}
							>
								{Object.values(GENDER_OPTIONS).map(val => {
									return (
										<option value={val.value} key={val.value}>
											{val.text}
										</option>
									)
								})}
							</select>
						</div>
					</label>
				</div>
				<div className="flex mb-4">
					<label className="w-100 mr-4">
						<span className="fw-500 gray">Ölüm</span>
						<div className="mt-2 w-100">
							<select
								className="input w-100"
								onChange={e => change('death', e.target.value)}
							>
								{Object.values(DEATH_OPTIONS).map(val => {
									return (
										<option value={val.value} key={val.value}>
											{val.text}
										</option>
									)
								})}
							</select>
						</div>
					</label>

					{familyMember.death === DEATH_OPTIONS.DEAD.value && (
						<label className="w-100 mr-4">
							<span className="fw-500 gray">Ölüm Tarihi</span>
							<div className="mt-2 w-100">
								<Input
									value={toDateInputValue(familyMember.deathDate)}
									placeholder="Ölüm tarihi"
									type="date"
									classes="my-2"
									onChange={e => change('deathDate', e.target.value)}
								/>
							</div>
						</label>
					)}
					<label className="w-100 mr-4">
						<span className="fw-500 gray">Evlenme</span>
						<Input
							value={familyMember.marriage}
							placeholder="Adı"
							classes="my-2"
							onChange={e => change('marriage', e.target.value)}
						/>
					</label>
					<label className="w-100 mr-4">
						<span className="fw-500 gray">Boşanma</span>
						<Input
							value={familyMember.divorce}
							placeholder="Adı"
							classes="my-2"
							onChange={e => change('divorce', e.target.value)}
						/>
					</label>
				</div>
				{error && (
					<Note type="error" classes="my-4">
						{error}
					</Note>
				)}
				<Button theme="green" classes="fw-600 fs-sm w-100 py-3">
					OLUŞTUR
				</Button>
			</form>
		</Modal>
	)
}
