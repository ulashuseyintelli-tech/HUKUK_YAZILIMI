import React, { useState, useEffect } from 'react'
import { getDebtorName, handleError } from '../../../helpers/Helper'
import { getAllThirdPersons } from '../../../services/deptorService'
import useInpoundmentContext from '../../../services/hooks/useInpoundmentContext'
import LoadingCircle from '../../anBrains/animations/LoadingCircle'
import Button from '../../anBrains/Button'
import Ssi from './Ssi'

export default function SsiList() {
	const {
		assetProps: { assets, visibleAsset, setVisibleAssetId },
	} = useInpoundmentContext()

	const [thirdPersons, setThirdPersons] = useState([])

	useEffect(() => {
		getThirdPersons()
	}, [])

	const getThirdPersons = () => {
		getAllThirdPersons()
			.then(res => {
				setThirdPersons(res.data)
			})
			.catch(handleError)
	}

	if (visibleAsset) {
		return <Ssi ssi={visibleAsset} />
	}

	return (
		<table className="restriction-list bg-white w-100">
			<tr className="restriction-row w-100">
				<th>Şirket (İşyeri)</th>
				<th>Son Sigorta Aktiflik Tarihi</th>
				<th>Maaş Bilgisi</th>
				<th>Eklenme Tarihi</th>
				<th>Güncellenme Tarihi</th>
				<th>Aksiyon</th>
			</tr>
			{assets.map(ssi => {
				const thirdPerson = thirdPersons.find(p => p._id === ssi.companyId)
				return (
					<tr className="restriction-row w-100">
						<td>
							{thirdPerson ? getDebtorName(thirdPerson) : <LoadingCircle />}
						</td>
						<td>
							{new Date(ssi.registrationDate).toLocaleDateString('tr-TR')}
						</td>
						<td>{ssi.salaryInfo.amount || 'Henüz bilinmiyor'}</td>
						<td>{new Date(ssi.createdAt).toLocaleString()}</td>
						<td>{new Date(ssi.lastUpdate).toLocaleString()}</td>
						<td>
							<Button
								onClick={() => setVisibleAssetId(ssi._id)}
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
