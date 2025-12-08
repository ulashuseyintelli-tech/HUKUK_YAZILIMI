import React, { useEffect, useState } from 'react'
import { FaPen } from 'react-icons/fa'
import { handleError } from '../../../helpers/Helper'
import { updateAssetRestriction } from '../../../services/assetService'
import useInpoundmentContext from '../../../services/hooks/useInpoundmentContext'
import { updateNormalAsset } from '../../../services/normalAssetService'
import { useSocket } from '../../../services/socket'
import Button from '../../anBrains/Button'
import Modal from '../../anBrains/Modal'
import InpoundmentStep from '../../inpoundments/InpoundmentStep'
import InpoundmentStepper from '../../inpoundments/InpoundmentStepper'
import RestrictionTable from '../../inpoundments/RestrictionTable'
import TaskRadar from '../../task/TaskRadar'
import Assets100 from '../commonSteps/Assets100'
import AssetsAppraisalResult from '../commonSteps/AssetsAppraisalResult'
import AssetsAppraisalResultNotification from '../commonSteps/AssetsAppraisalResultNotification'

export default function NormalAsset({ asset, setAsset }) {
	const [isOpen, setIsOpen] = useState(false)
	const [step, setStep] = useState(1)

	const { debtorTasks } = useInpoundmentContext()

	useEffect(() => {
		watchAssetChanges()
		return () => {
			unwatchAssetChanges()
		}
	}, [asset])

	const socket = useSocket()

	const watchAssetChanges = () => {
		socket.on(`${asset._id} reload`, reloadAsset)
	}

	const reloadAsset = data => {
		setAsset(data.doc)
	}

	const unwatchAssetChanges = () => {
		socket.off(`${asset._id} reload`)
	}

	const update = (prop, val) => {
		return updateNormalAsset(asset._id, prop, val)
			.then(res => {
				setAsset(res.data)
			})
			.catch(handleError)
	}

	const updateRestriction = (prop, val) => {
		updateAssetRestriction('NORMAL_ASSET', asset._id, prop, val)
			.then(res => {
				setAsset(res.data)
			})
			.catch(handleError)
	}

	const tasks = debtorTasks.filter(task => task.assetId === asset._id)

	return (
		<>
			<Modal visible={isOpen} close={() => setIsOpen(false)}>
				<div className="normal-asset-modal">
					<div>
						<p className="fs-md fw-600 mb-10">
							Haczedilmiş Mal - {asset.name} {asset.type} {asset.brand}{' '}
							{asset.size}
						</p>
					</div>
					<div className="w-100">
						<InpoundmentStepper
							assetType="NORMAL_ASSET"
							customCurrentStep={step}
							setCustomCurrentStep={setStep}
							customAsset={asset}
						/>
						<div className="step-item-divider"></div>
						{asset && asset.restriction.isCancelledByThreshold && (
							<div className="mt-10">
								<RestrictionTable
									disableCloseOnClick
									customAsset={asset}
									customUpdate={updateRestriction}
								/>
							</div>
						)}
						<InpoundmentStep
							type="NORMAL_ASSET"
							step={1}
							customCurrentStep={step}
						>
							<RestrictionTable
								disableCloseOnClick
								customAsset={asset}
								customUpdate={updateRestriction}
							/>
						</InpoundmentStep>
						<InpoundmentStep
							type="NORMAL_ASSET"
							step={2}
							customCurrentStep={step}
						>
							{!asset.appraisalResult && (
								<>
									<AssetsAppraisalResult
										customAsset={asset}
										customUpdate={update}
									/>
									<div className="step-item-divider"></div>
								</>
							)}
							<Assets100
								customAsset={asset}
								customUpdate={update}
								customUpdateRestriction={updateRestriction}
							/>
						</InpoundmentStep>
						<InpoundmentStep
							type="NORMAL_ASSET"
							step={3}
							customCurrentStep={step}
						>
							<AssetsAppraisalResultNotification
								customAsset={asset}
								customUpdate={update}
								customUpdateRestriction={updateRestriction}
								customType="NORMAL_ASSET"
							/>
						</InpoundmentStep>
					</div>
				</div>
			</Modal>
			<tr className="restriction-raw">
				<td>
					<div className="flex al-center">
						<button
							onClick={() => setIsOpen(true)}
							className="btn btn-cute p-2 mr-2 edit-hover"
						>
							<FaPen />
						</button>
					</div>
				</td>
				<td>{asset.name || 'Belirtilmemiş'}</td>
				<td>{asset.type || 'Belirtilmemiş'}</td>
				<td>{asset.brand || 'Belirtilmemiş'}</td>
				<td>{asset.size || 'Belirtilmemiş'}</td>
				<td>{asset.appraisalResult}</td>
				<td>
					<Button classes="blue fw-500" onClick={() => setIsOpen(true)}>
						{asset.restriction.exist
							? `${asset.restriction?.table?.length} takyidat`
							: 'Takyidat yok'}
					</Button>
				</td>
				<td>
					<TaskRadar
						always={tasks.length > 0}
						top="-1.5rem"
						right="50%"
						onClick={() => setIsOpen(true)}
					></TaskRadar>
				</td>
			</tr>
		</>
	)
}
