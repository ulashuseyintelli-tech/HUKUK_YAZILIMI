import Router from 'next/router'
import React, { useEffect, useState } from 'react'
import {
	FaBuilding,
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
import { createImmovable } from '../../../services/immovableService'
import LoadingCircle from '../../anBrains/animations/LoadingCircle'
import Button from '../../anBrains/Button'
import ImmovableInfo from '../../debtorAssets/immovable/ImmovableInfo'
import NewImmovableForm from '../../debtorAssets/immovable/NewImmovableForm'
import Note from '../../Note'

export default function Six({ debtor }) {
	const {
		assetProps: { visibleAsset, status: assetStatus },
		currentCase,
		setCurrentCase,
	} = useInpoundmentContext()

	const [status, setStatus] = useState(STATUS.NORMAL)
	const [isAssetFormVisible, setIsAssetFormVisible] = useState(false)
	const [isAssetDetailsVisible, setIsAssetDetailsVisible] = useState(false)

	const [isBlinking, setIsBlinking] = useState(
		getCasePartOpacity(currentCase, 'hypotec'),
	)

	useEffect(() => {
		if (currentCase.isDebtorsCompleted && !currentCase.isHypotecInfoCompleted) {
			setIsAssetDetailsVisible(true)
			if (!currentCase.hypotecInfo.assetType) {
				updateHypotecInfo('assetType', 'IMMOVABLE')
			}
		}
	}, [currentCase])

	const updateHypotecInfo = async (property, value) => {
		setStatus(STATUS.LOADING)
		currentCase.hypotecInfo[property] = value
		await saveCase(currentCase.number, currentCase)
			.then(res => {
				setCurrentCase({ ...res.data })
			})
			.catch(e => {
				alert('Bilinmeyen bir hata meydana geldi!')
			})
		setStatus(STATUS.NORMAL)
	}

	const createAsset = async asset => {
		setStatus(STATUS.LOADING)
		await createImmovable(
			currentCase._id,
			debtor._id,
			{ ...asset, withoutTasks: true },
			null,
		)
			.then(async res => {
				await updateHypotecInfo('assetId', res.data._id)
				setIsAssetFormVisible(false)
			})
			.catch(e => {
				alert('Taşınmaz oluşturulurken hata meydana geldi')
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
				setIsAssetDetailsVisible(false)
			})
			.catch(e => handleError(e))
		setStatus(STATUS.NORMAL)
	}

	const goInpoundment = () => {
		Router.push(
			`/takip/${currentCase.number}/haciz?assetType=${currentCase.hypotecInfo.assetType}&assetId=${currentCase.hypotecInfo.assetId}&debtorId=${debtor._id}`,
		)
	}

	return (
		<div
			className="inpoundment-asset-card mt-4 relative"
			disabled={!getCasePartOpacity(currentCase, 'hypotec')}
		>
			<NewImmovableForm
				visible={isAssetFormVisible}
				close={() => setIsAssetFormVisible(false)}
				add={createAsset}
			/>
			<React.Fragment>
				<Button
					classes="w-100 jst-between orange bold fs-nm"
					onClick={() => setIsAssetDetailsVisible(!isAssetDetailsVisible)}
				>
					<div className="flex al-center">
						<div className="btn btn-orange p-2 mr-2">
							<FaBuilding />
						</div>
						<p>Taşınmaz Detayları</p>
					</div>
					{isAssetDetailsVisible ? (
						<FaChevronCircleUp className="orange" />
					) : (
						<FaChevronCircleDown className="orange" />
					)}
				</Button>
				{(
					currentCase.hypotecInfo.assetId
						? assetStatus === STATUS.LOADING
						: status === STATUS.LOADING
				) ? (
					<LoadingCircle />
				) : (
					isAssetDetailsVisible && (
						<div className="mt-4">
							<div className="step-item-divider my-4"></div>
							{currentCase.hypotecInfo.assetId && visibleAsset ? (
								<>
									<ImmovableInfo />
									{visibleAsset &&
									checkEffectiveDateByNotificationList(
										currentCase,
										debtor.notifications,
									) ? (
										<Button
											theme="orange"
											classes="w-100 py-3 fw-600 mt-8"
											onClick={goInpoundment}
										>
											Haciz İşlemleri
										</Button>
									) : (
										<Note type="zekiye">
											Haciz işlemleri için takibin kesinleşmesi bekleniyor
										</Note>
									)}
									{(!visibleAsset || !currentCase.isHypotecInfoCompleted) && (
										<Button
											theme="orange"
											classes="w-100 py-3 fw-600 mt-8"
											onClick={completeHypotecInfo}
										>
											KAYDET
											<FaCheck className="ml-2" />
										</Button>
									)}
								</>
							) : (
								<div>
									<p className="fs-sm">
										Henüz taşınmaz detayları girilmemiş. Taşınmaz detaylarını
										girmeniz gerekiyor
									</p>
									<Button
										theme="orange"
										classes="mt-4 fw-600"
										onClick={() => setIsAssetFormVisible(true)}
									>
										Taşınmaz Detaylarını Gir
									</Button>
								</div>
							)}
						</div>
					)
				)}
			</React.Fragment>
			{!currentCase.isHypotecInfoCompleted && (
				<Note
					type="zekiye"
					classes="teacher"
					blinking={isBlinking}
					onMouseOver={() => setIsBlinking(false)}
				>
					Bir sonraki aşamaya geçebilmek için taşınmaz detaylarını girin
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
