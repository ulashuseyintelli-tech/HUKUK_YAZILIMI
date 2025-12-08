import React, { useContext, useState } from 'react'
import {
	FaChevronDown,
	FaChevronUp,
	FaFileAlt,
	FaStore,
	FaWarehouse,
} from 'react-icons/fa'
import { TASK_TYPE } from '../constants'
import { InpoundmentContext } from '../pages/takip/CaseInpoundmentDetails'
import { cities, getDistrictsByCity } from '../services/cities'
import Button from './anBrains/Button'
import Input from './anBrains/Input'
import TaskRadar from './task/TaskRadar'

export default function CustodianInfo({ customAsset, customUpdate }) {
	const [isOpen, setIsOpen] = useState(true)

	const { assetProps } = useContext(InpoundmentContext)
	const visibleAsset = customAsset || assetProps.visibleAsset
	const updateAsset = customUpdate || assetProps.updateAsset
	const { checkTasksIncludes } = assetProps

	const [custodianName, setCustodianName] = useState(
		visibleAsset.custodianInfo.name,
	)
	const [custodianAddress, setCustodianAddress] = useState(
		visibleAsset.custodianInfo.address,
	)
	const [custodianStartDate, setCustodianStartDate] = useState(
		visibleAsset.custodianInfo.startDate,
	)
	const [custodianDailyPrice, setCustodianDailyPrice] = useState(
		visibleAsset.custodianInfo.dailyPrice,
	)

	const onChangeAddress = (property, value) => {
		setCustodianAddress({ ...custodianAddress, [property]: value })
	}

	const save = async () => {
		if (validate()) {
			await updateAsset('custodianInfo', {
				address: custodianAddress,
				name: custodianName,
				startDate: custodianStartDate,
				dailyPrice: custodianDailyPrice,
			})
			alert('Bilgiler başarıyla kaydedildi')
		}
	}

	const validate = () => {
		if (
			custodianName === '' ||
			custodianDailyPrice === '' ||
			custodianDailyPrice === '0' ||
			custodianAddress.description === ''
		) {
			alert('Tüm alanlar doldurulmalıdır!')
			return false
		} else {
			return true
		}
	}

	return (
		<TaskRadar
			always={checkTasksIncludes(TASK_TYPE.CUSTODIAN_INFO_REQUIRED)}
			right="100%"
			top="-.75rem"
		>
			<div>
				<div className="flex al-center">
					<FaStore className="blue mr-2" />
					<p className="fw-600 blue fs-md">Yeddiemin Bilgileri</p>
				</div>
				{!isOpen && (
					<p className="mt-2">Yeddiemin bilgilerini girmek için tıklayın</p>
				)}
			</div>

			<div className="flex mt-4">
				<div className="w-50 mr-10">
					<div className="">
						<p className="fw-500 gray mb-2">Yeddiemin Adı</p>
						<Input
							placeholder="Yeddiemin Adı"
							classes="mb-2"
							value={custodianName}
							onChange={e => setCustodianName(e.target.value)}
						/>
					</div>
					<div className="">
						<p className="fw-500 gray mb-2">
							Malların Yeddiemine Bırakılma Tarihi
						</p>
						<Input
							placeholder="Malların Yeddiemine Bırakılma Tarihi"
							type="date"
							classes="mb-2"
							value={custodianStartDate}
							onChange={e => {
								if (new Date(e.target.value) > new Date()) {
									alert('Yeddiemine bırakılma tarihi bugünden sonra olamaz!')
								} else {
									setCustodianStartDate(e.target.value)
								}
							}}
						/>
					</div>
					<div className="">
						<p className="fw-500 gray">Günlük Yeddiemin Masrafı (₺)</p>
						<Input
							placeholder="Türk Lirası"
							classes="mt-2 mb-2"
							value={custodianDailyPrice}
							onChange={e => setCustodianDailyPrice(e.target.value)}
						/>
					</div>
				</div>
				<div className="w-50">
					<p className="fw-500 mb-2 gray">Yeddiemin Adresi</p>
					<div className="flex al-center mb-2">
						<select
							className="input mr-2"
							value={custodianAddress.city}
							onChange={e => onChangeAddress('city', e.target.value)}
						>
							{cities.map(city => {
								return (
									<option key={city.name} value={city.name} className="dark">
										{city.name}
									</option>
								)
							})}
						</select>
						<select
							className="input mr-4"
							value={custodianAddress.district}
							onChange={e => onChangeAddress('district', e.target.value)}
						>
							{getDistrictsByCity(custodianAddress.city).map(district => {
								return (
									<option
										key={district.districtName}
										value={district.districtName}
									>
										{district.districtName}
									</option>
								)
							})}
						</select>
					</div>
					<Input
						placeholder="Adres Açıklaması"
						textarea
						classes="mt-2 mb-2"
						value={custodianAddress.description}
						onChange={e => onChangeAddress('description', e.target.value)}
					/>
				</div>
			</div>
			<Button theme="blue" classes="mt-4 bold" onClick={save}>
				Kaydet
			</Button>
		</TaskRadar>
	)
}
