import React, { useContext } from 'react'
import { InpoundmentContext } from '../../../pages/takip/CaseInpoundmentDetails'
import Button from '../../anBrains/Button'
import LandRegistryOfficeSelect from '../../select/LandRegistryOfficeSelect'
import Immovable from './Immovable'

export default function ImmovableList() {
	const { assetProps } = useContext(InpoundmentContext)

	const { assets, visibleAsset, setVisibleAssetId } = assetProps

	if (visibleAsset) {
		return <Immovable immovable={visibleAsset} />
	}

	return (
		<table className="restriction-list bg-white w-100">
			<tr className="restriction-row w-100">
				<th>Tapu Müdürlüğü</th>
				<th>İl</th>
				<th>İlçe</th>
				<th>Mahalle/Köy</th>
				<th>Mevkii</th>
				<th>Ada</th>
				<th>Parsel</th>
				<th>Eklenme Tarihi</th>
				<th>Aksiyon</th>
			</tr>
			{assets.map(immovable => {
				return (
					<tr className="restriction-row w-100">
						<td>
							<LandRegistryOfficeSelect
								selectable={false}
								selectedId={immovable.landRegistryOfficeId}
							/>
						</td>
						<td>{immovable.city}</td>
						<td>{immovable.district}</td>
						<td>{immovable.street}</td>
						<td>{immovable.local}</td>
						<td>{immovable.cityBlock}</td>
						<td>{immovable.parcel}</td>
						<td>
							{new Date(immovable.createdAt).toLocaleDateString('tr-TR')}{' '}
							{new Date(immovable.createdAt).toLocaleTimeString()}
						</td>
						<td>
							<Button
								onClick={() => setVisibleAssetId(immovable._id)}
								classes="blue fw-600"
							>
								Detaylar
							</Button>
						</td>
					</tr>
				)
			})}
		</table>
	)
}
