import React from 'react'
import { FaPlay, FaStop } from 'react-icons/fa'
import { useAppContext } from '../../../services/hooks/useAppContext'
import useInpoundmentContext from '../../../services/hooks/useInpoundmentContext'
import Button from '../../anBrains/Button'
import Note from '../../Note'

export default function BankAccountBalanceThreshold() {
	const { user } = useAppContext()
	const {
		assetProps: { visibleAsset, updateAsset },
	} = useInpoundmentContext()

	if (
		visibleAsset.accountBalance === null ||
		visibleAsset.accountBalance > user.lawOffice[0].bankAccountBalanceThreshold
	) {
		return null
	}

	const { isCancelledByThreshold } = visibleAsset
	const shouldAsk =
		isCancelledByThreshold === null && visibleAsset.accountBalance !== null

	return (
		<div className={`${shouldAsk ? 'focus' : ''}`}>
			<Note
				type="zekiye"
				classes={`mt-4 ${shouldAsk ? 'w-50' : ''}`}
				containerClass="al-start"
			>
				{isCancelledByThreshold !== null && (
					<div>
						<p>
							Hesap bakiyesi, ofisiniz tarafından belirtilen hacize devam etme
							sınırının altında kalıyor.
						</p>
						<div className="flex al-center mt-1">
							{isCancelledByThreshold === true && (
								<>
									<FaStop className="red" />
									<p>Haciz işlemlerini durdurmayı seçtiniz</p>
								</>
							)}
							{isCancelledByThreshold === false && (
								<>
									<FaPlay className="green" />
									<p>Haciz işlemlerine devam etmeyi seçtiniz</p>
								</>
							)}
							<Button
								classes="ml-4 blue fw-600"
								onClick={() => updateAsset('isCancelledByThreshold', null)}
							>
								Düzenle
							</Button>
						</div>
					</div>
				)}
				{shouldAsk && (
					<>
						<p className="fw-600 fs-md mb-1">
							Hesap bakiyesi, ofisiniz tarafından belirtilen hacize devam etme
							sınırının altında kalıyor.
						</p>
						Yine de bu varlık için haciz işlemlerine devam etmek istiyor
						musunuz?
						<div className="flex al-center mt-6">
							<Button
								classes="red fw-500 mr-8"
								onClick={() => updateAsset('isCancelledByThreshold', true)}
							>
								Haciz işlemlerini durdur
							</Button>
							<Button
								theme="blue"
								classes="bold"
								onClick={() => updateAsset('isCancelledByThreshold', false)}
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
