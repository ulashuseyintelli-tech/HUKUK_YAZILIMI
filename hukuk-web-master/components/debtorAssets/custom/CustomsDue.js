import React from 'react'
import { TASK_TYPE } from '../../../constants'
import { toDateInputValue } from '../../../helpers/Helper'
import useInpoundmentContext from '../../../services/hooks/useInpoundmentContext'
import Button from '../../anBrains/Button'
import Input from '../../anBrains/Input'
import InpoundmentBackButton from '../../inpoundments/InpoundmentBackButton'
import Note from '../../Note'
import ReceivedAssets from '../../ReceivedAssets'
import TaskRow from '../../task/TaskRow'
import TrueFalse from '../../TrueFalse'

export default function CustomsDue({ customsDue }) {
	const {
		assetProps: { visibleAsset, setVisibleAssetId, updateAsset },
	} = useInpoundmentContext()

	return (
		<div className={`${visibleAsset ? '' : 'inpoundment-asset-card'}`}>
			<InpoundmentBackButton />
			<Button
				classes="column al-start"
				onClick={() => setVisibleAssetId(customsDue._id)}
			>
				<p className="fw-500 fs-nm">
					<span className="bold">
						{new Date(customsDue.createdAt).toLocaleDateString('tr-TR')} {' - '}
						{new Date(customsDue.createdAt).toLocaleTimeString()}{' '}
					</span>
					tarihinde oluşturulan kayıt
				</p>
			</Button>
			{visibleAsset && visibleAsset._id === customsDue._id && (
				<div>
					<div className="step-item-divider"></div>
					<TaskRow
						titles={['Haciz Durumu', 'Hacze Çıkılan Tarih']}
						conditions={[true, customsDue.isSeized]}
						children={[
							<TrueFalse
								change={updateAsset}
								property={'isSeized'}
								object={customsDue}
								options={['Olumsuz', 'Olumlu']}
							/>,
							<Input
								value={
									customsDue.deFactoSeizeDate
										? toDateInputValue(new Date(customsDue.deFactoSeizeDate), 0)
										: ''
								}
								classes="mt-2"
								type="date"
								onChange={e => updateAsset('deFactoSeizeDate', e.target.value)}
							/>,
						]}
						types={[
							TASK_TYPE.IS_SEIZED,
							TASK_TYPE.CUSTOMS_SEIZE_DE_FACTO_REQUIRED,
						]}
					/>

					{customsDue.isSeized && (
						<React.Fragment>
							<div className="step-item-divider"></div>
							{!customsDue.deFactoSeizeDate && (
								<Note type="zekiye">
									Gümrük müdürlüğüne hacze çıkılması gerekiyor. Hacze
									çıkıldıktan sonra Haciz Günü Tarihini güncelleyin. Haciz
									görevinin tarihi için görevleri takip edin.
								</Note>
							)}

							{customsDue.deFactoSeizeDate && (
								<>
									<div className="step-item-divider"></div>
									<ReceivedAssets />
								</>
							)}
						</React.Fragment>
					)}
					{customsDue.isSeized === false && (
						<div className="mt-8">
							<Button classes="fw-500" theme="red">
								Memur İşlemini Şikayet Davası Aç
							</Button>
						</div>
					)}
				</div>
			)}
		</div>
	)
}
