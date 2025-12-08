import React, { useState } from 'react'
import Button from '../anBrains/Button'
import TaxOfficeAddressRequest from './TaxOfficeAddressRequest'
import ChamberOfCommerceAddressRequest from './ChamberOfCommerceAddressRequest'
import LawEnforcersAddressRequest from './LawEnforcersAddressRequest'

export default function TaskDocuments({ task, text, classes, name }) {
	const [printingDoc, setPrintingDoc] = useState(null)

	let {
		caseClients,
		caseDues,
		caseDebtors,
		caseLawyers,
		caseExecutionOffices,
		currentCase,
	} = task

	const printDoc = docType => {
		setPrintingDoc(name)
		setTimeout(() => {
			window.print()
		}, 500)
	}

	const docProps = {
		clients: caseClients,
		dues: caseDues,
		debtors: caseDebtors,
		lawyers: caseLawyers,
		executionOffice: caseExecutionOffices[0],
		currentCase: currentCase[0],
	}

	return (
		<div>
			{printingDoc === 'law-enforcers' && (
				<LawEnforcersAddressRequest {...docProps} />
			)}
			{printingDoc === 'tax-office-address-req' && (
				<TaxOfficeAddressRequest {...docProps} />
			)}
			{printingDoc === 'chamber-of-commerce-req' && (
				<ChamberOfCommerceAddressRequest {...docProps} />
			)}
			{printingDoc === 'mernis-address' && (
				<TaxOfficeAddressRequest {...docProps} />
			)}
			<Button theme="green" classes={`w-100 ${classes}`} onClick={printDoc}>
				{text}
			</Button>
		</div>
	)
}
