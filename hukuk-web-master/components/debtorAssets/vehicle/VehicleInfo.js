import React from 'react'
import useInpoundmentContext from '../../../services/hooks/useInpoundmentContext'

export default function VehicleInfo() {
	const {
		assetProps: { visibleAsset },
	} = useInpoundmentContext()

	return (
		<React.Fragment>
			<div className="flex">
				<div className="mr-4 w-50">
					<p>
						<span className="fw-500">Plaka Numarası:</span>{' '}
						{visibleAsset.licenseNumber}
					</p>
				</div>
				<div className="w-50">
					<p>
						<span className="fw-500">Marka:</span> {visibleAsset.brand}
					</p>
				</div>
			</div>
			<div className="flex">
				<div className="mr-4 w-50">
					<p>
						<span className="fw-500">Model:</span> {visibleAsset.model}
					</p>
				</div>
				<div className="w-50">
					<p>
						<span className="fw-500">Sahiplenme Tarihi:</span>{' '}
						{visibleAsset.onwershipDate}
					</p>
				</div>
			</div>
			<div className="flex">
				<div className="mr-4 w-50">
					<p>
						<span className="fw-500">Cinsi:</span> {visibleAsset.kind}
					</p>
				</div>
				<div className="w-50">
					<p>
						<span className="fw-500">Tipi:</span> {visibleAsset.type}
					</p>
				</div>
			</div>
			<div className="flex">
				<div className="mr-4 w-50">
					<p>
						<span className="fw-500">Renk:</span> {visibleAsset.color}
					</p>
				</div>
				<div className="w-50">
					<p>
						<span className="fw-500">Kullanım Amacı:</span>{' '}
						{visibleAsset.intendedUse}
					</p>
				</div>
			</div>
			<div className="flex">
				<div className="mr-4 w-50">
					<p>
						<span className="fw-500">Motor Numarası:</span>{' '}
						{visibleAsset.motorNumber}
					</p>
				</div>
				<div className="w-50">
					<p>
						<span className="fw-500">Şasi Numarası:</span>{' '}
						{visibleAsset.chassisNumber}
					</p>
				</div>
			</div>
			<div className="step-item-divider"></div>
		</React.Fragment>
	)
}
