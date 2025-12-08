import React, { useState } from 'react'
import { FaBuilding, FaUser } from 'react-icons/fa'
import { DEBTOR_TYPES, STATUS } from '../../constants'
import { getDebtorName } from '../../helpers/Helper'
import { useRestrictionContext } from '../../services/hooks/useRestrictionContext'
import CaseUtilsList from '../case/CaseUtilsList'
import NewCreditorForm from '../forms/NewCreditorForm'

export default function CreditorSelect({ selectedId, setSelectedId }) {
	const {
		creditors,
		setCreditors,
		disableCloseOnClick,
	} = useRestrictionContext()

	const handleSelect = (item, isCreated) => {
		if (isCreated) {
			setCreditors([...creditors, { ...item }])
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
			<div className="flex al-center">
				{item.type === DEBTOR_TYPES.PERSON ? (
					<FaUser className="fs-xsm mr-2 gray" />
				) : (
					<FaBuilding className="fs-xsm mr-2 gray" />
				)}
				<p className="fw-500 fs-sm">{getDebtorName(item)}</p>
			</div>
		)
	}

	const ListBody = ({ item }) => {
		return (
			<div className="flex al-center blue">
				{item.type === DEBTOR_TYPES.PERSON ? (
					<FaUser className="fs-xsm mr-2" />
				) : (
					<FaBuilding className="fs-xsm mr-2" />
				)}
				<p className="fw-500 fs-sm">{getDebtorName(item)}</p>
			</div>
		)
	}

	const creditor = creditors.find(c => c._id === selectedId)

	return (
		<div>
			<CaseUtilsList
				disableCloseOnClick={disableCloseOnClick}
				withoutCreateButton
				withoutTitle
				status={STATUS.NORMAL}
				utils={creditors}
				selectedUtils={creditor ? [creditor] : []}
				handleClickItem={handleSelect}
				selectable
				utilType="creditor"
				modalListBody={<ModalListBody />}
				listBody={<ListBody />}
				utilItem={<NewCreditorForm />}
				modalDescription="Seçmek istediğiniz alacaklının yanındaki kutucuğa tıklayın"
				selectedListTitle="Seçilmiş Alacaklı"
				emptySelectedText="Henüz alacaklı seçilmemiş. Eğer daha önce oluşturduğunuz Alacaklı varsa aşağıdaki listeden seçebilir veya sağ üstten yeni bir Alacaklı oluşturabilirsiniz."
			/>
		</div>
	)
}
