import { useState, useEffect } from 'react'
import { STATUS, DEBTOR_TYPES } from '../../constants'
import NewClientForm from '../forms/NewClientForm'
import { getClients } from '../../services/clientService'
import { getDebtorName, handleError } from '../../helpers/Helper'
import CaseUtilsList from './CaseUtilsList'
import { saveCase } from '../../services/caseService'
import useInpoundmentContext from '../../services/hooks/useInpoundmentContext'

export default function CaseClients({ clients, setClients }) {
	const { currentCase, setCurrentCase } = useInpoundmentContext()

	const [status, setStatus] = useState(STATUS.NORMAL)
	const [allClients, setAllClients] = useState([])

	useEffect(() => {
		getAll()
	}, [])

	const getAll = async () => {
		setStatus(STATUS.LOADING)
		await getClients()
			.then(res => {
				setAllClients(res.data)
				const caseClients = res.data.filter(client =>
					currentCase.clientIds.includes(client._id),
				)
				setClients(caseClients)
			})
			.catch(e => alert('Hata'))
		setStatus(STATUS.NORMAL)
	}

	const handleClickItem = async (item, isCreated) => {
		setStatus(STATUS.LOADING)
		if (isCreated) {
			setAllClients([{ ...item }, ...allClients])
		}
		const index = clients.findIndex(client => client._id === item._id)
		if (index !== -1) {
			clients.splice(index, 1)
		} else {
			clients.push(item)
		}
		setClients([...clients])
		currentCase.clientIds = clients.map(c => c._id)
		await saveCase(currentCase.number, currentCase)
			.then(res => {
				setCurrentCase({ ...res.data })
			})
			.catch(e => handleError(e))
		setStatus(STATUS.NORMAL)
	}

	const ModalListBody = ({ item }) => {
		return (
			<div className="flex al-center">
				<p className="fw-500">{getDebtorName(item)}</p>
				<div className="badge-cyan fs-xsm ml-2 px-4 py-0 ">
					{item.type === DEBTOR_TYPES.INSTITUTION ? 'Kurum' : 'Şahıs'}
				</div>
			</div>
		)
	}

	return (
		<CaseUtilsList
			withoutTitle
			status={status}
			utils={allClients}
			selectedUtils={clients}
			handleClickItem={handleClickItem}
			selectable
			utilType="client"
			modalListBody={<ModalListBody />}
			listBody={<ModalListBody />}
			utilItem={
				<NewClientForm clients={allClients} setClients={setAllClients} />
			}
		/>
	)
}
