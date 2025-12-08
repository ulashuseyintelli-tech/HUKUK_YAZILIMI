import { useEffect } from 'react'
import BankQuery from './BankQuery'
import { getNotificationById } from '../../../services/notificationService'
import useInpoundmentContext from '../../../services/hooks/useInpoundmentContext'

export default function BankQueryList() {
	const {
		assetProps: { assets, visibleAsset },
	} = useInpoundmentContext()

	if (visibleAsset) {
		return <BankQuery bankQuery={visibleAsset} />
	}

	return (
		<div className="bank-query-list">
			{assets.map(bankQuery => {
				return <BankQuery key={bankQuery._id} bankQuery={bankQuery} />
			})}
		</div>
	)
}
