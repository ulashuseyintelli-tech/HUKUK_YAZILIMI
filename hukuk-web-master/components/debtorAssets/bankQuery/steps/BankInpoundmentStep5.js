import React, { useState } from 'react'
import { TASK_TYPE } from '../../../../constants'
import { calculateRestrictionCollections } from '../../../../helpers/Helper'
import printer from '../../../../printer'
import useInpoundmentContext from '../../../../services/hooks/useInpoundmentContext'
import Button from '../../../anBrains/Button'
import Input from '../../../anBrains/Input'
import InpoundmentStep from '../../../inpoundments/InpoundmentStep'
import Note from '../../../Note'
import Printer from '../../../Printer'
import TaskField from '../../../task/TaskField'
import TaskRow from '../../../task/TaskRow'
import TrueFalse from '../../../TrueFalse'

export default function BankInpoundmentStep5() {
	const {
		assetProps: { visibleAsset, updateAsset },
		selectedDebtor,
		currentCase,
	} = useInpoundmentContext()

	const [shareAmount, setShareAmount] = useState(visibleAsset.shareAmount || 0)

	return (
		<InpoundmentStep step={4}>
			<TaskRow
				titles={['Alacak Dosyaya Talep Edildi Mi?', 'Alacak Talebi Sonucu']}
				titleButtons={[
					<Printer
						paperDebtors={[selectedDebtor]}
						request={printer.COLLECTION_DECLARATION.value}
						caseId={currentCase._id}
						object={visibleAsset}
					/>,
				]}
				types={[
					TASK_TYPE.MONEY_REQUEST_REQUIRED,
					TASK_TYPE.MONEY_REQUEST_RESPONSE,
				]}
				conditions={[true, visibleAsset.isDueRequestCreated === true]}
				children={[
					<TrueFalse
						object={visibleAsset}
						property="isDueRequestCreated"
						change={updateAsset}
						options={['Edilmedi', 'Talep edildi']}
					/>,
					<TrueFalse
						object={visibleAsset}
						property="dueRequestResponse"
						change={updateAsset}
						options={['Olumsuz', 'Olumlu']}
					/>,
				]}
			/>
			{visibleAsset.dueRequestResponse && (
				<>
					<div className="step-item-divider"></div>
					<TaskField title="Paya Düşen Para" type={TASK_TYPE.SHARE_AMOUNT}>
						<div className="w-100">
							<Input
								classes="mt-4 w-100"
								placeholder="Paya düşen para miktarı"
								onChange={e => setShareAmount(e.target.value)}
								value={shareAmount ? `${shareAmount}` : ''}
							/>
							{visibleAsset.restriction.table.length > 0 && (
								<Note type="zekiye" classes="mt-2">
									<p>
										Sıra listesine göre paya düşen para{' '}
										<span className="fw-600">
											{
												calculateRestrictionCollections(
													parseInt(visibleAsset.accountBalance),
													visibleAsset.restriction,
												).ourCollection
											}
										</span>
										₺ olmalıdır
									</p>
								</Note>
							)}
							<Button
								classes="mt-4 blue fw-600"
								disabled={
									`${shareAmount}` === `${visibleAsset.shareAmount}` &&
									shareAmount !== 0 &&
									shareAmount !== '0'
								}
								onClick={() =>
									updateAsset('shareAmount', parseInt(shareAmount))
								}
							>
								Kaydet
							</Button>
							{visibleAsset.shareAmount > 0 && (
								<Note type="success" classes="fw-600 mt-4">
									Paya düşen para tahsilat olarak eklendi
								</Note>
							)}
						</div>
					</TaskField>
				</>
			)}
		</InpoundmentStep>
	)
}
