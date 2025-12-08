import React, { useEffect } from 'react'
import { getDebtorName } from '../../helpers/Helper'
import printer from '../../printer'

export default class RequestPaper extends React.Component {
	render() {
		let {
			request,
			executionFileNumber,
			executionOffice,
			clients,
			lawyers,
			debtors,
			due,
			paperDebtors,
		} = this.props
		executionOffice = executionOffice[0]

		return (
			<page size="A4" id="printSection">
				<p className="bold">{executionOffice.city}</p>
				<p className="bold">{executionOffice.name}</p>
				<p className="bold">{executionFileNumber} Esas</p>
				<br />
				<p>Alacaklı Vekili geldi, işbu dosyada,</p>
				{request === printer.SSI_QUERY.value &&
					'Dosya borçlusunun SGK’ sorgusunun yapılarak borçlunun SGK kayıtlarının çıkartılmasını talep ederim.'}
				{request === printer.PATENT.value &&
					`Borçlularının Türkiye Patent Enstitüsünde bulunan markalarına, patentlerine ve faydalı tasarımlarının sorgulanmasına ve tespiti halinde haciz konulması aksi takdirde devredilmiş ise devir tarihinin ve devir gerekçesinin bildirilmesi için müzekkere yazılmasını talep ederim dedi.`}
				{request === printer.SHARE_QUERY.value &&
					`Borçlunun ticaret odasında kayıtlı şirketlerinin olup olmadığının ayrıca var ise şirket hisse oranının öğrenilmesini ve ticaret odasına müzekkere ile sorulması, talep ederim dedi.`}
				{request === printer.SHARE_INPOUNDMENT.value &&
					`Borçlunun ..... şirketindeki bulunan hisselerine haciz konulması için şirkete haciz müzekkeresi yazılamasını talep ederim dedi`}
				{request === printer.SHARE_NOTIFICATION.value &&
					`Borçlunun ticaret odasında kayıtlı şirketlerine konulmuş haczin ticaret odasına bildirilmesini, talep ederim dedi.`}
				{request === 'VEHICLE_INPOUNDMENT' &&
					'Dosya borçlu/larına ait araçlara Uyap ile sorgulanarak var ise araçlara haciz konulmasını ve araç bulunamaması halinde borçlu hakkında pasif sorgularınında yapılarak cevaplarının bir suretinin dosyamıza alınmasını arz ve talep ederim.'}
				{request === 'VEHICLE_WARRANT' &&
					'Dosya borçlularına ait araçlara yakalama konulmasını arz ve talep ederim.'}
				{request === 'VEHICLE_SALE_ADVANCE' &&
					'Dosya borçlusuna ait aracın satışının yapılmasını, satış unsurlarının eksik olması halinde satış avansının depo edilmesini aracın satışa hazırlanmasını arz ve talep ederim.'}
				{request === 'VEHICLE_103' &&
					'Dosya Borçlusunun, aracına   işlenen hacze  ilişkin diyeceklerini  bildirmesi için  103  davetiyesi  tebliğine  karar  verilmesini müvekkilim adına talep ederim, dedi'}
				{request === 'VEHICLE_100' &&
					'Dosya borçlusuna ait ARACININ, 100. Madde gereğince dosya diğer alacaklıların alacaklarının devam edip etmediğinin devam ediyorsa son borcun bildirilmesi için taraflara 100. Madde malumatınca tebligat çıkartılmasını arz ve talep ederim dedi.'}
				{request === 'VEHICLE_APPRAISAL' &&
					'Dosyasından borçlunun TARAFIMIZCA HACİZLİ ARACININ kıymet takdirinin yapılası için ilgili icra Müd. Talimat yazılmasını talep ederim dedi.'}
				{request === 'VEHICLE_SALE_REQUEST' &&
					'Dosyasından borçlunun TARAFIMIZCA HACİZLİ ARACININ bütün unsurları toplanmış gerekli tebligatlar yapılmış olup gayrimenkulün satılmasını arz ve talep ederiz dedi.'}
				{request === 'IMMOVABLE_QUERY' &&
					'Dosya borçlularına ait gayrimenkullerin UYAP üzerinden araştırılarak var ise ilgili tapu sicil müdürlüğüne müzekkere yazılması için tarafımıza gayrimenkul bilgilerinin verilmesini arz ederim.'}
				{request === 'IMMOVABLE_INPOUNDMENT' &&
					'Dosya borçlularına ait gayrimenkullerin UYAP üzerinden araştırılmış borçlunun üzerine gayrimenkul bulunmuştur. İş bu noktada ilgili tapu sicil müdürlüğüne müzekkere yazılarak gayrimenkule haciz konulmasını arz ve talep ederim.'}
				{request === 'IMMOVABLE_SALE_ADVANCE' &&
					'Dosya borçlusuna ait gayrimenkulün satışının yapılmasını, satış unsurlarının eksik olması halinde satış avansının depo edilmesini aracın satışa hazırlanmasını arz ve talep ederim.'}
				{request === 'IMMOVABLE_103' &&
					'Dosya borçlusuna ait gayrimenkullerin,  aşağıda  tarihi  yazılı  gayrimenkul hacze  ilişkin diyeceklerini  bildirmesi için  103  davetiyesi  tebliğine  karar  verilmesini müvekkilim adına talep ederim, dedi.'}
				{request === printer.IMMOVABLE_100.value &&
					'Dosya borçlusuna ait GAYRİMENKULÜNÜN, 100. Madde gereğince dosya diğer alacaklıların alacaklarının devam edip etmediğinin devam ediyorsa son borcun bildirilmesi için taraflara 100. Madde malumatınca tebligat çıkartılmasını arz ve talep ederim dedi.'}
				{request === printer.IMMOVABLE_ZONE.value &&
					'Borçlunun gayrimenkullerinin imar durumunu sorulması için ilgili imar işleri müdürlüğüne müzekkere yazılmasını talep ederim dedi.'}
				{request === printer.IMMOVABLE_CADASTRE.value &&
					'Borçluların gayrimenkullerinin çap durumunun sorulması için ilgili kadastro müdürlüğüne müzekkere yazılmasını talep ederim dedi.'}
				{request === 'IMMOVABLE_APPRAISAL' &&
					'Dosyasından borçlunun TARAFIMIZCA HACİZLİ GAYRİMENKULÜNÜN kıymet takdirinin yapılası için ilgili icra Müd. Talimat yazılmasını talep ederim dedi. '}
				{request === 'IMMOVABLE_SALE_REQUEST' &&
					'Dosyasından borçlunun TARAFIMIZCA HACİZLİ GAYRİMENKULÜNÜN bütün unsurları toplanmış gerekli tebligatlar yapılmış olup gayrimenkulün satılmasını arz ve talep ederiz dedi. '}
				{request === 'GARNISHMENT' &&
					'Borçlularının maaşlarına haciz konulması için müzekkere yazılmasını talep ederim dedi.'}
				{request === printer.CUSTOMS.value &&
					'Ticari unvanı yazılı dosyamız borçlusunun vergi sicil numarasına göre GÜMRÜK MÜDÜRLÜĞÜNDE HERHANGİ BİR hak ve alacaklarının haczi için GÜMRÜK MÜDÜRLÜĞÜNE 89/1 ve haciz müzekkeresi yazılmasını talep ederim dedi.'}
				{request === printer.MOVABLE_103.value &&
					`Dosya borçlusuna ait MENKULLERİN, 100. Madde gereğince dosya diğer alacaklıların alacaklarının devam edip etmediğinin devam ediyorsa son borcun bildirilmesi için taraflara 100. Madde malumatınca tebligat çıkartılmasını arz ve talep ederim dedi.`}
				{request === printer.MOVABLE_100.value &&
					`Dosya borçlusuna ait MENKULLERİN, 100. Madde gereğince dosya diğer alacaklıların alacaklarının devam edip etmediğinin devam ediyorsa son borcun bildirilmesi için taraflara 100. Madde malumatınca tebligat çıkartılmasını arz ve talep ederim dedi.`}
				{request === printer.MOVABLE_APPRAISAL.value &&
					`Dosyasından borçlunun TARAFIMIZCA HACİZLİ MENKULÜNÜN kıymet takdirinin yapılması için ilgili icra Müd. Talimat yazılmasını talep ederim dedi.`}
				{request === printer.TAX_OFFICE.value &&
					`Ticari unvanı yazılı dosyamız borçlusunun vergi sicil numarasına göre hak ve alacaklarının haczi için VERGİ DAİRESİ MÜDÜRLÜĞÜNE 89/1 ve haciz müzekkeresi yazılmasını talep ederim dedi.`}
				{request === printer.CREDITOR_CASE.value &&
					`İş bu dosyamızın borçlusunun icra müdürlüklerindeki alacaklı olduğu icra dosyalarının tespit edilerek dosyalara haciz işleminin gerçekleştirilmesini ve ayrıca ilgili icra müdürlüğüne 3. şahıs borçlu veya borçlulara haczin bildirilmesi hususuna dair müzekkere yazılmasını arz ve talep ederim.`}
				{request === printer.MOVABLE_SALE_REQUEST.value &&
					`Dosyasından borçlunun TARAFIMIZCA HACİZLİ MENKULLERİNİN bütün unsurları toplanmış gerekli tebligatlar yapılmış olup menkulün satılmasını arz ve talep ederiz dedi.`}
				{request === printer.MOVABLE_SALE_ADVANCE.value &&
					`Dosya borçlusuna ait menkullerin satışının yapılmasını, satış unsurlarının eksik olması halinde satış avansının depo edilmesini aracın satışa hazırlanmasını arz ve talep ederim.`}
				<br />
				<div className="mt-2">
					{paperDebtors.map(debtor => {
						return (
							<p key={'requestPaper' + debtor._id}>
								{getDebtorName(debtor)}{' '}
								{debtor.identityNumber ? 'T.C Kimlik No: ' : 'Vergi No: '}{' '}
								{debtor.identityNumber || debtor.taxNumber}
							</p>
						)
					})}
				</div>
				<div className="column al-end jst-center mt-4 mr-4 ta-center">
					<p className="bold">Alacaklı Vekili</p>
					{lawyers.map(lawyer => {
						return (
							<p key={'requestPaper' + lawyer._id}>
								{lawyer.name} {lawyer.surname}
							</p>
						)
					})}
				</div>
				<div className="column al-end jst-center mt-10 mr-4 ta-center">
					<p className="bold">
						{executionOffice.city} {executionOffice.name} Müdür Yardımcısı
					</p>
				</div>
			</page>
		)
	}
}
