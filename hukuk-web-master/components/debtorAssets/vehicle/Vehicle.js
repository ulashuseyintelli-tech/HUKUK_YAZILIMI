import Router from 'next/router'
import React from 'react'
import useInpoundmentContext from '../../../services/hooks/useInpoundmentContext'
import Button from '../../anBrains/Button'
import InpoundmentBackButton from '../../inpoundments/InpoundmentBackButton'
import InpoundmentSale from '../../inpoundments/InpoundmentSale'
import InpoundmentStepper from '../../inpoundments/InpoundmentStepper'
import VehicleInpoundmentStep1 from './steps/VehicleInpoundmentStep1'
import VehicleInpoundmentStep2 from './steps/VehicleInpoundmentStep2'
import VehicleInpoundmentStep3 from './steps/VehicleInpoundmentStep3'
import VehicleInpoundmentStep4 from './steps/VehicleInpoundmentStep4'
import VehicleInpoundmentStep5 from './steps/VehicleInpoundmentStep5'
import VehicleInfo from './VehicleInfo'

export default function Vehicle({ vehicle }) {
	const {
		assetProps: { visibleAsset, setVisibleAssetId, assetType },
		currentCase,
		selectedDebtorId,
	} = useInpoundmentContext()

	return (
		<div className={`${visibleAsset ? '' : 'inpoundment-asset-card'}`}>
			<InpoundmentBackButton />
			<Button
				classes="column al-start"
				onClick={() =>
					Router.push(
						`/takip/${currentCase.number}/haciz?debtorId=${selectedDebtorId}&assetType=${assetType}&assetId=${vehicle._id}`,
					)
				}
			>
				<p className="fw-600 fs-md">
					{vehicle.brand} {vehicle.model}
				</p>
				<p className="mt-1">
					Son güncellenme:{' '}
					{new Date(vehicle.lastUpdate).toLocaleDateString('tr-TR')}
				</p>
			</Button>
			{visibleAsset && visibleAsset._id === vehicle._id && (
				<div className="mt-4">
					<VehicleInfo />
					<div className="mb-4"></div>
					<InpoundmentStepper />
					<VehicleInpoundmentStep1 />
					<div className="mt-4"></div>
					<VehicleInpoundmentStep2 />
					<div className="mt-4"></div>
					<VehicleInpoundmentStep3 />
					<div className="mt-4"></div>
					<VehicleInpoundmentStep4 />
					<div className="mt-4"></div>
					<VehicleInpoundmentStep5 />
					<div className="mt-4"></div>
					<InpoundmentSale />
				</div>
			)}
		</div>
	)
}
