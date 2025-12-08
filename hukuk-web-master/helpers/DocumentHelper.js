export const getOrderOfPaymentHeader = type => {
	switch (type) {
		case '2':
			return 'TAŞINIR TESLİMİNE VEYA TAŞINMAZ TAHLİYE VEYA TESLİMİNE İLİŞKİN İCRA EMRİ'
		case '3':
			return 'ÇOCUK TESLİMİ VEYA ÇOCUKLA KİŞİSEL İLİŞKİ KURULMASINA İLİŞKİN İCRA EMRİ'
		case '4':
			return 'PARA BORCUNA VEYA TEMİNAT VERİLMESİNE VEYA BİR İŞİN YAPILMASINA VEYA YAPILMAMASINA, İRTİFAK HAKKININ VEYA GEMİ ÜZERİNDEKİ İNTİFA HAKKININ KALDIRILMASINA İLİŞKİN İLÂMLARIN YERİNE GETİRİLMESİNDE İCRA EMRİ'
		case '6':
			return 'İPOTEĞİN PARAYA ÇEVRİLMESİ YOLU İLE TAKİPTE İCRA EMRİ'
		case '7':
			return 'İLÂMSIZ TAKİPTE ÖDEME EMRİ'
		case '8':
			return 'TAŞINIR REHNİNİN PARAYA ÇEVRİLMESİ YOLU İLE TAKİPTE ÖDEME EMRİ'
		case '9':
			return 'İPOTEĞİN PARAYA ÇEVRİLMESİ YOLU İLE TAKİPTE ÖDEME EMRİ'
		case '10':
			return 'KAMBİYO SENETLERİNE (ÇEK, POLİÇE VE EMRE MUHARRER SENET) ÖZGÜ HACİZ YOLU İLE YAPILACAK TAKİPTE ÖDEME EMRİ'
		case '11':
			return 'İFLÂS YOLU İLE ADÎ TAKİPTE ÖDEME EMRİ'
		case '12':
			return 'KAMBİYO SENETLERİNE (ÇEK, POLİÇE VE EMRE MUHARRER SENET) ÖZGÜ İFLÂS YOLU İLE TAKİPTE ÖDEME EMRİ'
		case '13':
			return 'ADÎ KİRAYA VE HASILAT KİRALARINA AİT TAKİPTE ÖDEME EMRİ'
		case '14':
			return 'YAZILI SÖZLEŞME İLE KİRALANAN TAŞINMAZIN KİRA SÜRESİNİN BİTMESİ DURUMUNDA TAHLİYE EMRİ'
	}
}

export const getOrderOfPaymentFooter = type => {
	switch (type) {
		case '2':
			return 'Yukarıda yazılı işbu icra emrinin tebliği tarihinden itibaren (7) gün içinde (tahliye) ve teslim etmeniz; bu müddet içinde (tahliye) ve teslim etmezseniz icra mahkemesinden veya yargılamanın yenilenmesi yolu ile ait olduğu mahkemeden yahut Yargıtay’dan icranın geri bırakılmasına dair bir karar getirmezseniz İcra İflas Kanununun    24 ve 26 ncı maddeleri gereğince ilâm hükmünün zorla icra olunacağı, (teslimi emredilen mal yedinizde bulunmazsa, ilâmda yazılı değerinin, taşınır malın değeri ilâmda yazılı olmadığı halde veya ihtilaf halinde, icra müdürü tarafından haczin yapıldığı tarihteki rayice göre takdir olunan değerinin alınacağı, bu değer de ödenmediği takdirde ayrıca icra emri tebliğine gerek kalmaksızın haciz yolu ile icra olunacağı) ihtar olunur. '
		case '3':
			return 'Teslimi hükmolunan çocuğu işbu icra emrinin tebliği tarihinden itibaren (7) gün içinde teslim etmeniz; küçüğün ilâm hükümleri dairesinde lehine hüküm verilen ile kişisel ilişki kurmasına engel olmamanız; aksi halde çocuk nerede bulunursa bulunsun İcra ve İflâs Kanununun 25/25-a maddesi gereğince ilâm hükmünün zorla icra olunacağı; ilâmın icrası sırasında çocuk gizlenir veya kişisel ilişki kurulmasına engel olunursa aynı Kanunun 341 inci maddesindeki cezanın uygulanacağı ihtar olunur.'
		case '4':
			return 'PARA BORCUNA VEYA TEMİNAT VERİLMESİNE VEYA BİR İŞİN YAPILMASINA VEYA YAPILMAMASINA, İRTİFAK HAKKININ VEYA GEMİ ÜZERİNDEKİ İNTİFA HAKKININ KALDIRILMASINA İLİŞKİN İLÂMLARIN YERİNE GETİRİLMESİNDE İCRA EMRİ'
		case '6':
			return 'İşbu icra emrinin tebliği tarihinden itibaren (30) gün içinde borcu ödemeniz; bu süre içinde borç ödenmez veya icra mahkemesinden icranın geri bırakılmasına dair bir karar getirilmezse alacaklının taşınmazın satışını isteyebileceği ihtar olunur. '
		case '7':
			return 'İşbu ödeme emrinin tebliği tarihinden itibaren borcu ve takip giderlerini (7) gün içinde ödemeniz (teminatı vermeniz); borcun tamamına veya bir kısmına veya alacaklının takibat icrası hakkına dair bir itirazınız varsa, senet altındaki imza size ait değilse yine bu (7) gün içinde ayrıca ve açıkça bildirmeniz; aksi halde icra takibinde bu senedin sizden sadır olmuş sayılacağı; imzayı reddettiğiniz takdirde icra mahkemesi önünde yapılacak duruşmada hazır bulunmanız; buna uymazsanız itirazınızın geçici olarak kaldırılacağı; senet veya borca itirazınızı yazılı veya sözlü olarak icra dairesine yedi gün içinde bildirmediğiniz takdirde aynı müddet içinde 74 üncü madde gereğince mal beyanında bulunmanız, aksi halde hapisle tazyik olunacağınız, hiç mal beyanında bulunmaz veya gerçeğe aykırı beyanda bulunursanız hapisle cezalandırılacağınız; dava ve takip işlemlerine esas olmak üzere kendinize ait bir adresi itirazla birlikte bildirmek zorunda olduğunuz; adresinizi değiştirdiğiniz halde yurt içinde yeni bir adres bildirmediğiniz ve yeni adresinizin de tespit edilemediği durumda, takip talebinde gösterilen adrese çıkarılacak tebligatın size yapılmış sayılacağı; borç ödenmez veya itiraz edilmezse cebrî icraya devam edileceği ihtar olunur. '
		case '8':
			return 'İşbu ödeme emrinin tebliği tarihinden itibaren (15) gün içinde borcu ödemeniz; rehin hakkına karşı bir itirazınız varsa tebliğ tarihinden itibaren (7) gün içinde dilekçe ile veya sözlü olarak icra dairesine bildirmeniz; borcun bir kısmına itirazınız varsa o kısmın cihet ve miktarını açıkça göstermediğiniz takdirde itiraz etmemiş sayılacağınız; senet altındaki imzayı inkâr ediyorsanız ayrıca ve açıkça bildirmeniz; aksi halde senetteki imzayı kabul etmiş sayılacağınız; bu süre içinde rehin hakkında açıkça itiraz etmediğiniz takdirde alacaklının rehin hakkını takip safhası içinde artık tartışma konusu olamayacağı; sırf rehin hakkına itiraz edildiği takdirde alacaklının bu takip yolundan vazgeçerek takibinin haciz yolu ile devamını ve 74 üncü madde gereğince mal beyanında bulunmanızı isteyebileceği, bu süreler içinde itiraz edilmez ve borç ödenmezse rehnin satılacağı ihtar olunur. '
		case '9':
			return 'İşbu icra emrinin tebliği tarihinden itibaren (30) gün içinde borcu ödemeniz; borca karşı bir itirazınız varsa tebliğ tarihinden itibaren (7) gün içinde yazılı veya sözlü olarak (ipotek hakkına itiraz edilemez mad. 150) icra dairesine bildirmeniz; borcun bir kısmına itirazınız varsa o kısmın cihet ve miktarını açıkça göstermediğiniz takdirde itiraz etmemiş sayılacağınız; senet altındaki imzayı inkâr ediyorsanız ayrıca ve açıkça bildirmeniz, aksi takdirde senetteki imzayı kabul etmiş sayılacağınız; süresi içinde itiraz edilmez ve borç ödenmezse alacaklının taşınmazın satışını isteyebileceği ihtar olunur. '
		case '10':
			return 'Yukarıda yazılı borç ve giderleri işbu ödeme emrinin tebliği tarihinden itibaren        (10) gün içinde ödemeniz; takibin dayanağı senet kambiyo senedi niteliğini haiz değilse (5) gün içinde icra mahkemesine şikâyet etmeniz; takip dayanağı senet altındaki imza size ait değilse yine bu (5) gün içinde ayrıca ve açıkça bir dilekçe ile icra mahkemesine bildirmeniz; aksi takdirde kambiyo senedindeki imzanın sizden sadır sayılacağı; imzanızı haksız yere inkar ederseniz takip konusu alacağın yüzde onu oranında para cezasına mahkûm edileceğiniz; borçlu olmadığınız veya borcun itfa veya imhal edildiği veya alacağın zamanaşımına uğradığı veya yetki hakkında itirazınız varsa bunu sebepleriyle birlikte (5) gün içinde icra mahkemesine bir dilekçe ile bildirerek icra mahkemesinde itirazın kabulüne dair bir karar getirmediğiniz takdirde cebri icraya devam olunacağı; itiraz edilmediği ve borç ödenmediği takdirde (10) gün içinde 74 üncü maddeye, itiraz edilip de reddedildiği takdirde ise (3) gün içinde 75 inci maddeye göre mal beyanında bulunmanız; bulunmazsanız hapisle tazyik olunacağınız, mal beyanında bulunmaz veya gerçeğe aykırı beyanda bulunursanız ayrıca hapisle cezalandırılacağınız ihtar olunur.'
		case '11':
			return 'İşbu ödeme emrinin tebliği tarihinden itibaren borcu ve takip giderlerini (7) gün içinde ödemeniz, bu süre içinde borcunuz olmadığına veya iflâsa tâbi şahıslardan bulunmadığınıza dair bir itirazınız varsa dilekçe ile icra dairesine bildirmeniz ve konkordato teklif edebileceğiniz; aynı süre içinde borç ödenmediği takdirde alacaklının ticaret mahkemesinden iflâs kararı isteyebileceği ihtar olunur.'
		case '12':
			return 'İşbu ödeme emrinin tebliği tarihinden itibaren borcu ve takip giderlerini (5) gün içinde ödemeniz; kambiyo senedi ve borca ait her türlü itiraz ve şikâyetlerinizi yine bu (5) gün içinde sebepleriyle birlikte ve diğer tarafa tebliğ edilecek nüshadan bir fazla dilekçe ile icra dairesine bildirmeniz; (5) gün içinde borç ödenmediği; veya itiraz ve şikâyet edilmediği takdirde, alacaklının ticaret mahkemesinden iflâsınızı isteyebileceği; itiraz ve şikâyet edildiği takdirde alacaklının ticaret mahkemesinden itiraz ve şikâyetin kaldırılması ve iflâsınıza karar verilmesini isteyebileceği ihtar olunur.'
		case '13':
			return 'Yukarıda yazılı borcu işbu ödeme emrinin tebliği tarihinden itibaren ...30.. gün içinde ödemeniz; borcun bir kısmına veya tamamına veya alacaklının takibine karşı bir itirazınız varsa, yine bu ödeme emrinin tebliği tarihinden itibaren ..7.. gün içinde açıkça ve sebepleri ile birlikte İcra ve İflâs Kanununun 62 nci maddesi hükmü gereğince dilekçe ile veya sözlü olarak icra dairesine bildirmeniz; kira akdini ve sözleşmedeki imzanızı kesin ve açık olarak reddetmediğiniz takdirde, akdi kabul etmiş sayılacağınız; yukarıdaki süreler içinde borcu ödemeniz veya itiraz etmezseniz, alacaklının icra mahkemesinden tahliyenizi isteyebileceği ve kesinleşen kira alacağından dolayı da haciz talep edilebileceği ihtar olunur.*'
		case '14':
			return 'Üç numaralı bentte yazılı kira süresi bitmiş olan taşınmaz işbu tahliye emrinin tebliği tarihinden itibaren (15) gün içinde tahliye ve teslim etmeniz; kiranın yenilendiğine veya uzatıldığına dair bir itirazınız varsa (7) gün içinde dilekçe ile veya sözlü olarak icra dairesine bildirmeniz; müddeti içinde itiraz etmez veya kendiliğinizden tahliye etmezseniz icraen çıkarılacağınız; itirazınız kaldırılırsa İcra ve İflâs Kanununun 273 üncü maddesi gereğince zorla tahliye olunacağınız ihtar olunur.'
	}
}

export const getOrderOfPaymentIIK = type => {
	switch (type) {
		case '2':
			return 'm.24, 26'
		case '3':
			return 'm.25, 25a'
		case '4':
			return 'm.30, 31, 32'
		case '6':
			return 'm.149'
		case '7':
			return 'm.60'
		case '8':
			return 'm.146, 147'
		case '9':
			return 'm.149/b'
		case '10':
			return 'm.168'
		case '11':
			return 'm.155'
		case '12':
			return 'm.171'
		case '13':
			return 'm.269'
		case '14':
			return 'm. 272, 273'
	}
}
