import React, { useState, useEffect } from 'react'
import { getAllThirdPersons } from '../../../services/deptorService'
import {
	STATUS,
	GARNISHMENT_DETAILS,
	NOTIFICATION_STATUS,
	TASK_TYPE,
	NOTIFICATION_TYPE,
	DEBTOR_TYPES,
	SALARY_INFO,
} from '../../../constants'
import InpoundmentStep from '../../inpoundments/InpoundmentStep'
import Modal from '../../anBrains/Modal'
import TrueFalse from '../../TrueFalse'
import NewThirdPersonForm from '../../forms/NewThirdPersonForm'
import LoadingCircle from '../../anBrains/animations/LoadingCircle'
import { FaInfoCircle } from 'react-icons/fa'
import GarnishmentForm from '../../debtorAssets/GarnishmentForm'
import printer from '../../../printer'
import Printer from '../../Printer'
import RestrictionTable from '../../inpoundments/RestrictionTable'
import { getFutureTask } from '../../../services/taskService'
import useInpoundmentContext from '../../../services/hooks/useInpoundmentContext'
import InpoundmentStepper from '../../inpoundments/InpoundmentStepper'
import TaskField from '../../task/TaskField'
import AssetNotifications from '../../notification/AssetNotifications'
import RadioSelect from '../../RadioSelect'
import Note from '../../Note'
import ThirdPersonList from '../../ThirdPersonList'
import TaskRow from '../../task/TaskRow'
import InpoundmentCreation from '../../inpoundments/InpoundmentCreation'
import Assets100 from '../../debtorAssets/commonSteps/Assets100'

export default function DeFactoStep5() {
	const {
		debtorTasks,
		assetProps: { visibleAsset, updateAsset },
	} = useInpoundmentContext()

	const [status, setStatus] = useState(STATUS.LOADING)
	const [isThirdPersonFormOpen, setIsThirdPersonFormOpen] = useState(false)
	const [thirdPersons, setThirdPersons] = useState([])

	const [garnishmentDetails, setGarnishmentDetails] = useState({
		...SALARY_INFO,
	})

	const [futureCollectionTasks, setFutureCollectionTasks] = useState([])
	const [tasksStatus, setTasksStatus] = useState(STATUS.NORMAL)

	const [step, setStep] = useState(0)

	useEffect(() => {
		load()
	}, [])

	const load = async () => {
		getThirdPersons()
		getFutureCollectionTasks()
		setStatus(STATUS.NORMAL)
	}

	const getThirdPersons = async () => {
		await getAllThirdPersons()
			.then(res => {
				setThirdPersons(res.data)
			})
			.catch(() => alert('Hata'))
	}

	const getFutureCollectionTasks = async () => {
		setTasksStatus(STATUS.LOADING)
		await getFutureTask('DE_FACTO', visibleAsset._id)
			.then(res => {
				setFutureCollectionTasks(res.data)
			})
			.catch(e => handleError(e))
		setTasksStatus(STATUS.NORMAL)
	}

	return (
		<div>
			<Modal
				visible={isThirdPersonFormOpen}
				close={() => setIsThirdPersonFormOpen(false)}
			>
				{/* //TODO: Bakılacak */}
				<NewThirdPersonForm
					close={() => setIsThirdPersonFormOpen(false)}
					thirdPersons={thirdPersons}
					setThirdPersons={setThirdPersons}
				/>
			</Modal>
			<InpoundmentStepper
				assetType={'GARNISHMENT'}
				setCustomCurrentStep={setStep}
				customCurrentStep={step}
			/>
			{visibleAsset && visibleAsset.restriction.isCancelledByThreshold && (
				<div className="mt-10">
					<RestrictionTable />
				</div>
			)}
			<InpoundmentStep step={1} customCurrentStep={step} type="GARNISHMENT">
				<div className="mt-8"></div>
				<TaskRow
					conditions={[
						true,
						visibleAsset.consentToGarnishment,
						visibleAsset.personConsentGarnishment === 1,
						visibleAsset.personConsentGarnishment === 0 ||
							(visibleAsset.personConsentGarnishment === 1 &&
								visibleAsset.thirdPersonConsentGarnishmentId),
					]}
					types={[
						TASK_TYPE.DE_FACTO_CONSENT_TO_GARNISHMENT,
						TASK_TYPE.DE_FACTO_PERSON_CONSENT_TO_GARNISHMENT,
						TASK_TYPE.DE_FACTO_PERSON_CONSENT_TO_GARNISHMENT,
						TASK_TYPE.DE_FACTO_COMPANY_OF_PERSON_CONSENT_TO_GARNISHMENT,
					]}
					titles={[
						'Maaş Rızası Var Mı?',
						'Maaş Rızasında Bulunan Kişi',
						'3. Şahıs Bilgileri',
						'Şirket Bilgileri',
					]}
					children={[
						<TrueFalse
							options={['Yok', 'Var']}
							object={visibleAsset}
							property="consentToGarnishment"
							change={updateAsset}
						/>,
						<TrueFalse
							options={['Borçlu', '3. Şahıs']}
							object={visibleAsset}
							property="personConsentGarnishment"
							change={updateAsset}
						/>,
						<div className="mt-4">
							<ThirdPersonList
								type={DEBTOR_TYPES.PERSON}
								thirdPersonId={visibleAsset.thirdPersonConsentGarnishmentId}
								setId={id => updateAsset('thirdPersonConsentGarnishmentId', id)}
							/>
						</div>,
						<div className="mt-4">
							<ThirdPersonList
								type={DEBTOR_TYPES.INSTITUTION}
								thirdPersonId={visibleAsset.companyId}
								setId={id => updateAsset('companyId', id)}
								selectBoxText="Şirket Seç"
							/>
						</div>,
					]}
				/>
				{visibleAsset.consentToGarnishment &&
					(visibleAsset.personConsentGarnishment === 0 ||
						(visibleAsset.personConsentGarnishment === 1 &&
							visibleAsset.thirdPersonConsentGarnishmentId !== null)) &&
					visibleAsset.companyId && (
						<>
							{' '}
							<div className="step-item-divider"></div> <InpoundmentCreation />
						</>
					)}
			</InpoundmentStep>
			{visibleAsset.consentToGarnishment && (
				<React.Fragment>
					<React.Fragment>
						<InpoundmentStep
							step={2}
							customCurrentStep={step}
							type="GARNISHMENT"
						>
							{visibleAsset.restriction.exist === true &&
								!visibleAsset.restriction.table[0]?.withoutCreditor && (
									<Note type="zekiye" classes="mt-10">
										Maaş haczine devam edebilmek için takyidat sırasının bize
										gelmesini beklememiz gerekiyor.
									</Note>
								)}
							<div className="step-item-divider"></div>
							<RestrictionTable type="GARNISHMENT" />
						</InpoundmentStep>
						<InpoundmentStep
							step={3}
							customCurrentStep={step}
							type="GARNISHMENT"
						>
							<Assets100 type="GARNISHMENT" />
						</InpoundmentStep>
						<InpoundmentStep
							step={4}
							customCurrentStep={step}
							type="GARNISHMENT"
						>
							<GarnishmentForm
								garnishmentDetails={garnishmentDetails}
								setGarnishmentDetails={setGarnishmentDetails}
								fieldName="garnishmentDetails"
								customCurrentStep={step}
								type={'GARNISHMENT'}
							/>
						</InpoundmentStep>
					</React.Fragment>
				</React.Fragment>
			)}
		</div>
	)
}
