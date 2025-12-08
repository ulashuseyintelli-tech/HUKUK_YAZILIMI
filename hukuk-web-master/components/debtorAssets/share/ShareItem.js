import React, { useState, useEffect } from 'react'
import { STATUS } from '../../../constants'
import LoadingCircle from '../../anBrains/animations/LoadingCircle'
import Button from '../../anBrains/Button'
import ShareInpoundmentStep1 from './steps/ShareInpoundmentStep1'
import ShareInpoundmentStep2 from './steps/ShareInpoundmentStep2'
import ShareInpoundmentStep3 from './steps/ShareInpoundmentStep3'
import InpoundmentSale from '../../inpoundments/InpoundmentSale'
import useInpoundmentContext from '../../../services/hooks/useInpoundmentContext'
import InpoundmentBackButton from '../../inpoundments/InpoundmentBackButton'
import InpoundmentStepper from '../../inpoundments/InpoundmentStepper'
import { getThirdPersonById } from '../../../services/deptorService'
import { getDebtorName } from '../../../helpers/Helper'

export default function ShareItem({ share }) {
	const {
		assetProps: { visibleAsset, setVisibleAssetId, currentStep },
	} = useInpoundmentContext()

	const [companyStatus, setCompanyStatus] = useState(STATUS.LOADING)
	const [company, setCompany] = useState(null)

	useEffect(() => {
		getShareCompany()
	}, [share])

	const getShareCompany = async () => {
		if (share.companyId) {
			setCompanyStatus(STATUS.LOADING)
			await getThirdPersonById(share.companyId)
				.then(res => {
					setCompany(res.data)
					setCompanyStatus(STATUS.NORMAL)
				})
				.catch(e => {
					alert('Hat')
					setCompanyStatus(STATUS.ERROR)
				})
		}
	}

	return (
		<div className={`${visibleAsset ? '' : 'inpoundment-asset-card'}`}>
			<InpoundmentBackButton />
			<Button
				classes="column al-start"
				onClick={() => setVisibleAssetId(share._id)}
			>
				<div className="flex al-center">
					{share.companyId ? (
						companyStatus === STATUS.LOADING ? (
							<LoadingCircle />
						) : (
							<p className="bold fs-md">
								{getDebtorName(company)} adlı şirkette{' '}
							</p>
						)
					) : (
						<p className="bold fs-md">Henüz Şirket Belirtilmemiş </p>
					)}
					<p className="bold fs-md ml-2"> %{share.sharePercentage} Hisse</p>
				</div>
				<p className="mt-1">
					Son Güncelleme:{' '}
					{new Date(share.lastUpdate).toLocaleDateString('tr-TR')}
				</p>
			</Button>
			{visibleAsset && visibleAsset._id === share._id && (
				<div className="mt-4">
					<div className="step-item-divider"></div>
					<InpoundmentStepper object={visibleAsset} />
					<ShareInpoundmentStep1 company={company} />
					<ShareInpoundmentStep2 />
					<ShareInpoundmentStep3 />
					<InpoundmentSale customCurrentStep={currentStep === 4 ? 6 : 0} />
				</div>
			)}
		</div>
	)
}
