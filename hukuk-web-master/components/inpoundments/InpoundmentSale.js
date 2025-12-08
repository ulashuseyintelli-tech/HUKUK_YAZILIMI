import InpoundmentStep from './InpoundmentStep'
import TrueFalse from '../TrueFalse'
import Button from '../anBrains/Button'
import { STATUS, TASK_TYPE } from '../../constants'
import {
	calculateRestrictionCollections,
	findSuccessfulSaleDay,
	toDateInputValue,
} from '../../helpers/Helper'
import { useState, useEffect, useContext } from 'react'
import {
	getSaleByAsset,
	updateSale,
	updateSaleRequest,
	createSaleRequest,
} from '../../services/saleService'
import LoadingCircle from '../anBrains/animations/LoadingCircle'
import SaleRequest from './SaleRequest'
import { InpoundmentContext } from '../../pages/takip/CaseInpoundmentDetails'
import Note from '../Note'
import TaskField from '../task/TaskField'
import TaskRow from '../task/TaskRow'
import Input from '../anBrains/Input'

export default function InpoundmentSale({ type, customCurrentStep }) {
	const {
		assetProps: { visibleAsset },
		reloadDebtorTasks,
	} = useContext(InpoundmentContext)

	const [status, setStatus] = useState(STATUS.LOADING)
	const [sale, setSale] = useState(null)
	const [saleAmount, setSaleAmount] = useState(0)
	const [shareAmount, setShareAmount] = useState(null)
	const [dateOfSoldByAnotherCreditor, setDateOfSoldByAnotherCreditor] =
		useState(null)

	useEffect(() => {
		prepare()
	}, [])

	const prepare = async () => {
		await getSale()
		setStatus(STATUS.NORMAL)
	}

	const getSale = async () => {
		await getSaleByAsset(visibleAsset._id)
			.then(res => {
				setSale(res.data)
				setShareAmount(res.data.shareAmount)
				setSaleAmount(res.data.saleAmount)
				setDateOfSoldByAnotherCreditor(res.data.dateOfSoldByAnotherCreditor)
			})
			.catch(e => alert('Hata'))
	}

	const changeSaleProperty = (property, propertyValue) => {
		updateSale(sale._id, property, propertyValue).then(res => {
			sale[property] = propertyValue
			setSale({ ...sale })
		})
	}

	const changeSaleRequestProperty = (
		requestIndex,
		property,
		value,
		dayProperty,
		dayPropertyValue,
		dayIndex,
	) => {
		updateSaleRequest(
			sale.saleRequests[requestIndex]._id,
			property,
			value,
			dayProperty,
			dayPropertyValue,
			dayIndex,
		)
			.then(res => {
				sale.saleRequests[requestIndex] = res.data
				setSale({ ...sale })
			})
			.catch(e => alert('Hata'))
	}

	const changeSaleRequestDayProperty = (
		requestIndex,
		dayIndex,
		property,
		value,
	) => {
		sale.saleRequests[requestIndex].days[dayIndex][property] = value
		changeSaleRequestProperty(
			requestIndex,
			'days',
			sale.saleRequests[requestIndex].days,
			property,
			value,
			dayIndex,
		)
	}

	const saleRequestCreationConditions = () => {
		if (sale.saleRequests.length > 0) {
			const lastSaleRequest = sale.saleRequests[sale.saleRequests.length - 1]
			return (
				lastSaleRequest.responseStatus === false ||
				(lastSaleRequest.days[0].saleStatus === false &&
					lastSaleRequest.days[1].saleStatus === false)
			)
		} else {
			return true
		}
	}

	const _createSaleRequest = () => {
		if (saleRequestCreationConditions()) {
			createSaleRequest(sale._id)
				.then(res => {
					sale.saleRequests.push(res.data)
					sale.isSaleRequested = true
					changeSaleProperty('isSaleRequested', sale.isSaleRequested)
				})
				.catch(e => alert('Hata'))
		} else {
			alert(
				'Tüm satış taleplerinin sonucu olumsuz olmadan yeni satış talebi oluşturulamaz!',
			)
		}
	}

	if (status === STATUS.LOADING) return <LoadingCircle />

	return (
		<InpoundmentStep
			step="SALE"
			type={type}
			customCurrentStep={customCurrentStep}
		>
			{!visibleAsset.isSaleAdvancePaid && (
				<Note type="zekiye" classes="mb-4">
					Satış avansı yatırılmadı olarak gözüküyor. Eğer satış avansını
					yatırdıysanız takyidat detayları sekmesinden yatırıldı olarak
					işaretlemeyi unutmayın!
				</Note>
			)}
			<div className="flex">
				<TaskField
					className="w-50 mr-8"
					title="Başka Alacaklı Tarafından Satıldı Mı?"
					type={TASK_TYPE.SALE_SOLD_BY_ANOTHER_CREDITOR}
				>
					<TrueFalse
						object={sale}
						property="isSoldByAnotherCreditor"
						change={changeSaleProperty}
						options={['Satılmadı', 'Satıldı']}
					/>
				</TaskField>
				{sale.isSoldByAnotherCreditor && (
					<div className="w-50">
						<p className="fw-500 mb-4">
							Dilerseniz satış işlemine itiraz davası açabilirsiniz
						</p>
						<Button theme="red" classes="fw-500 mt-4">
							Satışa İtiraz Et
						</Button>
					</div>
				)}
			</div>
			{sale.isSoldByAnotherCreditor === false && (
				<React.Fragment>
					<div className="step-item-divider"></div>
					{sale.saleRequests.length > 0 && (
						<React.Fragment>
							<p className="bold fs-md mb-4">Satış Talepleri</p>
							{sale.saleRequests.map((saleRequest, saleRequestIndex) => {
								return (
									<SaleRequest
										sale={sale}
										object={visibleAsset}
										saleRequest={saleRequest}
										changeProperty={(p, v) => {
											reloadDebtorTasks()
											changeSaleRequestProperty(saleRequestIndex, p, v)
										}}
										changeDayProperty={(i, p, v) => {
											reloadDebtorTasks()
											changeSaleRequestDayProperty(saleRequestIndex, i, p, v)
										}}
										reqIndex={saleRequestIndex}
									/>
								)
							})}
						</React.Fragment>
					)}
					{saleRequestCreationConditions() && (
						<Note type="zekiye">
							<p className="ml-0">Satış talebi oluşturmanız gerekiyor</p>
							<Button
								theme="green"
								classes="jst-between fw-600 mt-2 "
								onClick={_createSaleRequest}
							>
								Satış Talebi Oluştur
							</Button>
						</Note>
					)}
				</React.Fragment>
			)}
			<div className="step-item-divider"></div>
			<TaskRow
				titles={[
					'Varlığı Kim Satın Aldı?',
					'Satış Tarihi',
					'Varlığın Satıldığı Fiyat',
					'Paya Düşen Para Miktarı',
				]}
				condition={findSuccessfulSaleDay(sale) || sale.isSoldByAnotherCreditor}
				conditions={[true, true, true, true]}
				types={[
					TASK_TYPE.SALE_DETAILS,
					TASK_TYPE.SALE_DETAILS,
					TASK_TYPE.SALE_DETAILS,
					TASK_TYPE.SALE_DETAILS,
				]}
				children={[
					<TrueFalse
						object={sale}
						property="boughtByUs"
						change={changeSaleProperty}
						options={['Başkası satın aldı', 'Biz satın aldık']}
					/>,
					<div className="w-100">
						<Input
							type="date"
							classes="mt-4 w-100"
							onChange={e => {
								setDateOfSoldByAnotherCreditor(e.target.value)
							}}
							value={
								dateOfSoldByAnotherCreditor
									? toDateInputValue(new Date(dateOfSoldByAnotherCreditor), 0)
									: null
							}
						/>
						<Button
							classes="mt-4 blue fw-600"
							disabled={
								new Date(dateOfSoldByAnotherCreditor).toDateString() ===
								new Date(sale.dateOfSoldByAnotherCreditor).toDateString()
							}
							onClick={() =>
								changeSaleProperty(
									'dateOfSoldByAnotherCreditor',
									new Date(dateOfSoldByAnotherCreditor),
								)
							}
						>
							Kaydet
						</Button>
					</div>,
					<div className="w-100">
						<Input
							classes="mt-4 w-100"
							placeholder="Varlık ne kadara satıldı?"
							onChange={e => setSaleAmount(e.target.value)}
							value={saleAmount}
						/>
						<Button
							classes="mt-4 blue fw-600"
							disabled={`${saleAmount}` === `${sale.saleAmount}`}
							onClick={() =>
								changeSaleProperty('saleAmount', parseInt(saleAmount))
							}
						>
							Kaydet
						</Button>
					</div>,
					<div className="w-100">
						<Input
							classes="mt-4 w-100"
							placeholder="Paya düşen para miktarı"
							onChange={e => setShareAmount(e.target.value)}
							value={shareAmount ? `${shareAmount}` : ''}
						/>
						{visibleAsset.restriction && saleAmount !== 0 && (
							<Note type="zekiye" classes="mt-2">
								<p>
									Sıra listesine göre paya düşen para{' '}
									<span className="fw-600">
										{
											calculateRestrictionCollections(
												parseInt(saleAmount),
												visibleAsset.restriction,
											).ourCollection
										}
									</span>
									₺ olmalıdır
								</p>
							</Note>
						)}
						<Button
							classes="mt-4 blue fw-600"
							disabled={`${shareAmount}` === `${sale.shareAmount}`}
							onClick={() =>
								changeSaleProperty('shareAmount', parseInt(shareAmount))
							}
						>
							Kaydet
						</Button>
					</div>,
				]}
			/>

			{sale.shareAmount &&
			sale.saleAmount &&
			sale.boughtByUs !== null &&
			(findSuccessfulSaleDay(sale) || sale.isSoldByAnotherCreditor) ? (
				<div className="inpoundment-sale-request mt-4">
					<TaskRow
						titles={['Para Hesaba Yatırıldı Mı?']}
						conditions={[true, sale.isMoneyTaken]}
						types={[TASK_TYPE.SALE_MONEY_INCOME_REQUIRED]}
						children={[
							<TrueFalse
								object={sale}
								property="isMoneyTaken"
								change={changeSaleProperty}
								options={['Yatırılmadı', 'Yatırıldı']}
							/>,
						]}
					/>
					<Note type="zekiye" classes="mt-4">
						"Para hesaba yatırıldı" olarak işaretlendiğinde otomatik olarak
						tahsilat oluşturulacaktır
					</Note>
				</div>
			) : null}
		</InpoundmentStep>
	)
}
