import React, { useState } from 'react'
import {
	AVALIABLE_FOR_SALE_QUERIES,
	BANK_LIST,
	QUERY_LIST,
	TASK_TYPE,
} from '../../constants'
import Button from '../anBrains/Button'
import {
	FaCheckCircle,
	FaRegCircle,
	FaCheck,
	FaUniversity,
	FaFolderOpen,
	FaClock,
	FaTasks,
	FaSave,
} from 'react-icons/fa'
import Input from '../anBrains/Input'
import { getTaskTextByType } from '../../helpers/taskHelper'
import TrueFalse from '../TrueFalse'

export default function InpoundmentSettings({ lawOffice, setLawOffice, save }) {
	const [visibleSetting, setVisibleSetting] = useState(null)

	const handleVisibleSetting = setting => {
		setVisibleSetting(visibleSetting === setting ? null : setting)
	}

	const handleQueryList = query => {
		const index = lawOffice.queryList.findIndex(b => b === query)
		if (index === -1) {
			lawOffice.queryList.push(query)
		} else {
			lawOffice.queryList.splice(index, 1)
		}
		setLawOffice({ ...lawOffice })
	}

	const selectAllQueries = () => {
		lawOffice.queryList = [
			...Object.keys(QUERY_LIST).map(key => QUERY_LIST[key].value),
		]
		setLawOffice({ ...lawOffice })
	}

	const removeAllQueries = () => {
		setLawOffice({ ...lawOffice, queryList: [] })
	}

	const handleBankList = bank => {
		const index = lawOffice.bulkQueryBankList.findIndex(b => b === bank)
		if (index === -1) {
			lawOffice.bulkQueryBankList.push(bank)
		} else {
			lawOffice.bulkQueryBankList.splice(index, 1)
		}
		setLawOffice({ ...lawOffice })
	}

	const selectAllBanks = () => {
		lawOffice.bulkQueryBankList = [...BANK_LIST]
		setLawOffice({ ...lawOffice })
	}

	const removeAllBanks = () => {
		lawOffice.bulkQueryBankList = []
		setLawOffice({ ...lawOffice })
	}

	const changeQueryReminderDays = (queryType, days) => {
		lawOffice.queryReminderDays[queryType] = days
		setLawOffice({ ...lawOffice })
	}

	const changeTaskTransitioDays = (taskType, days) => {
		lawOffice.taskTransitionDays[taskType].days = days
		setLawOffice({ ...lawOffice })
	}

	const changeDeFactoIntelRequired = required => {
		lawOffice.deFactoIntelRequired = required
		setLawOffice({ ...lawOffice })
	}

	const changeRestrictionThreshold = threshold => {
		lawOffice.restrictionThreshold = threshold
		setLawOffice({ ...lawOffice })
	}

	const changeBankAccountBalanceThreshold = threshold => {
		lawOffice.bankAccountBalanceThreshold = threshold
		setLawOffice({ ...lawOffice })
	}

	const handleSaleNewspaperMandatoryAssetTypes = type => {
		const index = lawOffice.saleNewspaperMandatoryAssetTypes.findIndex(
			assetType => assetType === type,
		)
		if (index === -1) {
			lawOffice.saleNewspaperMandatoryAssetTypes.push(type)
		} else {
			lawOffice.saleNewspaperMandatoryAssetTypes.splice(index, 1)
		}
		setLawOffice({ ...lawOffice })
	}

	const selectAllAssetTypes = () => {
		lawOffice.saleNewspaperMandatoryAssetTypes = [
			...AVALIABLE_FOR_SALE_QUERIES.map(q => q.value),
		]
		setLawOffice({ ...lawOffice })
	}

	const removeAllAssetTypes = () => {
		lawOffice.saleNewspaperMandatoryAssetTypes = []
		setLawOffice({ ...lawOffice })
	}

	return (
		<div>
			<Button
				onClick={() => handleVisibleSetting(0)}
				classes="setting-item__button"
			>
				<FaFolderOpen className="mr-4 fs-md" />
				<div className="ta-left">
					<p className="fw-500 mb-1">Toplu Haciz Sorgu Listesi</p>
					<p className="fs-sm">
						Seçili olan sorgular, Haciz işlemlerinde otomatik olarak seçili
						gelecektir.
					</p>
				</div>
			</Button>
			{visibleSetting === 0 && (
				<div className="setting-item__content">
					<div className="flex al-center jst-between my-4">
						<Button classes="fw-500 blue" onClick={selectAllQueries}>
							Tümünü Seç
						</Button>
						<Button classes="fw-500 red" onClick={removeAllQueries}>
							Tümünü Bırak
						</Button>
					</div>
					<div className="step-item-divider"></div>
					{Object.keys(QUERY_LIST).map(key => {
						return (
							<Button
								classes="mb-2"
								onClick={() => handleQueryList(QUERY_LIST[key].value)}
							>
								{lawOffice.queryList.includes(QUERY_LIST[key].value) ? (
									<FaCheckCircle className="green" />
								) : (
									<FaRegCircle />
								)}
								<p className="ml-2">{QUERY_LIST[key].text}</p>
							</Button>
						)
					})}
					<Button theme="blue" classes="fw-500 mt-8" onClick={save}>
						<FaCheck className="mr-2" />
						Kaydet
					</Button>
				</div>
			)}
			<Button
				onClick={() => handleVisibleSetting(1)}
				classes="setting-item__button"
			>
				<FaUniversity className="mr-4 fs-md" />
				<div className="ta-left">
					<p className="fw-500 mb-1">Toplu Banka Listesi</p>
					<p className="fs-sm">
						Seçili olan bankalar, Haciz işlemlerinde otomatik olarak seçili
						gelecektir.
					</p>
				</div>
			</Button>
			{visibleSetting === 1 && (
				<div className="setting-item__content">
					<div className="flex al-center jst-between my-4">
						<Button classes="fw-500 blue" onClick={selectAllBanks}>
							Tümünü Seç
						</Button>
						<Button classes="fw-500 red" onClick={removeAllBanks}>
							Tümünü Bırak
						</Button>
					</div>
					<div className="step-item-divider"></div>
					{BANK_LIST.map(bank => {
						return (
							<Button classes="mb-2" onClick={() => handleBankList(bank)}>
								{lawOffice.bulkQueryBankList.includes(bank) ? (
									<FaCheckCircle className="green" />
								) : (
									<FaRegCircle />
								)}
								<p className="ml-2">{bank}</p>
							</Button>
						)
					})}
					<Button theme="blue" classes="fw-500 mt-8" onClick={save}>
						<FaCheck className="mr-2" />
						Kaydet
					</Button>
				</div>
			)}
			<Button
				onClick={() => handleVisibleSetting(2)}
				classes="setting-item__button"
			>
				<FaClock className="mr-4 fs-md" />
				<div className="ta-left">
					<p className="fw-500 mb-1">Tekrar Sorgu Hatırlatıcısı</p>
					<p className="fs-sm">
						Boş çıkan haciz sorgu sonuçlarının ne kadar sürede tekrarlanması
						gerektiğinin ayarlarıdır.
					</p>
				</div>
			</Button>
			{visibleSetting === 2 && (
				<div className="setting-item__content">
					<p className="fw-500 mb-2 mt-4">Aile Nüfus Kaydı Sorgusu</p>
					<div className="flex al-center">
						<Input
							value={
								lawOffice.queryReminderDays[QUERY_LIST.FAMILY_REGISTER.value]
							}
							onChange={e =>
								changeQueryReminderDays(
									QUERY_LIST.FAMILY_REGISTER.value,
									e.target.value,
								)
							}
						/>
						<p className="ml-2">gün</p>
					</div>
					<div className="divider my-4"></div>
					<p className="fw-500 mb-2">Araç Sorgusu</p>
					<div className="flex al-center">
						<Input
							value={lawOffice.queryReminderDays[QUERY_LIST.VEHICLE.value]}
							onChange={e =>
								changeQueryReminderDays(
									QUERY_LIST.VEHICLE.value,
									e.target.value,
								)
							}
						/>
						<p className="ml-2">gün</p>
					</div>
					<div className="divider my-4"></div>
					<p className="fw-500 mb-2">Gayrimenkul Sorgusu</p>
					<div className="flex al-center">
						<Input
							value={lawOffice.queryReminderDays[QUERY_LIST.IMMOVABLE.value]}
							onChange={e =>
								changeQueryReminderDays(
									QUERY_LIST.IMMOVABLE.value,
									e.target.value,
								)
							}
						/>
						<p className="ml-2">gün</p>
					</div>
					<div className="divider my-4"></div>
					<p className="fw-500 mb-2">SGK Maaş Sorgusu</p>
					<div className="flex al-center">
						<Input
							value={lawOffice.queryReminderDays[QUERY_LIST.SSI.value]}
							onChange={e =>
								changeQueryReminderDays(QUERY_LIST.SSI.value, e.target.value)
							}
						/>
						<p className="ml-2">gün</p>
					</div>
					<div className="divider my-4"></div>
					<p className="fw-500 mb-2">Toplu Banka Sorgusu</p>
					<div className="flex al-center">
						<Input
							value={lawOffice.queryReminderDays[QUERY_LIST.BANK.value]}
							onChange={e =>
								changeQueryReminderDays(QUERY_LIST.BANK.value, e.target.value)
							}
						/>
						<p className="ml-2">gün</p>
					</div>
					<div className="divider my-4"></div>
					<p className="fw-500 mb-2">Gümrük Alacağı Sorgusu</p>
					<div className="flex al-center">
						<Input
							value={lawOffice.queryReminderDays[QUERY_LIST.CUSTOMS.value]}
							onChange={e =>
								changeQueryReminderDays(
									QUERY_LIST.CUSTOMS.value,
									e.target.value,
								)
							}
						/>
						<p className="ml-2">gün</p>
					</div>
					<div className="divider my-4"></div>
					<p className="fw-500 mb-2">Vergi Alacağı Sorgusu</p>
					<div className="flex al-center">
						<Input
							value={lawOffice.queryReminderDays[QUERY_LIST.TAX_DUE.value]}
							onChange={e =>
								changeQueryReminderDays(
									QUERY_LIST.TAX_DUE.value,
									e.target.value,
								)
							}
						/>
						<p className="ml-2">gün</p>
					</div>
					<div className="divider my-4"></div>
					<p className="fw-500 mb-2">Patent Enstitüsü Sorgusu</p>
					<div className="flex al-center">
						<Input
							value={lawOffice.queryReminderDays[QUERY_LIST.PATENT.value]}
							onChange={e =>
								changeQueryReminderDays(QUERY_LIST.PATENT.value, e.target.value)
							}
						/>
						<p className="ml-2">gün</p>
					</div>
					<div className="divider my-4"></div>
					<p className="fw-500 mb-2">Alacaklı Olduğu Dosya Sorgusu</p>
					<div className="flex al-center">
						<Input
							value={
								lawOffice.queryReminderDays[QUERY_LIST.CREDITOR_CASE.value]
							}
							onChange={e =>
								changeQueryReminderDays(
									QUERY_LIST.CREDITOR_CASE.value,
									e.target.value,
								)
							}
						/>
						<p className="ml-2">gün</p>
					</div>
					<div className="divider my-4"></div>
					<p className="fw-500 mb-2">Hisse Sorgusu</p>
					<div className="flex al-center">
						<Input
							value={lawOffice.queryReminderDays[QUERY_LIST.SHARE.value]}
							onChange={e =>
								changeQueryReminderDays(QUERY_LIST.SHARE.value, e.target.value)
							}
						/>
						<p className="ml-2">gün</p>
					</div>
					<Button theme="blue" classes="fw-500 mt-8" onClick={save}>
						<FaCheck className="mr-2" />
						Kaydet
					</Button>{' '}
				</div>
			)}
			<Button
				onClick={() => handleVisibleSetting(3)}
				classes="setting-item__button"
			>
				<FaTasks className="mr-4 fs-md" />
				<div className="ta-left">
					<p className="fw-500 mb-1">Görev Süreleri</p>
					<p className="fs-sm">
						Yetkililere atanan görevlerin yapılma süreleri. Belirlenen sürelerde
						görevler yapılmadığı takdirde görev bir üst yetkiliye atanacaktır.
					</p>
				</div>
			</Button>
			{visibleSetting === 3 && (
				<div className="setting-item__content">
					<Button theme="blue" classes="btn-fixed fw-600 column" onClick={save}>
						<FaSave className="mb-2 fs-md" />
						<p className="fs-nm">Kaydet</p>
					</Button>
					{Object.values(lawOffice.taskTransitionDays).map((task, index) => {
						return (
							<div>
								{index === 0 && <div className="mt-4"></div>}
								<p className="fw-500 mb-2">{getTaskTextByType(task.value)}</p>
								<div className="flex al-center">
									<Input
										value={task.days}
										onChange={e =>
											changeTaskTransitioDays(
												Object.keys(TASK_TYPE).filter(
													key => TASK_TYPE[key] === task.value,
												)[0],
												e.target.value,
											)
										}
									/>
									<p className="ml-2">gün</p>
								</div>
								<div className="step-item-divider"></div>
							</div>
						)
					})}
				</div>
			)}
			<Button
				onClick={() => handleVisibleSetting(4)}
				classes="setting-item__button"
			>
				<FaTasks className="mr-4 fs-md" />
				<div className="ta-left">
					<p className="fw-500 mb-1">Haciz Seçenekleri</p>
					<p className="fs-sm">
						Haciz esnasında yapılacak işlemler ile ilgili seçenekler
					</p>
				</div>
			</Button>
			{visibleSetting === 4 && (
				<div className="setting-item__content">
					<div className="mt-4 flex">
						<div className="w-50 mr-8">
							<p className="fw-500 mb-4">
								Haczedilebilir olmayan adresler için otomatik olarak Fiili Haciz
								İstihbaratı görevi oluşturmak istiyor musunuz?
							</p>
							<TrueFalse
								values={[false, true]}
								options={['Hayır', 'Evet']}
								change={(prop, val) => changeDeFactoIntelRequired(val)}
								object={lawOffice}
								property="deFactoIntelRequired"
							/>
							<div className="step-item-divider"></div>

							<p className="fw-500 mb-4">
								Kaç adet takyidat olduğunda hacize devam edip edilmeyeceği
								sorulsun?
							</p>
							<Input
								value={lawOffice.restrictionThreshold}
								onChange={e => changeRestrictionThreshold(e.target.value)}
							/>
							<div className="step-item-divider"></div>
							<p className="fw-500 mb-4">
								Banka hesabında ne kadar miktardan fazla para olduğunda hacze
								devam edilsin?
							</p>
							<Input
								value={lawOffice.bankAccountBalanceThreshold}
								onChange={e =>
									changeBankAccountBalanceThreshold(e.target.value)
								}
							/>
						</div>
						<div className="w-50">
							<p className="fw-500 mb-2">
								Hangi tür malların satışında gazete ilanı zorunlu tutulsun?
							</p>
							<div className="flex al-center jst-between mt-4">
								<Button classes="fw-500 blue" onClick={selectAllAssetTypes}>
									Tümünü Seç
								</Button>
								<Button classes="fw-500 red" onClick={removeAllAssetTypes}>
									Tümünü Bırak
								</Button>
							</div>
							<div className="step-item-divider my-2"></div>
							{AVALIABLE_FOR_SALE_QUERIES.map(query => {
								return (
									<Button
										classes="mb-2"
										onClick={() =>
											handleSaleNewspaperMandatoryAssetTypes(query.value)
										}
									>
										{lawOffice.saleNewspaperMandatoryAssetTypes.includes(
											query.value,
										) ? (
											<FaCheckCircle className="green" />
										) : (
											<FaRegCircle />
										)}
										<p className="ml-2">{query.text}</p>
									</Button>
								)
							})}
						</div>
					</div>
					<Button theme="blue" classes="fw-600 blue mt-8" onClick={save}>
						<FaCheck className="mr-2" />
						Kaydet
					</Button>
				</div>
			)}
		</div>
	)
}
