import React from 'react'
import InpoundmentStep from '../../../inpoundments/InpoundmentStep'
import CustodianInfo from '../../../CustodianInfo'

export default function VehicleInpoundmentStep3() {
	return (
		<InpoundmentStep step={3}>
			<div className="mt-4"></div>
			<CustodianInfo />
		</InpoundmentStep>
	)
}
