import Layout from '../components/Layout'
import Button from '../components/anBrains/Button'
import { useEffect, useState } from 'react'
import { STATUS } from '../constants'
import { FaLongArrowAltRight } from 'react-icons/fa'
import Router from 'next/router'
import LoadingAnimation from '../components/anBrains/animations/LoadingAnimation/LoadingAnimation'
import { getLawOffices } from '../services/lawOfficeService'
import Modal from '../components/anBrains/Modal'
import NewLawyerForm from '../components/forms/NewLawyerForm'

export default function Lawyers(props) {
	const [status, setStatus] = useState(STATUS.LOADING)
	const [lawOffices, setLawOffices] = useState([])
	const [isFormOpen, setIsFormOpen] = useState(false)

	useEffect(() => {
		prepare()
	}, [])

	const prepare = async () => {
		await getLawOffices()
			.then(res => {
				setLawOffices(res.data)
			})
			.catch(e => alert('Hata'))
		setStatus(STATUS.NORMAL)
	}

	const handleFormOpen = () => setIsFormOpen(!isFormOpen)

	return (
		<Layout {...props}>
			<LoadingAnimation status={status} />
			<Modal close={handleFormOpen} visible={isFormOpen}>
				<NewLawyerForm
					lawOffices={lawOffices}
					setLawOffices={setLawOffices}
					close={handleFormOpen}
				/>
			</Modal>
			<div className="container">
				<div className="flex al-center jst-between">
					<h1>Bürolar</h1>
					<Button theme="blue">Yeni Büro</Button>
				</div>
				<div className="mt-8">
					{lawOffices.map(lawOffice => {
						return (
							<div className="flex al-center jst-between brd br-xsm p-4 mb-4">
								<div className="flex al-center">
									<p className="bold mr-4">{lawOffice.name}</p>
									{/* <p className="mr-4">{doc.way}</p>
                  <p className="underline">{doc.status}</p> */}
								</div>
								{/* <Button
									theme="basic"
									onClick={() => Router.push(`/takip/${doc.number}`)}
								>
									<span className="mr-2 fw-500">Görüntüle</span>
									<FaLongArrowAltRight />
								</Button> */}
							</div>
						)
					})}
				</div>
			</div>
		</Layout>
	)
}
