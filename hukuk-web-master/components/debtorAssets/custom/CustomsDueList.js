import { useEffect, useState } from 'react'
import { handleError } from '../../../helpers/Helper'
import { getCustomsOffices } from '../../../services/customsOfficeService'
import useInpoundmentContext from '../../../services/hooks/useInpoundmentContext'
import Button from '../../anBrains/Button'
import CustomsDue from './CustomsDue'

export default function CustomsDueList() {
	const {
		assetProps: { assets, visibleAsset, setVisibleAssetId },
	} = useInpoundmentContext()

	const [customsOffices, setCustomsOffices] = useState([])

	useEffect(() => {
		load()
	}, [])

	const load = async () => {
		await getOffices()
	}

	const getOffices = () => {
		return getCustomsOffices()
			.then(res => {
				setCustomsOffices(res.data)
			})
			.catch(handleError)
	}

	if (visibleAsset) {
		return <CustomsDue customsDue={visibleAsset} />
	}

	return (
		<table className="restriction-list bg-white w-100">
			<tr className="restriction-row w-100">
				<th>Gümrük Müdürlüğü</th>
				<th>İl</th>
				<th>İlçe</th>
				<th>Oluşturulma Tarihi</th>
				<th>Son Güncelleme</th>
				<th>Aksiyon</th>
			</tr>
			{assets.map(customsDue => {
				const customsOffice = customsOffices.find(
					o => o._id === customsDue.customsOfficeId,
				)
				return (
					<tr className="restriction-row w-100">
						<td>{customsOffice?.name}</td>
						<td>{customsOffice?.city}</td>
						<td>{customsOffice?.district}</td>
						<td>
							{new Date(customsDue.createdAt).toLocaleDateString('tr-TR')}{' '}
							{new Date(customsDue.createdAt).toLocaleTimeString()}
						</td>
						<td>
							{new Date(customsDue.lastUpdate).toLocaleDateString('tr-TR')}{' '}
							{new Date(customsDue.lastUpdate).toLocaleTimeString()}
						</td>
						<td>
							<Button
								onClick={() => setVisibleAssetId(customsDue._id)}
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
