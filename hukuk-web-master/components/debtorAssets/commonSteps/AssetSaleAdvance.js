import React from 'react'
import { TASK_TYPE } from '../../../constants'
import printer from '../../../printer'
import useInpoundmentContext from '../../../services/hooks/useInpoundmentContext'
import ExpenseForm from '../../expense/ExpenseForm'
import Printer from '../../Printer'
import TaskField from '../../task/TaskField'
import TrueFalse from '../../TrueFalse'

export default function AssetSaleAdvance() {
	const {
		assetProps: { visibleAsset, updateAsset },
		selectedDebtor,
	} = useInpoundmentContext()

	return (
		<TaskField
			type={TASK_TYPE.SALE_ADVANCE_REQUIRED}
			title="Satış Avansı Yatırıldı Mı?"
			titleButton={
				<div className="flex al-center">
					<Printer
						paperDebtors={[selectedDebtor]}
						type="requestPaper"
						request={printer.VEHICLE_SALE_ADVANCE.value}
						caseId={visibleAsset.caseId}
						object={visibleAsset}
					/>
					<div className="mr-8"></div>
					<ExpenseForm customTitle="Satış Avansı" />
				</div>
			}
		>
			<TrueFalse
				options={['Yatırılmadı', 'Yatırıldı']}
				object={visibleAsset}
				property="isSaleAdvancePaid"
				change={updateAsset}
			/>
		</TaskField>
	)
}
