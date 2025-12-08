import React from 'react'
import { DEBTOR_TYPES } from '../../constants'
import { getDebtorIdentityString, getDebtorName } from '../../helpers/Helper'
import printer from '../../printer'

export default class WarrantPaper extends React.Component {
	render() {
		let {
			lawyers,
			clients,
			debtors,
			dues,
			executionOffice,
			type,
			object,
			thirdPersons,
		} = this.props

		executionOffice = executionOffice[0]
		let generalAmount = 0
		dues.map(due => (generalAmount += due.totalAmount))
		return (
			<page size="A4" id="printSection">
				<div className="flex al-center jst-between">
					<div className="ml-4 ta-center bold">
						<p>T.C.</p>
						<p>{executionOffice.city.toUpperCase()}</p>
						<p>{executionOffice.name.toUpperCase()} MÜDÜRLÜĞÜ</p>
						<p>{this.props.executionFileNumber}</p>
					</div>
				</div>
				<p className="my-4 fw-500 ta-center">
					{type === printer.IMMOVABLE_INPOUNDMENT.value &&
						'... TAPU SİCİL MÜDÜRLÜĞÜNE'}
				</p>
				<div className="flex mb-4">
					<p className="w-30 mr-4 fs-xsm fw-500">Alacaklı</p>
					<div className="w-70 fs-xsm">
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
											return (
												<span key={address.title + address.description}>
													{address.description}
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
					<p className="w-30 mr-4 fs-xsm fw-500">Vekilleri</p>
					<div className="w-70 fs-xsm">
						{lawyers.map((lawyer, index) => {
							const isLast = index === lawyers.length - 1
							return (
								<p>
									AV. {lawyer.name} {lawyer.surname} {!isLast ? '&' : ''}
								</p>
							)
						})}
					</div>
				</div>
				<div className="flex mb-4">
					<p className="w-30 mr-4 fs-xsm fw-500">Borçlular</p>
					<div className="w-70 fs-xsm">
						{debtors.map(debtor => {
							return (
								<div>
									<p>{getDebtorName(debtor)}</p>
									<p>{getDebtorIdentityString(debtor)}</p>
								</div>
							)
						})}
					</div>
				</div>
				<div className="flex mb-4">
					<p className="w-30 mr-4 fs-xsm fw-500">BORÇ MİKTARI</p>
					<div className="w-70 fs-xsm">
						<p className="bold mb-2">
							{generalAmount} TRY (Faiz ve masraflar hariç)
						</p>
					</div>
				</div>
				{type === printer.GARNISHMENT.value && thirdPersons && (
					<div className="flex mb-4">
						<p className="w-30 mr-4 fs-xsm fw-500">3. Şahıslar</p>
						<div className="w-70 fs-xsm">
							{thirdPersons.map(thirdPerson => {
								return (
									<div>
										<p>{getDebtorName(thirdPerson)}</p>
										<p>{getDebtorIdentityString(thirdPerson)}</p>
									</div>
								)
							})}
						</div>
					</div>
				)}
				<div className="mb-4 fs-xsm ta-center">
					<span className="ta-left">
						{type === printer.TAX_OFFICE.value &&
							`Yukarda tarafları yazılı icra takibi gereğince, borçlu bulunan ${debtors.map(
								deb => `${getDebtorName(deb)} ${getDebtorIdentityString(deb)}`,
							)} işbu borç nedeniyle nezdinizde bulunan ihracat bedelleri, iade KDV alacağı, vs. tüm hak ve alacaklarının ihtiyaten haczine karar verilmiştir. Ayrıca borçlu şirket veya ortaklarının müdürlüğünüzde bulunan işyeri ve ikametgah adreslerinin de dosyamıza bildirilmesine karar verilmiştir. 
						Karar gereği işlem yapılması ve neticeden müdürlüğümüze bilgi verilmesi rica olunur. `}
					</span>
					{type === printer.VEHICLE_103.value &&
						'İcra ve İflâs Kanununun 102 nci maddesi uyarınca yapılan haciz sırasında kendiniz veya Tebligat Kanunu hükümlerine göre tebellüğe yetkili kimse hazır bulunmadığından işbu kâğıdın tebliğ tarihinden itibaren sözü edilen Kanunun 103 üncü maddesi gereğince (3) gün içinde haciz tutanağını tetkik ve bir diyeceğiniz varsa bildirmeniz için icra dairesine başvurmanız tebliğ olunur. *(İİK m.103)                '}
					{type === printer.IMMOVABLE_INPOUNDMENT.value &&
						`Yukarıda  belirtilen borçluların Tapu Sicil  Müdürlüğünüzde kayıtlı gayrimenkullere haciz konulmasına karar verilmiş olup takyidatlarının çıkartılarak birer suret gönderilmesine borçlular gayrimenkulleri satmış ise satılan gayrimenkullerin kime satıldığı ne zaman ve hangi bedelle satıldığına dair bilgi verilmesine  karar verilmiştir.`}
					{type === printer.CUSTOMS.value &&
						`Müdürlüğümüz dosyası ile yukarıda adı yazılı borçlu aleyhine yürütülen icra takibinde, borçlunun varsa müdürlüğünüz nezdinde ve denetimindeki geçici depolama yerleri ile genel antrepolarda bulunan eşya ve mallarının haczine karar verilmiştir. Karar gereği işlem yapılarak sonucunda bilgi verilmesi rica olunur.`}
					{type === printer.PATENT.value &&
						`Müdürlüğümüz dosyası ile yukarıda adı yazılı borçlu aleyhine yürütülen icra takibinde, Enstitünüz nezdinde kayıtlı bulunan ..../.... tescil numaralı "..................(var ise '+şekil yazınız')" ibareli markanın sicil kayıtları üzerine ve üzerine kayıtlı başkaca markalar varsa onların da haczine 556 Sayılı Markaların Korunması Hakkında Kanun Hükmünde Kararnamenin 19. maddesi uyarınca haciz konulmasına karar verilmiştir.

						Müdürlüğümüz kararı uyarınca, anılı markanın/markaların sicil kayıtları üzerine haciz şerhi işlenerek bu hususun yayınlanması; marka tescil belgesinin onaylı bir örneğinin Müdürlüğümüze gönderilmesi ve neticeden Müdürlüğümüze bilgi verilmesi rica olunur.
						 ../../..`}
					{type === printer.GARNISHMENT.value && (
						<div>
							<p>
								Yukarıda adı geçen borçlunun borcu sebebiyle MAAŞ tüm ikramiye,
								Prim, Tazminat haklarının ¼’ünün haczi ile ayrıca İ.İ.K.nun
								83.maddesi gereğince almakta olduğu maaş veya ücretlerinin
								¼’ünün haczine karar verilmiştir.
							</p>
							<p>Karar gereğince;</p>
							<p>
								1-Adı geçenin maaşına İ.İ.K.nun 355 maddesi gereğince haczin
								icra edildiğinin, borçlunun maaş veya ücret miktarının bir hafta
								içinde bildirilmesi, borç bitinceye kadar kesintiye devam
								olunması, kesintilerin bir hafta içinde müdürlüğümüze
								gönderilmesi, maaşı hacizli ise dosyamız sırasının bildirilmesi,
							</p>
							<p>
								2-Adı geçenin maaş ücret veya memuriyetinde veyahut başka yerde
								maaş almayı gerektiren değişikliklerin veya vazifesine son
								verildiği takdirde müdürlüğümüze bilgi verilmesi,
							</p>
							<p>
								3-Yukarıda belirtilen hususlara riayet edilmediği takdirde İİK.
								nun 356 mad. gereğince ayrıca mahkemeden hüküm alınmadan
								müdürlüğümüzce ilgili birim amirinin maaş veya sair mallarından
								kesmedikleri miktarı kadar tahsil edileceği,
							</p>
							<p>
								4-Yukarıdaki madde hükümlerine uymayan amir hakkında
								İ.İ.Kanununun 357 maddesi gereğince Cumhuriyet Başsavcılığınca
								doğrudan ceza takibatının yapılacağının bilinmesi ve yazımız
								doğrultusunda işlem yapılması ve yazımıza bir hafta içinde cevap
								verilmesi tekiden rica olunur.{' '}
							</p>
						</div>
					)}
					{type === '' &&
						`Yukarda tarafları yazılı icra takibi gereğince, adı soyadı yazılı dosyamız borçlusunun adres bilgilerine göre nüfus bilgilerinin T.C
            kimlik numarasının tebliğe yarar adreslerinin bildirilmesine karar
            verilmiştir. Karar gereği işlem yapılması ve neticeden müdürlüğümüze
            bilgi verilmesi rica olunur.`}
				</div>
				<div className="flex jst-between">
					<div className="w-50"></div>
					<div className="w-50 flex column al-center jst-center">
						<p>
							{executionOffice.city} {executionOffice.name} MÜDÜRLÜĞÜ
						</p>
					</div>
				</div>
				{type === printer.IMMOVABLE_INPOUNDMENT.value && (
					<div className="flex mb-4">
						<p className="w-30 mr-4 fs-xsm fw-500">TAPU BİLGİLERİ: </p>
						<div className="w-70 fs-xsm">
							<p className="bold mb-2">
								İl: {object.city} İlçe: {object.district} Mahalle:{' '}
								{object.street} Mevki: {object.local} Ada: {object.cityBlcok}{' '}
								Parsel: {object.parcel} Bağımsız Bölüm:{' '}
								{object.secondQualification}
							</p>
						</div>
					</div>
				)}
			</page>
		)
	}
}
