import React from 'react'
import { DEBTOR_TYPES } from '../../constants'
import {
	getOrderOfPaymentHeader,
	getOrderOfPaymentFooter,
	getOrderOfPaymentIIK,
} from '../../helpers/DocumentHelper'

export default class OrderOfPayment extends React.Component {
	render() {
		let {
			currentCase,
			lawyers,
			clients,
			debtors,
			dues,
			executionOffice,
			executionFileNumber,
			type,
			decision,
			contract,
			remittalAddress,
		} = this.props

		const CreditorInfo = ({ clients, lawyers }) => {
			return (
				<div className="flex mb-4">
					<p className="w-50 mr-4 fs-xsm">
						1-Alacaklının ve varsa kanuni temsilcisinin ve vekilinin adı,
						soyadı, vergi kimlik numarası, TC kimlik numarası, alacaklı veya
						vekili adına ödemenin yapılacağı banka adıyla hesap bilgileri ve
						yerleşim yerindeki adresi, alacaklı yabancı ülkede oturuyorsa
						Türkiye’de göstereceği yerleşim yerindeki adresi:
					</p>
					<div className="w-50 fs-xsm">
						{clients.map(client => {
							return (
								<div key={client._id} className="mb-2">
									<p>
										<span className="fw-500">
											{client.name} {client.surname}
										</span>
										(T.C. Kimlik No: {client.identityNumber})
									</p>
									<p>
										{client.addresses.map(address => {
											return <span>{address.description}</span>
										})}
									</p>
								</div>
							)
						})}
						{lawyers.map(lawyer => {
							return (
								<div>
									<p>
										<span className="fw-500">
											Av.{lawyer.name} {lawyer.surname}
										</span>
									</p>
									<p>
										{lawyer.addresses.map(address => {
											return <span>{address.description}</span>
										})}
									</p>
									<p>
										{lawyer.phoneNumbers.map(phoneNumber => {
											return (
												<span>
													{phoneNumber.title}: {phoneNumber.number}
												</span>
											)
										})}
									</p>
									<p>
										{lawyer.bankAccountInformations.map(info => {
											return (
												<span>
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
			)
		}

		const DebtorInfo = ({ debtors }) => {
			return (
				<div className="flex mb-4">
					<p className="w-50 mr-4 fs-xsm">
						2-Borçlunun ve varsa kanuni temsilcisinin adı, soyadı ve yerleşim
						yerindeki adresi, alacaklı tarafından biliniyorsa vergi kimlik
						numarası:
					</p>
					<div className="w-50 fs-xsm">
						{debtors.map(debtor => {
							return (
								<div>
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
											return <p>{address.description}</p>
										})}
									</p>
								</div>
							)
						})}
					</div>
				</div>
			)
		}

		const DueInfo = ({ dues }) => {
			let generalAmount = 0
			dues.map(due => (generalAmount += due.totalAmount))
			return (
				<div className="flex mb-4">
					<p className="w-50 mr-4 fs-xsm">
						3-Alacağın veya istenen teminatın Türk parasıyla tutarı ve faizli
						alacaklarda faizin miktarı ile işlemeye başladığı gün; alacak veya
						teminat yabancı para ise alacağın hangi tarihteki kur üzerinden
						talep edildiği ve faizi:
					</p>
					<p className="w-50 fs-xsm">
						{dues.map(due => {
							return (
								<p>
									{due.totalAmount}
									{due.currency} - {due.causeOfDebt} (
									{new Date(due.expiryDate).toLocaleDateString('tr-TR')})
								</p>
							)
						})}
						<p className="bold mb-2">{generalAmount} TRY</p>
						{generalAmount}TRY tutarındaki alacağın icra gideri, vek.ücr. ve
						takip tarihinden itibaren asıl alacağa işleyecek (YILLIK %19.50
						(TİCARİ) değişen oranlarda) değişen oranlarda) faizi ile ödemesi
						emridir. (Fazlaya dair ve faiz oranlarındaki artıştan doğan talep
						hakkımız saklıdır) TBK. 100.mad. gereğince kısmi ödemeler öncelikle
						işlemiş faiz, masraf ve fer'ilere mahsup edilecektir.
					</p>
				</div>
			)
		}

		const DecisionInfo = ({ decision, step }) => {
			return (
				<React.Fragment>
					<div className="flex mb-4">
						<p className="w-50 mr-4 fs-xsm">
							{step || 3} - İlamı veren mahkeme ve ilamın tarihi ve numarası:
						</p>
						{decision && (
							<p className="w-50 fs-xsm">
								<p className="mb-2">Karar Mercii: {decision.maker}</p>
								<p className="mb-2">Karar Tarihi: {decision.date}</p>
								<p className="mb-2">Esas No: {decision.basicNumber}</p>
								<p className="mb-2">Karar No: {decision.number}</p>
							</p>
						)}
					</div>
				</React.Fragment>
			)
		}

		const DecisionDue = ({ dues, step }) => {
			return (
				<div className="flex mb-4">
					<p className="w-50 mr-4 fs-xsm">
						{step || 4}-Talebin neden ibaret olduğu
					</p>
					<p className="w-50 fs-xsm">
						{dues.map(due => {
							return (
								<p>
									{due.totalAmount}
									{due.currency} - {due.causeOfDebt} (
									{new Date(due.expiryDate).toLocaleDateString('tr-TR')})
								</p>
							)
						})}
					</p>
				</div>
			)
		}

		const DecisionDueLarge = ({ dues, step }) => {
			return (
				<div className="flex mb-4">
					<p className="w-50 mr-4 fx-xsm">
						{step || 6} - İlâm veya belgeye dayalı olarak istenen alacağın veya
						teminatın; yapılması veya yapılmaması istenen işin; kaldırılacak
						veya yükletilecek irtifak hakkının veya gemi üzerindeki irtifak veya
						intifa hakkının neden ibaret olduğu ve faizi
					</p>
					<p className="w-50 fs-xsm">
						{dues.map(due => {
							return (
								<p>
									{due.totalAmount}
									{due.currency} - {due.causeOfDebt} (
									{new Date(due.expiryDate).toLocaleDateString('tr-TR')})
								</p>
							)
						})}
					</p>
				</div>
			)
		}

		const HeritageInfo = ({ step }) => {
			return (
				<div className="flex mb-4">
					<p className="w-50 mr-4 fx-xsm">
						{step || 4} - Takip terekeye karşı açılmışsa mirasçıların adı,
						soyadı ve yerleşim yerindeki adresleri
					</p>
					<p className="w-50 fs-xsm"></p>
				</div>
			)
		}

		const CommitmentInfo = ({ step }) => {
			return (
				<div className="flex mb-4">
					<p className="w-50 mr-4 fx-xsm">
						{step || 5} - Borç senedi ve tarihi ve taahhüdün sebebi :
					</p>
					<p className="w-50 fs-xsm"></p>
				</div>
			)
		}

		const HypothecInfo = ({ step }) => {
			return (
				<div className="flex mb-4">
					<p className="w-50 mr-4 fx-xsm">
						{step || 6} - Rehnedilenin ne olduğu
					</p>
					<p className="w-50 fs-xsm"></p>
				</div>
			)
		}

		const HypothecFileInfo = ({ step }) => {
			return (
				<div className="flex mb-4">
					<p className="w-50 mr-4 fx-xsm">
						{step || 5} - İpotek belgesi ve tarihi (ipotek bir cari hesap veya
						işlemeyecek kredi vesaire gibi bir mukavelenin teminatı olarak
						verilmişse tarih ve numarası){' '}
					</p>
					<p className="w-50 fs-xsm"></p>
				</div>
			)
		}

		const HypothecThirdPersonInfo = ({ step }) => {
			return (
				<div className="flex mb-4">
					<p className="w-50 mr-4 fx-xsm">
						{step || 7} - Rehnedilen üçüncü şahıs tarafından verilmiş veya
						mülkiyeti üçüncü şahsa geçmişse onun ve daha sonra gelen rehin hakkı
						sahibinin adı, soyadı, yerleşim yerindeki adresi
					</p>
					<p className="w-50 fs-xsm"></p>
				</div>
			)
		}

		const VoucherInfoOrCauseOfDebt = ({ dues, step }) => {
			return (
				<div className="flex mb-4">
					<p className="w-50 mr-4 fx-xsm">
						{step || 4} - Senet ve tarihi ve senet yoksa borcun sebebi
					</p>
					<p className="w-50 fs-xsm">
						{dues.map(due => {
							return (
								<p>
									{due.totalAmount}
									{due.currency} - {due.causeOfDebt} (
									{new Date(due.expiryDate).toLocaleDateString('tr-TR')})
								</p>
							)
						})}
					</p>
				</div>
			)
		}

		const VoucherInfo = ({ dues, step }) => {
			return (
				<div className="flex mb-4">
					<p className="w-50 mr-4 fs-xsm">{step || 4} - Senet ve Tarihi:</p>
					<p className="w-50 fs-xsm">
						{dues.map(due => {
							return (
								<p>
									{due.totalAmount}
									{due.currency} {due.causeOfDebt.toUpperCase()} (Keşide Tarihi:{' '}
									{new Date(due.expiryDate).toLocaleDateString('tr-TR')})
								</p>
							)
						})}
					</p>
				</div>
			)
		}

		const ContractInfo = ({ contract, step }) => {
			return (
				<div className="flex mb-4">
					<p className="w-50 mr-4 fs-xsm">{step || 5} - Sözleşme ve Tarihi:</p>
					{contract && (
						<p className="w-50 fs-xsm">
							<p className="mb-2">Kira Türü: {contract.rentType}</p>
							<p className="mb-2">
								Yıllık Kira Bedeli: {contract.annualRentalValue}
							</p>
							<p className="mb-2">Sözleşme Şekli: {contract.type}</p>
							<p className="mb-2">{contract.rentAddress}</p>
						</p>
					)}
				</div>
			)
		}

		const RemittalInfo = ({ clients, debtors, remittalAddress }) => {
			return (
				<React.Fragment>
					<div className="flex mb-4">
						<p className="w-50 mr-4 fs-xsm">
							1 - Kirayalanın ve varsa temsilcisinin adı, soyadı ve yerleşim
							yerindeki adresi
						</p>
						<div className="w-50 fs-xsm">
							{clients.map(client => {
								return (
									<div key={client._id} className="mb-2">
										<p>
											<span className="fw-500">
												{client.name} {client.surname}
											</span>
											(T.C. Kimlik No: {client.identityNumber})
										</p>
										<p>
											{client.addresses.map(address => {
												return <span>{address.description}</span>
											})}
										</p>
									</div>
								)
							})}
							{lawyers.map(lawyer => {
								return (
									<div>
										<p>
											<span className="fw-500">
												Av.{lawyer.name} {lawyer.surname}
											</span>
										</p>
										<p>
											{lawyer.addresses.map(address => {
												return <span>{address.description}</span>
											})}
										</p>
										<p>
											{lawyer.phoneNumbers.map(phoneNumber => {
												return (
													<span>
														{phoneNumber.title}: {phoneNumber.number}
													</span>
												)
											})}
										</p>
										<p>
											{lawyer.bankAccountInformations.map(info => {
												return (
													<span>
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
							2 - Kiracının ve varsa temsilcisinin yerleşim yerindeki adresi
						</p>
						<div className="w-50 fs-xsm">
							{debtors.map(debtor => {
								return (
									<div>
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
												return <p>{address.description}</p>
											})}
										</p>
									</div>
								)
							})}
						</div>
					</div>
					<div className="flex mb-4">
						<p className="w-50 mr-4 fs-xsm">
							3 - Tahliyesi istenen taşınmazın nev'i ve mevkii
						</p>
						<p className="w-50 fs-xsm">
							{remittalAddress} adresindeki taşınmazın tahliyesi, icra
							masrafları ve vekalet ücreti tahsili emridir.
						</p>
					</div>
				</React.Fragment>
			)
		}

		return (
			<div>
				<page size="A4" id="printSection">
					<div className="flex al-center jst-between">
						<div className="w-50">
							<p>T.C.</p>
							<p>{executionOffice.name} İcra Dairesi</p>
							<p>Dosya No: {executionFileNumber}</p>
						</div>
						<div className="w-50 flex al-center jst-end">
							<p className="w-50">Örnek No: {type === '4' ? '4-5' : type}</p>
						</div>
					</div>
					<p className="my-4 fw-500 ta-center">
						{getOrderOfPaymentHeader(currentCase)}
					</p>
					{(type === '2' || type === '3') && (
						<React.Fragment>
							<CreditorInfo clients={clients} lawyers={lawyers} />
							<DebtorInfo debtors={debtors} />
							<DecisionInfo decision={decision} step={3} />
							<DecisionDue dues={dues} step={4} />
						</React.Fragment>
					)}
					{type === '4' && (
						<React.Fragment>
							<CreditorInfo clients={clients} lawyers={lawyers} />
							<DebtorInfo debtors={debtors} />
							<DueInfo dues={dues} />
							<HeritageInfo />
							<DecisionInfo decision={decision} step={5} />
							<DecisionDueLarge dues={dues} />
						</React.Fragment>
					)}
					{type === '6' && (
						<React.Fragment>
							<CreditorInfo clients={clients} lawyers={lawyers} />
							<DebtorInfo debtors={debtors} />
							<DueInfo dues={dues} />
							<HeritageInfo />
							<CommitmentInfo />
							<HypothecInfo />
							<HypothecThirdPersonInfo />
						</React.Fragment>
					)}
					{type === '7' && (
						<React.Fragment>
							<CreditorInfo clients={clients} lawyers={lawyers} />
							<DebtorInfo debtors={debtors} />
							<DueInfo dues={dues} />
							<VoucherInfoOrCauseOfDebt dues={dues} />
							<HeritageInfo step={5} />
						</React.Fragment>
					)}
					{type === '8' && (
						<React.Fragment>
							<CreditorInfo clients={clients} lawyers={lawyers} />
							<DebtorInfo debtors={debtors} />
							<DueInfo dues={dues} />
							<CommitmentInfo step={4} />
							<HypothecInfo step={5} />
							<HypothecThirdPersonInfo step={6} />
						</React.Fragment>
					)}
					{type === '9' && (
						<React.Fragment>
							<CreditorInfo clients={clients} lawyers={lawyers} />
							<DebtorInfo debtors={debtors} />
							<DueInfo dues={dues} />
							<HeritageInfo />
							<HypothecFileInfo />
							<HypothecInfo />
							<HypothecThirdPersonInfo />
						</React.Fragment>
					)}
					{type == '10' && (
						<React.Fragment>
							<CreditorInfo clients={clients} lawyers={lawyers} />
							<DebtorInfo debtors={debtors} />
							<DueInfo dues={dues} />
							<VoucherInfo dues={dues} />
							<HeritageInfo step={5} />
						</React.Fragment>
					)}
					{type === '11' && (
						<React.Fragment>
							<CreditorInfo clients={clients} lawyers={lawyers} />
							<DebtorInfo debtors={debtors} />
							<DueInfo dues={dues} />
							<VoucherInfo dues={dues} />
						</React.Fragment>
					)}
					{type === '12' && (
						<React.Fragment>
							<CreditorInfo clients={clients} lawyers={lawyers} />
							<DebtorInfo debtors={debtors} />
							<DueInfo dues={dues} />
							<VoucherInfo dues={dues} />
						</React.Fragment>
					)}
					{type === '13' && (
						<React.Fragment>
							<CreditorInfo clients={clients} lawyers={lawyers} />
							<DebtorInfo debtors={debtors} />
							<DueInfo dues={dues} />
							<HeritageInfo />
							<ContractInfo contract={contract} />
						</React.Fragment>
					)}
					{type === '14' && (
						<React.Fragment>
							<RemittalInfo
								clients={clients}
								debtors={debtors}
								remittalAddress={remittalAddress}
							/>
							<ContractInfo contract={contract} />
						</React.Fragment>
					)}
					<p className="mb-4 fs-xsm">
						<p>
							İcra Dairesi Banka Hesap Bilgileri: {executionOffice.bankName} 
							{executionOffice.IBAN}
						</p>
						{type === '3' ? (
							<React.Fragment>
								<p>
									A) Yukarıda yazılı borcu (teminat) işbu icra emrinin tebliği
									tarihinden itibaren (7) gün içinde ödemeniz (vermeniz); İcra
									ve İflas Kanununun 32. maddesi gereğince ve bu süre içinde
									borcu (teminatı) ödemez. (vermez) iseniz, icra mahkemesinden
									veya Yargıtay’dan veya yargılamanın yenilenmesi yolu ile ait
									olduğu mahkemeden icranın geri bırakılmasına dair bir karar
									getirmediğiniz takdirde cebri icra yapılacağı; yine bu müddet
									içinde 74 üncü madde gereğince mal beyanında bulunmanız
									beyanda bulunmaz veya hakikate aykırı beyanda bulunursanız
									337. madde gereğince hapis ile cezalandırılacağınız,{' '}
								</p>
								<p>
									B) Yukarıda yazılı işi işbu icra emirinin, tebliği tarihinden
									itibaren .............. süre içinde yapmanız, aksi halde, 30
									uncu madde gereğince ilâm hükmünün icraen yerine getirileceği;
									iş yalnız tarafınızdan yapılmasına dair ise bu süre içinde
									yapılmaması halinde 343 üncü maddedeki cezayı gerektireceği,{' '}
								</p>
								<p>
									C) Yukarıda yazılı işin ........... süre içinde yapılmaması,
									aksi halde 343 üncü maddedeki cezayı gerektireceği,
								</p>
								<p>
									D) Yukarıda yazılı işin yapılmasına veya yapılmamasına ilişkin
									ilâm hükmü yerine getirildikten sonra, ilâm hükmünü ortadan
									kaldıracak bir eylemde bulunursanız mahkemeden ayrıca hüküm
									almaya gerek kalmadan, önceki ilâm hükmünün tekrar zorla
									yerine getirileceği,
								</p>
								<p>
									E) Yukarıda yazılı irtifak hakkını veya gemi üzerindeki intifa
									hakkının icra emrinin tebliği tarihinden itibaren (7) gün
									içinde yüklemeniz (kaldırmanız), aksi halde ilâm hükmünün
									zorla yerine getirileceği ve ilâm hükmüne muhalefetin ayrıca
									İcra ve İflâs Kanununun 343 üncü maddesindeki cezayı
									gerektireceği, ihtar olunur.
								</p>
							</React.Fragment>
						) : (
							getOrderOfPaymentFooter(currentCase)
						)}
						(İİK {getOrderOfPaymentIIK(currentCase)})
					</p>
					<div className="flex jst-between">
						<div className="w-50"></div>
						<div className="w-50 flex column al-center jst-center">
							<p>{new Date().toLocaleDateString('tr-TR')}</p>
							<p>İcra Müdürü Mühür ve İmza</p>
						</div>
					</div>
					{type == '13' && (
						<div className="flex jst-between">
							<p className="w-50 mr-4">
								A- Ödeme süresi; Borçlar Kanununun 260 ıncı maddesi gereğince,
								altı ay veya daha fazla süreli adî kiralarda otuz gün, daha az
								süreli olanlarında altı gün, aynı Kanunun 288 inci maddesi
								uyarınca hasılat kiralarında altmış gündür.
							</p>
							<p className="w-50">
								B- İtiraz süresi; Ödeme süresi otuz ve altmış gün olan adî ve
								hasılat kiralarında itiraz süresi yedi gün, ödeme süresi altı
								gün olan adî kiralarda ise üç gündür.
							</p>
						</div>
					)}
				</page>
			</div>
		)
	}
}
