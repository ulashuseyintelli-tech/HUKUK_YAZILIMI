import React, { useEffect, useRef, useState } from 'react'
import useInpoundmentContext from '../../../services/hooks/useInpoundmentContext'
import LoadingCircle from '../../anBrains/animations/LoadingCircle'
import Button from '../../anBrains/Button'
import InpoundmentBackButton from '../../inpoundments/InpoundmentBackButton'
import InpoundmentStepper from '../../inpoundments/InpoundmentStepper'
import BankInpoundmentStep1 from './steps/BankInpoundmentStep1'
import BankInpoundmentStep2 from './steps/BankInpoundmentStep2'
import BankInpoundmentStep3 from './steps/BankInpoundmentStep3'
import BankInpoundmentStep4 from './steps/BankInpoundmentStep4'
import BankInpoundmentStep5 from './steps/BankInpoundmentStep5'

export default function BankQuery({ bankQuery }) {
	const {
		assetProps: { visibleAsset, setVisibleAssetId, assetsLoading },
	} = useInpoundmentContext()

	if (assetsLoading) {
		return <LoadingCircle />
	}

	return (
		<div className={`${visibleAsset ? '' : 'inpoundment-asset-card'}`}>
			<InpoundmentBackButton />
			<Button
				classes="column al-start"
				onClick={() => setVisibleAssetId(bankQuery._id)}
			>
				<p className="bold fs-md">{bankQuery.bankName}</p>
				<p className="mt-1">
					Son Güncelleme:{' '}
					{new Date(bankQuery.lastUpdate).toLocaleDateString('tr-TR')}
				</p>
			</Button>
			{visibleAsset && visibleAsset._id === bankQuery._id && (
				<div>
					<div className="mt-8"></div>
					<InpoundmentStepper />
					<div className="step-item-divider"></div>
					{/* <BankInpoundmentStep1 /> */}
					<div className="mt-4">
						<BankInpoundmentStep2 />
					</div>
					<div className="mt-4">
						<BankInpoundmentStep3 />
					</div>
					<div className="mt-4">
						<BankInpoundmentStep4 />
					</div>
					<div className="mt-4">
						<BankInpoundmentStep5 />
					</div>
				</div>
			)}
		</div>
	)
}
