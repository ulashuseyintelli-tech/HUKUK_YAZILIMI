import React, { useEffect, useState } from 'react'
import { STATUS } from '../../constants'
import { handleError } from '../../helpers/Helper'
import { getCustomsOffices } from '../../services/customsOfficeService'
import CaseUtilsList from '../case/CaseUtilsList'
import NewCustomsOfficeForm from '../forms/NewCustomsOfficeForm'

export default function CustomsOfficeSelect({
	selectedId,
	setSelectedId,
	selectable = true,
}) {
	const [status, setStatus] = useState(STATUS.LOADING)
	const [customsOffices, setCustomsOffices] = useState([])

	useEffect(() => {
		load()
	}, [])

	const load = async () => {
		await getOffices()
		setStatus(STATUS.NORMAL)
	}

	const getOffices = () => {
		return getCustomsOffices()
			.then(res => {
				setCustomsOffices(res.data)
			})
			.catch(handleError)
	}

	const handleSelect = (item, isCreated) => {
		if (isCreated) {
			setCustomsOffices([...customsOffices, { ...item }])
		} else {
			if (selectedId === item._id) {
				setSelectedId(null)
			} else {
				setSelectedId(item._id)
			}
		}
	}

	const ModalListBody = ({ item }) => {
		return (
			<div className="ta-left">
				<p>
					<span className="fw-600">{item.name}</span>
				</p>
				<p className="fs-sm">
					{item.city} / {item.district}
				</p>
			</div>
		)
	}

	const ListBody = ({ item }) => {
		return (
			<p className="fs-sm">
				<span className="fw-500">{item.name}</span> {item.city} /{' '}
				{item.district}
			</p>
		)
	}

	const customsOffice = customsOffices.find(c => c._id === selectedId)

	return (
		<div>
			<CaseUtilsList
				withoutCreateButton
				withoutTitle
				status={STATUS.NORMAL}
				utils={customsOffices}
				selectedUtils={customsOffice ? [customsOffice] : []}
				handleClickItem={handleSelect}
				selectable={selectable}
				utilType="customs_office"
				modalListBody={<ModalListBody />}
				listBody={<ListBody />}
				utilItem={
					<NewCustomsOfficeForm
						offices={customsOffices}
						setOffices={setCustomsOffices}
					/>
				}
				modalDescription="Seçmek istediğiniz gümrük müdürlüğünün yanındaki kutucuğa tıklayın"
				selectedListTitle="Seçilmiş Gümrük Müdürlüğü"
				emptySelectedText="Henüz Gümrük Müdürlüğü seçilmemiş. Eğer daha önce oluşturduğunuz Gümrük Müdürlüğü varsa aşağıdaki listeden seçebilir veya sağ üstten yeni bir Vergi Daires oluşturabilirsiniz."
			/>
		</div>
	)
}
