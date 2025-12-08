import React from 'react'
import { FaPlay, FaStop } from 'react-icons/fa'
import { useAppContext } from '../../services/hooks/useAppContext'
import useInpoundmentContext from '../../services/hooks/useInpoundmentContext'
import Button from '../anBrains/Button'
import Note from '../Note'

export default function RestrictionThreshold({
	updateRestriction,
	withQuestion,
	customAsset,
}) {
	const { user } = useAppContext()
	const { assetProps } = useInpoundmentContext()

	const visibleAsset = customAsset || assetProps.visibleAsset

	if (
		visibleAsset.restriction.count < user.lawOffice[0].restrictionThreshold &&
		withQuestion
	) {
		return null
	}

	return (
		<div
			className={`${
				visibleAsset.restriction.isCancelledByThreshold === null ? 'focus' : ''
			}`}
		>
			<Note
				type="zekiye"
				classes={`mt-4 ${
					visibleAsset.restriction.isCancelledByThreshold === null ? 'w-50' : ''
				}`}
				containerClass="al-start"
			>
				{visibleAsset.restriction.isCancelledByThreshold !== null && (
					<div>
						<p>
							Takyidat sayısı, ofisiniz tarafından belirlenen takyidat sınırını
							aşıyor
						</p>
						<div className="flex al-center mt-1">
							{visibleAsset.restriction.isCancelledByThreshold === true && (
								<>
									<FaStop className="red" />
									<p>Haciz işlemlerini durdurmayı seçtiniz</p>
								</>
							)}
							{visibleAsset.restriction.isCancelledByThreshold === false && (
								<>
									<FaPlay className="green" />
									<p>Haciz işlemlerine devam etmeyi seçtiniz</p>
								</>
							)}
							<Button
								classes="ml-4 blue fw-600"
								onClick={() =>
									updateRestriction('isCancelledByThreshold', null)
								}
							>
								Düzenle
							</Button>
						</div>
					</div>
				)}
				{visibleAsset.restriction.isCancelledByThreshold === null && (
					<>
						<p className="fw-600 fs-md mb-1">
							Takyidat sayısı, ofisiniz tarafından belirlenen takyidat sınırını
							aşıyor.
						</p>
						Yine de bu varlık için haciz işlemlerine devam etmek istiyor
						musunuz?
						<div className="flex al-center mt-6">
							<Button
								classes="red fw-500 mr-8"
								onClick={() =>
									updateRestriction('isCancelledByThreshold', true)
								}
							>
								Haciz işlemlerini durdur
							</Button>
							<Button
								theme="blue"
								classes="bold"
								onClick={() =>
									updateRestriction('isCancelledByThreshold', false)
								}
							>
								Devam Et
							</Button>
						</div>
					</>
				)}
			</Note>
		</div>
	)
}
