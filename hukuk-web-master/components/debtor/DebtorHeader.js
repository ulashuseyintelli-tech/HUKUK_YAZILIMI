import Router from 'next/router'
import React, { useEffect, useState } from 'react'
import { FaLongArrowAltLeft, FaPaperclip, FaPen } from 'react-icons/fa'
import {
	DEBTOR_TYPES,
	NOTIFICATION_STATUS,
	NOTIFICATION_TYPE,
	TASK_TYPE,
} from '../../constants'
import { getDebtorName, handleError } from '../../helpers/Helper'
import { getGuaranteeByThirdPerson } from '../../services/guaranteeService'
import { useDebtorContext } from '../../services/hooks/useDebtorContext'
import useInpoundmentContext from '../../services/hooks/useInpoundmentContext'
import LoadingCircle from '../anBrains/animations/LoadingCircle'
import Button from '../anBrains/Button'
import Modal from '../anBrains/Modal'
import Guarantee from '../Guarantee'
import BulkQueryModal from '../inpoundments/BulkQueryModal'
import TaskRadar from '../task/TaskRadar'

export default function DebtorHeader({ setIsEditing }) {
	const { debtor, debtorTasks } = useDebtorContext()
	const { currentCase } = useInpoundmentContext()

	const [isLoading, setIsLoading] = useState(true)
	const [guarantee, setGuarantee] = useState(null)

	const [isBulkQueryModalVisible, setIsBulkQueryModalVisible] = useState(false)
	const [isGuaranteeDetailsVisible, setIsGuaranteeDetailsVisible] = useState(
		false,
	)

	useEffect(() => {
		if (
			debtor.thirdPersonReasons &&
			debtor.thirdPersonReasons.includes('guarantee')
		) {
			load()
		}
	}, [])

	const load = async () => {
		await getGuarantee()
		setIsLoading(false)
	}

	const getGuarantee = async () => {
		await getGuaranteeByThirdPerson(currentCase._id, debtor._id)
			.then(res => {
				setGuarantee(res.data)
			})
			.catch(handleError)
	}

	return (
		<div>
			<div className="flex al-center jst-between">
				<div className="flex al-center">
					<Button
						theme="basic"
						classes="py-1 mr-4 fs-xsm"
						onClick={() => Router.back()}
					>
						<FaLongArrowAltLeft className="mr-2" /> Geri Dön
					</Button>
				</div>
			</div>
			<div className="mt-4 flex al-center jst-between">
				<div className="flex column al-start">
					<div className="flex al-center">
						<p className="fs-xl fw-600 orange">{getDebtorName(debtor)}</p>
						<div className="badge-cyan fs-xsm ml-2 px py-0 ">
							{debtor.type === DEBTOR_TYPES.INSTITUTION ? 'Kurum' : 'Şahıs'}{' '}
							Borçlu
						</div>
						{debtor.thirdPersonReasons &&
							debtor.thirdPersonReasons.includes('guarantee') &&
							guarantee && (
								<TaskRadar
									top="-1rem"
									right="-2rem"
									always={debtorTasks.some(
										t => t.type === TASK_TYPE.GUARANTEE_FEE_MUST_PAY,
									)}
								>
									<Button
										onClick={() => setIsGuaranteeDetailsVisible(true)}
										classes="badge fs-xsm px-2 py-0 ml-4"
									>
										{isLoading ? (
											<LoadingCircle />
										) : (
											`${guarantee.amount}₺ tutarında `
										)}
										Kefil
									</Button>
									<Modal
										visible={isGuaranteeDetailsVisible}
										close={() => setIsGuaranteeDetailsVisible(false)}
									>
										<div className="case-form__modal p-10">
											<div className="flex al-center">
												<Button
													onClick={() => setIsGuaranteeDetailsVisible(false)}
												>
													<FaLongArrowAltLeft className="fs-lg" />
												</Button>
												<p className="fs-lg bold ml-4">Kefil</p>
											</div>
											<Guarantee
												debtor={debtor}
												debtorTasks={debtorTasks}
												size="large"
												guarantee={guarantee}
												setGuarantee={setGuarantee}
												caseId={currentCase._id}
											/>
										</div>
									</Modal>
								</TaskRadar>
							)}
					</div>
					<div className="mt-2">
						{debtor.type === DEBTOR_TYPES.INSTITUTION ? (
							<div className="flex al-center">
								<p className="mr-2">
									<span className="fw-500">Vergi No:</span>{' '}
									{debtor.taxNumber || 'Bilinmiyor'}
								</p>
								<p>
									<span className="fw-500">Vergi Dairesi:</span>{' '}
									{debtor.taxOffice || 'Bilinmiyor'}
								</p>
							</div>
						) : (
							<p>
								<span className="fw-500">T.C. Kimlik No:</span>{' '}
								{debtor.identityNumber || 'Bilinmiyor'}
							</p>
						)}
					</div>
				</div>
				<BulkQueryModal
					visible={isBulkQueryModalVisible}
					close={() => setIsBulkQueryModalVisible(false)}
				/>
				<div className="flex al-center">
					{debtor.notifications.some(
						n =>
							n.type === NOTIFICATION_TYPE.CASE_INITIALIZATION &&
							n.status === NOTIFICATION_STATUS.DONE.value,
					) && (
						<Button
							icon={<FaPaperclip className="fs-xsm" />}
							classes="fw-500 mr-8 blue"
							onClick={() => setIsBulkQueryModalVisible(true)}
						>
							Toplu Sorgu Yazdır
						</Button>
					)}
					<Button
						theme="orange"
						icon={<FaPen />}
						classes="fw-500"
						onClick={() => setIsEditing(true)}
					>
						Bilgileri Düzenle
					</Button>
				</div>
			</div>
		</div>
	)
}
