import Button from '../anBrains/Button'
import { FaPen, FaRegCircle, FaPlus, FaCheckCircle } from 'react-icons/fa'
import { useState, useEffect } from 'react'
import Modal from '../anBrains/Modal'
import { STATUS } from '../../constants'
import LoadingAnimation from '../anBrains/animations/LoadingAnimation/LoadingAnimation'
import NewLawyerForm from '../forms/NewLawyerForm'
import { getAllLawyers } from '../../services/userService'
import CaseUtilsList from './CaseUtilsList'
import { updateCasePropertyByNumber } from '../../services/caseService'
import useInpoundmentContext from '../../services/hooks/useInpoundmentContext'
import { handleError } from '../../helpers/Helper'
export default function CaseLawyers({ lawyers, setLawyers }) {
	const { currentCase, setCurrentCase } = useInpoundmentContext()

	const [status, setStatus] = useState(STATUS.NORMAL)
	const [allLawyers, setAllLawyers] = useState([])

	useEffect(() => {
		_getLawyers()
	}, [])

	const _getLawyers = async () => {
		setStatus(STATUS.LOADING)
		await getAllLawyers()
			.then(res => {
				setAllLawyers(res.data)
				const caseLawyers = res.data.filter(lawyer =>
					currentCase.lawyerIds.includes(lawyer._id),
				)
				setLawyers(caseLawyers)
			})
			.catch(e => alert('Hata'))
		setStatus(STATUS.NORMAL)
	}

	const handleClickLawyer = lawyer => {
		const index = lawyers.findIndex(item => item._id === lawyer._id)
		if (index !== -1) {
			lawyers.splice(index, 1)
		} else {
			lawyers.push(lawyer)
		}
		setCaseLawyers(lawyers)
	}

	const setCaseLawyers = async (lawyers, isCreated) => {
		setStatus(STATUS.LOADING)
		if (isCreated) {
			setAllLawyers([...lawyers])
			lawyers = [
				...lawyers.filter(l => currentCase.lawyerIds.includes(l._id)),
				{ ...lawyers[0] },
			]
		}
		await updateCasePropertyByNumber(
			currentCase.number,
			'lawyerIds',
			lawyers.map(l => l._id),
		)
			.then(res => {
				setLawyers([...lawyers])
				setCurrentCase({ ...res.data })
			})
			.catch(e => {
				handleError(e)
				console.log(e)
			})
		setStatus(STATUS.NORMAL)
	}

	const ListBody = ({ item }) => {
		return (
			<p>
				{item.name} {item.surname}
			</p>
		)
	}

	return (
		<CaseUtilsList
			withoutTitle
			title="Avukatlar"
			status={status}
			utils={allLawyers}
			selectable
			selectedUtils={lawyers}
			utilType="lawyer"
			modalListBody={<ListBody />}
			listBody={<ListBody />}
			utilItem={
				<NewLawyerForm
					lawyers={allLawyers}
					setLawyers={laws => setCaseLawyers(laws, true)}
				/>
			}
			handleClickItem={handleClickLawyer}
		/>
	)
}
