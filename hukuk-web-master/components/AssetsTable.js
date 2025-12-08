import React, { useState } from 'react'
import { FaPlus } from 'react-icons/fa'
import useInpoundmentContext from '../services/hooks/useInpoundmentContext'
import Button from './anBrains/Button'
import NewNormalAssetForm from './debtorAssets/normalAsset/NewNormalAssetForm'
import NormalAsset from './debtorAssets/normalAsset/NormalAsset'

export default function AssetsTable() {
	const {
		assetProps: {
			visibleAssetIndex,
			setAssets,
			assets,
			visibleAsset,
			assetType,
		},
	} = useInpoundmentContext()

	const [isAssetFormOpen, setIsAssetFormOpen] = useState(false)

	const addAsset = asset => {
		visibleAsset.receivedAssets.push({ ...asset })
		assets[visibleAssetIndex] = { ...visibleAsset }
		setAssets([...assets])
	}

	const setAsset = (index, asset) => {
		visibleAsset.receivedAssets[index] = { ...asset }
		setAssets([...assets])
	}

	return (
		<div className="w-100">
			<div className="flex al-center relative mt-4">
				<p className="fw-500">Haczedilen Malların Listesi</p>
				<Button
					classes="fw-500 blue ml-4"
					onClick={() => setIsAssetFormOpen(!isAssetFormOpen)}
				>
					<FaPlus className="mr-1 fs-xsm" /> Mal Ekle
				</Button>
				<NewNormalAssetForm
					visible={isAssetFormOpen}
					close={() => setIsAssetFormOpen(false)}
					withCreate
					add={addAsset}
					parentAssetId={visibleAsset._id}
					parentAssetType={assetType}
				/>
			</div>
			{visibleAsset.receivedAssets.length === 0 && (
				<p className="mt-2">Henüz haczedilen mal eklenmemiş.</p>
			)}
			{Array.isArray(visibleAsset.receivedAssets) &&
				visibleAsset.receivedAssets.length > 0 && (
					<>
						<table className="restriction-list mt-4">
							<tr>
								<th className="fw-500">Sıra</th>
								<th className="fw-500">Malın Adı</th>
								<th className="fw-500">Malın Cinsi</th>
								<th className="fw-500">Malın Markası</th>
								<th className="fw-500">Malın Boyutu</th>
								<th className="fw-500">Kıymet Takdiri</th>
								<th className="fw-500">Takyidatlar</th>
								<th className="fw-500">Aksiyon</th>
							</tr>
							{visibleAsset.receivedAssets.map((asset, index) => {
								return (
									<NormalAsset
										key={`normal-asset-${index}`}
										asset={asset}
										setAsset={item => setAsset(index, item)}
									/>
								)
							})}
						</table>
					</>
				)}
		</div>
	)
}
