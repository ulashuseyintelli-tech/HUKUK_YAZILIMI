import React from 'react'
import { CASE_WAY } from '../../../constants'
import { updateCasePropertyByNumber } from '../../../services/caseService'
import useInpoundmentContext from '../../../services/hooks/useInpoundmentContext'
import CustodianInfo from '../../CustodianInfo'
import TrueFalse from '../../TrueFalse'

export default function Two() {
	const { currentCase, setCurrentCase } = useInpoundmentContext()

	const save = updatedCase => {
		updateCasePropertyByNumber(
			currentCase.number,
			'evacuationAndDeliveryDetails',
			{ ...updatedCase.evacuationAndDeliveryDetails },
		)
	}

	const changeProperty = (prop, val) => {
		currentCase.evacuationAndDeliveryDetails[prop] = val
		setCurrentCase({ ...currentCase })
		save(currentCase)
	}

	return (
		<div className="inpoundment-asset-card mt-4">
			{currentCase?.way === CASE_WAY['2'][0].value && (
				<React.Fragment>
					<p className="fs-lg blue fw-600">
						{
							Object.values(CASE_WAY['2']).filter(
								v => v.value === currentCase.way,
							)[0].text
						}
					</p>
					<div className="step-item-divider"></div>
					<p className="fw-500 mt-4">Taşınır Teslim Alınmaya Gidildi Mi?</p>
					<TrueFalse
						options={['Gidilmedi', 'Evet, gidildi']}
						object={currentCase.evacuationAndDeliveryDetails}
						property="isWent"
						change={(prop, val) => {
							changeProperty(prop, val)
						}}
					/>
					{currentCase.evacuationAndDeliveryDetails.isWent && (
						<React.Fragment>
							<div className="step-item-divider"></div>
							<p className="fw-500 mt-4">Taşınır Şahısa Teslim Edildi Mi?</p>
							<TrueFalse
								options={['Hayır', 'Evet, teslim alındı']}
								object={currentCase.evacuationAndDeliveryDetails}
								property="isDelivered"
								change={(prop, val) => {
									changeProperty(prop, val)
								}}
							/>
							{currentCase.evacuationAndDeliveryDetails.isDelivered ===
								false && (
								<React.Fragment>
									<div className="step-item-divider"></div>
									<p className="fw-500 mt-4">
										Taşınır Yeddiemine Mi Bırakıldı?
									</p>
									<TrueFalse
										options={['Hayır', 'Evet, bırakıldı']}
										object={currentCase.evacuationAndDeliveryDetails}
										property="isDeliveredToCustodian"
										change={(prop, val) => {
											changeProperty(prop, val)
										}}
									/>
									{currentCase.evacuationAndDeliveryDetails
										.isDeliveredToCustodian && (
										<div className="mt-8">
											<CustodianInfo
												customAsset={currentCase.evacuationAndDeliveryDetails}
												customUpdate={changeProperty}
											/>
										</div>
									)}
								</React.Fragment>
							)}
						</React.Fragment>
					)}
				</React.Fragment>
			)}
			{currentCase?.way === CASE_WAY['2'][1].value && (
				<React.Fragment>
					<p className="fw-500 mt-4">
						Taşınmaz Tahliye Edilmeye ve Teslim Alınmaya Gidildi Mi?
					</p>
					<TrueFalse
						options={['Gidilmedi', 'Evet, gidildi']}
						object={{ currentCase }}
						property="personMakeCommitment"
						change={(prop, val) => {
							setPersonMakeCommitment(val)
						}}
					/>
					<p className="fw-500 mt-4">Tahliye Edildi Mi?</p>
					<TrueFalse
						options={['Hayır', 'Evet, tahliye edildi']}
						object={{ currentCase }}
						property="personMakeCommitment"
						change={(prop, val) => {
							setPersonMakeCommitment(val)
						}}
					/>
					<p className="fw-500 mt-4">Teslim Alındı Mı?</p>
					<TrueFalse
						options={['Alınmadı', 'Evet, teslim alındı']}
						object={{ currentCase }}
						property="personMakeCommitment"
						change={(prop, val) => {
							setPersonMakeCommitment(val)
						}}
					/>
					<p className="fw-500 mt-4">Taşınır Yeddiemine Mi Bırakıldı?</p>
					<TrueFalse
						options={['Hayır', 'Evet, bırakıldı']}
						object={{ currentCase }}
						property="personMakeCommitment"
						change={(prop, val) => {
							setPersonMakeCommitment(val)
						}}
					/>
				</React.Fragment>
			)}
		</div>
	)
}
