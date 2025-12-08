import Layout from '../components/Layout'
import Button from '../components/anBrains/Button'
import { useEffect, useState } from 'react'
import { STATUS } from '../constants'
import LoadingAnimation from '../components/anBrains/animations/LoadingAnimation/LoadingAnimation'
import Modal from '../components/anBrains/Modal'
import NewClientForm from '../components/forms/NewClientForm'
import { getClientList } from '../services/clientService'
import { getDebtorName } from '../helpers/Helper'
import Input from '../components/anBrains/Input'
import useSearch from '../services/hooks/useSearch'

export default function Lawyers(props) {
	const [status, setStatus] = useState(STATUS.LOADING)
	const [clients, setClients] = useState([])
	const [isFormOpen, setIsFormOpen] = useState(false)

	const { setSearchTerm, search } = useSearch({
		items: clients,
		sort: (a, b) =>
			`${getDebtorName(a)}`.localeCompare(getDebtorName(b), 'tr-TR'),
	})

	useEffect(() => {
		prepare()
	}, [])

	const prepare = async () => {
		await getClientList()
			.then(res => {
				setClients(res.data)
			})
			.catch(e => alert('Hata'))
		setStatus(STATUS.NORMAL)
	}

	const handleFormOpen = () => setIsFormOpen(!isFormOpen)

	return (
		<Layout {...props}>
			<div className="parties-page">
				<LoadingAnimation status={status} />
				<Modal close={handleFormOpen} visible={isFormOpen}>
					<NewClientForm
						clients={clients}
						setClients={setClients}
						close={handleFormOpen}
					/>
				</Modal>

				<div className="container">
					<div className="pt-8"></div>
					<div className="flex al-center jst-between">
						<div className="flex al-center">
							<h1 className="mr-4">Müvekkiller</h1>
							<Input
								classes="bg-white"
								placeholder="Arama terimi"
								onChange={e => setSearchTerm(e.target.value)}
							/>
						</div>

						<Button theme="blue" onClick={handleFormOpen}>
							Yeni Müvekkil
						</Button>
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
								{search().map(client => {
									return (
										<tr>
											<td>{getDebtorName(client)}</td>
											<td>{client.email}</td>
											<td>{client.identityNumber}</td>
											<td>
												{client.phoneNumbers.map(number => {
													return (
														<span>
															{number.number || number} <br />
														</span>
													)
												})}
											</td>
											<td>{client.cases.length}</td>
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
