import React from 'react'
import { NOTIFICATION_STATUS, TASK_TYPE } from '../../../constants'
import { check100DocumentStatus } from '../../../helpers/Helper'
import printer from '../../../printer'
import useInpoundmentContext from '../../../services/hooks/useInpoundmentContext'
import AssetsTable from '../../AssetsTable'
import RestrictionTable from '../../inpoundments/RestrictionTable'
import Note from '../../Note'
import Printer from '../../Printer'
import TaskField from '../../task/TaskField'
import TrueFalse from '../../TrueFalse'
import SsiSalaryAmount from '../ssi/SsiSalaryAmount'

export default function Assets100({
	customAsset,
	customUpdate,
	customUpdateRestriction,
	customType,
	type,
}) {
	const { assetProps, selectedDebtor, visibleInpoundment, currentCase } =
		useInpoundmentContext()
	const visibleAsset = customAsset || assetProps.visibleAsset
	const updateAsset = customUpdate || assetProps.updateAsset

	const field =
		type === 'GARNISHMENT'
			? 'garnishmentClaim100Created'
			: 'claim100DocumentCreated'

	const printerType =
		visibleInpoundment === 'VEHICLE'
			? printer.VEHICLE_100
			: visibleInpoundment === 'IMMOVABLE'
			? printer.IMMOVABLE_100
			: printer.MOVABLE_100

	if (visibleAsset.restriction?.exist === false) {
		return (
			<Note type="zekiye">
				Mallarda takyidat olmadığı için 100. maddeye gerek yok. Bir sonraki
				adıma geçebilirsiniz.
			</Note>
		)
	}

	if (customType === 'RECEIVED_ASSETS') {
		return (
			<>
				{visibleAsset.receivedAssets.some(
					a =>
						a.restriction.exist === true &&
						a.claim100Status !== NOTIFICATION_STATUS.DONE.value,
				) && (
					<Note type="zekiye">
						Takyidata sahip tüm haczedilen mallar için 100. madde toplanması
						gerekiyor
					</Note>
				)}
				<AssetsTable />
			</>
		)
	}

	return (
		<div>
			<div className="flex al-center">
				<TaskField
					customAssetId={customAsset?._id}
					type={[
						TASK_TYPE.CLAIM_100_DOCUMENT_CREATE,
						TASK_TYPE.GARNISHMENT_CLAIM_100_DOCUMENT_CREATE,
					]}
					className="w-50 mr-4"
					title="100. Madde Talebi Hazırlandı Mı?"
					titleButton={
						<Printer
							paperDebtors={[selectedDebtor]}
							type="requestPaper"
							request={printerType.value}
							caseId={currentCase._id}
							object={visibleAsset}
						/>
					}
				>
					<TrueFalse
						options={['Hayır', 'Evet, hazırlandı']}
						object={visibleAsset}
						property={field}
						change={updateAsset}
					/>
				</TaskField>
				<div className="flex al-center mb-2">
					<p className="fw-500 mr-4"></p>
				</div>
				{!check100DocumentStatus(visibleAsset, type) && (
					<Note type="zekiye" classes="mt-4 w-50">
						100 madde toplanması ve takyidat listesindeki devam eden takipler
						için tebliğe yarar bilgilerin doldurulması gerekiyor
					</Note>
				)}
			</div>
			{visibleAsset[field] === true && (
				<>
					{assetProps.assetType === 'TAX_DUE' ||
					assetProps.assetType === 'BANK' ||
					assetProps.assetType === 'SSI' ||
					type === 'GARNISHMENT' ||
					visibleAsset.appraisalResult ? (
						<RestrictionTable
							withQuestion={false}
							customAsset={customAsset}
							customUpdate={customUpdateRestriction}
							type={type}
						/>
					) : (
						<Note classes="mt-10">
							100. madde tebligatları için Kıymet Takdiri sonucu bekleniyor
						</Note>
					)}
				</>
			)}
			{(assetProps.assetType === 'SSI' || type === 'GARNISHMENT') &&
				check100DocumentStatus(visibleAsset, type) && (
					<SsiSalaryAmount type={type} />
				)}
		</div>
	)
}
