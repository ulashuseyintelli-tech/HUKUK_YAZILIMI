import InpoundmentStep from '../../../inpoundments/InpoundmentStep'
import TrueFalse from '../../../TrueFalse'
import useInpoundmentContext from '../../../../services/hooks/useInpoundmentContext'
import Note from '../../../Note'
import Court from '../../../court/Court'

export default function ImmovableInpoundmentStep3() {
	const { assetProps, selectedDebtor } = useInpoundmentContext()
	const { visibleAsset, updateAsset } = assetProps

	return (
		<InpoundmentStep step={3}>
			<p className="fw-500 mt-4">Haczedilmezlik İtirazı Var Mı?</p>
			<TrueFalse
				change={updateAsset}
				property="isNotDistrainableObjectionExist"
				object={visibleAsset}
				options={['İtiraz Yok', 'İtiraz Var']}
			/>
			{visibleAsset.isNotDistrainableObjectionExist && (
				<>
					<div className="step-item-divider"></div>
					<div>
						<Note type="zekiye" classes="mb-4">
							<p className="ml-0">
								İtiraza dair dava açılması ve bu davaya ait mahkeme bilgilerinin
								girilmesi gerekiyor.
							</p>
						</Note>
						<Court type="notDistrainableObjection" debtor={selectedDebtor} />
						{/* TODO: BAK BURAYA <courtList> gelecek */}
					</div>
				</>
			)}
		</InpoundmentStep>
	)
}
