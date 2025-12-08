import React from 'react'
import { getAssetName, getDebtorName } from '../../helpers/Helper'
import router from 'next/router'
import { INPOUNDMENT_PROPERTIES } from '../../constants'
import { getTaskTargetUrl, getTaskTextByType } from '../../helpers/taskHelper'

export default function WorkList({ tasks }) {
	return (
		<table className="restriction-list bg-white w-100">
			<tr className="restriction-raw w-100">
				<th>Takip No</th>
				<th>İcra Dairesi</th>
				<th>Dosya No</th>
				<th>Görev</th>
				<th>Varlık</th>
				<th>Borçlu</th>
				<th>Müvekkiller</th>
				<th>Bitiş</th>
			</tr>
			<tbody>
				{tasks.map(task => {
					const text = getTaskTextByType(task)
					const debtorName = getDebtorName(task.debtor[0])
					const assetType = task.assetType || task?.extra?.queryType
					const assetName = getAssetName(`${assetType}`)
					const asset = INPOUNDMENT_PROPERTIES[assetType]
					const targetUrl = getTaskTargetUrl(task)
					const currentCase = task.currentCase[0]
					const execOffice = currentCase?.executionOffice[0]
					const clients = currentCase?.clients || []
					return (
						<tr
							key={task._id}
							className="work-list-row"
							onDoubleClick={() => router.push(targetUrl)}
						>
							<td>{currentCase?.number}</td>
							<td>{execOffice?.name}</td>
							<td>{currentCase?.executionFileNumber}</td>
							<td title={text}>
								{text.substring ? text.substring(0, 50) : text}
								{text?.length > 50 && <span>...</span>}
							</td>
							<td title={assetName} className="blue fw-500">
								<span className="flex al-center">
									<span className="blue flex al-center mr-1">
										{asset && asset.icon}
									</span>
									<span>
										{assetName?.substring(0, 30)}
										{assetName?.length > 30 && <span>...</span>}
									</span>
								</span>
							</td>
							<td title={debtorName}>
								{debtorName?.substring(0, 20)}
								{debtorName?.length > 12 && <span>...</span>}
							</td>
							<td>
								{clients.map(client => {
									const name = getDebtorName(client)
									return (
										<span>
											{name?.substring(0, 20)}
											{name?.length > 12 && <span>...</span>}
											<br />
										</span>
									)
								})}
							</td>
							<td>{new Date(task.dueDate).toLocaleDateString('tr-TR')}</td>
						</tr>
					)
				})}
			</tbody>
		</table>
	)
}
