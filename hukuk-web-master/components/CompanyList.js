import React, { useState, useEffect } from 'react'
import { getCompaniesByLawOffice } from '../services/companyServices'
import { STATUS } from '../constants'
import { FaCheck, FaCheckSquare, FaRegSquare, FaUser } from 'react-icons/fa'
import Button from './anBrains/Button'
import NewCompanyForm from './forms/NewCompanyForm'
import LoadingCircle from './anBrains/animations/LoadingCircle'
import Modal from './anBrains/Modal'

const CompanyList = ({ companyId, setId, setCompany }) => {
	const [status, setStatus] = useState(STATUS.LOADING)
	const [companies, setCompanies] = useState([])
	const [isListOpen, setIsListOpen] = useState(false)
	const [isFormOpen, setIsFormOpen] = useState(false)

	const selectedCompany = companies.find(c => c._id === companyId)

	useEffect(() => {
		if (setCompany) {
			setCompany(companies.find(c => c._id === companyId))
		}
	}, [companies])

	useEffect(() => {
		load()
	}, [])

	const load = async () => {
		await getCompaines()
		setStatus(STATUS.NORMAL)
	}

	const getCompaines = async () => {
		await getCompaniesByLawOffice()
			.then(res => {
				setCompanies(res.data)
			})
			.catch(e => console.log(e))
	}

	if (status === STATUS.LOADING) {
		return <LoadingCircle />
	}

	return (
		<div className="relative company-list">
			<Button
				classes="fw-500 blue"
				type="button"
				onClick={() => setIsListOpen(!isListOpen)}
			>
				<FaUser className="mr-1 fs-xsm" />
				{selectedCompany ? selectedCompany.name : 'Şirket Seç'}
			</Button>
			<Modal visible={isFormOpen} close={() => setIsFormOpen(false)}>
				<NewCompanyForm
					close={() => setIsFormOpen(false)}
					companies={companies}
					setCompanies={setCompanies}
				/>
			</Modal>
			{isListOpen && (
				<div className="creditor-list">
					{companies.length > 0 ? (
						companies.map(company => {
							const isSelected = companyId === company._id
							return (
								<Button
									type="button"
									onClick={() => setId(company._id)}
									classes={`third-person mb-2 ${
										isSelected ? 'blue fw-500' : ''
									}`}
								>
									{isSelected ? (
										<FaCheckSquare className=" mr-1" />
									) : (
										<FaRegSquare className="mr-1 gray" />
									)}
									{company.name}
								</Button>
							)
						})
					) : (
						<p>Henüz Şirket eklenmemiş.</p>
					)}
					<Button
						type="button"
						classes="blue mt-4 fw-500"
						onClick={() => setIsFormOpen(!isFormOpen)}
					>
						Yeni Şirket Oluştur
					</Button>
				</div>
			)}
		</div>
	)
}

export default CompanyList
