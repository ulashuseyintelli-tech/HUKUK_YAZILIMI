import React, { useState, useEffect } from 'react'
import Modal from '../anBrains/Modal'
import Button from '../anBrains/Button'
import { BANK_LIST, QUERY_LIST, STATUS } from '../../constants'
import { FaRegCircle, FaCheckCircle } from 'react-icons/fa'
import { createQueryBulk } from '../../services/queryService'
import LoadingAnimation from '../anBrains/animations/LoadingAnimation/LoadingAnimation'
import { getDebtorName } from '../../helpers/Helper'
import Printer from '../Printer'
import useInpoundmentContext from '../../services/hooks/useInpoundmentContext'
import { useAppContext } from '../../services/hooks/useAppContext'

export default function BulkQueryModal({ visible, close }) {
	const { user } = useAppContext()
	const { currentCase, selectedDebtorId, debtors } = useInpoundmentContext()
	const [status, setStatus] = useState(STATUS.NORMAL)
	const [queryList, setQueryList] = useState([])
	const [bankList, setBankList] = useState(user.lawOffice[0].bulkQueryBankList)
	const [debtorList, setDebtorList] = useState([selectedDebtorId])

	useEffect(() => {
		if (user) {
			setQueryListByLawOfficeSetting()
		}
	}, [user])

	const setQueryListByLawOfficeSetting = () => {
		setQueryList([...user.lawOffice[0].queryList])
	}

	const handleQueryList = query => {
		const index = queryList.findIndex(b => b === query)
		if (index === -1) {
			queryList.push(query)
		} else {
			queryList.splice(index, 1)
		}
		setQueryList([...queryList])
	}

	const handleBankList = bank => {
		bankList.includes(bank)
			? bankList.splice(
					bankList.findIndex(b => b === bank),
					1,
			  )
			: bankList.push(bank)
		setBankList([...bankList])
	}

	const handleDebtorList = debtorId => {
		const index = debtorList.findIndex(id => id === debtorId)
		if (index === -1) {
			debtorList.push(debtorId)
		} else {
			if (debtorList.length === 1) {
				alert('En az 1 borçlu seçmelisiniz.')
			} else {
				debtorList.splice(index, 1)
			}
		}
		setDebtorList([...debtorList])
	}

	const selectAllQueries = () => {
		setQueryList([...Object.keys(QUERY_LIST).map(key => QUERY_LIST[key].value)])
	}

	const selectAllBanks = () => {
		setBankList([...BANK_LIST])
	}

	const selectAllDebtors = () => {
		setDebtorList([...debtors])
	}

	const removeAllQueries = () => setQueryList([])
	const removeAllBanks = () => setBankList([])
	const removeAllDebtors = () => setDebtorList([])

	const doBulkQuery = async () => {
		if (queryList.length > 0) {
			setStatus(STATUS.LOADING)
			await createQueryBulk(currentCase._id, selectedDebtorId, queryList)
				.then(() => {
					location.reload()
				})
				.catch(() => {
					setStatus(STATUS.NORMAL)
					alert('Hata meydana geldi!')
				})
		} else {
			alert('En az 1 sorgu türü seçmelisiniz.')
		}
	}

	return (
		<Modal visible={visible} close={close}>
			<LoadingAnimation status={status} />
			<div className="form-modal">
				<div className="flex">
					<div className="w-50 mr-10">
						<p className="fw-600 mb-4">Haciz Tipleri</p>
						<div className="flex al-center jst-between mb-4">
							<Button classes="fw-500 blue mr-10" onClick={selectAllQueries}>
								Tümünü Seç
							</Button>
							<Button classes="fw-500 red" onClick={removeAllQueries}>
								Tümünü Bırak
							</Button>
						</div>
						<div className="step-item-divider my-4"></div>
						{Object.keys(QUERY_LIST).map((key, index) => {
							return (
								<Button
									key={key + index}
									classes="mb-2"
									onClick={() => handleQueryList(QUERY_LIST[key].value)}
								>
									{queryList.includes(QUERY_LIST[key].value) ? (
										<FaCheckCircle className="green" />
									) : (
										<FaRegCircle />
									)}
									<p className="ml-2">{QUERY_LIST[key].text}</p>
								</Button>
							)
						})}
						<Button
							classes="mb-2"
							onClick={() => handleQueryList('FINALIZATION')}
						>
							{queryList.includes('FINALIZATION') ? (
								<FaCheckCircle className="green" />
							) : (
								<FaRegCircle />
							)}
							<p className="ml-2">Tebligat Kesinleştirme</p>
						</Button>
					</div>
					{queryList.includes('BANK') && (
						<div className="w-50 mr-10">
							<p className="fw-600 mb-4">Bankalar</p>
							<div className="flex al-center jst-between mb-4">
								<Button classes="fw-500 blue mr-10" onClick={selectAllBanks}>
									Tümünü Seç
								</Button>
								<Button classes="fw-500 red" onClick={removeAllBanks}>
									Tümünü Bırak
								</Button>
							</div>
							<div className="step-item-divider my-4"></div>
							{BANK_LIST.map((bank, index) => {
								return (
									<Button
										key={bank}
										classes="mb-2"
										onClick={() => handleBankList(bank)}
									>
										{bankList.includes(bank) ? (
											<FaCheckCircle className="green" />
										) : (
											<FaRegCircle />
										)}
										<p className="ml-2">{bank}</p>
									</Button>
								)
							})}
						</div>
					)}

					<div className="w-50">
						<p className="fw-600 mb-4">Borçlular</p>
						<div className="flex al-center jst-between mb-4">
							<Button classes="fw-500 blue mr-10" onClick={selectAllDebtors}>
								Tümünü Seç
							</Button>
							<Button classes="fw-500 red" onClick={removeAllDebtors}>
								Tümünü Bırak
							</Button>
						</div>
						<div className="step-item-divider my-4"></div>
						{debtors.map((debtor, index) => {
							return (
								<Button
									key={debtor._id}
									classes="mb-2"
									onClick={() => handleDebtorList(debtor._id)}
								>
									{debtorList.includes(debtor._id) ? (
										<FaCheckCircle className="green" />
									) : (
										<FaRegCircle />
									)}
									<p className="ml-2">{getDebtorName(debtor)}</p>
								</Button>
							)
						})}
					</div>
				</div>
				<Printer
					type="BULK"
					lawOffice={user.lawOffice[0]}
					paperDebtors={debtors.filter(d => debtorList.includes(d._id))}
					queryList={queryList}
					caseId={currentCase._id}
					bankList={bankList}
				/>
			</div>
		</Modal>
	)
}
