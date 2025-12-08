import { useContext } from 'react'
import { InpoundmentContext } from '../../pages/takip/CaseInpoundmentDetails'

const useInpoundmentContext = () => {
	return useContext(InpoundmentContext)
}

export default useInpoundmentContext
