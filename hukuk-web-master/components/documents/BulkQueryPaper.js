import React, { Component } from 'react'
import {
	getBulkQueryText,
	getDebtorIdentityString,
	getDebtorName,
} from '../../helpers/Helper'

export default class BulkQueryPaper extends Component {
	render() {
		let {
			executionOffice,
			executionFileNumber,
			paperDebtors,
			queryList,
			lawyers,
			lawOffice,
			bankList,
		} = this.props

		executionOffice = executionOffice[0]

		return (
			<page size="A4" id="printSection">
				<div className="column al-center bold">
					<p>T.C.</p>
					<p>{executionOffice.city}</p>
					<p className="mb-8">{executionOffice.name}</p>
				</div>
				<p className="bold">Dosya No: {executionFileNumber}</p>
				<p>Alacaklı Vekili geldi.</p>
				<div>
					{paperDebtors.map(debtor => {
						return (
							<p className="bold">
								{getDebtorName(debtor)}({getDebtorIdentityString(debtor)})
							</p>
						)
					})}
				</div>
				<div>
					{queryList.map((query, index) => {
						const isLast = index === queryList.length - 1
						return (
							<React.Fragment>
								<p>
									{index + 1} - {getBulkQueryText(query, lawOffice)} 
								</p>
								{query === 'BANK' &&
									(bankList || lawOffice.bulkQueryBankList).map(bank => {
										return <p className="fw-500">{bank}</p>
									})}
								{isLast && 'talep ederim dedi.'}
							</React.Fragment>
						)
					})}
				</div>
				<div className="mt-8 column al-end jst-center">
					Alacaklı Vekili
					{lawyers.map(lawyer => {
						return (
							<p>
								Av. {lawyer.name} {lawyer.surname}
							</p>
						)
					})}
				</div>
			</page>
		)
	}
}
