import Layout from '../components/Layout'
import { useEffect, useState } from 'react'
import { STATUS } from '../constants'
import LoadingAnimation from '../components/anBrains/animations/LoadingAnimation/LoadingAnimation'
import { getDebtorsList } from '../services/deptorService'
import { getDebtorName } from '../helpers/Helper'
import useSearch from '../services/hooks/useSearch'
import Input from '../components/anBrains/Input'

export default function Lawyers(props) {
	const [status, setStatus] = useState(STATUS.LOADING)
	const [debtors, setDebtors] = useState([])

	const { setSearchTerm, search } = useSearch({
		items: debtors,
		sort: (a, b) =>
			`${getDebtorName(a)}`.localeCompare(getDebtorName(b), 'tr-TR'),
	})

	useEffect(() => {
		prepare()
	}, [])

	const prepare = async () => {
		await getDebtorsList()
			.then(res => {
				setDebtors(res.data)
			})
			.catch(e => alert('Hata'))
		setStatus(STATUS.NORMAL)
	}

	return (
		<Layout {...props}>
			<div className="parties-page">
				<LoadingAnimation status={status} />

				<div className="container">
					<div className="pt-8"></div>
					<div className="flex al-center jst-between">
						<div className="flex al-center">
							<h1 className="mr-4">Borçlular</h1>
							<Input
								classes="bg-white"
								placeholder="Arama terimi"
								onChange={e => setSearchTerm(e.target.value)}
							/>
						</div>
					</div>
					<div className="mt-8">
						<table className="restriction-list bg-white w-100">
							<tr className="restriction-raw w-100">
								<th>Ad Soyad</th>
								<th>E-posta adresi</th>
								<th>T.C. Kimlik Numarası</th>
								<th>Telefon Numaraları</th>
								<th>Takip Sayısı</th>
							</tr>
							<tbody>
								{search().map(debtor => {
									return (
										<tr>
											<td>{getDebtorName(debtor)}</td>
											<td>{debtor.email}</td>
											<td>{debtor.identityNumber}</td>
											<td>
												{debtor.phoneNumbers.map(number => {
													return (
														<span>
															{number.number} <br />
														</span>
													)
												})}
											</td>
											<td>{debtor.cases.length}</td>
										</tr>
									)
								})}
							</tbody>
						</table>
					</div>
				</div>
			</div>
		</Layout>
	)
}
