import { useContext } from 'react'
import { DebtorContext } from '../../components/debtor/Debtor'

export const useDebtorContext = () => {
	return useContext(DebtorContext)
}
