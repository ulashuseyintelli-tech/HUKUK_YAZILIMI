import React from 'react'
import Button from '../anBrains/Button'
import useInpoundmentContext from '../../services/hooks/useInpoundmentContext'
import Note from '../Note'
import DeFacto from './deFacto'

export default function ForeclosableAddress() {
	const {
		assetProps: { assets, visibleAsset, setVisibleAssetId },
		selectedQueryId,
	} = useInpoundmentContext()

	if (!selectedQueryId) {
		return null
	}

	if (visibleAsset) {
		return <DeFacto />
	}

	return (
		<div className="w-100">
			<div className="de-facto">
				<div className="de-facto__content">
					{assets && assets.length > 0 ? (
						assets.map((deFacto, index) => {
							return (
								<div className="inpoundment-asset-card">
									<Button
										onClick={() => setVisibleAssetId(deFacto._id)}
										classes="fs-nm"
									>
										<p className="fw-500">
											{new Date(deFacto.date).toLocaleDateString('tr-TR')}{' '}
											tarihli haciz günü
										</p>
									</Button>
								</div>
							)
						})
					) : (
						<Note>
							Henüz hiç haciz günü oluşturulmamış. Yukarıdaki butona tıklayarak
							yeni haciz günü oluşturabilirsiniz.
						</Note>
					)}
				</div>
			</div>
		</div>
	)
}
