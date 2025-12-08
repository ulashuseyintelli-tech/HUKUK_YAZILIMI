import React, { useEffect, useState } from 'react'
import {
	DEBTOR_TYPES,
	SALARY_INFO,
	STATUS,
	TASK_TYPE,
	THIRD_PERSON_REASONS,
} from '../../../constants'
import { isMoreThanOneMonth } from '../../../helpers/Helper'
import useInpoundmentContext from '../../../services/hooks/useInpoundmentContext'
import Button from '../../anBrains/Button'
import InpoundmentBackButton from '../../inpoundments/InpoundmentBackButton'
import InpoundmentCreation from '../../inpoundments/InpoundmentCreation'
import InpoundmentStep from '../../inpoundments/InpoundmentStep'
import InpoundmentStepper from '../../inpoundments/InpoundmentStepper'
import RestrictionTable from '../../inpoundments/RestrictionTable'
import Note from '../../Note'
import TaskField from '../../task/TaskField'
import ThirdPersonList from '../../ThirdPersonList'
import TrueFalse from '../../TrueFalse'
import Assets100 from '../commonSteps/Assets100'
import SsiStep3 from './steps/SsiStep3'

export default function Ssi({ ssi }) {
	const {
		assetProps: { visibleAsset, setVisibleAssetId, updateAsset },
	} = useInpoundmentContext()

	const [company, setCompany] = useState(null)

	return (
		<div className={`${visibleAsset ? '' : 'inpoundment-asset-card'}`}>
			<InpoundmentBackButton />
			<Button
				classes="column al-start"
				onClick={() => setVisibleAssetId(ssi._id)}
			>
				<p className="bold fs-md">
					{new Date(ssi.registrationDate).toLocaleDateString('tr-TR')} tarihinde
					son sigorta aktifliği
				</p>
				<p className="mt-1">
					Son Güncelleme: {new Date(ssi.lastUpdate).toLocaleDateString('tr-TR')}
				</p>
			</Button>
			{visibleAsset && visibleAsset._id === ssi._id && (
				<div className="mt-8">
					<InpoundmentStepper />
					{visibleAsset && visibleAsset.restriction.isCancelledByThreshold && (
						<div className="mt-10">
							<RestrictionTable />
						</div>
					)}
					<InpoundmentStep step={1}>
						<p className="fw-500 mb-2 mt-4">İşyeri Bilgisi</p>
						<ThirdPersonList
							nonSelect
							setThirdPerson={setCompany}
							thirdPersonId={visibleAsset.companyId}
							setId={_id => updateAsset('companyId', _id)}
							type={DEBTOR_TYPES.INSTITUTION}
							thirdPersonReason={THIRD_PERSON_REASONS.SSI.value}
						/>

						<div className="step-item-divider"></div>
						{isMoreThanOneMonth(visibleAsset.registrationDate) ? (
							<div>
								<TaskField
									type={TASK_TYPE.SHOULD_CREATE_SSI_INPOUNDMENT}
									title="Sigorta Yatırılma Tarihi 1 ayı geçmiş. Haciz hazırlansın mı?"
								>
									<TrueFalse
										change={updateAsset}
										property="shouldCreateInpoundment"
										object={visibleAsset}
										options={['Hayır, hazırlanmasın', 'Evet, hazırlansın']}
									/>
								</TaskField>
							</div>
						) : null}
						<div className="step-item-divider"></div>
						{ssi.shouldCreateInpoundment && company && <InpoundmentCreation />}
					</InpoundmentStep>
					<InpoundmentStep step={2}>
						{ssi.restriction.exist === true &&
							!ssi.restriction.table[0]?.withoutCreditor && (
								<Note type="zekiye">
									Maaş haczine devam edebilmek için takyidat sırasının bize
									gelmesini beklememiz gerekiyor.
								</Note>
							)}
						<div className="step-item-divider"></div>
						<RestrictionTable />
					</InpoundmentStep>
					<InpoundmentStep step={3}>
						<Assets100 />
					</InpoundmentStep>
					<SsiStep3 />
				</div>
			)}
		</div>
	)
}
