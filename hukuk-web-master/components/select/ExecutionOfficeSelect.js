import React from 'react'
import { STATUS } from '../../constants'
import { useRestrictionContext } from '../../services/hooks/useRestrictionContext'
import CaseUtilsList from '../case/CaseUtilsList'
import NewExecutionOfficeForm from '../forms/NewExecutionOfficeForm'

export default function ExecutionOfficeSelect({
	selectedId,
	setSelectedId,
	offices,
	setOffices,
	disabled,
	selectable = true,
}) {
	const restrictionContext = useRestrictionContext()
	const executionOffices = offices || restrictionContext.executionOffices
	const setExecutionOffices =
		setOffices || restrictionContext.setExecutionOffices

	const handleSelect = (item, isCreated) => {
		if (isCreated) {
			setExecutionOffices([...executionOffices, { ...item }])
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
					<span className="fw-600">{item.name}</span> {item.city} /{' '}
					{item.district}
				</p>
				<p className="fs-sm">
					{item.bankName} - {item.IBAN}
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

	const executionOffice = executionOffices.find(c => c._id === selectedId)
	return (
		<div>
			<CaseUtilsList
				disableCloseOnClick={restrictionContext?.disableCloseOnClick}
				withoutCreateButton
				withoutTitle
				status={STATUS.NORMAL}
				utils={executionOffices}
				selectedUtils={executionOffice ? [executionOffice] : []}
				handleClickItem={handleSelect}
				selectable={selectable}
				utilType="execution_office"
				modalListBody={<ModalListBody />}
				listBody={<ListBody />}
				utilItem={
					<NewExecutionOfficeForm
						offices={executionOffices}
						setOffices={setExecutionOffices}
					/>
				}
				modalDescription="Seçmek istediğiniz icra dairesinin yanındaki kutucuğa tıklayın"
				selectedListTitle="Seçilmiş İcra Dairesi"
				emptySelectedText="Henüz icra dairesi seçilmemiş. Eğer daha önce oluşturduğunuz İcra Dairesi varsa aşağıdaki listeden seçebilir veya sağ üstten yeni bir İcra Daires oluşturabilirsiniz."
				disableListBodyClick={disabled}
			/>
		</div>
	)
}
