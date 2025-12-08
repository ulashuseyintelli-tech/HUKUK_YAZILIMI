import React, { useState, useEffect, useContext } from 'react'
import Button from '../anBrains/Button'
import { FaTimes, FaPen, FaCheckCircle } from 'react-icons/fa'
import {
	getInpoundmentStepName,
	getInpoundmentStepStatus,
} from '../../helpers/Helper'
import { InpoundmentContext } from '../../pages/takip/CaseInpoundmentDetails'
import { useAppContext } from '../../services/hooks/useAppContext'

export default function InpoundmentStep({
	children,
	type,
	step,
	completed,
	customCurrentStep,
}) {
	const { user } = useAppContext()
	const { assetProps, visibleInpoundment } = useContext(InpoundmentContext)
	let { visibleAsset, currentStep } = assetProps
	type = type || visibleInpoundment
	currentStep = customCurrentStep || currentStep

	const [isCompleted, setIsCompleted] = useState(
		completed === undefined
			? getInpoundmentStepStatus(type, visibleAsset, step, user.lawOffice[0])
			: completed,
	)
	const [isOpen, setIsOpen] = useState(
		completed === undefined
			? !getInpoundmentStepStatus(type, visibleAsset, step, user.lawOffice[0])
			: !completed,
	)

	useEffect(() => {
		if (completed !== undefined) {
			handleCompleted()
		}
	}, [completed])

	useEffect(() => {
		handleCompleted()
	}, [visibleAsset])

	const handleCompleted = () => {
		// prettier-ignore
		setIsCompleted(
			completed === undefined
				? getInpoundmentStepStatus(type, visibleAsset, step, user.lawOffice[0])
				: completed,
		)
		// prettier-ignore
		if(true){
			(completed === undefined ? getInpoundmentStepStatus(type, visibleAsset, step, user.lawOffice[0]) : completed) && setIsOpen(false)
		}
	}

	if (step === currentStep || step === 'SALE') {
		return (
			<div className={`step w-100`}>
				{(step === currentStep ||
					(step === 'SALE' && currentStep === 6) ||
					(step === 'SALE' && currentStep === 4 && type === 'PATENT') ||
					(step === 'SALE' &&
						currentStep === 5 &&
						(type === 'IMMOVABLE' ||
							type === 'RECEIVED_ASSETS' ||
							type === 'PLEDGED_MOVABLE'))) && (
					<>
						{visibleAsset.restriction?.isCancelledByThreshold === true
							? null
							: children}
					</>
				)}
			</div>
		)
	} else {
		return null
	}

	return (
		<div className={`step ${isCompleted && !isOpen ? 'step-completed' : ''}`}>
			<div className="flex al-center jst-between">
				<div className="flex al-center">
					{isCompleted && (
						<div className="mr-2 flex al-center">
							<FaCheckCircle className="green fs-md" />
						</div>
					)}
					{step === 'SALE' ? (
						<p className="blue fw-500 fs-md">SATIŞ</p>
					) : (
						<p className="blue">
							<span className="underline">{step + '. Adım'}</span>{' '}
							<span className="fw-500 fs-md">
								{getInpoundmentStepName(type, step) &&
									getInpoundmentStepName(type, step)}
							</span>
						</p>
					)}
				</div>
				{!isOpen && (
					<Button classes="fw-500" onClick={() => setIsOpen(true)}>
						<FaPen className="mr-2 fs-xsm" />
						Düzenle
					</Button>
				)}
				{isOpen && isCompleted && (
					<Button classes="fw-500 red" onClick={() => setIsOpen(false)}>
						<FaTimes className="mr-2 fs-xsm" />
						Kapat
					</Button>
				)}
			</div>
			{isOpen && children}
		</div>
	)
}
