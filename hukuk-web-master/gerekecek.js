// {task.type === TASK_TYPE.QUERY_RESPONSE_REQUIRED && (
//   <Link href={getTaskTargetUrl(task)}>
//     <a className="btn btn-blue w-100 fw-500 mb-2 ta-center fs-sm">
//       Sorgu Cevabını Gir
//     </a>
//   </Link>
// )}
// {task.type === TASK_TYPE.QUERY_RESPONSE_ENTRY_REQUIRED && (
//   <Link href={getTaskTargetUrl(task)}>
//     <a className="btn btn-blue w-100 fw-500 mb-2 ta-center fs-sm">
//       Sorguda Çıkan Kayıtları Gir
//     </a>
//   </Link>
// )}
// {task.type === TASK_TYPE.SEIZE_DE_FACTO_REQUIRED && (
//   <Link href={getTaskTargetUrl(task)}>
//     <a className="btn btn-blue w-100 fw-500 mb-2 ta-center fs-sm">
//       Haciz Tarihini Gir
//     </a>
//   </Link>
// )}
// {task.type ===
//   TASK_TYPE.CUSTOMS_SEIZE_DE_FACTO_REQUIRED && (
//   <Link href={getTaskTargetUrl(task)}>
//     <a className="btn btn-blue w-100 fw-500 mb-2 ta-center fs-sm">
//       Haciz Günü Bilgilerini Gir
//     </a>
//   </Link>
// )}
// {task.type === TASK_TYPE.IS_SEIZED && (
//   <Link href={getTaskTargetUrl(task)}>
//     <a className="btn btn-blue w-100 fw-500 mb-2 ta-center fs-sm">
//       Haciz Durumunu Belirt
//     </a>
//   </Link>
// )}
// {task.type === TASK_TYPE.NOT_DISTRAINABLE_OBJECTION && (
//   <Link href={getTaskTargetUrl(task)}>
//     <a className="btn btn-blue w-100 fw-500 mb-2 ta-center fs-sm">
//       Haczedilmezlik İtirazının Olup Olmadğını Belirt
//     </a>
//   </Link>
// )}
// {task.type === TASK_TYPE.ZONING_STATUS_ANSWER && (
//   <Link href={getTaskTargetUrl(task)}>
//     <a className="btn btn-blue w-100 fw-500 mb-2 ta-center fs-sm">
//       İmar Durumunu Kontrol Et
//     </a>
//   </Link>
// )}
// {task.type === TASK_TYPE.CADASTRE_ANSWER && (
//   <Link href={getTaskTargetUrl(task)}>
//     <a className="btn btn-blue w-100 fw-500 mb-2 ta-center fs-sm">
//       Tapu Kadastro Cevabını Kontrol Et
//     </a>
//   </Link>
// )}
// {task.type === TASK_TYPE.RESTRICTIONS_EXIST && (
//   <Link href={getTaskTargetUrl(task)}>
//     <a className="btn btn-blue w-100 fw-500 mb-2 ta-center fs-sm">
//       Takyidat Olup Olmadığını Belirt
//     </a>
//   </Link>
// )}
// {task.type === TASK_TYPE.RESTRICTIONS_REQUIRED && (
//   <Link href={getTaskTargetUrl(task)}>
//     <a className="btn btn-blue w-100 fw-500 mb-2 ta-center fs-sm">
//       Takyidatları Gir
//     </a>
//   </Link>
// )}
// {task.type === TASK_TYPE.REASON_FOR_NEGATIVE_REQUIRED && (
//   <Link href={getTaskTargetUrl(task)}>
//     <a className="btn btn-green w-100 fw-500 mb-2 ta-center fs-sm">
//       Olumsuz Haciz Sebebini Gir
//     </a>
//   </Link>
// )}
// {task.type ===
//   TASK_TYPE.INPOUNDMENT_NOTIFICATION_REQUIRED && (
//   <Link href={getTaskTargetUrl(task)}>
//     <a className="btn btn-green w-100 fw-500 mb-2 ta-center fs-sm">
//       103. Madde Tebligatı Hazırla
//     </a>
//   </Link>
// )}
// {task.type === TASK_TYPE.SALE_ADVANCE_REQUIRED && (
//   <Link href={getTaskTargetUrl(task)}>
//     <a className="btn btn-blue w-100 fw-500 mb-2 ta-center fs-sm">
//       Yatırıldı Olarak İşaretle
//     </a>
//   </Link>
// )}
// {task.type === TASK_TYPE.WARRANT_REQUIRED && (
//   <React.Fragment>
//     <Link href={getTaskTargetUrl(task)}>
//       <a className="btn btn-blue w-100 fw-500 mb-2 ta-center fs-sm">
//         Yakalama Talebi Oluştur
//       </a>
//     </Link>
//     <Link href={getTaskTargetUrl(task)}>
//       <a className="btn btn-green w-100 fw-500 mb-2 ta-center fs-sm">
//         Yakalandı Olarak İşaretle
//       </a>
//     </Link>
//   </React.Fragment>
// )}
// {task.type === TASK_TYPE.CUSTODIAN_INFO_REQUIRED && (
//   <React.Fragment>
//     {/* <Link
//       href={getTaskTargetUrl(task)}
//     >
//       <a className="btn btn-blue w-100 fw-500 mb-2 ta-center fs-sm">
//         Yeddiemin bilgilerini sorgula
//       </a>
//     </Link> */}
//     <Link href={getTaskTargetUrl(task)}>
//       <a className="btn btn-green w-100 fw-500 mb-2 ta-center fs-sm">
//         Yeddiemin bilgilerini gir
//       </a>
//     </Link>
//   </React.Fragment>
// )}
// {task.type === TASK_TYPE.APPRAISAL_RESULT_REQUIRED && (
//   <React.Fragment>
//     <Link href={getTaskTargetUrl(task)}>
//       <a className="btn btn-blue w-100 fw-500 mb-2 ta-center fs-sm">
//         Kıymet Takdiri Talep Et
//       </a>
//     </Link>
//     <Link href={getTaskTargetUrl(task)}>
//       <a className="btn btn-green w-100 fw-500 mb-2 ta-center fs-sm">
//         Kıymet Takdiri Sonucunu Gir
//       </a>
//     </Link>
//   </React.Fragment>
// )}
// {task.type ===
//   TASK_TYPE.LAST_INPOUNDMENT_STATUS_REQUIRED && (
//   <React.Fragment>
//     <Link href={getTaskTargetUrl(task)}>
//       <a className="btn btn-blue w-100 fw-500 mb-2 ta-center fs-sm">
//         100. Maddeye Yarar Bilgileri Talep Et
//       </a>
//     </Link>
//     <Link href={getTaskTargetUrl(task)}>
//       <a className="btn btn-green w-100 fw-500 mb-2 ta-center fs-sm">
//         Cevap Geldi Olarak İşaretle
//       </a>
//     </Link>
//   </React.Fragment>
// )}
// {task.type === TASK_TYPE.RESTRICTIONS_UPDATE_REQUIRED && (
//   <Link href={getTaskTargetUrl(task)}>
//     <a className="btn btn-green w-100 fw-500 mb-2 ta-center fs-sm">
//       Takyidatları Güncelle
//     </a>
//   </Link>
// )}
// {task.type ===
//   TASK_TYPE.APPRAISAL_NOTIFICATION_REQUIRED && (
//   <Link href={getTaskTargetUrl(task)}>
//     <a className="btn btn-green w-100 fw-500 mb-2 ta-center fs-sm">
//       Tebligat Hazırla
//     </a>
//   </Link>
// )}
// {task.type === TASK_TYPE.SSI_INPOUNDMENT_CREATE && (
//   <Link href={getTaskTargetUrl(task)}>
//     <a className="btn btn-green w-100 fw-500 mb-2 ta-center fs-sm">
//       Maaş Haczi Hazırla
//     </a>
//   </Link>
// )}
// {task.type === TASK_TYPE.INPOUNDMENT_RESPONSE && (
//   <Link href={getTaskTargetUrl(task)}>
//     <a className="btn btn-green w-100 fw-500 mb-2 ta-center fs-sm">
//       {getAssetName(task.assetType)} Cevabını Gir
//     </a>
//   </Link>
// )}
// {task.type === TASK_TYPE.SSI_INPOUNDMENT_SALARY_INFO && (
//   <Link href={getTaskTargetUrl(task)}>
//     <a className="btn btn-green w-100 fw-500 mb-2 ta-center fs-sm">
//       Maaş Haczi Detaylarını Gir
//     </a>
//   </Link>
// )}
// {task.type === TASK_TYPE.MONEY_REQUEST_RESPONSE && (
//   <Link href={getTaskTargetUrl(task)}>
//     <a className="btn btn-green w-100 fw-500 mb-2 ta-center fs-sm">
//       Alacağı Dosyaya Talep Et ve Sonucunu Gir
//     </a>
//   </Link>
// )}
// {task.type === TASK_TYPE.CREATE_COLLECTION && (
//   <Link href={getTaskTargetUrl(task)}>
//     <a className="btn btn-green w-100 fw-500 mb-2 ta-center fs-sm">
//       Tahsilat Ekle
//     </a>
//   </Link>
// )}
// {task.type === TASK_TYPE.SHARE_COMPANY && (
//   <Link href={getTaskTargetUrl(task)}>
//     <a className="btn btn-green w-100 fw-500 mb-2 ta-center fs-sm">
//       Şirket Bilgilerini Gir
//     </a>
//   </Link>
// )}
// {task.type ===
//   TASK_TYPE.CHAMBER_OF_COMMERCE_NOTIFICATION && (
//   <Link href={getTaskTargetUrl(task)}>
//     <a className="btn btn-green w-100 fw-500 mb-2 ta-center fs-sm">
//       Ticaret Odasına Tebligat Hazırla
//     </a>
//   </Link>
// )}
// {task.type === TASK_TYPE.CREDITOR_CASE_INCOME_CHECK && (
//   <Link href={getTaskTargetUrl(task)}>
//     <a className="btn btn-green w-100 fw-500 mb-2 ta-center fs-sm">
//       Ödeme Durumunu Belirt
//     </a>
//   </Link>
// )}
// {task.type === TASK_TYPE.MAKE_THIRD_PERSON_DEBTOR && (
//   <Link href={getTaskTargetUrl(task)}>
//     <a className="btn btn-green w-100 fw-500 mb-2 ta-center fs-sm">
//       3. Şahsı Borçlu Olarak Ekle
//     </a>
//   </Link>
// )}
// {task.type === TASK_TYPE.IS_ASSET_RECEIVED && (
//   <Link href={getTaskTargetUrl(task)}>
//     <a className="btn btn-green w-100 fw-500 mb-2 ta-center fs-sm">
//       Mal Haczinin Yapılıp Yapılmadığını Gir
//     </a>
//   </Link>
// )}
// {task.type === TASK_TYPE.RECEIVED_ASSETS && (
//   <Link
//     href={`/takip/${task.currentCase[0].number}/haciz?debtorId=${debtor._id}&assetType=${task.assetType}&assetId=${task.assetId}`}
//   >
//     <a className="btn btn-green w-100 fw-500 mb-2 ta-center fs-sm">
//       Haczedilen Malları Gir
//     </a>
//   </Link>
// )}
// {task.type ===
//   TASK_TYPE.RECEIVED_ASSETS_RESTRICTIONS_EXIST && (
//   <Link href={getTaskTargetUrl(task)}>
//     <a className="btn btn-green w-100 fw-500 mb-2 ta-center fs-sm">
//       Takyidat Olup Olmadığını Gir
//     </a>
//   </Link>
// )}
// {task.type ===
//   TASK_TYPE.RECEIVED_ASSETS_RESTRICTIONS_CREATED && (
//   <Link href={getTaskTargetUrl(task)}>
//     <a className="btn btn-green w-100 fw-500 mb-2 ta-center fs-sm">
//       Haczedilen Malların Takyidatlarını Gir
//     </a>
//   </Link>
// )}
// {task.type === TASK_TYPE.BANK_RESPOND && (
//   <Link href={getTaskTargetUrl(task)}>
//     <a className="btn btn-green w-100 fw-500 mb-2 ta-center fs-sm">
//       Bankanın Cevap Durumunu Belirt
//     </a>
//   </Link>
// )}
// {task.type === TASK_TYPE.BANK_ACCOUNT_EXIST && (
//   <Link href={getTaskTargetUrl(task)}>
//     <a className="btn btn-green w-100 fw-500 mb-2 ta-center fs-sm">
//       Banka Hesabının Olup Olmadığını Belirt
//     </a>
//   </Link>
// )}
// {task.type === TASK_TYPE.BANK_ACCOUNT_BALANCE && (
//   <Link href={getTaskTargetUrl(task)}>
//     <a className="btn btn-green w-100 fw-500 mb-2 ta-center fs-sm">
//       Hesap Bakiyesini Belirt
//     </a>
//   </Link>
// )}
// {task.type === TASK_TYPE.BANK_MONEY_RESPONSE && (
//   <Link href={getTaskTargetUrl(task)}>
//     <a className="btn btn-green w-100 fw-500 mb-2 ta-center fs-sm">
//       Tahsilat Durumunu Belirt
//     </a>
//   </Link>
// )}
// <DeFactoTasker task={task} debtor={debtor} />
// <SaleTasker task={task} debtor={debtor} />
// <BeforeInpoundmentTasker task={task} debtor={debtor} />
