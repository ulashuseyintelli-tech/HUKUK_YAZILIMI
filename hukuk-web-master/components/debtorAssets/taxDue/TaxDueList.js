import Button from '../../anBrains/Button'
import TrueFalse from '../../TrueFalse'
import RestrictionTable from '../../inpoundments/RestrictionTable'
import useInpoundmentContext from '../../../services/hooks/useInpoundmentContext'
import InpoundmentBackButton from '../../inpoundments/InpoundmentBackButton'
import CollectionList from '../../collection/CollectionList'
import Note from '../../Note'
import { TASK_TYPE } from '../../../constants'
import TaskField from '../../task/TaskField'
import TaskRow from '../../task/TaskRow'
import { checkRestrictionsStatus, handleError } from '../../../helpers/Helper'
import { useAppContext } from '../../../services/hooks/useAppContext'
import TaxOfficeSelect from '../../select/TaxOfficeSelect'
import { useEffect, useState } from 'react'
import { getTaxOffices } from '../../../services/taxOfficeService'

export default function TaxDueList() {
	const { user } = useAppContext()
	const {
		assetProps: {
			assets,
			visibleAsset,
			setVisibleAssetId,
			updateAsset,
			checkTasksIncludes,
		},
	} = useInpoundmentContext()

	const [taxOffices, setTaxOffices] = useState([])

	useEffect(() => {
		load()
	}, [])

	const load = async () => {
		await getOffices()
	}

	const getOffices = () => {
		return getTaxOffices()
			.then(res => {
				setTaxOffices(res.data)
			})
			.catch(handleError)
	}

	const visibleTaxOffice = taxOffices.find(
		o => o._id === visibleAsset?.taxOfficeId,
	)

	if (visibleAsset) {
		return (
			<div className={`${visibleAsset ? '' : 'inpoundment-asset-card'}`}>
				<InpoundmentBackButton />
				<Button
					classes="column al-start"
					onClick={() => setVisibleAssetId(visibleAsset._id)}
				>
					<div className="flex al-center">
						<p className="bold fs-md">
							{visibleAsset.dueAmount}₺ tutarında vergi alacağı
						</p>
						<p className="fw-500 ml-4 fs-nm">
							{visibleTaxOffice?.name} {visibleTaxOffice?.city}{' '}
							{visibleTaxOffice?.district}
						</p>
					</div>
					<p className="mt-1">
						Son Güncelleme:{' '}
						{new Date(visibleAsset.lastUpdate).toLocaleDateString('tr-TR')}
					</p>
				</Button>
				{visibleAsset && (
					<div>
						<div className="step-item-divider"></div>
						<TaskField
							title="Haciz Durumu"
							type={TASK_TYPE.IS_SEIZED}
							className="mt-4"
						>
							<TrueFalse
								change={updateAsset}
								property={'isSeized'}
								object={visibleAsset}
								options={['Olumsuz', 'Olumlu']}
							/>
						</TaskField>
						{visibleAsset.isSeized !== null && (
							<div className="step-item-divider"></div>
						)}
						{visibleAsset.isSeized === false && (
							<Note type="zekiye">
								Cevabın doğruluğuna dair şüpheniz varsa şikayet davası
								açabilirsiniz.
								<Button classes="fw-500 mt-4" theme="red">
									Memur İşlemini Şikayet Davası Aç
								</Button>
							</Note>
						)}
						{visibleAsset.isSeized && (
							<React.Fragment>
								<div className="step">
									<RestrictionTable />
									<div className="step-item-divider"></div>
									<div>
										<TaskRow
											types={[
												TASK_TYPE.MONEY_REQUEST_REQUIRED,
												TASK_TYPE.MONEY_REQUEST_RESPONSE,
											]}
											titles={[
												'Alacak Dosyaya Talep Edildi Mi?',
												'Alacak Talebi Sonucu',
											]}
											condition={checkRestrictionsStatus(
												visibleAsset,
												user.lawOffice[0],
											)}
											conditions={[true, visibleAsset.isDueRequestCreated]}
											titleButtons={[
												<Button classes="blue fw-600">
													Alacağı Dosyaya Talep Et
												</Button>,
												null,
											]}
											children={[
												<TrueFalse
													change={updateAsset}
													property={'isDueRequestCreated'}
													object={visibleAsset}
													options={['Hayır', 'Evet, talep edildi']}
												/>,
												<TrueFalse
													object={visibleAsset}
													property="dueRequestResponse"
													change={updateAsset}
													options={['Olumsuz', 'Olumlu']}
												/>,
											]}
										/>
										<div className="step-item-divider"></div>
										{visibleAsset.dueRequestResponse === null &&
											visibleAsset.isDueRequestCreated && (
												<Note type="zekiye">
													Alacak talebinin olumlu olması sonucunda vergi alacağı
													miktarı otomatik olarak tahsil edilmiş sayılcaktır
												</Note>
											)}
										{visibleAsset.dueRequestResponse === true && (
											<Note type="success" classes="fw-600">
												Tahsilat başarıyla eklendi!
											</Note>
										)}
										{visibleAsset.dueRequestResponse === false && (
											<Button theme="red bold">
												Memur Hakkında Savcılığa Suç Duyurusu
											</Button>
										)}
									</div>
								</div>
							</React.Fragment>
						)}
					</div>
				)}
			</div>
		)
	}

	return (
		<table className="restriction-list bg-white w-100">
			<tr className="restriction-row w-100">
				<th>Vergi Dairesi</th>
				<th>İl</th>
				<th>İlçe</th>
				<th>Alacak Miktarı</th>
				<th>Son Güncelleme</th>
				<th>Aksiyon</th>
			</tr>
			{assets.map(taxDue => {
				const taxOffice = taxOffices.find(o => o._id === taxDue.taxOfficeId)
				return (
					<tr className="restriction-row w-100">
						<td>{taxOffice?.name}</td>
						<td>{taxOffice?.city}</td>
						<td>{taxOffice?.district}</td>
						<td>{taxDue.dueAmount}</td>
						<td>
							{new Date(taxDue.lastUpdate).toLocaleDateString('tr-TR')}{' '}
							{new Date(taxDue.lastUpdate).toLocaleTimeString()}
						</td>
						<td>
							<Button
								onClick={() => setVisibleAssetId(taxDue._id)}
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
