import { getAuthToken } from './services/userService'

// export const API_URL = `http://localhost:8081`
export const API_URL = `https://api.toprak.io`
export const USER_URL = `${API_URL}/user`
export const LAW_OFFICE_URL = `${API_URL}/lawOffice`
export const LAWYER_URL = `${API_URL}/lawyer`
export const CLIENT_URL = `${API_URL}/client`
export const DEBTOR_URL = `${API_URL}/debtor`
export const PAYMENT_URL = `${API_URL}/payment`
export const DUE_URL = `${API_URL}/due`
export const EXECUTION_OFFICE_URL = `${API_URL}/executionOffice`
export const CASE_URL = `${API_URL}/case`
export const TASK_URL = `${API_URL}/task`
export const NOTIFICATION_URL = `${API_URL}/notification`
export const QUERY_URL = `${API_URL}/query`
export const VEHICLE_URL = `${API_URL}/vehicle`
export const SSI_URL = `${API_URL}/ssi`
export const TAX_DUE_URL = `${API_URL}/taxDue`
export const BANK_QERY_URL = `${API_URL}/bankQuery`
export const IMMOVABLE_URL = `${API_URL}/immovable`
export const CREDITOR_URL = `${API_URL}/creditor`
export const DE_FACTO_URL = `${API_URL}/deFacto`
export const SALE_URL = `${API_URL}/sale`
export const COMPANY_URL = `${API_URL}/company`
export const SHARE_URL = `${API_URL}/share`
export const CREDITOR_CASE_URL = `${API_URL}/creditorCase`
export const COMMITMENT_URL = `${API_URL}/commitment`
export const CUSTOMS_DUE_URL = `${API_URL}/customsDue`
export const NORMAL_ASSET_URL = `${API_URL}/normalAsset`
export const PATENT_URL = `${API_URL}/patent`
export const GUARANTEE_URL = `${API_URL}/guarantee`
export const EXPENSE_URL = `${API_URL}/expense`
export const COLLECTION_URL = `${API_URL}/collection`
export const FAMILY_MEMBER_URL = `${API_URL}/familyMember`
export const COURT_URL = `${API_URL}/court`
export const INTEL_URL = `${API_URL}/intel`
export const ASSET_URL = `${API_URL}/asset`
export const TAX_OFFICE_URL = `${API_URL}/taxOffice`
export const LAND_REGISTRY_OFFICE_URL = `${API_URL}/landRegistryOffice`
export const CUSTOMS_OFFICE_URL = `${API_URL}/customsOffice`
export const PLEDGED_MOVABLE_URL = `${API_URL}/pledgedMovable`

export const headerWithToken = token => {
	const authToken = getAuthToken()
	return {
		headers: {
			'x-auth-token':
				'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI1ZTZlN2Q5ZjlkNTFmODI3YTRkZTRkNjkiLCJlbWFpbCI6Im9va25ka3JrQGdtYWlsLmNvbSIsImxhd09mZmljZUlkIjoiNWU2ZWE3NTFmMTYzYmMxNjc0ZjZhNWNlIiwibmFtZSI6IkjDvHNleWluIiwic3VybmFtZSI6IlRlbGxpIiwiaWF0IjoxNjA1ODE3MjQ1LCJleHAiOjE5NjU4MTM2NDV9.y8G9uaV83qOUIxIm3YGMm1CEskUj89xdSCjAZaHCOxQ',
		},
	}
}
