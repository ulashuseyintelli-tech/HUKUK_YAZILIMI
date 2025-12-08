import React from 'react'
import { DEATH_OPTIONS } from '../../../constants'
import useInpoundmentContext from '../../../services/hooks/useInpoundmentContext'
import Button from '../../anBrains/Button'
import InpoundmentBackButton from '../../inpoundments/InpoundmentBackButton'
import InpoundmentSale from '../../inpoundments/InpoundmentSale'
import InpoundmentStepper from '../../inpoundments/InpoundmentStepper'

export default function FamilyMember({ familyMember }) {
	const {
		assetProps: { visibleAsset, setVisibleAssetId },
	} = useInpoundmentContext()

	return (
		<div className={`${visibleAsset ? '' : 'inpoundment-asset-card'}`}>
			<InpoundmentBackButton />
			<Button
				classes="column al-start"
				onClick={() => setVisibleAssetId(familyMember._id)}
			>
				<div className="flex al-center jst-between">
					<p className="fw-600 fs-md mr-4">
						{familyMember.name} {familyMember.surname}
					</p>
					<div className="fs-xsm">
						<span className="fw-600 blue">ÖLÜM</span>:{' '}
						{familyMember.death === DEATH_OPTIONS.DEAD.value
							? new Date(familyMember.deathDate).toLocaleDateString('tr-TR')
							: Object.values(DEATH_OPTIONS).find(
									o => o.value === familyMember.death,
							  ).text}
					</div>
				</div>
				<p className="mt-1">
					Son güncellenme:{' '}
					{new Date(familyMember.lastUpdate).toLocaleDateString('tr-TR')}
				</p>
			</Button>
			{visibleAsset && visibleAsset._id === familyMember._id && (
				<div className="mt-4">
					{/* <VehicleInfo />
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
					<InpoundmentSale /> */}
				</div>
			)}
		</div>
	)
}
