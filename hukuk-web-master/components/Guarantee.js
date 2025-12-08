import React from 'react'
import ThirdPersonList from './ThirdPersonList'
import { createGuarantee, updateGuarantee } from '../services/guaranteeService'
import TrueFalse from './TrueFalse'
import Button from './anBrains/Button'
import Input from './anBrains/Input'
import { handleError } from '../helpers/Helper'
import Note from './Note'
import TaskRadar from './task/TaskRadar'
import { TASK_TYPE } from '../constants'
import Printer from './Printer'
import printer from '../printer'
import useInpoundmentContext from '../services/hooks/useInpoundmentContext'

export default function Guarantee({
	guarantee,
	setGuarantee,
	changeProperty,
	caseId,
	size,
	taskRadarAlways = false,
	debtorTasks,
	debtor,
}) {
	const { currentCase } = useInpoundmentContext()

	const handleFields = (property, value) => {
		guarantee[property] = value
		setGuarantee({ ...guarantee })
	}

	const submit = () => {
		if (validateSubmission()) {
			if (guarantee._id) {
				update()
			} else {
				create()
			}
		}
	}

	const validateSubmission = () => {
		if (!guarantee.thirdPersonId) {
			alert('3.Şahıs seçilmeden kefil Kaydedilemez')
			return false
		} else if (
			guarantee.isPartnerConsentient === null ||
			guarantee.amount === 0 ||
			guarantee.feePayer === null
		) {
			alert('Lütfen tüm bilgileri bilgilerini doldurun')
			return false
		} else {
			return true
		}
	}

	const create = () => {
		createGuarantee(caseId, {
			...guarantee,
		})
			.then(res => {
				if (changeProperty) {
					changeProperty(res.data._id)
					alert('Bilgiler başarıyla kaydedildi.')
				}
				setGuarantee(res.data)
			})
			.catch(e => handleError(e))
	}

	const update = async () => {
		updateGuarantee(guarantee._id, {
			...guarantee,
		})
			.then(res => {
				alert('Bilgiler başarıyla kaydedildi.')
			})
			.catch(e => alert('Hata meydana geldi!'))
	}

	const isSaveButtonDisabled =
		guarantee.thirdPersonId === null ||
		guarantee.isPartnerConsentient === null ||
		!guarantee.amount ||
		guarantee.isFeePaid === null

	return (
		<>
			<div className="step-item-divider"></div>
			<TaskRadar always={taskRadarAlways} right="100%" top="-.75rem">
				<p className="fs-md fw-500">Kefillik Detayları</p>
				<div className={`${size === 'large' ? 'flex' : ''}`}>
					<div className={`${size === 'large' ? 'w-50 mr-4' : ''}`}>
						<p className="fw-500 gray mt-4 mb-4">Kefil Olan Kişi</p>
						<ThirdPersonList
							thirdPersonReason="guarantee"
							thirdPersonId={guarantee.thirdPersonId}
							setId={_id => handleFields('thirdPersonId', _id)}
						/>
					</div>
					{size !== 'large' && <div className="step-item-divider"></div>}
					<div
						className={`${size === 'large' ? 'w-50' : ''}`}
						disabled={!guarantee.thirdPersonId}
					>
						<p className="fw-500 gray mt-4">Eş Rızası Var Mı?</p>
						<TrueFalse
							options={['Yok', 'Var']}
							object={guarantee}
							property="isPartnerConsentient"
							change={handleFields}
						/>
					</div>
					<div
						className={`${size === 'large' ? 'w-50' : ''}`}
						disabled={guarantee.isPartnerConsentient === null}
					>
						<p className="fw-500 gray mt-4">Kefil Olunan Tutar</p>
						<Input
							classes="mt-2"
							onChange={e => handleFields('amount', e.target.value)}
							value={guarantee.amount}
						/>
					</div>

					{size !== 'large' && <div className="step-item-divider"></div>}
				</div>
				{guarantee.isPartnerConsentient === false && (
					<Note type="zekiye" classes="mt-4 mr-4" inline>
						<span className="fw-600">DİKKAT:</span> Eş Rızası olmayan
						kefillikler daha sonra itiraza uğrayabilir
					</Note>
				)}
				<div className="step-item-divider"></div>
				<div className="flex al-center mb-8">
					<div disabled={!guarantee.amount} className="w-50 mr-4">
						<p className="fw-500  gray">Kafalet Harcı Ödendi Mi?</p>
						<TrueFalse
							options={['Hayır', 'Evet, ödendi']}
							object={guarantee}
							property="isFeePaid"
							change={handleFields}
						/>
					</div>
					{debtorTasks &&
						debtorTasks.some(
							t => t.type === TASK_TYPE.GUARANTEE_FEE_MUST_PAY,
						) && (
							<TaskRadar containerClasses="w-50" always={true}>
								<div>
									<p className="fw-500 my-4">
										Kefalet Harcının Ödenmesi İçin Talep Oluşturulması Gerekiyor
									</p>
									<Printer
										paperDebtors={[debtor]}
										type="requestPaper"
										request={printer.VEHICLE_103.value}
										caseId={currentCase._id}
										object={guarantee}
										title="Talep Yazdır"
									/>
								</div>
								<p className="mt-4 fs-sm orange fw-600">
									NOT: Kefalet harcı "ödendi" olarak işaretlendiğinde görev
									tamamlanacaktır.
								</p>
							</TaskRadar>
						)}
				</div>
				{/* <Note classes="mt-8" type="zekiye">
				{guarantee._id
					? '3. Şahıs borçlu olarak kaydedildi ve haciz süreci başlatıldı. Detaylar için size verdiğim görevleri takip edin.'
					: "Tüm detaylar girilip, bilgiler kaydedildiğinde 3. Şahıs otomatik olarak 'Borçlu' olacak ve haciz tebligatı için görev oluşturacağım."}
			</Note> */}

				<Button
					theme="blue"
					classes="mt-4 fw-500 blue"
					onClick={submit}
					disabled={isSaveButtonDisabled}
				>
					Kaydet
				</Button>
			</TaskRadar>
		</>
	)
}
