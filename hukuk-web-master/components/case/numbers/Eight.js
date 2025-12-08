import Router from 'next/router'
import { useEffect, useState } from 'react'
import {
	FaCheck,
	FaChevronCircleDown,
	FaChevronCircleUp,
	FaLongArrowAltLeft,
} from 'react-icons/fa'
import { STATUS } from '../../../constants'
import {
	checkEffectiveDateByNotificationList,
	getCasePartOpacity,
	goPreviousStepOfTeacher,
} from '../../../helpers/Helper'
import { saveCase } from '../../../services/caseService'
import useInpoundmentContext from '../../../services/hooks/useInpoundmentContext'
import { createPledgedMovable } from '../../../services/pledgedMovableService'
import LoadingCircle from '../../anBrains/animations/LoadingCircle'
import Button from '../../anBrains/Button'
import NewNormalAssetForm from '../../debtorAssets/normalAsset/NewNormalAssetForm'
import NormalAsset from '../../debtorAssets/normalAsset/NormalAsset'
import NewVehicleForm from '../../debtorAssets/vehicle/NewVehicleForm'
import Note from '../../Note'
import TrueFalse from '../../TrueFalse'

export default function Eight({ debtor }) {
	const {
		assetProps: { visibleAsset, status: assetStatus },
		currentCase,
		setCurrentCase,
	} = useInpoundmentContext()

	// This components means Number 8 Case, there is movable hypotec
	const [status, setStatus] = useState(STATUS.NORMAL)
	const [isOpen, setIsOpen] = useState(false)
	const [isAssetFormVisible, setIsAssetFormVisible] = useState(false)
	const [isAssetDetailsVisible, setIsAssetDetailsVisible] = useState(true)

	const [isBlinking, setIsBlinking] = useState(
		getCasePartOpacity(currentCase, 'hypotec'),
	)

	useEffect(() => {
		if (currentCase.isDebtorsCompleted && !currentCase.isHypotecInfoCompleted) {
			setIsOpen(true)
		}
	}, [currentCase])

	const updateHypotecInfo = (property, value) => {
		currentCase.hypotecInfo[property] = value
		saveCase(currentCase.number, currentCase)
			.then(res => {
				setCurrentCase({ ...res.data })
			})
			.catch(e => {
				console.log(e)
				alert('Bilinmeyen bir hata meydana geldi!')
			})
	}

	const createAsset = asset => {
		setStatus(STATUS.LOADING)
		createPledgedMovable(currentCase._id, debtor._id, asset)
			.then(res => {
				updateHypotecInfo('assetId', res.data._id)
				setIsAssetFormVisible(false)
			})
			.catch(e => {
				console.log(e)
				alert('Rehinli mal oluşturulurken hata meydana geldi')
			})
		setStatus(STATUS.NORMAL)
	}

	const completeHypotecInfo = async () => {
		setStatus(STATUS.LOADING)
		await saveCase(currentCase.number, {
			...currentCase,
			isHypotecInfoCompleted: true,
		})
			.then(res => {
				setCurrentCase(res.data)
				setIsOpen(false)
			})
			.catch(e => handleError(e))
		setStatus(STATUS.NORMAL)
	}

	const goInpoundment = () => {
		Router.push(
			`/takip/${currentCase.number}/haciz?debtorId=${debtor._id}&assetType=PLEDGED_MOVABLE&assetId=${currentCase.hypotecInfo.assetId}`,
		)
	}

	return (
		<div
			className="inpoundment-asset-card mt-4 relative"
			disabled={!getCasePartOpacity(currentCase, 'hypotec')}
		>
			<NewVehicleForm
				visible={
					isAssetFormVisible && currentCase.hypotecInfo.assetType === 'VEHICLE'
				}
				close={() => setIsAssetFormVisible(false)}
				add={createAsset}
			/>
			<NewNormalAssetForm
				visible={
					isAssetFormVisible &&
					currentCase.hypotecInfo.assetType === 'NORMAL_ASSET'
				}
				close={() => setIsAssetFormVisible(false)}
				add={createAsset}
			/>
			<Button
				onClick={() => setIsOpen(!isOpen)}
				classes="jst-between w-100 orange fs-nm"
			>
				<p className="bold">Rehinli Taşınır Bilgileri</p>
				{isOpen ? <FaChevronCircleUp /> : <FaChevronCircleDown />}
			</Button>
			{isOpen && (
				<>
					<p className="fw-600 mb-2 mt-4">Taşınır Tipi</p>
					{currentCase.hypotecInfo.assetId ? (
						<p>
							{currentCase.hypotecInfo.assetType === 'NORMAL_ASSET'
								? 'Mal'
								: 'Araç'}
						</p>
					) : (
						<TrueFalse
							property="assetType"
							object={currentCase.hypotecInfo}
							change={updateHypotecInfo}
							options={['Araç', 'Mal']}
							values={['VEHICLE', 'NORMAL_ASSET']}
						/>
					)}
					{currentCase.hypotecInfo.assetType && (
						<div>
							<div className="step-item-divider"></div>
							<Button
								classes="mb-4"
								onClick={() => setIsAssetDetailsVisible(!isAssetDetailsVisible)}
							>
								<p className="fs-nm fw-600 mr-4">Taşınır Bilgileri</p>
								{isAssetDetailsVisible ? (
									<FaChevronCircleDown className="blue" />
								) : (
									<FaChevronCircleUp className="blue" />
								)}
							</Button>
							{status === STATUS.LOADING || assetStatus === STATUS.LOADING ? (
								<LoadingCircle />
							) : (
								isAssetDetailsVisible && (
									<React.Fragment>
										{currentCase.hypotecInfo.assetId && visibleAsset ? (
											<React.Fragment>
												{currentCase.hypotecInfo.assetType === 'VEHICLE' ? (
													<div>
														<p>
															Aracın Marka - Modeli:{' '}
															{visibleAsset.properties.brand} -{' '}
															{visibleAsset.properties.model}
														</p>

														<p>
															Aracın Plakası:{' '}
															{visibleAsset.properties.licenseNumber}
														</p>
													</div>
												) : (
													<div>
														<p>Malın Adı: {visibleAsset.properties.name}</p>
														<p>Malın Tipi: {visibleAsset.properties.type}</p>
														<p>
															Malın Markası: {visibleAsset.properties.brand}
														</p>
														<p>Malın Boyutu: {visibleAsset.properties.size}</p>
													</div>
												)}
												{visibleAsset &&
													checkEffectiveDateByNotificationList(
														currentCase,
														debtor.notifications,
													) && (
														<Button
															theme="orange"
															classes="w-100 py-3 fw-600 mt-8"
															onClick={goInpoundment}
														>
															Haciz İşlemleri
														</Button>
													)}
												{(!visibleAsset ||
													!currentCase.isHypotecInfoCompleted) && (
													<Button
														theme="orange"
														classes="w-100 py-3 fw-600 mt-8"
														onClick={completeHypotecInfo}
													>
														KAYDET
														<FaCheck className="ml-2" />
													</Button>
												)}
											</React.Fragment>
										) : (
											<div>
												<p className="fs-sm">
													Henüz taşınır bilgileri girilmemiş. Taşınır
													bilgilerini girmeniz gerekiyor
												</p>
												<Note classes="mb-4 mt-2" type="warn">
													<span className="fs-sm">
														Taşınır bilgileri girildikten sonra Taşınır Tipi
														değiştirilemez!
													</span>
												</Note>
												<Button
													theme="green"
													classes="mt-4 fw-500"
													onClick={() => setIsAssetFormVisible(true)}
												>
													Taşınır Bilgilerini Gir
												</Button>
											</div>
										)}
									</React.Fragment>
								)
							)}
						</div>
					)}
				</>
			)}
			{currentCase.isDebtorsCompleted && !currentCase.isHypotecInfoCompleted && (
				<Note
					type="zekiye"
					classes="teacher"
					blinking={isBlinking}
					onMouseOver={() => setIsBlinking(false)}
				>
					Bir sonraki aşamaya geçebilmek için rehinli taşınır bilgilerini girin
					<Button
						classes="mt-4"
						onClick={() =>
							goPreviousStepOfTeacher(setStatus, currentCase, setCurrentCase)
						}
					>
						<FaLongArrowAltLeft className="fs-xsm blue" />
						<span className="fw-500 fs-xsm blue">Önceki Adım</span>
					</Button>
				</Note>
			)}
		</div>
	)
}
