import React, { useContext } from 'react'
import { FaInfoCircle } from 'react-icons/fa'
import { QUERY_TYPE, TASK_TYPE } from '../../constants'
import { InpoundmentContext } from '../../pages/takip/CaseInpoundmentDetails'
import BankQueryList from './bankQuery/BankQueryList'
import CreditorCaseList from './creditorCase/CreditorCaseList'
import CustomsDueList from './custom/CustomsDueList'
import ImmovableList from './immovable/ImmovableList'
import PatentList from './patent/PatentList'
import ShareList from './share/ShareList'
import SsiList from './ssi/SsiList'
import TaxDueList from './taxDue/TaxDueList'
import VehicleList from './vehicle/VehicleList'
import FamilyMemberList from './familyMember/FamilyMemberList'
import Note from '../Note'
import ForeclosableAddress from '../deFacto/ForeclosableAddress'
import Button from '../anBrains/Button'
import TaskField from '../task/TaskField'
import PledgedMovable from './pledgedMovable/PledgedMovable'

export default function AssetList() {
	const {
		currentCase,
		assetProps,
		visibleInpoundment,
		visibleQueries,
		user,
		selectedQueryId,
	} = useContext(InpoundmentContext)

	return (
		<div
			className="inpoundment-assets"
			style={assetProps.visibleAsset ? { marginLeft: '0' } : {}}
		>
			<>
				{!assetProps.visibleAssetId && (
					<div className="flex al-center jst-between mb-4">
						<p className="bold fs-md">
							{currentCase.type === '8'}
							{visibleInpoundment === 'DE_FACTO' && 'Haciz Günleri'}
							{visibleInpoundment !== 'DE_FACTO' &&
								visibleInpoundment !== 'BANK' &&
								'Sorgularda Çıkan Kayıtlar'}
						</p>
						{visibleInpoundment === 'DE_FACTO' && selectedQueryId && (
							<TaskField
								type={TASK_TYPE.SEIZE_DE_FACTO_REQUIRED}
								customAssetId={selectedQueryId}
								right="100%"
							>
								<Button
									theme="blue"
									classes="fw-500"
									onClick={assetProps.createAsset}
								>
									Haciz Günü Sonucu Oluştur
								</Button>
							</TaskField>
						)}
					</div>
				)}
				{visibleInpoundment === 'FAMILY_REGISTER' && <FamilyMemberList />}
				{visibleInpoundment === 'BANK' && <BankQueryList />}
				{visibleInpoundment === 'DE_FACTO' && <ForeclosableAddress />}
				{visibleInpoundment === 'VEHICLE' && <VehicleList />}
				{visibleInpoundment === 'SSI' && <SsiList />}
				{visibleInpoundment === 'TAX_DUE' && <TaxDueList />}
				{visibleInpoundment === 'CUSTOMS' && <CustomsDueList />}
				{visibleInpoundment === 'IMMOVABLE' && <ImmovableList />}
				{visibleInpoundment === 'SHARE' && <ShareList />}
				{visibleInpoundment === 'CREDITOR_CASE' && <CreditorCaseList />}
				{visibleInpoundment === 'PATENT' && <PatentList />}
				{visibleInpoundment === 'PLEDGED_MOVABLE' && <PledgedMovable />}
				{visibleQueries.length > 0 &&
					assetProps.assets.length === 0 &&
					visibleInpoundment !== 'DE_FACTO' && (
						<Note>Henüz kayıt eklenmemiş.</Note>
					)}
				{visibleInpoundment === 'DE_FACTO' && !selectedQueryId && (
					<Note>
						İşlem yapabilmek için yan taraftan haczedilebilir adres seçmeniz
						gerekiyor
					</Note>
				)}
				<React.Fragment>
					{visibleQueries.length > 0 &&
						visibleQueries.every(q => q.isResultEmpty === true) && (
							<div className="note">
								<FaInfoCircle />
								Sorgularda {QUERY_TYPE[visibleInpoundment]} çıkmadığı için
								listede hiçbir varlık yok.{' '}
								{user.lawOffice[0].queryReminderDays[visibleInpoundment]} gün
								sonra tekrar sorgu yapılması için hatırlatıcı ayarlandı.
							</div>
						)}
					{visibleQueries.length === 0 &&
						visibleInpoundment !== 'DE_FACTO' &&
						visibleInpoundment !== 'BANK' &&
						visibleQueries.filter(q => q.isResultEmpty === true).length ===
							visibleQueries.length &&
						(currentCase.type === '7' || currentCase.type === '10') && (
							<Note>Henüz sorgu yapılmamış</Note>
						)}
				</React.Fragment>
			</>
		</div>
	)
}
