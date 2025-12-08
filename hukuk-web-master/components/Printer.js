import React, { useEffect, useRef, useState } from 'react'
import {
	FaCheckSquare,
	FaPrint,
	FaRegSquare,
	FaSquare,
	FaTimes,
} from 'react-icons/fa'
import { INTEL_TYPE, STATUS } from '../constants'
import { getCaseByNumberWithDetails } from '../services/caseService'
import LoadingCircle from './anBrains/animations/LoadingCircle'
import Button from './anBrains/Button'
import RequestPaper from './documents/RequestPaper'
import ReactToPrint, { PrintContextConsumer } from 'react-to-print'
import NoticePaper from './documents/NoticePaper'
import printer from '../printer'
import WarrantPaper from './documents/WarrantPaper'
import Modal from './anBrains/Modal'
import {
	findDistrainableDebtors,
	getDebtorIdentityString,
	getDebtorName,
} from '../helpers/Helper'
import OrderOfPayment from './documents/OrderOfPayment'
import EnforcementRequest from './documents/EnforcementRequest'
import BulkQueryPaper from './documents/BulkQueryPaper'

export default function Printer({
	caseNumber,
	caseId,
	type,
	request,
	title,
	paperDebtors,
	object,
	thirdPersons,
	queryList,
	intelList,
	onPrint,
	onAfterPrint,
	lawOffice,
	bankList,
}) {
	const [status, setStatus] = useState(STATUS.LOADING)
	const [currentCase, setCurrentCase] = useState(null)
	const [isPanelVisible, setIsPanelVisible] = useState(false)

	const [selectedRequest, setSelectedRequest] = useState(
		request || printer[21].value,
	)

	const [isDebtorsModalVisible, setIsDebtorsModalVisible] = useState(false)
	const [isThirdPersonsModalVisible, setIsThirdPersonsModalVisible] =
		useState(false)

	const [selectedDebtors, setSelectedDebtors] = useState(paperDebtors || [])
	const [selectedThirdPersons, setSelectedThirdPersons] = useState(
		thirdPersons || [],
	)

	const componentRef = useRef()

	useEffect(() => {
		load()
	}, [])

	const load = async () => {
		await getCase()
		setStatus(STATUS.NORMAL)
	}

	const getCase = async () => {
		await getCaseByNumberWithDetails(caseNumber, caseId)
			.then(res => {
				setCurrentCase(res.data)
			})
			.catch(e => {
				console.log(e)
				alert('Hata')
			})
	}

	const printDoc = async () => {
		if (onPrint) {
			await onPrint()
		}
		window.open()
		setTimeout(() => {
			window.print()
		}, 500)
	}

	if (status === STATUS.LOADING || !currentCase) {
		return <LoadingCircle />
	}

	const debtors = findDistrainableDebtors(currentCase, currentCase.debtors)
	const caseThirdPersons = currentCase.thirdPersons

	if (type === printer.ENFORCEMENT_REQUEST.value) {
		return (
			<div ref={componentRef} className="printer">
				<ReactToPrint
					onAfterPrint={onAfterPrint}
					trigger={() => (
						<Button
							theme="blue"
							classes="mt-8 py-3 fw-600 blue fs-nm al-center jst-center w-100"
							onClick={printDoc}
						>
							<FaPrint className="mr-2" /> {title || 'Yazdır'}
						</Button>
					)}
					content={() => componentRef.current}
				/>
				<EnforcementRequest
					currentCase={currentCase}
					{...currentCase}
					paperDebtors={paperDebtors}
				/>
				<EnforcementRequest
					currentCase={currentCase}
					{...currentCase}
					paperDebtors={paperDebtors}
				/>
			</div>
		)
	}

	if (type === 'BULK') {
		return (
			<div ref={componentRef} className="printer">
				<ReactToPrint
					trigger={() => (
						<Button
							theme="blue"
							classes="mt-4 blue fw-500 al-center jst-center w-100"
							onClick={printDoc}
						>
							<FaPrint className="mr-2" /> {title || 'Yazdır'}
						</Button>
					)}
					content={() => componentRef.current}
				/>
				<BulkQueryPaper
					{...currentCase}
					paperDebtors={paperDebtors}
					queryList={queryList}
					lawOffice={lawOffice}
					bankList={bankList}
				/>
			</div>
		)
	}

	if (type === 'intel') {
		return (
			<div ref={componentRef} className="printer">
				<ReactToPrint
					onAfterPrint={onAfterPrint}
					trigger={() => (
						<Button
							theme="blue"
							classes="py-3 blue fw-500 al-center jst-center w-100"
							onClick={onPrint}
						>
							<FaPrint className="mr-2" /> {title || 'Yazdır'}
						</Button>
					)}
					content={() => componentRef.current}
				/>
				{intelList.map(intelType => {
					const type = Object.values(INTEL_TYPE).find(
						t => t.entityName === intelType,
					)
					return (
						<div ref={componentRef} className="printer">
							<RequestPaper
								request={type.value}
								{...currentCase}
								paperDebtors={selectedDebtors}
							/>
							<React.Fragment>
								{type.warrant && (
									<WarrantPaper
										{...currentCase}
										debtors={selectedDebtors}
										debtor={selectedDebtors[0]}
										type={type.value}
										object={object}
										thirdPersons={thirdPersons}
									/>
								)}
								{type.envelope && (
									<NoticePaper
										{...currentCase}
										debtors={selectedDebtors}
										debtor={selectedDebtors[0]}
										type={type.value}
									/>
								)}
							</React.Fragment>
						</div>
					)
				})}
			</div>
		)
	}

	return (
		<div>
			<Modal visible={isPanelVisible} close={() => setIsPanelVisible(false)}>
				<Modal
					visible={isDebtorsModalVisible}
					close={() => setIsDebtorsModalVisible(false)}
				>
					<div className="multi-select-modal">
						<div className="flex al-center jst-between">
							<p className="fw-600 blue">Borçlular</p>
							<button
								onClick={() => setIsDebtorsModalVisible(false)}
								className="flex al-center"
							>
								<FaTimes className="mr-1" />
								<span className="fw-500">Kapat</span>
							</button>
						</div>
						<div className="step-item-divider my-4"></div>
						{debtors.map((debtor, index) => {
							const isLast = index === debtors.length - 1
							const isSelected =
								selectedDebtors.filter(d => d._id === debtor._id).length !== 0
							return (
								<Button
									classes={`${isLast ? '' : 'mb-2'} ${
										isSelected ? 'blue' : ''
									}`}
									onClick={() => {
										setSelectedDebtors(
											isSelected
												? selectedDebtors.filter(d => d._id !== debtor._id)
												: [...selectedDebtors, { ...debtor }],
										)
									}}
								>
									{isSelected ? <FaCheckSquare /> : <FaRegSquare />}
									<p className="ml-2">
										<span className="fw-500">{getDebtorName(debtor)} </span>
										{getDebtorIdentityString(debtor) && (
											<span className="gray">
												({getDebtorIdentityString(debtor)})
											</span>
										)}
									</p>
								</Button>
							)
						})}
					</div>
				</Modal>
				<Modal
					visible={isThirdPersonsModalVisible}
					close={() => setIsThirdPersonsModalVisible(false)}
				>
					<div className="multi-select-modal">
						<div className="flex al-center jst-between">
							<p className="fw-600 blue">3. Şahıslar</p>
							<button
								onClick={() => setIsThirdPersonsModalVisible(false)}
								className="flex al-center"
							>
								<FaTimes className="mr-1" />
								<span className="fw-500">Kapat</span>
							</button>
						</div>
						<div className="step-item-divider my-4"></div>
						{caseThirdPersons.map((debtor, index) => {
							const isLast = index === caseThirdPersons.length - 1
							const isSelected =
								selectedThirdPersons.filter(d => d._id === debtor._id)
									.length !== 0
							return (
								<Button
									classes={`${isLast ? '' : 'mb-2'} ${
										isSelected ? 'blue' : ''
									}`}
									onClick={() => {
										setSelectedThirdPersons(
											isSelected
												? selectedThirdPersons.filter(d => d._id !== debtor._id)
												: [...selectedThirdPersons, { ...debtor }],
										)
									}}
								>
									{isSelected ? <FaCheckSquare /> : <FaRegSquare />}
									<p className="ml-2">
										<span className="fw-500">{getDebtorName(debtor)} </span>
										{getDebtorIdentityString(debtor) && (
											<span className="gray">
												({getDebtorIdentityString(debtor)})
											</span>
										)}
									</p>
								</Button>
							)
						})}
					</div>
				</Modal>
				<div className="printer-panel">
					<div className="printer-panel__body">
						<div className="printer-panel__item">
							<p className="fw-600">Dosya</p>
							<div className="step-item-divider my-2"></div>
							<select
								onChange={e => setSelectedRequest(e.target.value)}
								value={selectedRequest}
								className="input w-100"
							>
								{Object.keys(printer).map(key => {
									return (
										<option value={printer[key].value}>
											{printer[key].name}
										</option>
									)
								})}
							</select>
						</div>
						<div className="printer-panel__item">
							<div className="flex al-center">
								<p className="fw-600 mr-2">Borçlular</p>
								<button
									onClick={() => setIsDebtorsModalVisible(true)}
									className="blue fw-500 ml-2 fs-sm"
								>
									Borçlu Seç
								</button>
							</div>
							<div className="step-item-divider my-2"></div>
							{selectedDebtors.length > 0 ? (
								selectedDebtors.map(debtor => {
									return <div className="mb-2">{getDebtorName(debtor)}</div>
								})
							) : (
								<p>Henüz borçlu seçilmemiş</p>
							)}
						</div>
						<div className="printer-panel__item">
							<div className="flex al-center">
								<p className="fw-600 mr-2">3. Şahıslar</p>
								<button
									onClick={() => setIsThirdPersonsModalVisible(true)}
									className="blue fw-500 ml-2 fs-sm"
								>
									3.Şahıs Seç
								</button>
							</div>
							<div className="step-item-divider my-2"></div>
							{selectedThirdPersons.length > 0 ? (
								selectedThirdPersons.map(debtor => {
									return <div className="mb-2">{getDebtorName(debtor)}</div>
								})
							) : (
								<p>Henüz 3. şahıs seçilmemiş</p>
							)}
						</div>
					</div>
					<ReactToPrint
						trigger={() => (
							<Button
								theme="blue"
								classes="mt-8 blue fw-500 al-center jst-center w-100"
								onClick={printDoc}
							>
								<FaPrint className="mr-2" /> {title || 'Yazdır'}
							</Button>
						)}
						content={() => componentRef.current}
					/>
				</div>
			</Modal>
			<Button
				classes="blue fw-500 al-center jst-center"
				onClick={() => setIsPanelVisible(!isPanelVisible)}
			>
				<FaPrint className="mr-2" /> {title || 'Yazdır'}
			</Button>
			{type === 'requestPaper' && request !== 21 && request !== 35 && (
				<div ref={componentRef} className="printer">
					<RequestPaper
						request={selectedRequest}
						{...currentCase}
						paperDebtors={selectedDebtors}
					/>
					{selectedDebtors.map(debtor => {
						return (
							<React.Fragment key={debtor._id}>
								{printer[request].warrant && (
									<WarrantPaper
										{...currentCase}
										debtor={debtor}
										type={request}
										object={object}
										thirdPersons={thirdPersons}
									/>
								)}
								{printer[request].envelope && (
									<NoticePaper
										{...currentCase}
										debtor={debtor}
										type={request}
									/>
								)}
							</React.Fragment>
						)
					})}
				</div>
			)}

			{(request === printer['21'].value || request === 35) && (
				<div ref={componentRef} className="printer">
					{selectedDebtors.map(debtor => {
						return (
							<React.Fragment key={debtor._id}>
								<OrderOfPayment {...currentCase} debtors={[debtor]} />
								<NoticePaper {...currentCase} debtor={debtor} />
							</React.Fragment>
						)
					})}
				</div>
			)}
		</div>
	)
}
