import React, { useContext } from 'react'
import { FaLongArrowAltLeft } from 'react-icons/fa'
import { CASE_TYPES_WITHOUT_BACK_BUTTON } from '../../constants'
import { InpoundmentContext } from '../../pages/takip/CaseInpoundmentDetails'
import useInpoundmentContext from '../../services/hooks/useInpoundmentContext'
import Button from '../anBrains/Button'

export default function InpoundmentBackButton() {
	const {
		assetProps: { visibleAsset, setVisibleAssetId },
		currentCase,
	} = useInpoundmentContext()

	if (
		visibleAsset &&
		!CASE_TYPES_WITHOUT_BACK_BUTTON.includes(currentCase.type)
	) {
		return (
			<Button
				theme="basic"
				classes="fw-500 mb-4"
				onClick={() => setVisibleAssetId(null)}
			>
				<FaLongArrowAltLeft className="mr-2" />
				Sorgularda Çıkan Kayıtlar
			</Button>
		)
	}

	return null
}
