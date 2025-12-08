import Layout from '../components/Layout'
import Button from '../components/anBrains/Button'
import { useEffect, useState } from 'react'
import { STATUS } from '../constants'
import LoadingAnimation from '../components/anBrains/animations/LoadingAnimation/LoadingAnimation'
import NewLawyerForm from '../components/forms/NewLawyerForm'
import Modal from '../components/anBrains/Modal'
import { getAllLawyers } from '../services/userService'
import { getDebtorName } from '../helpers/Helper'
import Input from '../components/anBrains/Input'
import useSearch from '../services/hooks/useSearch'

export default function Lawyers(props) {
	const [status, setStatus] = useState(STATUS.LOADING)
	const [lawyers, setLawyers] = useState([])
	const [isFormOpen, setIsFormOpen] = useState(false)

	const { setSearchTerm, search } = useSearch({
		items: lawyers,
		sort: (a, b) =>
			`${getDebtorName(a)}`.localeCompare(getDebtorName(b), 'tr-TR'),
	})

	useEffect(() => {
		prepare()
	}, [])

	const prepare = async () => {
		await getAllLawyers()
			.then(res => {
				setLawyers(res.data)
			})
			.catch(e => alert('Hata'))
		setStatus(STATUS.NORMAL)
	}

	const handleFormOpen = () => setIsFormOpen(!isFormOpen)

	return (
		<Layout {...props}>
			<LoadingAnimation status={status} />
			<Modal close={handleFormOpen} visible={isFormOpen}>
				<div className="parties-form">
					<NewLawyerForm
						lawyers={lawyers}
						setLawyers={setLawyers}
						close={handleFormOpen}
					/>
				</div>
			</Modal>
			<div className="parties-page">
				<div className="container ">
					<div className="pt-8"></div>
					<div className="flex al-center jst-between">
						<div className="flex al-center">
							<h1 className="mr-4">Avukatlar</h1>
							<Input
								classes="bg-white"
								placeholder="Arama terimi"
								onChange={e => setSearchTerm(e.target.value)}
							/>
						</div>
						<Button theme="blue" onClick={handleFormOpen}>
							Yeni Avukat
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
								{search().map(lawyer => {
									return (
										<tr>
											<td>
												{lawyer.name} {lawyer.surname}
											</td>
											<td>{lawyer.email}</td>
											<td>{lawyer.identityNumber}</td>
											<td>
												{lawyer.phoneNumbers.map(number => {
													return (
														<span>
															{number.number || number} <br />
														</span>
													)
												})}
											</td>
											<td>{lawyer.cases.length}</td>
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
