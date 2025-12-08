import React, { useState } from 'react'
import { FaCheckSquare, FaExclamationTriangle } from 'react-icons/fa'
import { checkIdentityNumber } from '../../helpers/Helper'
import { useRestrictionContext } from '../../services/hooks/useRestrictionContext'
import Button from '../anBrains/Button'
import Input from '../anBrains/Input'
import Modal from '../anBrains/Modal'
import Note from '../Note'
import CreditorSelect from '../select/CreditorSelect'
import TaskRadar from '../task/TaskRadar'
import TrueFalse from '../TrueFalse'

export default function Restriction100({ restriction, changeProperty }) {
	const [isDetailsVisible, setIsDetailsVisible] = useState(false)
	const [debtAmount, setDebtAmount] = useState(restriction.debtAmount)
	const { creditors } = useRestrictionContext()
	const creditor = restriction?.creditorId
		? creditors.find(c => c._id === restriction.creditorId)
		: null

	const operationRequired =
		restriction.claim100Status === null ||
		!creditor ||
		creditor.addresses.length === 0 ||
		!checkIdentityNumber(creditor)

	const debtAmountRequired = !restriction.debtAmount

	return (
		<>
			{!restriction.isContinue && restriction.creditorId && (
				<div className="red fw-600 flex al-center">
					<FaExclamationTriangle className="mr-2" />
					Devam etmiyor!
				</div>
			)}
			{restriction.withoutCreditor && (
				<div className="blue fw-600">Takyidat bize ait</div>
			)}
			{restriction.isContinue && !restriction.withoutCreditor && (
				<>
					{operationRequired || debtAmountRequired ? (
						<TaskRadar right="100%" top="-1rem" always>
							<Button onClick={() => setIsDetailsVisible(true)}>
								<p className="orange fw-600">İşlem yapılması gerekiyor!</p>
							</Button>
						</TaskRadar>
					) : (
						<Button
							classes="green fw-600 flex al-center btn-green"
							onClick={() => setIsDetailsVisible(true)}
						>
							<FaCheckSquare className="mr-2" />
							Tamamlandı
						</Button>
					)}
				</>
			)}
			<Modal
				visible={isDetailsVisible}
				close={() => setIsDetailsVisible(false)}
			>
				<div className="form-modal">
					<p className="fs-md bold mb-4">100. Madde Detayları</p>
					<div className="flex mb-4">
						<div className="w-50 mr-4">
							<TaskRadar
								right="90%"
								top="-1.5rem"
								always={restriction.claim100Status === null}
							>
								<p className="fw-500 fs-nm">100. Madde Cevabı Geldi Mi?</p>
								<TrueFalse
									options={['Cevap gelmedi', 'Cevap geldi']}
									object={restriction}
									property="claim100Status"
									change={changeProperty}
								/>
							</TaskRadar>
						</div>
						{restriction.claim100Status === true && (
							<div className="w-50">
								<TaskRadar always={operationRequired} top="-.75rem">
									<p className="fw-500 fs-nm mb-4">Alacaklı Bilgileri</p>
									<CreditorSelect
										selectedId={restriction.creditorId}
										setSelectedId={v => changeProperty('creditorId', v)}
									/>
								</TaskRadar>
								<TaskRadar
									always={debtAmountRequired}
									top="-.75rem"
									right="100%"
									containerClasses="mt-4"
								>
									<p className="fw-500 fs-nm mb-4">Borç Miktarı</p>
									<Input
										placeholder="Borç miktarı"
										value={debtAmount}
										onChange={e => setDebtAmount(e.target.value)}
									/>
									{parseInt(debtAmount) !==
										parseInt(restriction.debtAmount) && (
										<Button
											classes="fw-500 blue mt-2"
											onClick={e => changeProperty('debtAmount', debtAmount)}
										>
											Kaydet
										</Button>
									)}
								</TaskRadar>
							</div>
						)}
					</div>
					{restriction.claim100Status === true && (
						<>
							{operationRequired || debtAmountRequired ? (
								<Note type="zekiye">
									<p className="fs-sm">
										100. madde cevabına göre alacaklı bilgilerinin doldurulması
										gerekiyor!
									</p>
								</Note>
							) : (
								<Note type="success" classes="fw-500">
									Tüm bilgiler tamamlandı!
								</Note>
							)}
						</>
					)}
				</div>
			</Modal>
		</>
	)
}
