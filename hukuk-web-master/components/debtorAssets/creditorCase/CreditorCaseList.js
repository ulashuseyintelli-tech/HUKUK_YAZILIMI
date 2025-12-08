import React, { useEffect, useState } from 'react'
import {
	COLLECTION_TYPE,
	NOTIFICATION_STATUS,
	TASK_TYPE,
} from '../../../constants'
import { getDebtorName, handleError } from '../../../helpers/Helper'
import { getAllThirdPersons } from '../../../services/deptorService'
import { getExecutionOffices } from '../../../services/executionOfficeService'
import useInpoundmentContext from '../../../services/hooks/useInpoundmentContext'
import LoadingCircle from '../../anBrains/animations/LoadingCircle'
import Button from '../../anBrains/Button'
import InpoundmentBackButton from '../../inpoundments/InpoundmentBackButton'
import Note from '../../Note'
import TaskRow from '../../task/TaskRow'
import ThirdPersonList from '../../ThirdPersonList'
import TrueFalse from '../../TrueFalse'
import Assets103 from '../commonSteps/Assets103'
import AssetSeizeStatus from '../commonSteps/AssetSeizeStatus'

export default function CreditorCaseList() {
	const {
		assetProps: { assets, visibleAsset, setVisibleAssetId, updateAsset },
	} = useInpoundmentContext()

	const [thirdPersons, setThirdPersons] = useState([])
	const [executionOffices, setExecutionOffices] = useState([])

	useEffect(() => {
		getThirdPersons()
		getOffices()
	}, [])

	const getThirdPersons = () => {
		getAllThirdPersons()
			.then(res => {
				setThirdPersons(res.data)
			})
			.catch(handleError)
	}

	const getOffices = () => {
		getExecutionOffices()
			.then(res => {
				setExecutionOffices(res.data)
			})
			.catch(handleError)
	}

	if (visibleAsset) {
		return (
			<div>
				<div className={`${visibleAsset ? '' : 'inpoundment-asset-card'}`}>
					<InpoundmentBackButton />
					<Button
						classes="column al-start"
						onClick={() => setVisibleAssetId(visibleAsset._id)}
					>
						<ThirdPersonList
							nonSelect
							thirdPersonId={visibleAsset.thirdPersonId}
						/>
						<p className="bold fs-md mt-2">
							{visibleAsset.dueAmount} tutarında alacak
						</p>
						<p className="mt-1">
							Son Güncelleme:{' '}
							{new Date(visibleAsset.lastUpdate).toLocaleDateString('tr-TR')}
						</p>
					</Button>
				</div>
				<div className="step-item-divider"></div>
				<div className="step mt-4">
					<AssetSeizeStatus />

					{visibleAsset.isSeized === true && (
						<div>
							<div className="step-item-divider"></div>
							<Assets103 />
							<div className="step-item-divider"></div>
							{visibleAsset.claim103Status ===
								NOTIFICATION_STATUS.DONE.value && (
								<>
									<TaskRow
										types={[
											TASK_TYPE.CREDITOR_CASE_THIRD_PERSON_WARN,
											TASK_TYPE.CREDITOR_CASE_INCOME_CHECK,
										]}
										titles={['3.Şahıs İhtar Edildi Mi?', 'Ödeme Yapıldı Mı?']}
										condition={visibleAsset.isSeized}
										conditions={[true, visibleAsset.isThirdPersonWarned]}
										titleButtons={[
											<Button classes="fw-500 blue">
												3.Şahısa Durumu İhtar Et
											</Button>,
										]}
										children={[
											<TrueFalse
												change={updateAsset}
												property={'isThirdPersonWarned'}
												object={visibleAsset}
												options={['Edilmedi', 'Edildi']}
											/>,
											<TrueFalse
												change={updateAsset}
												property={'isPaid'}
												object={visibleAsset}
												options={['Yapılmadı', 'Yapıldı']}
											/>,
										]}
									/>
									<Note type="zekiye" classes="mt-8">
										Ödeme yapılması durumunda otomatik olarak tahsilat
										eklenecektir. Eğer ödeme yapılmazsa otomatik olarak, 3.
										Şahıs borçlu olarak eklenecektir!
									</Note>
								</>
							)}
						</div>
					)}
				</div>
			</div>
		)
	}

	return (
		<table className="restriction-list bg-white w-100">
			<tr className="restriction-row w-100">
				<th>İcra Dairesi</th>
				<th>Dosya No</th>
				<th>Alacak Miktarı</th>
				<th>Üçüncü Şahıs</th>
				<th>Eklenme Tarihi</th>
				<th>Güncellenme Tarihi</th>
				<th>Aksiyon</th>
			</tr>
			{assets.map(creditorCase => {
				const office = executionOffices.find(
					o => o._id === creditorCase.executionOfficeId,
				)
				const thirdPerson = thirdPersons.find(
					p => p._id === creditorCase.thirdPersonId,
				)
				return (
					<tr className="restriction-row w-100">
						<td>{office?.name || <LoadingCircle />}</td>
						<td>{creditorCase.executionFileNumber}</td>
						<td>{creditorCase.dueAmount}</td>
						<td>
							{thirdPerson ? getDebtorName(thirdPerson) : <LoadingCircle />}
						</td>
						<td>{new Date(creditorCase.createdAt).toLocaleString()}</td>
						<td>{new Date(creditorCase.lastUpdate).toLocaleString()}</td>
						<td>
							<Button
								onClick={() => setVisibleAssetId(creditorCase._id)}
								classes="blue fw-600"
							>
								Detaylar
							</Button>
						</td>
					</tr>
				)
			})}
		</table>
	)
}
