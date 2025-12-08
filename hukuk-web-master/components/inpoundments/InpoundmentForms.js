import React, { useContext } from 'react'
import NewVehicleForm from '../debtorAssets/vehicle/NewVehicleForm'
import NewTaxDueForm from '../debtorAssets/taxDue/NewTaxDueForm'
import NewImmovableForm from '../debtorAssets/immovable/NewImmovableForm'
import NewShareForm from '../forms/NewShareForm'
import NewPatentForm from '../debtorAssets/patent/NewPatentForm'
import { QUERY_TYPE } from '../../constants'
import NewCreditorCaseForm from '../debtorAssets/creditorCase/NewCreditorCaseForm'
import NewCustomsDueForm from '../debtorAssets/custom/NewCustomsDueForm'
import NewSsiForm from '../debtorAssets/ssi/NewSsiForm'
import { InpoundmentContext } from '../../pages/takip/CaseInpoundmentDetails'
import FamilyMemberForm from '../debtorAssets/familyMember/FamilyMemberForm'

export default function InpoundmentForms() {
	const { visibleModal } = useContext(InpoundmentContext)

	return (
		<div>
			<NewVehicleForm visible={visibleModal === QUERY_TYPE.VEHICLE} />
			<NewSsiForm visible={visibleModal === QUERY_TYPE.SSI} />
			<NewTaxDueForm visible={visibleModal === QUERY_TYPE.TAX_DUE} />
			<NewImmovableForm visible={visibleModal === QUERY_TYPE.IMMOVABLE} />
			<NewShareForm visible={visibleModal === QUERY_TYPE.SHARE} />
			<NewCreditorCaseForm
				visible={visibleModal === QUERY_TYPE.CREDITOR_CASE}
			/>
			<NewCustomsDueForm visible={visibleModal === QUERY_TYPE.CUSTOMS} />
			<NewPatentForm visible={visibleModal === QUERY_TYPE.PATENT} />
			<FamilyMemberForm visible={visibleModal === QUERY_TYPE.FAMILY_REGISTER} />
		</div>
	)
}
