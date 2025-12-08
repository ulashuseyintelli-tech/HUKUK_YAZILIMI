import {
	QUERY_TYPE,
	MULTI_SOURCE_INPOUNDMENT_TYPE,
	INPOUNDMENT_TYPE,
	QUERY_EXIST_TEXT,
	TASK_TYPE,
} from '../../constants'
import Button from '../anBrains/Button'
import Printer from '../Printer'
import { getPrinterTypeByQueryType } from '../../helpers/Helper'
import useHeightWithoutCaseNav from '../../services/hooks/useHeightWithoutCaseNav'
import DeFactoList from '../deFacto/deFactoList'
import BankQueryForm from '../debtorAssets/bankQuery/BankQueryForm'
import TrueFalse from '../TrueFalse'
import TaskRadar from '../task/TaskRadar'
import useInpoundmentContext from '../../services/hooks/useInpoundmentContext'

export default function InpoundmentQueries() {
	const { height } = useHeightWithoutCaseNav()

	const {
		currentCase,
		selectedDebtor,
		assetProps,
		visibleInpoundment,
		visibleQueries,
		doQuery,
		changeQueryProperty,
		setVisibleModal,
		setSelectedQueryId,
		debtorTasks,
	} = useInpoundmentContext()

	const containerStyle = assetProps.visibleAsset
		? { marginLeft: -1000 }
		: { height: `calc(100% - ${height})` }

	return (
		<div className="inpoundment-queries" style={containerStyle}>
			{visibleInpoundment === 'DE_FACTO' && <DeFactoList />}
			{visibleInpoundment !== 'DE_FACTO' && (
				<>
					<div className="inpoundment-queries__header">
						<p className="fs-lg bold">{QUERY_TYPE[visibleInpoundment]}</p>
						{visibleInpoundment === 'BANK' ? (
							<BankQueryForm />
						) : (
							<Button
								theme="green"
								classes="bold py-1"
								onClick={() => doQuery()}
							>
								Yeni Sorgu
							</Button>
						)}
					</div>
				</>
			)}
			<div className="inpoundment-queries__list">
				<div className="flex al-center jst-between mb-4">
					{visibleInpoundment !== 'DE_FACTO' && (
						<p className="fw-600 fs-md">Sorgular</p>
					)}
					{visibleInpoundment !== 'DE_FACTO' && (
						<Printer
							caseNumber={currentCase.number}
							type="requestPaper"
							paperDebtors={[selectedDebtor]}
							request={getPrinterTypeByQueryType(visibleInpoundment)}
							title="Yazdır"
						/>
					)}
				</div>
				{visibleInpoundment !== 'DE_FACTO' && visibleQueries.length > 0 ? (
					<React.Fragment>
						{visibleQueries.map(query => {
							return (
								<div className="inpoundment-query" key={query._id}>
									<p>
										{new Date(query.createdAt).toLocaleDateString('tr-TR')}{' '}
										tarihinde {QUERY_TYPE[query.type]} sorgusu yapıldı
									</p>
									<TaskRadar
										always={debtorTasks.some(
											t =>
												t.type === TASK_TYPE.QUERY_RESPONSE_REQUIRED &&
												t.extra &&
												t.extra.queryType === visibleInpoundment &&
												t.extra.queryId === query._id,
										)}
									>
										{visibleInpoundment !== 'BANK' && (
											<>
												<p className="fw-500 my-2">
													{QUERY_EXIST_TEXT[query.type]}
												</p>
												<div className="flex al-center">
													<TrueFalse
														object={query}
														property="isResultEmpty"
														change={(prop, val) =>
															changeQueryProperty(query._id, prop, val, () => {
																if (
																	MULTI_SOURCE_INPOUNDMENT_TYPE.includes(
																		visibleInpoundment,
																	)
																) {
																	setSelectedQueryId(query._id)
																	if (val === false) {
																		setVisibleModal(QUERY_TYPE[query.type])
																	}
																}
															})
														}
														options={['Evet, var', 'Hayır, yok']}
														reverse
													/>
												</div>
											</>
										)}
										{query.isResultEmpty === false &&
											MULTI_SOURCE_INPOUNDMENT_TYPE.includes(
												visibleInpoundment,
											) && (
												<TaskRadar
													top="-.5rem"
													always={debtorTasks.some(
														t =>
															t.type ===
																TASK_TYPE.QUERY_RESPONSE_ENTRY_REQUIRED &&
															t.extra &&
															t.extra.queryType === visibleInpoundment &&
															t.extra.queryId === query._id,
													)}
												>
													<Button
														theme="blue"
														classes="mt-4 fw-500"
														onClick={() => {
															setVisibleModal(QUERY_TYPE[query.type])
															setSelectedQueryId(query._id)
														}}
													>
														Borçluya Yeni{' '}
														{query.type === 'FAMILY_REGISTER'
															? 'Aile Bireyi'
															: QUERY_TYPE[query.type]}{' '}
														Ekle
													</Button>
												</TaskRadar>
											)}
									</TaskRadar>
								</div>
							)
						})}
					</React.Fragment>
				) : (
					<React.Fragment>
						{visibleInpoundment !== 'DE_FACTO' && (
							<p className="fw-500 red">
								Daha önce {INPOUNDMENT_TYPE[visibleInpoundment]} sorgusu
								yapılmamış.
							</p>
						)}
					</React.Fragment>
				)}
			</div>
		</div>
	)
}
