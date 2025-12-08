import React, { useContext } from 'react'
import Button from '../../anBrains/Button'
import ImmovableInpoundmentStep1 from './steps/ImmovableInpoundmentStep1'
import ImmovableInpoundmentStep2 from './steps/ImmovableInpoundmentStep2'
import ImmovableInpoundmentStep3 from './steps/ImmovableInpoundmentStep3'
import ImmovableInpoundmentStep4 from './steps/ImmovableInpoundmentStep4'
import ImmovableInpoundmentStep5 from './steps/ImmovableInpoundmentStep5'
import InpoundmentSale from '../../inpoundments/InpoundmentSale'
import { InpoundmentContext } from '../../../pages/takip/CaseInpoundmentDetails'
import InpoundmentStepper from '../../inpoundments/InpoundmentStepper'
import InpoundmentBackButton from '../../inpoundments/InpoundmentBackButton'

export default function Immovable({ immovable }) {
	const { visibleAsset, setVisibleAssetId } =
		useContext(InpoundmentContext).assetProps

	return (
		<div className={`${visibleAsset ? '' : 'inpoundment-asset-card'}`}>
			<InpoundmentBackButton />
			<Button
				classes="column al-start"
				onClick={() => setVisibleAssetId(immovable._id)}
			>
				<p className="bold fs-md">
					{immovable.city} {immovable.district} {immovable.local}
				</p>
				<p className="mt-1">
					Son güncellenme:{' '}
					{new Date(immovable.lastUpdate).toLocaleDateString('tr-TR')}
				</p>
			</Button>
			{visibleAsset && visibleAsset._id === immovable._id && (
				<div>
					<div className="step-item-divider"></div>
					{/* <ImmovableInfo /> */}
					<InpoundmentStepper />
					<ImmovableInpoundmentStep1 />
					<div className="mt-4"></div>
					<ImmovableInpoundmentStep2 />
					<div className="mt-4"></div>
					<ImmovableInpoundmentStep4 />
					<div className="mt-4"></div>
					<ImmovableInpoundmentStep5 />
					<div className="mt-4"></div>
					<InpoundmentSale />
				</div>
			)}
		</div>
	)
}
