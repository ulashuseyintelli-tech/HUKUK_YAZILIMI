import React, { useRef } from 'react'
import { FaCalendarAlt, FaPlusCircle, FaUser } from 'react-icons/fa'
import { getDebtorName } from '../../helpers/Helper'
import useInpoundmentContext from '../../services/hooks/useInpoundmentContext'
import LoadingCircle from '../anBrains/animations/LoadingCircle'
import Button from '../anBrains/Button'
import Note from '../Note'
import TaskRadar from '../task/TaskRadar'
import CollectionForm from './CollectionForm'

export default function CollectionList({
	customCollections,
	customLoading,
	customSetFunction,
	customAsset,
	thirdPerson,
	exactType,
	taskRadarAlways = false,
}) {
	const { assetProps, visibleInpoundment } = useInpoundmentContext()

	const collections = customCollections || assetProps.collections
	const setCollections = customSetFunction || assetProps.setCollections
	const loading =
		customLoading !== undefined ? customLoading : assetProps.collectionsLoading

	const addCollection = newCollection => {
		collections.push(newCollection)
		setCollections([...collections])
	}

	const formRef = useRef()

	return (
		<div>
			<div className="flex al-center jst-between w-100 mb-4">
				<TaskRadar always={taskRadarAlways} right="-3rem" top="-.75rem">
					<p className="fw-600">Yapılan Tahsilatlar </p>
				</TaskRadar>
				<Button
					icon={<FaPlusCircle />}
					theme="green"
					classes="fw-600 ml-8 fs-xsm"
					onClick={() => formRef.current.open()}
				>
					Tahsilat Oluştur
				</Button>
				<CollectionForm
					ref={formRef}
					thirdPerson={thirdPerson}
					exactType={exactType || visibleInpoundment}
					addCollection={addCollection}
					customAsset={customAsset}
					withoutButton
				/>
			</div>
			{loading ? (
				<LoadingCircle />
			) : (
				<div>
					{collections.length > 0 ? (
						collections.map(collection => {
							return (
								<div className="mb-6">
									<p className="fw-500 mb-1">
										{collection.amount} {collection.receivedMoneyCurrency}{' '}
										tutarında tahsilat yapıldı.
									</p>
									<div className="flex al-center fs-sm">
										<FaUser className="fs-xsm mr-2 blue" />
										<p className="blue">{getDebtorName(collection.debtor)}</p>
										<p className="ml-4 gray">
											<FaCalendarAlt className="mr-2 fs-xsm gray" />
											{new Date(collection.date).toLocaleDateString('tr-TR')}
										</p>
									</div>
								</div>
							)
						})
					) : (
						<Note>Henüz tahsilat yapılmamış.</Note>
					)}
				</div>
			)}
		</div>
	)
}
