import React, { useState } from 'react'
import { TASK_TYPE } from '../../../constants'
import printer from '../../../printer'
import useInpoundmentContext from '../../../services/hooks/useInpoundmentContext'
import Button from '../../anBrains/Button'
import Input from '../../anBrains/Input'
import CollectionList from '../../collection/CollectionList'
import Note from '../../Note'
import Printer from '../../Printer'
import TaskRadar from '../../task/TaskRadar'
import TaskRow from '../../task/TaskRow'
import TrueFalse from '../../TrueFalse'

export default function DeFactoStep1() {
	const { assetProps, selectedForeclosableAddress } = useInpoundmentContext()
	const { checkTasksIncludes, visibleAsset, updateAsset } = assetProps

	const [receivedMoneyAmount, setReceivedMoneyAmount] = useState(
		visibleAsset.receivedMoneyAmount,
	)

	return (
		<div>
			<TaskRow
				titles={['Para Tahsilatı Yapıldı Mı?', 'Para Miktarı (₺)']}
				types={[
					TASK_TYPE.DE_FACTO_IS_MONEY_RECEIVED,
					TASK_TYPE.DE_FACTO_RECEIVED_MONEY_AMOUNT,
				]}
				children={[
					<TrueFalse
						options={['Yapılmadı', 'Yapıldı']}
						object={visibleAsset}
						property="isMoneyReceived"
						change={updateAsset}
					/>,
					<>
						<Input
							classes="mt-2 w-100"
							value={receivedMoneyAmount}
							placeholder="Tahsil edilen para miktarı"
							onChange={e => setReceivedMoneyAmount(parseInt(e.target.value))}
						/>
						{receivedMoneyAmount !== visibleAsset.receivedMoneyAmount && (
							<Button
								theme="blue"
								classes="fw-500 mt-4"
								onClick={() =>
									updateAsset('receivedMoneyAmount', receivedMoneyAmount)
								}
							>
								Kaydet
							</Button>
						)}
					</>,
				]}
				conditions={[true, visibleAsset.isMoneyReceived]}
			/>
			<div className="step-item-divider"></div>
			<TaskRow
				titles={[
					'Tahsilat Nereye Yapıldı?',
					visibleAsset.personGotMoney === 0
						? 'Para Talep Edildi ve Alındı Mı?'
						: 'Para Beyan Edildi Mi?',
				]}
				titleButtons={[
					null,
					<Printer
						title="Talep Yazdır"
						type="requestPaper"
						request={printer.IMMOVABLE_ZONE.value}
						caseId={selectedForeclosableAddress.caseId}
						object={selectedForeclosableAddress}
					/>,
				]}
				types={[
					TASK_TYPE.DE_FACTO_PERSON_GOT_MONEY,
					[
						TASK_TYPE.DE_FACTO_IS_MONEY_REQUESTED,
						TASK_TYPE.DE_FACTO_IS_RECEIVED_MONEY_DECLARED,
					],
				]}
				children={[
					<TrueFalse
						options={['Dosyaya', 'Alacaklı Vekiline']}
						object={visibleAsset}
						property="personGotMoney"
						change={updateAsset}
					/>,
					<TrueFalse
						options={
							visibleAsset.personGotMoney === 0
								? ['Alınmadı', 'Alındı']
								: ['Beyan Edilmedi', 'Beyan Edildi']
						}
						object={visibleAsset}
						property={
							visibleAsset.personGotMoney === 0
								? 'isMoneyRequested'
								: 'isReceivedMoneyDeclared'
						}
						change={updateAsset}
					/>,
				]}
				conditions={[true, visibleAsset.personGotMoney !== null]}
				condition={
					visibleAsset.isMoneyReceived && visibleAsset.receivedMoneyAmount
				}
			/>
			<Note type="zekiye" inline classes="mt-8">
				Tahsil edilen para miktarı otomatik olarak tahsilat eklenecektir.
			</Note>
		</div>
	)
}
