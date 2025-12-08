import React, { useEffect, useState } from 'react'
import { FaCheckSquare, FaInfoCircle, FaPen, FaRegSquare } from 'react-icons/fa'
import {
	DEBTOR_TYPES,
	INTEL,
	INTEL_TYPE,
	STATUS,
	TASK_TYPE,
} from '../../constants'
import { handleError } from '../../helpers/Helper'
import { useDebtorContext } from '../../services/hooks/useDebtorContext'
import useInpoundmentContext from '../../services/hooks/useInpoundmentContext'
import {
	createIntel,
	updateIntelPropertyById,
} from '../../services/intelService'
import LoadingAnimation from '../anBrains/animations/LoadingAnimation/LoadingAnimation'
import Button from '../anBrains/Button'
import Modal from '../anBrains/Modal'
import Note from '../Note'
import Printer from '../Printer'
import IntelType from './IntelType'

export default function IntelTypeList({ intel, setIntel, debtor }) {
	const { currentCase, queryTaskId } = useInpoundmentContext()
	const { debtorTasks } = useDebtorContext()
	const [status, setStatus] = useState(STATUS.NORMAL)
	const [list, setList] = useState(
		intel._id && intel.selectedTypes.length !== 0
			? intel.selectedTypes
			: (
					debtor.type === DEBTOR_TYPES.INSTITUTION
						? debtor.taxNumber
						: debtor.identityNumber
			  )
			? ['mernis']
			: [],
	)
	const [isOpen, setIsOpen] = useState(false)
	const [visibleType, setVisibleType] = useState(null)
	const [isVisibleTypeSetByQueryTaskId, setIsVisibleTypeSetByQueryId] =
		useState(false)

	useEffect(() => {
		handleQueryTaskId()
	}, [debtorTasks, queryTaskId])

	const handleQueryTaskId = () => {
		if (!isVisibleTypeSetByQueryTaskId && debtorTasks && queryTaskId) {
			const currentTask = debtorTasks.find(t => t._id === queryTaskId)
			if (currentTask?.extra?.intelType) {
				setVisibleType(currentTask.extra.intelType)
				setIsVisibleTypeSetByQueryId(true)
			}
		}
	}

	const handleClickItem = key => {
		if (list.includes(key)) {
			setList([...list.filter(i => i !== key)])
		} else {
			setList([...list, key])
		}
	}

	const saveList = async () => {
		setStatus(STATUS.LOADING)
		if (intel._id) {
			await updateIntelPropertyById(intel._id, 'selectedTypes', list)
				.then(res => {
					setIntel({ ...res.data })
					setIsOpen(false)
				})
				.catch(e => handleError(e))
		} else {
			await createIntel(currentCase._id, debtor._id, {
				...intel,
				areTypesSelected: true,
				selectedTypes: list,
			})
				.then(res => {
					setIntel({ ...res.data })
					setIsOpen(false)
				})
				.catch(e => {
					console.log(e)
				})
		}
		setStatus(STATUS.NORMAL)
	}

	const printerProps = {
		paperDebtors: [debtor],
		type: 'requestPaper',
		caseId: currentCase._id,
	}

	const updateIntelType = async (
		type,
		property,
		propertyValue,
		innerProperty,
	) => {
		setStatus(STATUS.LOADING)
		if (innerProperty) {
			intel[type][property][innerProperty] = propertyValue
		} else {
			intel[type][property] = propertyValue
		}
		await updateIntelPropertyById(intel._id, type, intel[type], property)
			.then(res => {
				setIntel({ ...res.data })
			})
			.catch(e => {
				handleError(e)
				console.log(e)
			})
		setStatus(STATUS.NORMAL)
	}

	const visibleTypeObject = Object.values(INTEL_TYPE).find(
		t => t.entityName === visibleType,
	)

	return (
		<div>
			{(intel.areTypesSelected === false ||
				(!intel.areTypesSelected &&
					debtorTasks?.some(
						t => t.type === TASK_TYPE.DEBTOR_NULL_FORMAL_ADDRESS,
					))) && (
				<Note type="zekiye" classes="mt-4">
					<div className="flex al-center jst-between w-100 fw-600">
						Yapmak istediğiniz istihbarat türlerini seçmeniz gerekiyor
					</div>
					<Button
						theme="blue"
						classes="mt-4 bold"
						onClick={() => setIsOpen(true)}
					>
						İstihbarat Türlerini Seç
					</Button>
				</Note>
			)}
			<LoadingAnimation status={status} />
			{(intel.areTypesSelected === true ||
				(debtor.addresses.length > 0 && debtor.type === DEBTOR_TYPES.INSTITUTION
					? debtor.taxNumber
					: debtor.identityNumber)) && (
				<div>
					<div className="step-item-divider"></div>
					<div className="flex al-center jst-between mb-8">
						<p className="fs-lg fw-600 dark-blue">İstihbarat Listesi</p>
						<Button
							theme="blue"
							classes="fw-500"
							onClick={() => setIsOpen(true)}
						>
							<FaPen className="mr-2" />
							Düzenle
						</Button>
					</div>
					{intel._id && (
						<div className="flex">
							<div className="w-30 mr-10">
								{Object.keys(INTEL_TYPE)
									.filter(
										key =>
											INTEL_TYPE[key].isAvailable(intel, debtor) &&
											intel.selectedTypes.includes(INTEL_TYPE[key].entityName),
									)
									.map(key => {
										const type = INTEL_TYPE[key]
										return (
											<IntelType
												inSidebar
												key={key}
												type={INTEL_TYPE[key]}
												intel={intel}
												update={(p, v, i) =>
													updateIntelType(type.entityName, p, v, i)
												}
												printerProps={printerProps}
												debtor={debtor}
												visibleType={visibleType}
												setVisibleType={setVisibleType}
											/>
										)
									})}
							</div>
							<div className="w-70">
								{visibleType && (
									<IntelType
										type={visibleTypeObject}
										intel={intel}
										update={(p, v, i) =>
											updateIntelType(visibleTypeObject.entityName, p, v, i)
										}
										printerProps={printerProps}
										debtor={debtor}
										visibleType={visibleType}
										setVisibleType={setVisibleType}
									/>
								)}
							</div>
						</div>
					)}
				</div>
			)}
			<Modal visible={isOpen} close={() => setIsOpen(false)}>
				<div className="case-form__modal intel-type-list">
					<p className="fw-500 fs-lg ta-center">
						Yapmak İstediğiniz İstihbarat Türlerini Seçin
					</p>
					<div className="step-item-divider"></div>
					<div className="flex al-center jst-between wrap">
						{Object.keys(INTEL_TYPE)
							.filter(key => INTEL_TYPE[key].isAvailable(intel, debtor))
							.map(key => {
								const { entityName } = INTEL_TYPE[key]
								const isSelected = list.includes(entityName)
								return (
									<div style={{ width: '48%' }} className="mb-4">
										<Button
											theme="basic"
											key={key}
											classes="fw-500 jst-between w-100 relative"
											onClick={() => handleClickItem(entityName)}
											disabled={entityName === 'mernis'}
										>
											<p className={isSelected ? 'blue fw-600' : 'dark'}>
												{INTEL_TYPE[key].name}
											</p>
											{isSelected ? (
												<FaCheckSquare className="blue" />
											) : (
												<FaRegSquare className="gray" />
											)}
										</Button>
										{entityName === 'mernis' && (
											<div className="fs-xsm absolute flex al-center mt-1">
												<FaInfoCircle className="mr-1 blue" />
												Mernis İstihbaratı zorunludur
											</div>
										)}
										{entityName === 'client' && (
											<div className="fs-xsm absolute flex al-center mt-1">
												<FaInfoCircle className="mr-1 blue" />
												Müvekkilden öğrenilecek bilgiler için
											</div>
										)}
									</div>
								)
							})}
					</div>
					<div className="flex mt-8">
						<Button theme="basic w-50 mr-4" onClick={() => setIsOpen(false)}>
							Vazgeç
						</Button>
						<Button theme="green" classes="bold mr-4 w-50" onClick={saveList}>
							Sadece Kaydet
						</Button>
						<div className="w-50" disabled={list.length === 0}>
							<Printer
								{...printerProps}
								type="intel"
								intelList={list.filter(l => l !== 'client')}
								title="KAYDET VE YAZDIR"
								onAfterPrint={saveList}
							/>
						</div>
					</div>
				</div>
			</Modal>
		</div>
	)
}
