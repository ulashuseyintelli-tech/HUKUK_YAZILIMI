import React, { useEffect, useState } from 'react'
import LoadingAnimation from '../../components/anBrains/animations/LoadingAnimation/LoadingAnimation'
import Button from '../../components/anBrains/Button'
import CaseNav from '../../components/case/CaseNav'
import Layout from '../../components/Layout'
import { STATUS } from '../../constants'
import { findDistrainableDebtors } from '../../helpers/Helper'
import printer from '../../printer'
import { getCaseByNumber } from '../../services/caseService'
import { getDebtors } from '../../services/deptorService'

export default function CasePrinter(props) {
	const { number } = props
	const [status, setStatus] = useState(STATUS.LOADING)
	const [currentCase, setCurrentCase] = useState(null)
	const [debtors, setDebtors] = useState([])

	useEffect(() => {
		preapare()
	}, [])

	const preapare = async () => {
		await getCase()
		setStatus(STATUS.NORMAL)
	}

	const getCase = async () => {
		await getCaseByNumber(number)
			.then(async res => {
				setCurrentCase(res.data)
				await _getDebtors(res.data)
			})
			.catch(e => {
				console.log(e)
				alert('Hata')
			})
	}

	const _getDebtors = async currentCase => {
		await getDebtors()
			.then(res => {
				const distrainableDebtors = findDistrainableDebtors(
					currentCase,
					res.data,
				)
				setDebtors([...distrainableDebtors])
			})
			.catch(e => {
				console.log(e)
				alert('Hata')
			})
	}

	if (status === STATUS.LOADING) return <LoadingAnimation />

	return (
		<Layout {...props}>
			<CaseNav currentCase={currentCase} debtors={debtors} />
			<div>
				<table className="restriction-list">
					<tr className="restriction-row">
						<th className="fw-500">Ad</th>
						<th className="fw-500">Talep</th>
						<th className="fw-500">Müzekkere</th>
						<th className="fw-500">Zarf</th>
						<th className="fw-500">Toplu</th>
					</tr>
					{Object.keys(printer).map(key => {
						const item = printer[key]
						return (
							<tr className="restriction-row">
								<td>
									<p>{item.name}</p>
								</td>
								<td>
									{item.request && <Button theme="blue">Talep Yazdır</Button>}
								</td>
								<td>
									{item.warrant && (
										<Button theme="blue">Müzekkere Yazdır</Button>
									)}
								</td>
								<td>
									{item.envelope && <Button theme="blue">Zarf Yazdır</Button>}
								</td>
								<td>
									<Button classes="fw-500 blue">Yazdır</Button>
								</td>
							</tr>
						)
					})}
				</table>
			</div>
		</Layout>
	)
}

CasePrinter.getInitialProps = ({ query }) => {
	return {
		number: query.number,
	}
}
