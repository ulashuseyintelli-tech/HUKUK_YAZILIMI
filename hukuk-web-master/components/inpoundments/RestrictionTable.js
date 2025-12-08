import React, { useState, useEffect, useContext } from 'react'
import Button from '../anBrains/Button'
import { FaPlus } from 'react-icons/fa'
import { getExecutionOffices } from '../../services/executionOfficeService'
import RestrictionRaw from './RestrictionRaw'
import { getCreditorsByLawOffice } from '../../services/creditorService'
import { STATUS, TASK_TYPE } from '../../constants'
import LoadingCircle from '../anBrains/animations/LoadingCircle'
import { SortableContainer, SortableElement } from 'react-sortable-hoc'
import Input from '../anBrains/Input'
import Note from '../Note'
import TrueFalse from '../TrueFalse'
import TaskRow from '../task/TaskRow'
import TaskField from '../task/TaskField'
import useInpoundmentContext from '../../services/hooks/useInpoundmentContext'
import {
	RestrictionContext,
	useRestrictionContext,
} from '../../services/hooks/useRestrictionContext'
import RestrictionThreshold from './RestrictionThreshold'
import { useCaseStatement } from '../../services/hooks/useCaseStatement'
import RestrictionCopyPanel from './RestrictionCopyPanel'
import { check100DocumentCreated } from '../../helpers/Helper'

export default function RestrictionTable({
	customAsset,
	customUpdate,
	withQuestion = true,
	disableCloseOnClick,
	type,
}) {
	const [status, setStatus] = useState(STATUS.LOADING)
	const [executionOffices, setExecutionOffices] = useState([])
	const [creditors, setCreditors] = useState([])
	const [isFormOpen, setIsFormOpen] = useState(false)
	const [isEditing, setIsEditing] = useState(false)
	const [isAssetsListOpen, setIsAssetsListOpen] = useState(false)

	const { assetProps } = useInpoundmentContext()
	const { statementStatus, caseStatement } = useCaseStatement()

	console.log({ caseStatement })

	const visibleAsset = customAsset || assetProps.visibleAsset
	const updateRestriction = customUpdate || assetProps.updateRestriction
	const restrictions = visibleAsset.restriction.table
	const exist = visibleAsset.restriction?.exist

	const [count, setCount] = useState(visibleAsset.restriction.count)

	useEffect(() => {
		load()
	}, [])

	const load = async () => {
		await Promise.all([_getExecutionOffices(), getCreditors()])
		setStatus(STATUS.NORMAL)
	}

	const _getExecutionOffices = async () => {
		await getExecutionOffices()
			.then(res => {
				setExecutionOffices(res.data)
			})
			.catch(() => alert('İcra Daireleri Getirilirken Hata Meydana Geldi'))
	}

	const getCreditors = async () => {
		await getCreditorsByLawOffice()
			.then(res => {
				setCreditors(res.data)
			})
			.catch(() => alert('Alacaklılar Getirilirken Hata Meydana Geldi'))
	}

	const addNew = restriction => {
		restrictions.push(restriction)
		updateRestriction('table', restrictions)
		setIsFormOpen(false)
	}

	const onSortEnd = ({ oldIndex, newIndex }) => {
		const a = restrictions[oldIndex]
		restrictions[oldIndex] = restrictions[newIndex]
		restrictions[newIndex] = a
		updateRestriction('table', restrictions)
	}

	return (
		<RestrictionContext.Provider
			value={{
				creditors,
				setCreditors,
				executionOffices,
				setExecutionOffices,
				onSortEnd,
				customAsset,
				disableCloseOnClick,
				caseStatement,
			}}
		>
			<div>
				<TaskRow
					customAssetId={customAsset?._id}
					titles={[
						'Varlıkta Takyidat Var Mı?',
						'Toplam Kaç Adet Takyidat Var?',
					]}
					condition={withQuestion}
					conditions={[true, exist, true]}
					types={[
						TASK_TYPE.RESTRICTIONS_EXIST,
						TASK_TYPE.RESTRICTIONS_COUNT,
						null,
					]}
					children={[
						<TrueFalse
							options={['Yok', 'Var']}
							object={visibleAsset.restriction}
							property="exist"
							change={updateRestriction}
						/>,
						<div className="mt-2">
							<Input
								value={count}
								placeholder="Takyidat sayısı"
								onChange={e => setCount(e.target.value)}
							/>
							<Button
								onClick={() => updateRestriction('count', count)}
								classes="blue fw-600 mt-2"
								disabled={count === visibleAsset.restriction.count}
							>
								Kaydet
							</Button>
						</div>,
						<RestrictionThreshold
							customAsset={customAsset}
							updateRestriction={updateRestriction}
							withQuestion={withQuestion}
						/>,
					]}
				/>
				{visibleAsset.restriction.isCancelledByThreshold !== true && (
					<>
						{exist && (
							<>
								<div className="step-item-divider"></div>
								<TaskField
									customAssetId={customAsset?._id}
									containerProps={{
										disabled: !visibleAsset.restriction?.count,
									}}
									className="restrictions"
									type={TASK_TYPE.RESTRICTIONS_REQUIRED}
									right="0"
								>
									<div className="flex al-center jst-between mb-4 w-100">
										<div className="flex al-center">
											<p className="fw-600 fs-md">Takyidat Listesi</p>
											{restrictions.length > 0 &&
												restrictions.every(r => !r.withoutCreditor) && (
													<Note
														type="zekiye"
														inline
														containerClass="py-1 px-4 ml-4"
														imageWidth="1.5rem"
														imageHeight="1.5rem"
													>
														<p className="ml-2">
															Bize ait olan takyidatın belirtilmesi gerekiyor
														</p>
													</Note>
												)}
											<Button
												classes="btn-orange fw-600 ml-4"
												onClick={() => setIsAssetsListOpen(true)}
											>
												Başka Varlıktan Kopyala
											</Button>
											<RestrictionCopyPanel
												visibleAsset={visibleAsset}
												visible={isAssetsListOpen}
												setVisibility={setIsAssetsListOpen}
											/>
										</div>
										<div className="flex al-center">
											<span className="fw-500 mr-4">
												{isEditing
													? 'Düzenleme Etkin'
													: 'Düzenleme Etkin Değil'}
											</span>
											<Input
												toggle
												value={isEditing}
												onChange={v => setIsEditing(v)}
											/>
										</div>
									</div>
									{isEditing && (
										<Note classes="mb-4">
											Düzenleme etkin haldeyken takyidat sırasını sürükleyerek
											değiştirebilirsiniz.
										</Note>
									)}
									{status === STATUS.LOADING ? (
										<LoadingCircle />
									) : (
										<React.Fragment>
											<SortableComponent
												items={restrictions}
												onSortEnd={onSortEnd}
												executionOffices={executionOffices}
												set={updateRestriction}
												isEditing={isEditing}
												restrictions={restrictions}
												type={type}
											/>
										</React.Fragment>
									)}
									{isFormOpen && (
										<>
											{statementStatus === STATUS.LOADING ? (
												<LoadingCircle />
											) : (
												<RestrictionRaw
													arrIndex={restrictions.length}
													withForm
													addNew={addNew}
													restrictions={restrictions}
													executionOffices={executionOffices}
													close={() => setIsFormOpen(false)}
												/>
											)}
										</>
									)}
									{!isFormOpen && (
										<Button
											theme="blue"
											classes="fw-500 mt-4"
											onClick={() => setIsFormOpen(true)}
										>
											<FaPlus className="fs-sm mr-2" />
											Yeni Takyidat Ekle
										</Button>
									)}
								</TaskField>
							</>
						)}
						{withQuestion && exist && restrictions.length > 0 && (
							<>
								<div className="step-item-divider"></div>
								<p className="fw-500 mt-4">
									Takyidat Kayıtlarının Tamamı Girildi Mi?
								</p>
								<TrueFalse
									options={['Girilmedi', 'Girildi']}
									object={visibleAsset.restriction}
									property="completed"
									change={updateRestriction}
								/>
							</>
						)}
					</>
				)}
			</div>
		</RestrictionContext.Provider>
	)
}

const SortableItem = SortableElement(
	({
		creditors,
		executionOffices,
		restriction,
		set,
		restrictions,
		arrIndex,
		type,
	}) => (
		<RestrictionRaw
			arrIndex={arrIndex}
			creditors={creditors}
			executionOffices={executionOffices}
			restriction={restriction}
			set={set}
			restrictions={restrictions}
			type={type}
		/>
	),
)

const SortableList = SortableContainer(
	({
		items,
		creditors,
		executionOffices,
		set,
		restrictions,
		isEditing,
		type,
	}) => {
		let { assetProps } = useInpoundmentContext()

		const visibleAsset =
			useRestrictionContext().customAsset || assetProps.visibleAsset

		return (
			<table className="restriction-list">
				<tr className="restriction-row">
					<th>Sıra</th>
					<th>İcra Dairesi</th>
					<th>İcra Yılı / Dosya No</th>
					{check100DocumentCreated(visibleAsset, type) && (
						<th>100 Madde Cevabı</th>
					)}
					{visibleAsset.appraisalNotificationCreated && (
						<th>Kıymet Takdiri Tebligatı</th>
					)}
					<th>Alacaklı</th>
					<th>Borç Miktarı</th>
					<th>Alacağın Tipi</th>
					<th>Satış Avansı</th>
					<th>Satış Talebi</th>
					{check100DocumentCreated(visibleAsset, type) && <th>Devam</th>}
				</tr>
				{items.map((restriction, index) => {
					return (
						<SortableItem
							disabled={!isEditing}
							key={restriction._id}
							arrIndex={index}
							index={index}
							creditors={creditors}
							executionOffices={executionOffices}
							restriction={restriction}
							set={set}
							restrictions={restrictions}
							type={type}
						/>
					)
				})}
			</table>
		)
	},
)

const SortableComponent = ({
	items,
	onSortEnd,
	creditors,
	executionOffices,
	set,
	restrictions,
	isEditing,
	type,
}) => {
	return (
		<SortableList
			isEditing={isEditing}
			items={items}
			onSortEnd={onSortEnd}
			pressDelay={200}
			creditors={creditors}
			executionOffices={executionOffices}
			set={set}
			restrictions={restrictions}
			type={type}
		/>
	)
}
