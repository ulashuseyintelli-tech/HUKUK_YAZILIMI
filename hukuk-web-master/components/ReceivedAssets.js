import React, { useState } from 'react'
import { TASK_TYPE } from '../constants'
import Button from './anBrains/Button'
import AssetsTable from './AssetsTable'
import CustodianInfo from './CustodianInfo'
import InpoundmentSale from './inpoundments/InpoundmentSale'
import InpoundmentStep from './inpoundments/InpoundmentStep'
import TrueFalse from './TrueFalse'
import Assets100 from './debtorAssets/commonSteps/Assets100'
import AssetsAppraisalResultNotification from './debtorAssets/commonSteps/AssetsAppraisalResultNotification'

import useInpoundmentContext from '../services/hooks/useInpoundmentContext'
import InpoundmentStepper from './inpoundments/InpoundmentStepper'
import TaskRadar from './task/TaskRadar'
import TaskField from './task/TaskField'
import Assets103 from './debtorAssets/commonSteps/Assets103'

//TODO: Burada verilen currentSteplere nasıl bir çözüm bulunabilir

export default function ReceivedAssets() {
	const {
		queryAssetId,
		assetProps: { visibleAsset, updateAsset, checkTasksIncludes },
	} = useInpoundmentContext()

	const [step, setStep] = useState(0)

	return (
		<div className="received-assets">
			<div className="mt-10"></div>
			<InpoundmentStepper
				setCustomCurrentStep={setStep}
				customCurrentStep={step}
				assetType="RECEIVED_ASSETS"
			/>
			<div className="mt-4"></div>
			<InpoundmentStep
				step={1}
				customCurrentStep={step}
				type="RECEIVED_ASSETS"
				object={visibleAsset}
			>
				<div className="flex">
					<TaskField
						className="w-30 mr-4"
						type={TASK_TYPE.IS_ASSET_RECEIVED}
						title="Mal Haczi Yapıldı Mı?"
					>
						<TrueFalse
							options={['Yapılmadı', 'Yapıldı']}
							object={visibleAsset}
							property="isAssetReceived"
							change={updateAsset}
						/>
					</TaskField>
					{visibleAsset.isAssetReceived === false &&
						queryAssetId !== 'CUSTOMS' && (
							<div className="w-50">
								<Button theme="blue" classes="fw-500">
									İflas İstememe Ceza Davası Aç
								</Button>
							</div>
						)}
					{visibleAsset.isAssetReceived === true && (
						<TaskRadar
							right="100%"
							containerClasses="w-70"
							always={checkTasksIncludes(TASK_TYPE.RECEIVED_ASSETS)}
						>
							<AssetsTable object={visibleAsset} changeProperty={updateAsset} />
							<div className="step-item-divider"></div>
							<p className="fw-500 mb-2">
								Haczedilen Malların Tümü Girildi Mi?
							</p>
							<TrueFalse
								options={['Hayır', 'Evet, hepsi girildi']}
								change={updateAsset}
								property="allReceivedAssetsEntered"
								object={visibleAsset}
							/>
						</TaskRadar>
					)}
				</div>
			</InpoundmentStep>
			<InpoundmentStep step={2} customCurrentStep={step} type="RECEIVED_ASSETS">
				<Assets103 />
			</InpoundmentStep>
			<InpoundmentStep step={3} customCurrentStep={step} type="RECEIVED_ASSETS">
				<CustodianInfo />
			</InpoundmentStep>
			<InpoundmentStep step={4} customCurrentStep={step} type="RECEIVED_ASSETS">
				<Assets100 customType={'RECEIVED_ASSETS'} />
			</InpoundmentStep>
			<InpoundmentSale type="RECEIVED_ASSETS" customCurrentStep={step} />
		</div>
	)
}
