import Layout from '../components/Layout'
import { useEffect, useState } from 'react'
import { getCases } from '../services/caseService'
import { CASE_STATUS, CASE_TYPE, STATUS } from '../constants'
import LoadingAnimation from '../components/anBrains/animations/LoadingAnimation/LoadingAnimation'
import Link from 'next/link'
import router from 'next/router'
import { getDebtors } from '../services/deptorService'
import { getClients } from '../services/clientService'
import { getDebtorName } from '../helpers/Helper'

export default function davalar(props) {
	const [status, setStatus] = useState(STATUS.LOADING)
	const [cases, setCases] = useState([])
	const [statusFilter, setStatusFilter] = useState('')
	const [typeFilter, setTypeFilter] = useState('')
	const [debtorFilter, setDebtorFilter] = useState('')
	const [clientFilter, setClientFilter] = useState('')

	const [debtors, setDebtors] = useState([])
	const [clients, setClients] = useState([])

	useEffect(() => {
		prepare()
	}, [])

	const prepare = async () => {
		_getDebtors()
		_getClients()
		await getCases()
			.then(res => {
				setCases(res.data)
			})
			.catch(e => alert('Hata'))
		setStatus(STATUS.NORMAL)
	}

	const _getDebtors = () => {
		getDebtors()
			.then(res => {
				setDebtors(res.data)
			})
			.catch(e => console.log(e))
	}

	const _getClients = () => {
		getClients()
			.then(res => {
				setClients(res.data)
			})
			.catch(e => console.log(e))
	}

	const filter = () => {
		return cases.filter(doc => {
			return statusFilter
				? doc.status === statusFilter
				: true && typeFilter
				? doc.type === typeFilter
				: true && debtorFilter
				? doc.debtorIds.includes(debtorFilter)
				: true && clientFilter
				? doc.clientIds.includes(clientFilter)
				: true
		})
	}

	return (
		<Layout {...props}>
			<LoadingAnimation status={status} />
			<div className="container mt-10 home">
				<div className="flex al-center jst-between pt-10">
					<h1 className="fs-xl">Tüm Takipler</h1>
					<div className="flex al-end">
						<div className="flex al-center mr-6">
							<div className="mr-4 fs-sm">
								<p className="fw-500 mb-1">Form</p>
								<select
									style={{ maxWidth: '130px' }}
									className="input"
									value={typeFilter}
									onChange={e => setTypeFilter(e.target.value)}
								>
									<option value="">Tüm Formlar</option>
									{Object.keys(CASE_TYPE).map(key => {
										return <option value={key}>{CASE_TYPE[key]}</option>
									})}
								</select>
							</div>
							<div className="mr-4 fs-sm">
								<p className="fw-500 mb-1">Statü</p>
								<select
									className="input"
									value={statusFilter}
									onChange={e => setStatusFilter(e.target.value)}
								>
									<option value="">Tüm Statüler</option>
									{Object.values(CASE_STATUS).map(val => {
										return <option value={val}>{val}</option>
									})}
								</select>
							</div>
							<div className="mr-4 fs-sm">
								<p className="fw-500 mb-1">Borçlu</p>
								<select
									style={{ maxWidth: '120px' }}
									className="input"
									value={debtorFilter}
									onChange={e => setDebtorFilter(e.target.value)}
								>
									<option value="">Tüm Borçlular</option>
									{debtors.map(deb => {
										return <option value={deb._id}>{getDebtorName(deb)}</option>
									})}
								</select>
							</div>
							<div className="mr-4 fs-sm">
								<p className="fw-500 mb-1">Müvekkil</p>
								<select
									style={{ maxWidth: '130px' }}
									className="input"
									value={clientFilter}
									onChange={e => setClientFilter(e.target.value)}
								>
									<option value="">Tüm Müvekkiller</option>
									{clients.map(client => {
										return (
											<option value={client._id}>
												{getDebtorName(client)}
											</option>
										)
									})}
								</select>
							</div>
						</div>
						<Link href="/fiili-istihbarat-listesi">
							<a className="btn btn-cute fw-500 mr-4">
								Fiili İstihbarat Listesi
							</a>
						</Link>
						<Link href="/fiili-haciz-listesi">
							<a className="btn btn-orange fw-600">Fiili Haciz Listesi</a>
						</Link>
					</div>
				</div>
				<div className="mt-8">
					<table className="restriction-list bg-white w-100">
						<tr className="restriction-row w-100">
							<th>Takip No</th>
							<th>Dosya Numarası</th>
							<th>Takip Türü</th>
							<th>Takip Statüsü</th>
							<th>Son Güncellenme Tarihi</th>
							<th>Aksiyon</th>
						</tr>
						<tbody>
							{filter().map(doc => {
								return (
									<tr
										className="restriction-row cases-row"
										onDoubleClick={() => router.push(`/takip/${doc.number}`)}
									>
										<td>{doc.number}</td>
										<td>{doc.executionFileNumber}</td>
										<td>{CASE_TYPE[doc.type]}</td>
										<td>{doc.status}</td>
										<td>
											{new Date(
												doc.updatedAt || doc.createdAt,
											).toLocaleString()}
										</td>
										<td>
											<Link href={`/takip/${doc.number}`}>
												<a className="blue ">Görüntüle</a>
											</Link>
										</td>
									</tr>
								)
							})}
						</tbody>
					</table>
				</div>
			</div>
		</Layout>
	)
}
