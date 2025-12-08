import React, { useContext } from 'react'
import { ActiveLink } from '../anBrains/ActiveLink'
import { InpoundmentContext } from '../../pages/takip/CaseInpoundmentDetails'
import { CASE_TYPE, INPOUNDMENT_PROPERTIES } from '../../constants'
import Link from 'next/link'
import { getAssetName, getDebtorName } from '../../helpers/Helper'
import { FaUser } from 'react-icons/fa'
import Button from '../anBrains/Button'
import Router from 'next/router'

export default function CaseNav() {
	const { currentCase, debtors, queryDebtorId, queryAssetType, assetProps } =
		useContext(InpoundmentContext)

	const queryDebtor = debtors.find(d => d._id === queryDebtorId)
	if (!queryDebtor) {
		return null
	}

	return (
		<div className="zekiye-header" id="case-nav">
			<div className="flex al-center">
				<Link href={`/takip/${currentCase.number}`}>
					<a>
						<h1>
							{currentCase.executionFileNumber} nolu dosya{' '}
							{CASE_TYPE[currentCase.type]}
						</h1>
					</a>
				</Link>
				{/* <div className="badge fw-600 ml-4 fs-sm">{currentCase.status}</div> */}
				{queryDebtor && (
					<>
						<p className="mx-4"> / </p>
						<Link
							href={`/takip/${currentCase.number}?debtorId=${queryDebtor._id}`}
						>
							<a className="flex al-center fs-nm">
								<FaUser className="mr-2 blue" />
								<p className="fw-500 blue fs-nm">
									{getDebtorName(queryDebtor)}
								</p>
							</a>
						</Link>
					</>
				)}
				{queryAssetType &&
					queryAssetType !== 'INTEL' &&
					queryAssetType !== 'NOTIFICATION' &&
					currentCase.type !== '8' && (
						<>
							<p className="mx-4"> / </p>
							<Link
								href={`/takip/${currentCase.number}/haciz?debtorId=${queryDebtor._id}&assetType=${queryAssetType}`}
							>
								<a className="flex al-center">
									{Object.values(INPOUNDMENT_PROPERTIES).find(
										p => p.key === queryAssetType,
									) &&
										React.cloneElement(
											Object.values(INPOUNDMENT_PROPERTIES).find(
												p => p.key === queryAssetType,
											).icon,
											{ className: 'mr-2 orange' },
										)}
									<p className="fw-500 orange">
										{getAssetName(queryAssetType)} Listesi
									</p>
								</a>
							</Link>
						</>
					)}
			</div>
		</div>
	)
}
