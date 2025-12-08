import Router from 'next/router'
import React from 'react'
import useInpoundmentContext from '../../../services/hooks/useInpoundmentContext'
import Button from '../../anBrains/Button'
import CustodianInfo from '../../CustodianInfo'
import InpoundmentBackButton from '../../inpoundments/InpoundmentBackButton'
import InpoundmentSale from '../../inpoundments/InpoundmentSale'
import InpoundmentStep from '../../inpoundments/InpoundmentStep'
import InpoundmentStepper from '../../inpoundments/InpoundmentStepper'
import RestrictionTable from '../../inpoundments/RestrictionTable'
import Assets100 from '../commonSteps/Assets100'
import AssetSaleAdvance from '../commonSteps/AssetSaleAdvance'
import AssetsAppraisalResult from '../commonSteps/AssetsAppraisalResult'
import AssetsAppraisalResultNotification from '../commonSteps/AssetsAppraisalResultNotification'

export default function PledgedMovable() {
	const {
		assetProps: { visibleAsset },
	} = useInpoundmentContext()

	return (
		<div className={`${visibleAsset ? '' : 'inpoundment-asset-card'}`}>
			<InpoundmentBackButton />
			{/* <p className="fw-600 fs-md">
				{vehicle.brand} {vehicle.model}
			</p>
			<p className="mt-1">
				Son güncellenme:{' '}
				{new Date(vehicle.lastUpdate).toLocaleDateString('tr-TR')}
			</p> */}
			{visibleAsset && (
				<div className="mt-4">
					<InpoundmentStepper />
					<InpoundmentStep step={1}>
						<RestrictionTable />
						<div className="step-item-divider"></div>
						<AssetSaleAdvance />
					</InpoundmentStep>
					<InpoundmentStep step={2}>
						<CustodianInfo />
					</InpoundmentStep>
					<InpoundmentStep step={3}>
						<AssetsAppraisalResult />
						<div className="step-item-divider"></div>
						<div>
							<Assets100 />
						</div>
					</InpoundmentStep>
					<InpoundmentStep step={4}>
						<AssetsAppraisalResultNotification />
					</InpoundmentStep>
					<InpoundmentSale />
				</div>
			)}
		</div>
	)
}
