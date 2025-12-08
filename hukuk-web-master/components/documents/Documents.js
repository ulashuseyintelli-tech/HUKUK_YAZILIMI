import React, { useState } from 'react'
import Button from '../anBrains/Button'
import { FaPrint, FaChevronRight } from 'react-icons/fa'
import OrderOfPayment from './OrderOfPayment'
import EnforcementRequest from './EnforcementRequest'
import NoticePaper from './NoticePaper'

export default function Documents({
	currentCase,
	executionOffice,
	clients,
	lawyers,
	debtors,
	dues,
}) {
	const [printingDoc, setPrintingDoc] = useState(null)

	const printDoc = docType => {
		setPrintingDoc(docType)
		setTimeout(() => {
			window.print()
		}, 500)
	}

	return (
		<div>
			{printingDoc === 'enforcement' && (
				<EnforcementRequest
					currentCase={currentCase}
					clients={clients}
					lawyers={lawyers}
					debtors={debtors}
					dues={dues}
				/>
			)}
			{printingDoc === 'order' && (
				<OrderOfPayment
					currentCase={currentCase}
					clients={clients}
					lawyers={lawyers}
					debtors={debtors}
					dues={dues}
					executionOffice={executionOffice}
				/>
			)}
			{printingDoc === 'notice' && (
				<NoticePaper
					currentCase={currentCase}
					clients={clients}
					lawyers={lawyers}
					debtors={debtors}
					dues={dues}
				/>
			)}
			<details>
				<summary>
					<div className="btn btn-basic fs-sm mr-4 bold">
						<FaPrint className="mr-2" />
						Yazdır
					</div>
				</summary>
				<div className="nav-summary al-start">
					<Button onClick={() => printDoc('enforcement')} classes="mb-2">
						<FaChevronRight className="mr-2 fs-xsm" />
						<span className="fw-500 fs-nm">Takip Talebi</span>
					</Button>
					<Button onClick={() => printDoc('order')} classes="mb-2">
						<FaChevronRight className="mr-2 fs-xsm" />
						<span className="fw-500 fs-nm">Ödeme Emri</span>
					</Button>
					<Button onClick={() => printDoc('notice')}>
						<FaChevronRight className="mr-2 fs-xsm" />
						<span className="fw-500 fs-nm">Tebliğ Mazbatası</span>
					</Button>
				</div>
			</details>
		</div>
	)
}
