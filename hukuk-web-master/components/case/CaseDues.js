import { useState, useEffect } from 'react'
import { getDues } from '../../services/dueService'
import NewDueForm from '../forms/NewDueForm'
import CaseUtilsList from './CaseUtilsList'
import useInpoundmentContext from '../../services/hooks/useInpoundmentContext'
import { STATUS } from '../../constants'
import {
	calculateBadCheckFee,
	calculateTotalDueAmount,
	calculateAfterCaseAmountOfDue,
	calculateBeforeCaseAmountOfDue,
	formatMoney,
} from '../../helpers/financeHelper'

export default function CaseDues({ setCaseTotalDue, setBadCheckFee, setDues }) {
	const { currentCase } = useInpoundmentContext()

	const [status, setStatus] = useState(STATUS.NORMAL)
	const [allDues, setAllDues] = useState([])

	useEffect(() => {
		getAll()
	}, [])

	useEffect(() => {
		setCaseTotalDue(calculateTotalDueAmount(allDues, currentCase))
		setBadCheckFee(calculateBadCheckFee(allDues))
		setDues([...allDues])
	}, [allDues])

	const getAll = async () => {
		setStatus(STATUS.LOADING)
		await getDues(currentCase._id)
			.then(res => {
				setAllDues(res.data)
			})
			.catch(e => alert('Hata'))
		setStatus(STATUS.NORMAL)
	}

	const ModalListBody = ({ item }) => {
		return (
			<div>
				<div className="flex al-center">
					<p className="fw-500">
						{formatMoney(item.totalAmount)} {item.currency}
					</p>
					<div className="badge fs-xsm ml-2 py-0">
						<span className="fw-600">{item.causeOfDebt}</span>
					</div>
				</div>
				<p className="fs-sm ta-left">
					Takip Öncesi Faiz ={' '}
					{formatMoney(calculateBeforeCaseAmountOfDue(item))} {item.currency}
				</p>
				<p className="fs-sm ta-left">
					Takip Sonrası Faiz ={' '}
					{formatMoney(calculateAfterCaseAmountOfDue(item, currentCase))}{' '}
					{item.currency}
				</p>
			</div>
		)
	}

	let total = calculateTotalDueAmount(allDues, currentCase)

	return (
		<div>
			<CaseUtilsList
				title="Alacak Kalemleri"
				status={status}
				utils={allDues}
				selectedUtils={allDues}
				// handleClickItem={handleClickItem}
				utilType="due"
				modalListBody={<ModalListBody />}
				listBody={<ModalListBody />}
				utilItem={<NewDueForm dues={allDues} setDues={setAllDues} />}
			/>
			<p className="bold mt-2">Takip Tutarı = {formatMoney(total)} ₺</p>
		</div>
	)
}
