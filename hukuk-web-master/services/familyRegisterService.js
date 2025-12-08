import { headerWithToken, FAMILY_MEMBER_URL } from '../config'
import Axios from 'axios'

export const createFamilyMember = (caseId, debtorId, familyMember, queryId) => {
	const url = `${FAMILY_MEMBER_URL}/${caseId}/${debtorId}/${queryId}`
	return Axios.post(url, familyMember, headerWithToken())
}

export const updateFamilyRegister = (
	familyMemberId,
	property,
	propertyValue,
) => {
	const url = `${FAMILY_MEMBER_URL}/${familyMemberId}/${property}`
	return Axios.put(url, { propertyValue }, headerWithToken())
}
