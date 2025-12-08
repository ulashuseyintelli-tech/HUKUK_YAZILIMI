import { getDebtorName } from '../../helpers/Helper'
import printer from '../../printer'

export default class NoticePaper extends React.Component {
	render() {
		let {
			request,
			executionFileNumber,
			executionOffice,
			clients,
			lawyers,
			debtor,
			due,
			type,
		} = this.props
		executionOffice = executionOffice[0]

		return (
			<page size="A4" id="printSection">
				<div className="flex">
					<div className="w-50 mr-4 fs-xxsm brd-black p-2">
						<p className="bold">TEBLİĞ MAZBATASI</p>
						<p>Tebliğ evrakı,</p>
						<p>
							1 – Adresinde veya
							…………………....................................................... da
							muhatap
							....................................................................................................................................
						</p>
						<p>
							2 - ................................................ sebebiyle
							muhatap yerine ....................................
							………………………………………………………………………………………………..
						</p>
						<p>
							3 – Tebliğin yapılması
							............................................. sebebiyle temin
							edilmediğinden
							....................................................................................................................................
						</p>
						<p>
							4 – Muhatabın muvakkaten .....................................
							gittiği tarafından bildirildiğinden
							....................................................................................................................................
						</p>
						<p>
							5 – (..................) mehil tayin edip (ikinci defa) tebligat
							çıkarıldığından keyfiyet haber verilerek muhatap yerine
							............................................................................................
						</p>
						<p>
							6 - ………………………………… tebellüğden imtina ettiğinden ……………………...
							………………………………………………………………………………………………..
						</p>
						<p>
							7 – Adreste kimse bulunmaması üzerine ………………………………………………..
							…………………………………………………………………………………………………
						</p>
						<p>
							8 – Tebliğ yapacak kimse …………………………………. sebebiyle imtina
							ettiğinden ……………………………………………………..huzurunda …………………………….
						</p>
						<p>Tebligat yapılanın</p>
						<div className="flex al-center mb-2">
							<div className="flex column al-center mr-4">
								<p>Tebliğ tarihi</p>
								<p>...............</p>
							</div>
							<div className="flex column al-center mr-4">
								<p>İmza veya parmak izi</p>
								<p>..........................</p>
							</div>
							<div className="flex column al-center mr-2">
								<p>İmza</p>
								<p>...............</p>
							</div>
						</div>
						<p className="mb-2">Tebliğ memurunun imzası :</p>
						<p>
							Muhatap adresini değiştirmişse tebliğ memuru tarafından tesbit
							edilen yeni adres : …………………………………………………………………………………………………
							…………………………………………………………………………………………………
						</p>
						 
					</div>
					<div className="w-50 fs-xxsm brd-black p-2 flex column jst-between">
						<div className="fw-500">
							<div className="column al-center jst-center">
								<p>T A A H H Ü T L Ü</p>
								<p>No: </p>
							</div>
							<p>İADE EDİLECEĞİ ADRES:</p>
							T.C. İSTANBUL 14. İCRA MÜD.
							<p>Dosya No: {this.props.executionFileNumber}</p>
						</div>
						<div>
							<p className="underline">
								Muhatabın adı, soyadı veya ünvanı ve adresi:
							</p>
							<div>
								<div>
									<p>
										<span className="fw-500">{getDebtorName(debtor)}</span>{' '}
										(T.C. Kimlik Numarası: {debtor.identityNumber})
									</p>
									<p>
										{debtor.addresses.map(address => {
											return (
												<p key={address.description}>{address.description}</p>
											)
										})}
									</p>
								</div>
							</div>
							<p className="mt-2">
								Bu zarf, Örnek 10 ÖDEME EMRİ ve 2 adet senet fotokopisi ihtiva
								eder.
							</p>
						</div>
						                                                                  
						<p className="mb-20 mr-10 fw-500 al-self-end">İmza ve mühür</p>
					</div>
				</div>
				<div className="brd-btm-black my-4">
					<p className="fw-300 ta-right fs-xxsm">Buradan Katlayınız</p>
				</div>
				<div className="brd-black flex column p-2 fs-xxsm">
					<div className="flex column al-center fw-500">
						<div className="column al-center jst-center">
							<p>T A A H H Ü T L Ü</p>
							<p>No: </p>
						</div>
						<div className="al-self-end">
							<p className="fw-400">Örnek No: 2</p>
							<p>İADE EDİLECEĞİ ADRES:</p>
							T.C. İSTANBUL 14. İCRA MÜD.
							<p>Dosya No: {this.props.executionFileNumber}</p>
						</div>
						<div className="al-self-start">
							<p className="underline">
								Muhatabın adı, soyadı veya ünvanı ve adresi:
							</p>
							<div>
								<div>
									<p>
										<span className="fw-500">{getDebtorName(debtor)}</span>{' '}
										(T.C. Kimlik Numarası: {debtor.identityNumber})
									</p>
									<p>
										{debtor.addresses.map(address => {
											return (
												<p key={address.description}>{address.description}</p>
											)
										})}
									</p>
								</div>
							</div>
						</div>
					</div>
					<div className="al-self-end mt-10">
						<p className="fw-500 mb-10">İmza ve Mühür</p>
						<p className="fw-400 mt-2">
							Bu zarf
							{type === printer.VEHICLE_103 && `103 DAVETİYESİ`}
							ihtiva eder
						</p>
					</div>
				</div>
				<div className="brd-btm-black my-4">
					<p className="fw-300 ta-right fs-xxsm">Buradan Katlayınız</p>
				</div>
			</page>
		)
	}
}
