import React, { useEffect, useState } from 'react'
import { createForeclosableAddress } from '../../services/deFactoService'
import { ADDRESS_TYPE, STATUS, TASK_TYPE } from '../../constants'
import Button from '../anBrains/Button'
import useInpoundmentContext from '../../services/hooks/useInpoundmentContext'
import Modal from '../anBrains/Modal'
import { declareAreAddressesSame } from '../../helpers/Helper'
import TaskField from '../task/TaskField'

export default function DeFactoList() {
	const [status, setStatus] = useState(STATUS.LOADING)

	const [isAddressModalOpen, setIsAddressModalOpen] = useState(false)
	const [selectedAddress, setSelectedAdress] = useState(false)

	const {
		selectedDebtor,
		currentCase,
		queryAssetId,
		selectedQueryId,
		setSelectedQueryId,
		updateSelectedDebtorField,
	} = useInpoundmentContext()

	const { foreclosableAddresses } = selectedDebtor

	useEffect(() => {
		if (selectedDebtor) {
			load()
		}
	}, [selectedDebtor])

	const load = async () => {
		await getDeFactos()
		setStatus(STATUS.NORMAL)
	}

	const getDeFactos = async () => {
		if (queryAssetId) {
			const selected = foreclosableAddresses.find(address => {
				return address.deFactos.some(deFacto => {
					return deFacto._id === queryAssetId
				})
			})
			setSelectedQueryId(selected ? selected._id : null)
		}
	}

	const createAddressCondition = newAddress => {
		return (
			foreclosableAddresses.filter(address => {
				return (
					address.city === newAddress.city &&
					address.district === newAddress.district &&
					address.description === newAddress.description
				)
			}).length === 0
		)
	}

	const createAddress = () => {
		if (createAddressCondition(selectedAddress)) {
			createForeclosableAddress(
				currentCase._id,
				selectedDebtor._id,
				selectedAddress,
			)
				.then(res => {
					setIsAddressModalOpen(false)
					updateSelectedDebtorField('foreclosableAddresses', [
						...foreclosableAddresses,
						res.data,
					])
				})
				.catch(e => {
					alert('Hata')
					console.log(e)
				})
		} else {
			alert('Bu adres zaten haczedilebilir adres olarak eklenmiş.')
		}
	}

	return (
		<div className="de-facto">
			<Modal
				visible={isAddressModalOpen}
				close={() => setIsAddressModalOpen(false)}
			>
				<div className="form-modal">
					<div className="de-facto__sidebar">
						<p className="fw-500 mb-4 fs-md">Borçlunun Adresleri</p>
						{selectedDebtor.addresses.map(address => {
							if (address.title !== '' && address.description !== '') {
								const addressType = Object.values(ADDRESS_TYPE).filter(
									a => a.value === address.type,
								)[0]
								const isAvailable = true //TODO: bakılabilir
								const isSelected = declareAreAddressesSame(
									address,
									selectedAddress,
								)
								return (
									<Button
										disabled={!isAvailable}
										classes={`notification-address ${
											isSelected ? 'notification-address__selected' : ''
										}`}
										onClick={() => setSelectedAdress(address)}
									>
										<div className="flex al-center mb-2">
											<p className="fw-500">{address.title}</p>
											{addressType && (
												<div className="badge ml-4">
													{addressType.getText(selectedDebtor)}
												</div>
											)}
										</div>
										<p className="mb-1">{address.description}</p>
										<p>
											{address.city} {address.district}
										</p>
									</Button>
								)
							}
						})}
						<Button
							theme="green w-100 mt-8 py-4 fw-600"
							onClick={createAddress}
						>
							Haczedilebilir Adres Olarak Ekle
						</Button>
					</div>
				</div>
			</Modal>
			<div className="flex al-center w-100 jst-between mb-4">
				<p className="fw-500 fs-md">Haczedilebilir Adresler</p>
				<TaskField
					type={TASK_TYPE.FORECLOSABLE_ADDRESS_REQUIRED}
					right={'0'}
					customAssetId={null}
				>
					<Button
						theme="blue"
						classes="fw-500 py-1"
						onClick={() => setIsAddressModalOpen(true)}
					>
						Yeni Ekle
					</Button>
				</TaskField>
			</div>
			{foreclosableAddresses.length > 0 ? (
				foreclosableAddresses.map((address, index) => {
					return (
						<TaskField
							type={TASK_TYPE.SEIZE_DE_FACTO_REQUIRED}
							customAssetId={address._id}
						>
							<Button
								key={address._id + index}
								classes={`column al-start fs-nm w-100 de-facto__address ${
									address._id === selectedQueryId
										? 'de-facto__address-selected'
										: ''
								}`}
								onClick={() => setSelectedQueryId(address._id)}
							>
								<p className="fw-500 mb-2">{address.title}</p>
								<p className="mb-1">{address.description}</p>
								<p className="fs-sm">
									{address.city} / {address.district}
								</p>
							</Button>
						</TaskField>
					)
				})
			) : (
				<div className="mb-4">Haczdedilebilir adres bulunamadı.</div>
			)}
		</div>
	)
}
