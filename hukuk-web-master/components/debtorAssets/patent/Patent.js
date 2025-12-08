import React from 'react'
import { PATENT_TYPES } from '../../../constants'
import useInpoundmentContext from '../../../services/hooks/useInpoundmentContext'
import Button from '../../anBrains/Button'
import InpoundmentBackButton from '../../inpoundments/InpoundmentBackButton'
import InpoundmentSale from '../../inpoundments/InpoundmentSale'
import InpoundmentStepper from '../../inpoundments/InpoundmentStepper'
import PatentInpoundmentStep1 from './steps/PatentInpoundmentStep1'
import PatentInpoundmentStep2 from './steps/PatentInpoundmentStep2'
import PatentInpoundmentStep3 from './steps/PatentInpoundmentStep3'

export default function Patent({ patent }) {
	const {
		assetProps: { visibleAsset, setVisibleAssetId },
	} = useInpoundmentContext()

	return (
		<div className={`${visibleAsset ? '' : 'inpoundment-asset-card'}`}>
			<InpoundmentBackButton />
			<Button
				classes="column al-start"
				onClick={() => setVisibleAssetId(patent._id)}
			>
				<div className="flex al-center">
					{patent.type && (
						<span className="badge">{PATENT_TYPES[patent.type].text} </span>
					)}
					<div className="ml-2 ta-left">
						<p className="bold">{patent.name}</p>
						<p className="fs-xsm">Tescil No: {patent.registrationNumber}</p>
					</div>
				</div>
				<p className="mt-2 fs-xsm">
					Son Güncelleme:{' '}
					{new Date(patent.lastUpdate).toLocaleDateString('tr-TR')}
				</p>
			</Button>
			{visibleAsset && visibleAsset._id === patent._id && (
				<div className="mt-4">
					<div className="step-item-divider"></div>
					<InpoundmentStepper />
					<div className="mt-4"></div>
					<PatentInpoundmentStep1 />
					<div className="mt-4">
						<PatentInpoundmentStep2 />
						<div className="mt-4">
							<PatentInpoundmentStep3 />
							<div className="mt-4">
								<InpoundmentSale />
							</div>
						</div>
					</div>
				</div>
			)}
		</div>
	)
}
