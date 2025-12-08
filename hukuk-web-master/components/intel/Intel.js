import { sub } from 'date-fns'
import React, { useEffect, useState } from 'react'
import { FaFingerprint, FaLongArrowAltRight, FaTimes } from 'react-icons/fa'
import { DEBTOR_TYPES, INTEL, STATUS } from '../../constants'
import { checkIdentityNumber, handleError } from '../../helpers/Helper'
import useInpoundmentContext from '../../services/hooks/useInpoundmentContext'
import {
	createIntel,
	getDebtorIntel,
	updateIntelById,
} from '../../services/intelService'
import LoadingAnimation from '../anBrains/animations/LoadingAnimation/LoadingAnimation'
import Button from '../anBrains/Button'
import Modal from '../anBrains/Modal'
import Note from '../Note'
import IntelDebtorReminder from './IntelDebtorReminder'
import IntelInfo from './IntelInfo'
import IntelTypeList from './IntelTypeList'

export default function Intel({ debtor, setDebtor, intelRequired }) {
	const { currentCase } = useInpoundmentContext()

	const [status, setStatus] = useState(STATUS.LOADING)
	const [isOpen, setIsOpen] = useState(false)
	const [intel, setIntel] = useState({ ...INTEL })

	const checkAssetType = () => {
		if (window.location.search.includes('assetType=INTEL')) {
			setIsOpen(true)
		}
	}

	useEffect(() => {
		load()
		checkAssetType()
	}, [])

	const load = async () => {
		await getIntel()
		setStatus(STATUS.NORMAL)
	}

	const getIntel = async () => {
		await getDebtorIntel(currentCase._id, debtor._id).then(res => {
			if (res.data) {
				setIntel({ ...res.data })
			}
		})
	}

	const changeIntel = (prop, val) => {
		intel[prop] = val
		setIntel({ ...intel })
	}

	const submit = async () => {
		setStatus(STATUS.LOADING)
		if (intel._id) {
			await update()
		} else {
			await create()
		}
		setStatus(STATUS.NORMAL)
	}

	const create = async () => {
		await createIntel(currentCase._id, debtor._id, { ...intel })
			.then(res => {
				setIntel({ ...res.data })
			})
			.catch(e => {
				handleError(e)
				console.log({ e })
			})
	}

	const update = async () => {
		await updateIntelById(intel._id, { ...intel })
			.then(res => {
				setIntel({ ...res.data })
			})
			.catch(e => {
				handleError(e)
				console.log({ e })
			})
	}

	if (!isOpen) {
		return (
			<div className="intel">
				<div className="flex al-center">
					<div className="icon icon-purple bg-white mr-2">
						<FaFingerprint />
					</div>
					<p className="fw-500 fs-md dark-blue">İstihbarat</p>
				</div>
				{intelRequired ? (
					<div>
						<p className="mt-4">İstihbarat yapılması gerekiyor</p>
						<Button
							onClick={() => setIsOpen(true)}
							icon={<FaLongArrowAltRight />}
							iconPosition="right"
							classes="purple mt-1 fw-500"
						>
							{intel.areTypesSelected
								? 'İstihbarata Devam Et'
								: intel.isCityKnown !== null || !intel.isDistrictKnown
								? 'İstihbarat Yap'
								: 'İstihbarata Başla'}
						</Button>
					</div>
				) : (
					<Button
						onClick={() => setIsOpen(true)}
						icon={<FaLongArrowAltRight />}
						iconPosition="right"
						classes="purple mt-4 fw-500"
					>
						İstihbarat Detayları
					</Button>
				)}
			</div>
		)
	}

	return (
		<Modal visible={true} close={() => setIsOpen(false)}>
			<div className="form-modal intel-modal">
				<div className="flex al-center jst-between mb-4">
					<div className="flex al-center">
						<div className="icon icon-purple bg-white mr-2">
							<FaFingerprint />
						</div>
						<p className="fw-600 fs-lg dark-blue">İstihbarat</p>
					</div>
					<Button
						theme="basic"
						icon={<FaTimes />}
						onClick={() => setIsOpen(false)}
					>
						Kapat
					</Button>
				</div>
				<div className="intel">
					<LoadingAnimation status={status} />
					{(debtor.addresses.length === 0 || !checkIdentityNumber(debtor)) && (
						<>
							{!debtor.isInformationsAskedAgain ? (
								<IntelDebtorReminder
									intel={intel}
									setIntel={setIntel}
									debtor={debtor}
									setDebtor={setDebtor}
									submit={submit}
								/>
							) : (
								debtor.addresses.length === 0 && (
									<IntelInfo
										debtor={debtor}
										intel={intel}
										changeIntel={changeIntel}
										submitIntel={submit}
									/>
								)
							)}
						</>
					)}

					<IntelTypeList intel={intel} setIntel={setIntel} debtor={debtor} />
				</div>
			</div>
		</Modal>
	)
}
