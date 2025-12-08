import React from 'react'
import useInpoundmentContext from '../../../services/hooks/useInpoundmentContext'
import Button from '../../anBrains/Button'
import Vehicle from './Vehicle'

export default function VehicleList() {
	const {
		assetProps: { assets, visibleAsset, setVisibleAssetId },
	} = useInpoundmentContext()

	if (visibleAsset) {
		return <Vehicle vehicle={visibleAsset} />
	}

	return (
		<table className="restriction-list bg-white w-100">
			<tr className="restriction-row w-100">
				<th>Plaka</th>
				<th>Marka</th>
				<th>Model</th>
				<th>Sahiplenme Tarihi</th>
				<th>Cinsi</th>
				<th>Tipi</th>
				<th>Eklenme Tarihi</th>
				<th>Aksiyon</th>
			</tr>
			{assets.map(vehicle => {
				return (
					<tr className="restriction-row w-100">
						<td>{vehicle.licenseNumber}</td>
						<td>{vehicle.brand}</td>
						<td>{vehicle.model}</td>
						<td>{vehicle.ownershipDate}</td>
						<td>{vehicle.kind}</td>
						<td>{vehicle.type}</td>
						<td>{new Date(vehicle.createdAt).toLocaleDateString('tr-TR')}</td>
						<td>
							<Button
								onClick={() => setVisibleAssetId(vehicle._id)}
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
