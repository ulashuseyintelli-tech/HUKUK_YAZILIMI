import React from 'react'
import { DEBTOR_TYPES } from '../../constants'

export default class EnforcementRequest extends React.Component {
	render() {
		let { currentCase, lawyers, clients, dues, paperDebtors } = this.props
		let generalAmount = 0
		dues.map(due => (generalAmount += due.totalAmount))

		return (
			<div>
				<page size="A4" id="printSection">
					<p className="mb-4 fw-500">TAKİP TALEBİ</p>
					<div className="flex mb-4">
						<p className="w-50 mr-4 fs-xsm">
							Alacaklının ve varsa kanuni temsilcisinin ve vekilinin adı,
							soyadı, vergi kimlik numarası, TC kimlik numarası, alacaklı veya
							vekili adına ödemenin yapılacağı banka adıyla hesap bilgileri ve
							yerleşim yerindeki adresi, alacaklı yabancı ülkede oturuyorsa
							Türkiye’de göstereceği yerleşim yerindeki adresi:
						</p>
						<div className="w-50 fs-xsm">
							{clients.map(client => {
								return (
									<div className="mb-2" key={client._id}>
										<p>
											<span className="fw-500">
												{client.name} {client.surname}
											</span>
											(T.C. Kimlik No: {client.identityNumber})
										</p>
										<p>
											{client.addresses.map(address => {
												return (
													<span key={address.description}>
														{address.description}
													</span>
												)
											})}
										</p>
									</div>
								)
							})}
							{lawyers.map(lawyer => {
								return (
									<div key={lawyer._id}>
										<p>
											<span className="fw-500">
												Av.{lawyer.name} {lawyer.surname}
											</span>
										</p>
										<p>
											{lawyer.addresses.map(address => {
												return (
													<span key={address.description}>
														{address.description}
													</span>
												)
											})}
										</p>
										<p>
											{lawyer.phoneNumbers.map(phoneNumber => {
												return (
													<span key={phoneNumber.number + phoneNumber.title}>
														{phoneNumber.title}: {phoneNumber.number}
													</span>
												)
											})}
										</p>
										<p>
											{lawyer.bankAccountInformations.map(info => {
												return (
													<span key={info.bankName + info.IBAN}>
														{info.bankName} {info.IBAN}
													</span>
												)
											})}
										</p>
									</div>
								)
							})}
						</div>
					</div>

					<div className="flex mb-4">
						<p className="w-50 mr-4 fs-xsm">
							Borçlunun ve varsa kanuni temsilcisinin adı, soyadı ve yerleşim
							yerindeki adresi, alacaklı tarafından biliniyorsa vergi kimlik
							numarası:
						</p>
						<p className="w-50 fs-xsm">
							{paperDebtors.map(debtor => {
								return (
									<div key={debtor._id}>
										<p>
											{debtor.type === DEBTOR_TYPES.PERSON ? (
												<span>
													{debtor.name} {debtor.surname}
												</span>
											) : (
												<span>{debtor.institutionName}</span>
											)}{' '}
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
								)
							})}
						</p>
					</div>
					<div className="flex mb-4">
						<p className="w-50 mr-4 fs-xsm">
							Takip terekeye karşı açılmışsa mirasçıların, adı, soyadı ve
							yerleşim yerindeki adresleri:
						</p>
					</div>
					<div className="flex mb-4">
						<p className="w-50 mr-4 fs-xsm">
							Alacağın veya istenen teminatın Türk parasıyla tutarı ve faizli
							alacaklarda faizin miktarı ile işlemeye başladığı gün; alacak veya
							teminat yabancı para ise alacağın hangi tarihteki kur üzerinden
							talep edildiği ve faizi:
						</p>
						<p className="w-50 fs-xsm">
							{dues.map(due => {
								return (
									<p className="fs-xsm">
										{due.totalAmount}
										{due.currency} - {due.causeOfDebt} (
										{new Date(due.expiryDate).toLocaleDateString('tr-TR')})
									</p>
								)
							})}
							<p className="mb-2 fs-xsm">2000TRY - İşlemiş Faiz (TİCARİ)</p>
							{generalAmount + 2000} TRY
							{generalAmount + 2000} TRY tutarındaki alacağın icra gideri,
							vek.ücr. ve takip tarihinden itibaren asıl alacağa işleyecek
							(YILLIK %19.50 (TİCARİ) değişen oranlarda) faizi ile tahsili
							talebildir. (Fazlaya dair ve faiz oranlarındaki artıştan doğan
							talep hakkımız saklıdır) TBK. 100.mad gereğince kısmi ödemeler
							öncelikle işlemiş faiz, masraf ve fer'ilere mahsup edilecektir.
						</p>
					</div>
					<div className="flex mb-4">
						<p className="w-50 mr-4 fs-xsm">
							Taşınır rehni veya ipotekle temin edilmiş olan bir alacak
							talebinde rehnedilenin ne olduğu rehnedilen üçüncü sşahıslar
							tarafından verilmiş veya mülkiyeti üçüncü şahsa geçmiş ise adı ve
							soyadı, rehnedilen şey üzerinde, sonra gelen rehin hakkı varsa bu
							hakka sahip olan kişinin adı, soyadı, yerleşim yerindeki adresi:
						</p>
						<p className="w-50"></p>
					</div>
					<div className="flex mb-4">
						<p className="w-50 mr-4 fs-xsm">
							Takip, ilama veya ilam hükmündeki belgeye müstenit ise belgeyi
							veren makamın adı, ilam veya belgenin tarih ve numarası ve özeti:
						</p>
						<p className="w-50"></p>
					</div>
					<div className="flex mb-4">
						<p className="w-50 mr-4 fs-xsm">
							Adi veya hasılat kiralarına ait takip talebi:
						</p>
						<p className="w-50"></p>
					</div>
					<div className="flex mb-4">
						<p className="w-50 mr-4 fs-xsm">
							Tevdi edilen senet (poliçe, emre muharrer senet, çek)in tarih ve
							numarası, özeti, senede müstenit değilse borcun sebebi:
						</p>
						<p className="w-50"></p>
					</div>
					<div className="flex mb-4">
						<p className="w-50 mr-4 fs-xsm">
							Alacaklının takip yollarından hangisini talep ettiği:
						</p>
						<p className="w-50">{currentCase ? currentCase.way : ''}</p>
					</div>
					<p className="mb-4">
						Yukarıda yazdığım hakkımın alınmasını talep ederim
					</p>
					<p className="fw-500">(İİK m.8, 58)</p>
					<div className="flex jst-between">
						<div className="w-50"></div>
						<div className="w-50 flex column al-center jst-center">
							<p>{new Date().toLocaleDateString('tr-TR')}</p>
							<p>
								Av. {lawyers[0] ? lawyers[0].name : ''}{' '}
								{lawyers[0] ? lawyers[0].surname : ''}
							</p>
							<p>Alacaklı veya Vekilin İmzası</p>
						</div>
					</div>
				</page>
			</div>
		)
	}
}
