import InpoundmentStep from '../../../inpoundments/InpoundmentStep'
import InpoundmentCreation from '../../../inpoundments/InpoundmentCreation'

export default function ShareInpoundmentStep1({ company }) {
	return (
		<InpoundmentStep step={1}>
			<InpoundmentCreation customAddresses={company?.addresses || []} />
		</InpoundmentStep>
	)
}
