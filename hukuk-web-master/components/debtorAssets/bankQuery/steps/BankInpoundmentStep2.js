import React, { useState } from 'react'
import InpoundmentStep from '../../../inpoundments/InpoundmentStep'
import TrueFalse from '../../../TrueFalse'
import Input from '../../../anBrains/Input'
import Button from '../../../anBrains/Button'
import useInpoundmentContext from '../../../../services/hooks/useInpoundmentContext'
import Note from '../../../Note'
import TaskRow from '../../../task/TaskRow'
import {
	NOTIFICATION_STATUS,
	NOTIFICATION_TYPE,
	TASK_TYPE,
} from '../../../../constants'
import BankAccountBalanceThreshold from '../BankAccountBalanceThreshold'
import TaskField from '../../../task/TaskField'
import Printer from '../../../Printer'
import printer from '../../../../printer'
import RadioSelect from '../../../RadioSelect'
import AssetNotifications from '../../../notification/AssetNotifications'
import { useAppContext } from '../../../../services/hooks/useAppContext'

export default function BankInpoundmentStep2() {
	const { user } = useAppContext()
	const {
		assetProps: { assetType, visibleAsset, updateAsset },
		selectedDebtor,
	} = useInpoundmentContext()

	const [newAccountBalance, setNewAccountBalance] = useState(
		visibleAsset.accountBalance || 0,
	)

	return (
		<InpoundmentStep step={1}>
			<TaskRow
				types={[TASK_TYPE.BANK_ACCOUNT_EXIST, TASK_TYPE.BANK_ACCOUNT_BALANCE]}
				titles={[
					'Borçlunun Bankada Hesabı Var Mı?',
					'Borçlunun Hesap Bakiyesi',
				]}
				conditions={[true, visibleAsset.isAccountExist]}
				children={[
					<TrueFalse
						object={visibleAsset}
						property="isAccountExist"
						change={updateAsset}
						options={['Hesap yok', 'Hesap var']}
					/>,
					<div className="mt-2">
						<Input
							value={`${newAccountBalance}`}
							onChange={e => setNewAccountBalance(e.target.value)}
						/>
						<Button
							disabled={
								parseInt(newAccountBalance) ===
									parseInt(visibleAsset.accountBalance) ||
								(!newAccountBalance && newAccountBalance !== 0)
							}
							classes="fw-500 blue mt-2"
							onClick={() =>
								updateAsset('accountBalance', parseInt(newAccountBalance))
							}
						>
							Kaydet
						</Button>
					</div>,
				]}
			/>
			{/* <div className="step-item-divider"></div>
			<Note type="zekiye">
				Eğer cevabın doğruluğu konusunda şüpheleriniz varsa ceza davası
				açabilirsiniz.
				<Button theme="red" classes="fw-500 mt-4">
					Ceza Davası Yazdır
				</Button>
			</Note> */}
			<BankAccountBalanceThreshold />
			{(visibleAsset.accountBalance >
				user.lawOffice[0].bankAccountBalanceThreshold ||
				visibleAsset.isCancelledByThreshold === false) && (
				<>
					<div className="step-item-divider"></div>
					<div className="flex">
						<TaskField
							type={TASK_TYPE.RESTRICTIONS_NOTIFICATION_REQUIRED}
							className="w-30 mr-4"
							title="Takyidat Talebi hazırlandı mı?"
							titleButton={
								<Printer
									paperDebtors={[selectedDebtor]}
									type="requestPaper"
									request={printer.SHARE_NOTIFICATION.value}
									caseId={visibleAsset.caseId}
									object={visibleAsset}
								/>
							}
						>
							<TrueFalse
								options={['Hayır', 'Evet, hazırlandı']}
								object={visibleAsset}
								property="restrictionsNotificationCreated"
								change={updateAsset}
							/>
							{visibleAsset.restrictionsNotificationStatus ===
								NOTIFICATION_STATUS.DONE.value && (
								<>
									<div className="step-item-divider"></div>
									<TaskField
										title={`Takyidat Talebi Cevabı`}
										type={TASK_TYPE.RESTRICTIONS_NOTIFICATION_RESPONSE}
									>
										<RadioSelect
											className="mt-4"
											options={['Sessiz Kaldı', 'Olumsuz', 'Olumlu']}
											values={[
												NOTIFICATION_STATUS.PENDING.value,
												NOTIFICATION_STATUS.REJECTED.value,
												NOTIFICATION_STATUS.DONE.value,
											]}
											value={visibleAsset.restrictionsNotificationResponse}
											onChange={val =>
												updateAsset('restrictionsNotificationResponse', val)
											}
										/>
									</TaskField>
								</>
							)}
							{visibleAsset.restrictionsNotificationResponse ===
								NOTIFICATION_STATUS.PENDING.value && (
								<>
									<div className="step-item-divider"></div>
									<TaskField
										type={TASK_TYPE.RESTRICTIONS_NOTIFICATION_MEMORIAL}
										title="Bankaya muhtıra hazırlandı mı?"
										titleButton={
											<Printer
												paperDebtors={[selectedDebtor]}
												type="requestPaper"
												request={printer.SHARE_NOTIFICATION.value}
												caseId={visibleAsset.caseId}
												object={visibleAsset}
											/>
										}
									>
										<TrueFalse
											options={['Hayır', 'Evet, hazırlandı']}
											object={visibleAsset}
											property="isMemorialCreated"
											change={updateAsset}
										/>
									</TaskField>
									{visibleAsset.memorialStatus ===
										NOTIFICATION_STATUS.DONE.value && (
										<>
											<div className="step-item-divider"></div>
											<TaskField
												title="Muhtıra Cevabı"
												type={
													TASK_TYPE.RESTRICTIONS_NOTIFICATION_MEMORIAL_RESPONSE
												}
											>
												<RadioSelect
													className="mt-4"
													options={['Sessiz Kaldı', 'Olumsuz', 'Olumlu']}
													values={[
														NOTIFICATION_STATUS.PENDING.value,
														NOTIFICATION_STATUS.REJECTED.value,
														NOTIFICATION_STATUS.DONE.value,
													]}
													value={visibleAsset.memorialResponse}
													onChange={val => updateAsset('memorialResponse', val)}
												/>
												{visibleAsset.memorialResponse === null && (
													<Note type="zekiye" classes="mt-4">
														<span>
															Muhtıraya sessiz kalınması durumunda şirket
															otomatik olarak borçlu hale gelecektir.
														</span>
													</Note>
												)}
											</TaskField>
										</>
									)}
								</>
							)}
						</TaskField>
						<div className="w-70">
							<AssetNotifications
								notificationType={NOTIFICATION_TYPE.THIRD_PERSON}
								title={`Takyidat Talebi Tebligatları`}
								emptyText={`Henüz takyidat talebi tebligatı hazırlanmamış.`}
							/>
						</div>
					</div>
				</>
			)}

			{visibleAsset.isRespond && visibleAsset.accountBalance === 0 && (
				<Note classes="mt-4">
					Borçlunun {visibleAsset.bankName} bankasında hesap bakiyesi
					bulunmadığı için 6 ay sonra tekrar sorgulanmak üzere hatırlatıcı
					oluşturuldu.
				</Note>
			)}
			{visibleAsset.isRespond && visibleAsset.isAccountExist === false && (
				<Note classes="mt-4">
					Borçlunun {visibleAsset.bankName} bankasında hesabı olmadığı için 6 ay
					sonra tekrar sorgulanmak üzere hatırlatıcı oluşturuldu.
				</Note>
			)}
		</InpoundmentStep>
	)
}
