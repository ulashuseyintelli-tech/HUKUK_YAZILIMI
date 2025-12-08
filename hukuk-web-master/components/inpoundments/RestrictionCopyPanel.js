import React, { useEffect, useState } from 'react'
import { FaTimes } from 'react-icons/fa'
import {
	DEBTOR_TYPES,
	INPOUNDMENT_PROPERTIES,
	PATENT_TYPES,
	QUERY_LIST,
} from '../../constants'
import {
	copyAssetRestrictions,
	getAssetsWithRestriction,
} from '../../services/assetService'
import useInpoundmentContext from '../../services/hooks/useInpoundmentContext'
import LoadingAnimation from '../anBrains/animations/LoadingAnimation/LoadingAnimation'
import LoadingCircle from '../anBrains/animations/LoadingCircle'
import Button from '../anBrains/Button'
import Modal from '../anBrains/Modal'
import CompanyList from '../CompanyList'
import CustomsOfficeSelect from '../select/CustomsOfficeSelect'
import ExecutionOfficeSelect from '../select/ExecutionOfficeSelect'
import TaxOfficeSelect from '../select/TaxOfficeSelect'
import ThirdPersonList from '../ThirdPersonList'

export default function RestrictionCopyPanel({
	visibleAsset,
	visible,
	setVisibility,
}) {
	const {
		assetProps: {
			visibleAssetId,
			assetType: visibleAssetType,
			assets,
			setAssets,
			visibleAssetIndex,
		},
		selectedDebtorId,
		currentCase,
	} = useInpoundmentContext()

	const [loading, setLoading] = useState(true)
	const [allAssets, setAllAssets] = useState([])
	const [copying, setCopying] = useState(false)

	useEffect(() => {
		load()
	}, [])

	const load = async () => {
		await getAllAssets()
		setLoading(false)
	}

	const getAllAssets = async () => {
		if (!visibleAsset?.restriction?.completed) {
			await getAssetsWithRestriction(currentCase._id, selectedDebtorId)
				.then(res => {
					setAllAssets(res.data)
				})
				.catch(e => console.log(e))
		}
	}

	const copy = async (assetType, assetId) => {
		setCopying(true)
		await copyAssetRestrictions(
			assetType,
			assetId,
			visibleAssetType,
			visibleAssetId,
		)
			.then(res => {
				assets[visibleAssetIndex] = {
					...assets[visibleAssetIndex],
					restriction: res.data.restriction,
				}
				setAssets([...assets])
				alert('Takyidatlar başarıyla kopyalandı')
				setVisibility(false)
			})
			.catch(e => console.log(e))
		setCopying(false)
	}

	return (
		<>
			{!visibleAsset?.restriction?.completed && (
				<>
					<Modal
						close={() => {}}
						visible={visible}
						close={() => setVisibility(false)}
					>
						<LoadingAnimation loading={copying} />
						<div className="form-modal">
							<div className="case-util-header mb-4">
								<p className="fw-600 fs-lg">
									Takyidat Listesine Sahip Olan Varlıklar
								</p>
								<Button
									classes="btn btn-basic"
									onClick={() => setVisibility(false)}
								>
									<FaTimes className="mr-2" />
									Kapat
								</Button>
							</div>
							{loading && (
								<div className="flex al-center">
									<LoadingCircle />
									<p className="ml-4">Yükleniyor</p>
								</div>
							)}
							{!loading &&
								Object.values(INPOUNDMENT_PROPERTIES)
									.filter(
										inpoundment =>
											allAssets[inpoundment.field] &&
											allAssets[inpoundment.field].some(
												asset => asset?.restriction?.table?.length > 0,
											),
									)
									.map(inpoundment => {
										return (
											<InpoundmentType
												inpoundment={inpoundment}
												allAssets={allAssets}
												copy={copy}
											/>
										)
									})}
							{!loading &&
								Object.values(allAssets).every(
									assetList =>
										!assetList.some(
											asset => asset?.restriction?.table?.length > 0,
										),
								) && (
									<p>
										Takyidat listesine sahip olan herhangi bir varlık
										bulunamadı!
									</p>
								)}
						</div>
					</Modal>
				</>
			)}
		</>
	)
}

const InpoundmentType = ({ inpoundment, allAssets, copy }) => {
	const list = allAssets[inpoundment.field]
	return (
		<div className="mb-6">
			<p className="fw-600 mb-4 fs-md">{inpoundment.text} Listesi</p>

			{list &&
				list
					.filter(item => item?.restriction?.table?.length > 0)
					.map(item => {
						return (
							<div className="mb-4 flex al-center jst-between btn-basic">
								{inpoundment.key === QUERY_LIST.VEHICLE.value && (
									<p>
										<span className="fw-500">{item.licenseNumber}</span> plakalı
										araç
									</p>
								)}
								{inpoundment.key === QUERY_LIST.BANK.value && (
									<p>
										<span className="fw-500">{item.bankName}</span> adlı banka
									</p>
								)}
								{inpoundment.key === QUERY_LIST.IMMOVABLE.value && (
									<p>
										<span className="fw-500">Ada:</span>{' '}
										{item.cityBlock || 'Belirtilmemiş'}{' '}
										<span className="fw-500">Parsel:</span>{' '}
										{item.parcel || 'Belirtilmemiş'}{' '}
										<span className="fw-500">Mahalle/Köy:</span>{' '}
										{item.street || 'Belirtilmemiş'}{' '}
										<span className="fw-500">İl/İlçe:</span> {item.city} /{' '}
										{item.district}
									</p>
								)}
								{inpoundment.key === QUERY_LIST.SSI.value && (
									<p>
										<CompanyList
											companyId={item.companyId}
											selectable={false}
										/>{' '}
										adlı şirketteki
										{new Date(item.registrationDate).toLocaleDateString(
											'tr-TR',
										)}{' '}
										son sigorta girişi tarihli maaş haczi
									</p>
								)}
								{inpoundment.key === QUERY_LIST.CUSTOMS.value && (
									<p>
										<CustomsOfficeSelect
											selectedId={item.customsOfficeId}
											selectable={false}
										/>{' '}
										adlı Gümrük Müdürlüğünden alacak haczi
									</p>
								)}
								{inpoundment.key === QUERY_LIST.TAX_DUE.value && (
									<div className="flex al-center">
										<TaxOfficeSelect
											selectedId={item.taxOfficeId}
											selectable={false}
										/>{' '}
										<p className="ml-2">
											adlı Vergi Dairesinden {item.dueAmount} tutarında alacak
											haczi
										</p>
									</div>
								)}
								{inpoundment.key === QUERY_LIST.PATENT.value && (
									<p>
										<span className="fw-500">{item.name}</span> adlı{' '}
										<span className="fw-500">
											{
												Object.values(PATENT_TYPES).find(
													pt => pt.value === item.type,
												).text
											}{' '}
										</span>
										haczi
									</p>
								)}
								{inpoundment.key === QUERY_LIST.CREDITOR_CASE.value && (
									<p>
										<ExecutionOfficeSelect
											selectedId={item.executionOfficeId}
											selectable={false}
										/>{' '}
										adlı İcra Müdürlüğünden {item.executionFileNumber} no'lu
										dosyadaki alacak haczi
									</p>
								)}
								{inpoundment.key === QUERY_LIST.SHARE.value && (
									<div className="flex al-center">
										<ThirdPersonList
											thirdPersonId={item.companyId}
											type={DEBTOR_TYPES.INSTITUTION}
											selectable={false}
										/>{' '}
										<p className="ml-2">
											adlı şirketteki %{item.sharePercentage} hisse haczi
										</p>
									</div>
								)}
								<Button
									theme="orange"
									classes="fw-600 ml-4"
									onClick={() => copy(inpoundment.key, item._id)}
								>
									Kopyala
								</Button>
							</div>
						)
					})}
		</div>
	)
}
