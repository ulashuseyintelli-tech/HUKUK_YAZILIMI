import React, { useContext, useEffect, useState } from 'react'
import { TASK_TYPE } from '../../../constants'
import { InpoundmentContext } from '../../../pages/takip/CaseInpoundmentDetails'
import printer from '../../../printer'
import Button from '../../anBrains/Button'
import Input from '../../anBrains/Input'
import Printer from '../../Printer'
import TaskRow from '../../task/TaskRow'
import TrueFalse from '../../TrueFalse'

export default function AssetsAppraisalResult({ customAsset, customUpdate }) {
	const {
		assetProps,
		selectedDebtor,
		visibleInpoundment,
		currentCase,
	} = useContext(InpoundmentContext)
	let { visibleAsset, updateAsset } = assetProps

	visibleAsset = customAsset || visibleAsset
	updateAsset = customUpdate || updateAsset

	const printerType =
		visibleInpoundment === 'VEHICLE'
			? printer.VEHICLE_APPRAISAL
			: visibleInpoundment === 'IMMOVABLE'
			? printer.IMMOVABLE_APPRAISAL
			: printer.MOVABLE_APPRAISAL

	const [appraisalResult, setAppraisalResult] = useState(
		visibleAsset.appraisalResult,
	)

	useEffect(() => {
		setAppraisalResult(visibleAsset.appraisalResult)
	}, [visibleAsset])

	return (
		<TaskRow
			customAssetId={customAsset?._id}
			types={[
				TASK_TYPE.APPRAISAL_DOCUMENT_REQUIRED,
				TASK_TYPE.APPRAISAL_RESULT_REQUIRED,
			]}
			conditions={[true, visibleAsset.appraisalResultDocumentCreated]}
			titleButtons={[
				<Printer
					paperDebtors={[selectedDebtor]}
					type="requestPaper"
					request={printerType.value}
					caseId={currentCase._id}
					object={visibleAsset}
				/>,
				null,
			]}
			children={[
				<TrueFalse
					options={['Edilmedi', 'Evet, edildi']}
					object={visibleAsset}
					property="appraisalResultDocumentCreated"
					change={updateAsset}
				/>,
				<>
					<Input
						placeholder="Türk Lirası"
						classes="mt-4"
						onChange={e => setAppraisalResult(e.target.value)}
						value={appraisalResult}
					/>
					{appraisalResult !== visibleAsset.appraisalResult && (
						<Button
							classes="mt-4 blue fw-500"
							onClick={() => updateAsset('appraisalResult', appraisalResult)}
						>
							Kaydet
						</Button>
					)}
				</>,
			]}
			titles={['Kıymet Takdiri Talep Edildi Mi?', 'Kıymet Takdiri Sonucu (₺)']}
		/>
	)
}
