import Router from 'next/router'
import { useState } from 'react'
import {
	FaCheckSquare,
	FaInfoCircle,
	FaPen,
	FaPlus,
	FaRegSquare,
	FaTimes,
} from 'react-icons/fa'
import { UTILS } from '../../constants'
import { checkCaseInitialized } from '../../helpers/Helper'
import useInpoundmentContext from '../../services/hooks/useInpoundmentContext'
import LoadingAnimation from '../anBrains/animations/LoadingAnimation/LoadingAnimation'
import Button from '../anBrains/Button'
import Modal from '../anBrains/Modal'
import Input from '../anBrains/Input'
import Note from '../Note'

export default function CaseUtilsList({
	utils,
	setUtils,
	currentCase,
	handleClickItem,
	selectable,
	selectedUtils,
	title,
	status,
	modalListBody,
	listBody,
	utilItem,
	utilType,
	withoutTitle,
	withoutCreateButton,
	modalDescription,
	selectedListTitle,
	emptySelectedText,
	selectBoxText,
	disableCloseOnClick,
	disableListBodyClick,
}) {
	currentCase = useInpoundmentContext().currentCase || currentCase
	const { queryDebtorId, setSelectedDebtorId } = useInpoundmentContext()
	const [isEditing, setIsEditing] = useState(false)

	const [isFormOpen, setIsFormOpen] = useState(false)
	const [editingUtilId, setEditingUtilId] = useState(
		utilType === 'debtor' ? queryDebtorId : null,
	)
	const [searchTerm, setSearchTerm] = useState('')

	selectedUtils = selectedUtils || utils

	const closeModal = () => {
		setIsEditing(false)
		setIsFormOpen(false)
		setEditingUtilId(null)
	}

	const closeUtilItemModal = () => {
		setIsFormOpen(false)
		setEditingUtilId(null)
	}
	if (selectable && currentCase) {
		utils = utils.sort(u => (currentCase.debtorIds.includes(u._id) ? -1 : 1))
	}

	const selectDebtor = id => {
		if (checkCaseInitialized(currentCase)) {
			Router.push(`/takip/${currentCase.number}?debtorId=${id}`)
		}
	}

	utils = selectable
		? [...utils.filter(u => !selectedUtils.some(su => su._id === u._id))]
		: utils

	const filterBySearch = () => {
		if (searchTerm === '') {
			return [...utils]
		} else {
			return utils.filter(util => {
				return Object.values(util).some(value => {
					return `${value}`.toLowerCase().includes(searchTerm)
				})
			})
		}
	}

	return (
		<div className="case-utils">
			<LoadingAnimation status={status} />
			{!withoutTitle && (
				<div className="case-util-header">
					<span className="orange fw-600">{title}</span>
					{selectedUtils.length > 0 && (
						<Button
							theme="orange"
							classes="p-2"
							onClick={() => setIsEditing(true)}
						>
							<FaPen />
						</Button>
					)}
				</div>
			)}
			<div className={withoutTitle ? '' : 'mt-4'}>
				{selectedUtils.map((item, index) => {
					return (
						<>
							<Button
								onClick={() =>
									disableListBodyClick
										? () => {}
										: utilType === 'debtor'
										? selectDebtor(item._id)
										: setIsEditing(true)
								}
								classes="fs-nm bg br p-3 w-100 jst-start"
							>
								{React.cloneElement(listBody, { item, key: item._id + index })}
							</Button>
							{index !== selectedUtils.length - 1 && (
								<div className="mb-4"></div>
							)}
						</>
					)
				})}
				{selectedUtils.length === 0 && (
					<div
						className={`column al-center jst-center ${
							!withoutTitle ? 'my-4' : ''
						}`}
					>
						{selectable && (
							<Button
								theme={withoutCreateButton ? 'basic' : 'blue'}
								onClick={() => setIsEditing(true)}
								classes={`${withoutCreateButton ? '' : 'mb-4'} ${
									withoutTitle ? '' : 'mt-4'
								}`}
							>
								<FaPlus className="mr-2 fs-xsm" />
								<span className="fw-500">
									{selectBoxText || `${UTILS[utilType.toUpperCase()].text} Seç`}
								</span>
							</Button>
						)}
						{!withoutCreateButton && (
							<Button theme="green" onClick={() => setIsFormOpen(true)}>
								<FaPlus className="mr-2 fs-xsm" />
								<span className="fw-500">
									Yeni {UTILS[utilType.toUpperCase()].text} Oluştur
								</span>
							</Button>
						)}
					</div>
				)}
			</div>
			<Modal
				disableCloseOnClick={disableCloseOnClick}
				visible={isEditing || isFormOpen || editingUtilId}
				close={closeModal}
			>
				<div className={utilType}>
					<div className="case-form__modal">
						{isFormOpen || editingUtilId ? (
							React.cloneElement(utilItem, {
								close: closeUtilItemModal,
								editingUtilId,
								utils,
								util: editingUtilId
									? [...utils, ...selectedUtils].find(
											u => u._id === editingUtilId,
									  )
									: null,
								handleClickItem,
								setDebtor: debtor => {
									const index = utils.findIndex(u => u._id === editingUtilId)
									utils[index] = debtor
									setUtils([...utils])
								},
							})
						) : (
							<>
								<div className="flex al-center jst-between mb-6">
									<div className="mr-4">
										<p className="bold fs-lg">
											{UTILS[utilType.toUpperCase()].plural}
										</p>
										{utilType !== UTILS.DUE.key && (
											<p className="fs-sm mt-1">
												{modalDescription ||
													`Takibe eklemek istediğiniz 
													${UTILS[utilType.toUpperCase()].text.toLowerCase()}
													yanındaki kutucuğa tıklayın.`}
											</p>
										)}
									</div>
									<div className="flex al-center">
										{utils.length + selectedUtils.length > 0 && (
											<Button theme="green" onClick={() => setIsFormOpen(true)}>
												<FaPlus className="mr-2 fs-xsm" />
												<span className="fw-500">
													Yeni {UTILS[utilType.toUpperCase()].text}
												</span>
											</Button>
										)}
										<Button
											classes="ml-4"
											theme="basic"
											icon={<FaTimes />}
											onClick={closeModal}
										>
											Kapat
										</Button>
									</div>
								</div>
								{/* {note} */}
								{utils.length === 0 && selectedUtils.length === 0 && (
									<div className="flex column al-center jst-center brd p-8 br mb-4">
										<p className="fs-md fw-500 mb-4">
											Henüz hiç {UTILS[utilType.toUpperCase()].text}{' '}
											oluşturulmamış
										</p>
										<Button theme="green" onClick={() => setIsFormOpen(true)}>
											<FaPlus className="mr-2 fs-xsm" />
											<span className="fw-500">
												Yeni {UTILS[utilType.toUpperCase()].text}
											</span>
										</Button>
									</div>
								)}
								{selectable && (
									<>
										<p className="fs-md fw-600 mb-4">
											{selectedListTitle ||
												`Takip ${UTILS[utilType.toUpperCase()].plural}ı`}
										</p>
										{selectedUtils.length === 0 ? (
											<Note classes="w-100">
												{emptySelectedText ||
													`
													Bu takibe henüz ${UTILS[utilType.toUpperCase()].text}
													eklenmemiş. Eğer daha önce oluşturduğunuz
													${UTILS[utilType.toUpperCase()].text} varsa aşağıdaki
													listeden seçebilir veya sağ üstten yeni bir
													${UTILS[utilType.toUpperCase()].text} oluşturabilirsiniz.
													`}
											</Note>
										) : (
											<div className="bg br p-4">
												{selectedUtils.map((item, index) => {
													return (
														<div
															className="case-details-item"
															key={item._id + index}
														>
															<Button
																classes="mr-4"
																onClick={() => handleClickItem(item)}
															>
																<FaCheckSquare className="green fs-md" />
															</Button>
															<Button
																classes="case-details-item__body"
																onClick={() =>
																	utilType === 'debtor'
																		? selectDebtor(item._id)
																		: setEditingUtilId(item._id)
																}
															>
																{modalListBody &&
																	React.cloneElement(modalListBody, { item })}
																<div className="flex al-center fw-500 fs-sm dark-blue">
																	Detaylar
																	<FaInfoCircle className="ml-1" />
																</div>
															</Button>
														</div>
													)
												})}
											</div>
										)}
									</>
								)}

								{selectable && (
									<p className="fs-md fw-600 mt-8 mb-4">
										Büronuz Tarafından Eklenmiş Tüm{' '}
										{UTILS[utilType.toUpperCase()].plural}
									</p>
								)}
								<Input
									placeholder="Aramak için bir terim girin"
									onChange={e => setSearchTerm(e.target.value)}
									classes="mb-4"
								/>
								<div className={`${selectable ? 'bg br p-4' : ''}`}>
									{filterBySearch().map((item, index) => {
										const selected = selectable
											? selectedUtils.findIndex(d => d._id === item._id) !== -1
											: false
										return (
											<div className="case-details-item" key={item._id + index}>
												{selectable && (
													<Button
														classes="mr-4"
														onClick={() => handleClickItem(item)}
													>
														{selected ? (
															<FaCheckSquare className="green fs-md" />
														) : (
															<FaRegSquare className="fs-md gray" />
														)}
													</Button>
												)}
												<Button
													classes={`case-details-item__body ${
														selectable ? '' : 'bg'
													}`}
													onClick={() => setEditingUtilId(item._id)}
												>
													{modalListBody &&
														React.cloneElement(modalListBody, { item })}
													{(utilType !== 'payment' ||
														(utilType === 'payment' &&
															!item.receivedMoneyCurrency)) && (
														<div className="flex al-center fw-500 fs-xsm btn btn-cute">
															Düzenle
															<FaPen className="ml-1 " />
														</div>
													)}
												</Button>
											</div>
										)
									})}
								</div>
							</>
						)}
					</div>
				</div>
			</Modal>
		</div>
	)
}
