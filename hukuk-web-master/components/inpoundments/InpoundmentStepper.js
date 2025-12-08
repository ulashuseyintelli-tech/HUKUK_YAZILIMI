import React, { useContext, useEffect, forwardRef } from 'react'
import { FaCheck } from 'react-icons/fa'
import { STEP_NAME } from '../../constants'
import {
	checkAllBeforeStepsCompleted,
	getInpoundmentStepStatusObject,
} from '../../helpers/Helper'
import { InpoundmentContext } from '../../pages/takip/CaseInpoundmentDetails'
import { useAppContext } from '../../services/hooks/useAppContext'
import Button from '../anBrains/Button'

function InpoundmentStepper({
	assetType,
	customCurrentStep,
	setCustomCurrentStep,
	customStepsStatus,
	customAsset,
}) {
	const { user } = useAppContext()
	let { assetProps, visibleInpoundment } = useContext(InpoundmentContext)
	let { visibleAsset, currentStep, setCurrentStep } = assetProps

	visibleAsset = customAsset || visibleAsset
	currentStep = customCurrentStep || currentStep
	setCurrentStep = setCustomCurrentStep || setCurrentStep
	visibleInpoundment = assetType || visibleInpoundment

	const steps = Object.keys(STEP_NAME[visibleInpoundment])

	const stepsStatus = customStepsStatus || {
		...getInpoundmentStepStatusObject(
			visibleInpoundment,
			visibleAsset,
			user.lawOffice[0],
		),
	}

	useEffect(() => {
		if (stepsStatus.STEP1) {
			if (stepsStatus.STEP2) {
				if (stepsStatus.STEP3) {
					if (stepsStatus.STEP4) {
						if (stepsStatus.STEP5) {
							setCurrentStep(6)
						} else setCurrentStep(5)
					} else setCurrentStep(4)
				} else setCurrentStep(3)
			} else setCurrentStep(2)
		} else setCurrentStep(1)
	}, [visibleAsset])

	return (
		<div className="stepper">
			<div className="stepper-item w-100">
				<div className="w-100 flex al-center jst-between mb-2">
					{steps.map((key, index) => {
						const disabled = !checkAllBeforeStepsCompleted(
							stepsStatus,
							index + 1,
						)
						const completed = stepsStatus[`STEP${key}`] && !disabled
						return (
							<React.Fragment key={key}>
								<Button
									disabled={disabled}
									onClick={() => {
										setCurrentStep(index + 1)
									}}
									style={{ width: '12.5%' }}
									classes={`flex al-center jst-center${
										completed && currentStep !== index + 1 ? ' completed' : ''
									}${currentStep === index + 1 ? ' blue' : ''}`}
								>
									<p
										className={`banner${
											currentStep === index + 1 ? ' brd-blue' : ''
										}`}
									>
										{completed && currentStep !== index + 1 ? (
											<FaCheck />
										) : (
											<span>{index + 1}</span>
										)}
									</p>
								</Button>
								{index !== steps.length - 1 && (
									<div
										style={{ width: '5%' }}
										className="step-item-divider"
									></div>
								)}
							</React.Fragment>
						)
					})}
				</div>
				<div className="w-100 flex al-center jst-between">
					{steps.map((key, index) => {
						const disabled = !checkAllBeforeStepsCompleted(
							stepsStatus,
							index + 1,
						)
						const completed = stepsStatus[`STEP${key}`] && !disabled
						return (
							<Button
								disabled={disabled}
								style={{ width: '12%' }}
								classes={`${completed ? 'completed' : ''}`}
							>
								<p
									className={`fs-sm${currentStep === index + 1 ? ' blue' : ''}`}
								>
									{STEP_NAME[visibleInpoundment][key]}
								</p>
							</Button>
						)
					})}
				</div>
			</div>
		</div>
	)
}

export default forwardRef(InpoundmentStepper)
