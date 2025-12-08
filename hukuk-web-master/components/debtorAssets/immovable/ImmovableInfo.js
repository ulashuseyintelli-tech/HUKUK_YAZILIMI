import React, { useContext } from 'react'
import { InpoundmentContext } from '../../../pages/takip/CaseInpoundmentDetails'
import useInpoundmentContext from '../../../services/hooks/useInpoundmentContext'
import RestrictionTable from '../../inpoundments/RestrictionTable'

export default function ImmovableInfo() {
	const {
		assetProps: { visibleAsset },
	} = useInpoundmentContext()

	return (
		<React.Fragment>
			<div className="flex">
				<div className="mr-4 w-50">
					<p>
						<span className="fw-500">Kayıt Durumu:</span>{' '}
						{visibleAsset.registrationStatus}
					</p>
				</div>
				<div className="w-50">
					<p>
						<span className="fw-500">Zemin Tipi</span> {visibleAsset.typeOfSoil}
					</p>
				</div>
			</div>
			<div className="flex">
				<div className="mr-4 w-50">
					<p>
						<span className="fw-500">Zemin No</span> {visibleAsset.soilNumber}
					</p>
				</div>
				<div className="w-50">
					<p>
						<span className="fw-500">Kurum Adı:</span>{' '}
						{visibleAsset.associationName}
					</p>
				</div>
			</div>
			<div className="flex">
				<div className="mr-4 w-50">
					<p>
						<span className="fw-500">Cilt No:</span> {visibleAsset.volumeNumber}
					</p>
				</div>
				<div className="w-50">
					<p>
						<span className="fw-500">Sayfa No:</span> {visibleAsset.pageNumber}
					</p>
				</div>
			</div>
			<div className="flex">
				<div className="mr-4 w-50">
					<p>
						<span className="fw-500">Şehir:</span> {visibleAsset.city}
					</p>
				</div>
				<div className="w-50">
					<p>
						<span className="fw-500">İlçe:</span> {visibleAsset.district}
					</p>
				</div>
			</div>
			<div className="flex">
				<div className="mr-4 w-50">
					<p>
						<span className="fw-500">Mahalle / Köy:</span> {visibleAsset.street}
					</p>
				</div>
				<div className="w-50">
					<p>
						<span className="fw-500">Mevkii:</span> {visibleAsset.local}
					</p>
				</div>
			</div>
			<div className="flex">
				<div className="mr-4 w-50">
					<p>
						<span className="fw-500">Ada:</span> {visibleAsset.cityBlock}
					</p>
				</div>
				<div className="w-50">
					<p>
						<span className="fw-500">Parsel:</span> {visibleAsset.parcel}
					</p>
				</div>
			</div>
			<div className="flex">
				<div className="mr-4 w-50">
					<p>
						<span className="fw-500">Yüz Ölçüm:</span> {visibleAsset.area}
					</p>
				</div>
				<div className="w-50">
					<p>
						<span className="fw-500">Ana Taş Nitelik:</span>{' '}
						{visibleAsset.mainQualification}
					</p>
				</div>
			</div>
			<div className="flex">
				<div className="mr-4 w-50">
					<p>
						<span className="fw-500">Blok:</span> {visibleAsset.block}
					</p>
				</div>
				<div className="w-50">
					<p>
						<span className="fw-500">Kat:</span> {visibleAsset.floor}
					</p>
				</div>
			</div>
			<div className="flex">
				<div className="mr-4 w-50">
					<p>
						<span className="fw-500">Giriş-BBNo:</span> {visibleAsset.BbNo}
					</p>
				</div>
				<div className="w-50">
					<p>
						<span className="fw-500">Bağ Böl. Nitelik:</span>{' '}
						{visibleAsset.secondQualification}
					</p>
				</div>
			</div>
			<div className="flex">
				<div className="mr-4 w-100">
					<p>
						<span className="fw-500">Arsa Pay/Payda:</span>{' '}
						{visibleAsset.landShareAndDenominator}
					</p>
				</div>
			</div>
			<div className="step-item-divider"></div>
		</React.Fragment>
	)
}
