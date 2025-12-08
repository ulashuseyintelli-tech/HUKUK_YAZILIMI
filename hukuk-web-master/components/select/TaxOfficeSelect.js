import React, { useEffect, useState } from 'react'
import { STATUS } from '../../constants'
import { handleError } from '../../helpers/Helper'
import { getTaxOffices } from '../../services/taxOfficeService'
import CaseUtilsList from '../case/CaseUtilsList'
import NewTaxOfficeForm from '../forms/NewTaxOfficeForm'

export default function TaxOfficeSelect({
	selectedId,
	setSelectedId,
	selectable = true,
}) {
	const [status, setStatus] = useState(STATUS.LOADING)
	const [taxOffices, setTaxOffices] = useState([])

	useEffect(() => {
		load()
	}, [])

	const load = async () => {
		await getOffices()
		setStatus(STATUS.NORMAL)
	}

	const getOffices = () => {
		return getTaxOffices()
			.then(res => {
				setTaxOffices(res.data)
			})
			.catch(handleError)
	}

	const handleSelect = (item, isCreated) => {
		if (isCreated) {
			setTaxOffices([...taxOffices, { ...item }])
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

	const taxOffice = taxOffices.find(c => c._id === selectedId)

	return (
		<div>
			<CaseUtilsList
				withoutCreateButton
				withoutTitle
				status={STATUS.NORMAL}
				utils={taxOffices}
				selectedUtils={taxOffice ? [taxOffice] : []}
				handleClickItem={handleSelect}
				selectable={selectable}
				utilType="tax_office"
				modalListBody={<ModalListBody />}
				listBody={<ListBody />}
				utilItem={
					<NewTaxOfficeForm offices={taxOffices} setOffices={setTaxOffices} />
				}
				modalDescription="Seçmek istediğiniz vergi dairesinin yanındaki kutucuğa tıklayın"
				selectedListTitle="Seçilmiş Vergi Dairesi"
				emptySelectedText="Henüz vergi dairesi seçilmemiş. Eğer daha önce oluşturduğunuz Vergi Dairesi varsa aşağıdaki listeden seçebilir veya sağ üstten yeni bir Vergi Daires oluşturabilirsiniz."
			/>
		</div>
	)
}
