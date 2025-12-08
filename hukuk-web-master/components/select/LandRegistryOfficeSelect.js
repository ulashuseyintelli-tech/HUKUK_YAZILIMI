import React, { useEffect, useState } from 'react'
import { STATUS } from '../../constants'
import { handleError } from '../../helpers/Helper'
import { getLandRegistryOffices } from '../../services/landRegistryOfficeServie'
import CaseUtilsList from '../case/CaseUtilsList'
import NewLandRegistryOfficeForm from '../forms/NewLandRegistryOfficeForm'

export default function LandRegistryOfficeSelect({
	selectedId,
	setSelectedId,
	selectable = true,
}) {
	const [status, setStatus] = useState(STATUS.LOADING)
	const [landRegistryOffices, setLandRegistryOffices] = useState([])

	useEffect(() => {
		load()
	}, [])

	const load = async () => {
		await getOffices()
		setStatus(STATUS.NORMAL)
	}

	const getOffices = () => {
		return getLandRegistryOffices()
			.then(res => {
				setLandRegistryOffices(res.data)
			})
			.catch(handleError)
	}

	const handleSelect = (item, isCreated) => {
		if (isCreated) {
			setLandRegistryOffices([...landRegistryOffices, { ...item }])
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
				<span className="fw-500">{item.name}</span>
			</p>
		)
	}

	const landRegistryOffice = landRegistryOffices.find(c => c._id === selectedId)

	return (
		<div>
			<CaseUtilsList
				withoutCreateButton
				withoutTitle
				status={STATUS.NORMAL}
				utils={landRegistryOffices}
				selectedUtils={landRegistryOffice ? [landRegistryOffice] : []}
				handleClickItem={handleSelect}
				selectable={selectable}
				utilType="land_registry_office"
				modalListBody={<ModalListBody />}
				listBody={<ListBody />}
				utilItem={
					<NewLandRegistryOfficeForm
						offices={landRegistryOffices}
						setOffices={setLandRegistryOffices}
					/>
				}
				modalDescription="Seçmek istediğiniz tapu sicil müdürlüğünün yanındaki kutucuğa tıklayın"
				selectedListTitle="Seçilmiş Tapu Sicil Müdürlüğü"
				emptySelectedText="Henüz tapu sicil müdürlüğü seçilmemiş. Eğer daha önce oluşturduğunuz Vergi Dairesi varsa aşağıdaki listeden seçebilir veya sağ üstten yeni bir Tapu Sicil Müdürlüğü oluşturabilirsiniz."
			/>
		</div>
	)
}
