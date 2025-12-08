import React, { useState, useEffect } from 'react'
import { DEBTOR_TYPES, STATUS } from '../constants'
import {
	getAllThirdPersons,
	getThirdPersonsByType,
} from '../services/deptorService'
import Button from './anBrains/Button'
import { FaUser, FaRegSquare, FaCheckSquare, FaBuilding } from 'react-icons/fa'
import Modal from './anBrains/Modal'
import NewThirdPersonForm from './forms/NewThirdPersonForm'
import LoadingCircle from './anBrains/animations/LoadingCircle'
import { getDebtorIdentityString, getDebtorName } from '../helpers/Helper'
import CaseUtilsList from './case/CaseUtilsList'

export default function ThirdPersonList({
	thirdPersonId,
	setId,
	nonSelect,
	thirdPersonReason,
	type,
	setThirdPerson,
	selectBoxText,
	selectable = true,
}) {
	const [status, setStatus] = useState(STATUS.LOADING)
	const [thirdPersons, setThirdPersons] = useState([])

	const selectedThirdPerson = thirdPersons.filter(
		c => c._id === thirdPersonId,
	)[0]

	useEffect(() => {
		load()
	}, [])

	const load = async () => {
		await getThirdPersons()
		setStatus(STATUS.NORMAL)
	}

	const getThirdPersons = async () => {
		const func = type ? getThirdPersonsByType : getAllThirdPersons
		await func(type)
			.then(res => setThirdPersons(res.data))
			.catch(e => console.log(e))
	}

	useEffect(() => {
		if (setThirdPerson) {
			setThirdPerson(thirdPersons.find(p => p._id === thirdPersonId))
		}
	}, [thirdPersons, thirdPersonId])

	const handleSelect = (item, isCreated) => {
		if (isCreated) {
			setThirdPersons([...thirdPersons, { ...item }])
			setId(item._id)
		} else {
			if (thirdPersonId === item._id) {
				setId(null)
			} else {
				setId(item._id)
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
				<div>
					<p className="fw-600 fs-sm ta-left">{getDebtorName(item)}</p>
					<p className="fs-sm ta-left">{getDebtorIdentityString(item)}</p>
				</div>
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

	if (status === STATUS.LOADING) {
		return <LoadingCircle />
	}

	return (
		<div className="relative company-list">
			<CaseUtilsList
				selectBoxText={selectBoxText}
				disableCloseOnClick
				withoutCreateButton
				withoutTitle
				status={STATUS.NORMAL}
				utils={thirdPersons}
				selectedUtils={selectedThirdPerson ? [selectedThirdPerson] : []}
				handleClickItem={handleSelect}
				selectable={selectable}
				utilType="third_person"
				modalListBody={<ModalListBody />}
				listBody={<ListBody />}
				utilItem={
					<NewThirdPersonForm
						thirdPersons={thirdPersons}
						setThirdPersons={setThirdPersons}
						exactType={type}
						thirdPersonReason={thirdPersonReason}
					/>
				}
				modalDescription="Seçmek istediğiniz üçüncü şahsın yanındaki kutucuğa tıklayın"
				selectedListTitle="Seçilmiş Üçüncü Şahıs"
				emptySelectedText="Henüz üçüncü şahıs seçilmemiş. Eğer daha önce oluşturduğunuz üçüncü şahıs varsa aşağıdaki listeden seçebilir veya sağ üstten yeni bir üçüncü şahıs oluşturabilirsiniz."
			/>
		</div>
	)
}
