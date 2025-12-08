import React, { useEffect, useState } from 'react'
import {
	FaCheckCircle,
	FaCheckSquare,
	FaRegCircle,
	FaRegSquare,
} from 'react-icons/fa'
import { BANK_LIST } from '../../../constants'
import useInpoundmentContext from '../../../services/hooks/useInpoundmentContext'
import Button from '../../anBrains/Button'
import Modal from '../../anBrains/Modal'

export default function BankQueryForm() {
	const {
		assetProps: { assets, setAssets },
		user,
		doQuery,
	} = useInpoundmentContext()

	const [visible, setVisible] = useState(false)
	const [bankList, setBankList] = useState([])

	useEffect(() => {
		setBankListByLawOfficeSetting()
	}, [])

	const setBankListByLawOfficeSetting = () => {
		setBankList([...user.lawOffice[0].bulkQueryBankList])
	}

	const handleBankList = bank => {
		const index = bankList.findIndex(b => b === bank)
		if (index === -1) {
			bankList.push(bank)
		} else {
			bankList.splice(index, 1)
		}
		setBankList([...bankList])
	}

	const doQueryBulk = async () => {
		if (bankList.length > 0) {
			await doQuery({ bankList }, res => {
				setAssets([...res.data.bankQueryList, ...assets])
			})
			setVisible(false)
		} else {
			alert('En az 1 banka seçmelisiniz.')
		}
	}

	return (
		<div>
			<Modal visible={visible} close={() => setVisible(false)}>
				<div className="mt-4 form-modal">
					<div className="flex al-center jst-between">
						<p className="fw-600 fs-md">Yeni Banka Sorgusu</p>
						<div className="flex al-center jst-between mb-4">
							<Button
								classes="fw-600 blue mr-8"
								onClick={() => setBankList([...BANK_LIST])}
							>
								Tümünü Seç
							</Button>
							<Button classes="fw-600 red" onClick={() => setBankList([])}>
								Tümünü Bırak
							</Button>
						</div>
					</div>
					<div className="step-item-divider"></div>
					<div className="bank-list">
						{BANK_LIST.map(bank => {
							const isSelected = bankList.includes(bank)
							return (
								<Button
									classes={`${
										isSelected ? 'brd-green' : 'brd'
									} p-4 br mb-4 jst-start fs-nm fw-500`}
									key={bank}
									onClick={() => handleBankList(bank)}
								>
									{bankList.includes(bank) ? (
										<FaCheckSquare className="green" />
									) : (
										<FaRegSquare />
									)}
									<p className={`ml-2 ${isSelected ? 'green fw-60' : 'black'}`}>
										{bank}
									</p>
								</Button>
							)
						})}
					</div>
					<Button
						theme="green"
						classes="bold fs-nm ml-auto mt-4 px-8 py-4 br"
						onClick={doQueryBulk}
					>
						OLUŞTUR
					</Button>
				</div>
			</Modal>
			<Button
				theme="green"
				classes="fw-500 w-100 fw-600"
				onClick={() => setVisible(true)}
			>
				Yeni Sorgu
			</Button>
		</div>
	)
}
