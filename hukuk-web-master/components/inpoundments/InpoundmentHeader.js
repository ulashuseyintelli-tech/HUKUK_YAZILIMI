import React, { useContext, useState } from 'react'
import { getDebtorName } from '../../helpers/Helper'
import BulkQueryModal from './BulkQueryModal'
import Button from '../anBrains/Button'
import { DEBTOR_TYPES, INPOUNDMENT_TYPE } from '../../constants'
import { FaChevronDown, FaInfoCircle } from 'react-icons/fa'
import { InpoundmentContext } from '../../pages/takip/CaseInpoundmentDetails'

export default function InpoundmentHeader() {
	const {
		user,
		debtors,
		currentCase,
		selectedDebtorId,
		setSelectedDebtorId,
		visibleInpoundment,
		setVisibleInpoundment,
		isAvailableForAll,
	} = useContext(InpoundmentContext)

	const [isBulkInpoundmentModalOpen, setIsBulkInpoundmentModalOpen] = useState(
		false,
	)

	const selectedDebtor = debtors.filter(d => d._id === selectedDebtorId)[0]
	const isAvailableForOnlyDeFacto =
		selectedDebtor &&
		selectedDebtor.identityNumber === '' &&
		selectedDebtor.taxNumber === ''

	return (
		<React.Fragment>
			{isAvailableForOnlyDeFacto && (
				<div className="note mb-4">
					<FaInfoCircle />
					<p>
						Fiili Haciz dışındaki haciz türleri için borçluya{' '}
						{selectedDebtor.type === DEBTOR_TYPES.INSTITUTION
							? 'Vergi Numarası'
							: 'T.C. Kimlik Numarası'}{' '}
						girilmesi gerekiyor.
					</p>
				</div>
			)}
			<div className="inpoundments-menu">
				<div className="flex al-end">
					<div className="mr-4">
						<p className=" fs-sm blue fw-500">Borçlu</p>
						<div>
							<select
								className="p-0 pr-2"
								value={selectedDebtorId}
								onChange={e => setSelectedDebtorId(e.target.value)}
							>
								{debtors
									.filter(debtor => currentCase.debtorIds.includes(debtor._id))
									.map(debtor => {
										return (
											<option key={debtor._id} value={debtor._id}>
												{getDebtorName(debtor)}
											</option>
										)
									})}
							</select>
							<FaChevronDown className="fs-xsm" />
						</div>
					</div>
					{isAvailableForAll && (
						<div>
							<p className="fw-500 blue fs-sm">Haciz Türü</p>
							<div>
								<select
									value={visibleInpoundment}
									className="fs-sm p-0 pr-2"
									onChange={e => setVisibleInpoundment(e.target.value)}
								>
									{Object.keys(INPOUNDMENT_TYPE).map(key => {
										if (key === 'DE_FACTO' || !isAvailableForOnlyDeFacto) {
											return (
												<option value={key} key={key} className="fs-sm">
													{INPOUNDMENT_TYPE[key]}
												</option>
											)
										}
									})}
								</select>
								<FaChevronDown className="fs-xsm" />
							</div>
						</div>
					)}
				</div>
				{isAvailableForAll && !isAvailableForOnlyDeFacto && (
					<div>
						<BulkQueryModal
							user={user}
							debtors={debtors}
							visible={isBulkInpoundmentModalOpen}
							close={() => setIsBulkInpoundmentModalOpen(false)}
							currentCase={currentCase}
							selectedDebtorId={selectedDebtorId}
						/>
						{/* <Button
							theme="green"
							classes="fw-500 py-3"
							onClick={() =>
								setIsBulkInpoundmentModalOpen(!isBulkInpoundmentModalOpen)
							}
						>
							<FaSuitcase className="mr-2" />
							Toplu Haciz Sorgusu Yap
						</Button> */}
					</div>
				)}
			</div>
		</React.Fragment>
	)
}
