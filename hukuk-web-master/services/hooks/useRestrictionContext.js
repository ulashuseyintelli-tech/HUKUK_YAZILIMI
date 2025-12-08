import { createContext, useContext } from 'react'

export const RestrictionContext = createContext()
export const useRestrictionContext = () => {
	return useContext(RestrictionContext)
}
