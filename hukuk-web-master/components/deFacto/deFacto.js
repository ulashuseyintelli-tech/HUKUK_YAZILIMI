import React, { useState } from 'react'
import Input from '../anBrains/Input'
import InpoundmentStep from '../inpoundments/InpoundmentStep'
import TrueFalse from '../TrueFalse'
import {
	getDeFactoStepsCompletedStatus,
	toDateInputValue,
} from '../../helpers/Helper'
import Button from '../anBrains/Button'
import DeFactoStep4 from './steps/DeFactoStep4'
import DeFactoStep5 from './steps/DeFactoStep5'
import DeFactoMenu from './DeFactoMenu'
import { TASK_TYPE } from '../../constants'
import ReceivedAssets from '../ReceivedAssets'
import DeFactoStep3 from './steps/DeFactoStep3'
import useInpoundmentContext from '../../services/hooks/useInpoundmentContext'
import InpoundmentBackButton from '../inpoundments/InpoundmentBackButton'
import InpoundmentStepper from '../inpoundments/InpoundmentStepper'
import TaskRadar from '../task/TaskRadar'
import DeFactoStep1 from './steps/DeFactoStep1'
import ExpenseForm from '../expense/ExpenseForm'
import { FaCheck, FaEdit } from 'react-icons/fa'

export default function DeFacto() {
	const {
		assetProps: { visibleAsset, updateAsset, checkTasksIncludes },
	} = useInpoundmentContext()

	const [selectedTab, setSelectedTab] = useState(0)
	const [description, setDescription] = useState(visibleAsset.description)
	const [isEditing, setIsEditing] = useState(false)

	const saveDescription = async () => {
		await updateAsset('description', description)
		setDescription(visibleAsset.description)
		setIsEditing(false)
	}

	return (
		<div className="de-facto__day mt-4">
			<InpoundmentBackButton />
			<div className="flex al-start jst-between">
				<div className="w-100 mr-10">
					<p className="fs-md fw-500 mb-2">
						{new Date(visibleAsset.date).toLocaleDateString('tr-TR')} tarihli
						haciz günü
					</p>
					{isEditing ? (
						<div>
							<textarea
								placeholder="Fiili haciz açıklaması"
								onChange={e => setDescription(e.target.value)}
								className="input w-100 p-4"
								style={{ height: '5rem' }}
							/>
							<div className="flex al-center mt-2">
								<Button
									classes="red fw-500 mr-10"
									onClick={() => setIsEditing(!isEditing)}
								>
									Vazgeç
								</Button>
								<Button classes="blue fw-500" onClick={saveDescription}>
									<FaCheck className="mr-2" />
									Açıklamayı Kaydet
								</Button>
							</div>
						</div>
					) : (
						<>
							<p>{visibleAsset.description || 'Henüz açıklama eklenmemiş'}</p>
							<Button
								classes="blue fw-500 mt-2"
								onClick={() => setIsEditing(!isEditing)}
							>
								<FaEdit className="mr-2" />
								Açıklamayı Düzenle
							</Button>
						</>
					)}
				</div>
				<ExpenseForm />
			</div>
			<div className="step-item-divider"></div>
			<div className="mb-8"></div>
			<InpoundmentStepper />
			<InpoundmentStep step={1}>
				<div className="flex al-center">
					<TaskRadar containerClasses="w-50 mr-4">
						<p className="fw-500 mt-4">Haciz Günü Tarihi</p>
						<Input
							value={toDateInputValue(new Date(visibleAsset.date), 0)}
							classes="mt-2 w-50"
							type="date"
							onChange={e => updateAsset('date', e.target.value)}
						/>
					</TaskRadar>
					<div className="column al-start w-50">
						<TaskRadar
							right="-3rem"
							containerClasses="w-auto"
							always={checkTasksIncludes(TASK_TYPE.DE_FACTO_IS_DEBTOR_EXIST)}
						>
							<p className="fw-500 mt-4">Borçlu Adreste Miydi?</p>
						</TaskRadar>
						<TrueFalse
							options={['Adreste Yoktu', 'Adresteydi']}
							object={visibleAsset}
							property="isDebtorExist"
							change={updateAsset}
						/>
					</div>
				</div>
				{visibleAsset.isDebtorExist === false && (
					<div>
						<div className="step-item-divider"></div>
						<div className="flex al-center">
							<div className="column al-start w-50 mr-4">
								<TaskRadar
									right="-3rem"
									always={checkTasksIncludes(
										TASK_TYPE.DE_FACTO_IS_POLICE_HELPED,
									)}
								>
									<p className="fw-500 mt-4">
										Adreste olmadığı tespit edildi, polis ve çilingir
										vasıtasıyla giriş yapıldı mı?
									</p>
								</TaskRadar>
								<TrueFalse
									options={['Hayır', 'Evet, giriş yapıldı']}
									object={visibleAsset}
									property="isPoliceHelped"
									change={updateAsset}
								/>
							</div>
							{visibleAsset.isPoliceHelped && (
								<div className="w-50">
									<TaskRadar
										always={checkTasksIncludes(TASK_TYPE.IS_103_LEFT_TO_PLACE)}
									>
										<p className="fw-500 mt-4">Mahalde 103 Bırakıldı Mı?</p>
									</TaskRadar>
									<TrueFalse
										options={['Hayır', 'Evet, bırakıldı']}
										object={visibleAsset}
										property="is103LeftToPlace"
										change={updateAsset}
									/>
								</div>
							)}
						</div>
						{visibleAsset.isDebtorExist === false &&
							visibleAsset.isPoliceHelped === false && (
								<>
									<div className="step-item-divider"></div>
									<div className="flex al-center">
										<Button theme="blue" classes="mr-8 fw-500">
											Ticareti Beyansız Terk Davası Aç
										</Button>
										<Button theme="blue" classes="fw-500">
											İflas İstememe Ceza Davası Aç
										</Button>
									</div>
								</>
							)}
					</div>
				)}
			</InpoundmentStep>
			{getDeFactoStepsCompletedStatus(visibleAsset).STEP1 && (
				<InpoundmentStep step={2}>
					<div className="mt-4"></div>
					{(visibleAsset.isDebtorExist || visibleAsset.isPoliceHelped) && (
						<React.Fragment>
							<DeFactoMenu
								selectedTab={selectedTab}
								setSelectedTab={setSelectedTab}
							/>
							{selectedTab === 0 && <DeFactoStep1 />}
							{selectedTab === 1 && <ReceivedAssets />}
							{selectedTab === 2 && <DeFactoStep3 />}
							{selectedTab === 3 && <DeFactoStep4 />}
							{selectedTab === 4 && <DeFactoStep5 />}
						</React.Fragment>
					)}
				</InpoundmentStep>
			)}
		</div>
	)
}
