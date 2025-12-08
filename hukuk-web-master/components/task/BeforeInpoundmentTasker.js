import React from 'react'
import { TASK_TYPE, DEBTOR_TYPES } from '../../constants'
import Link from 'next/link'
import { getTaskTargetUrl } from '../../helpers/taskHelper'

export default function BeforeInpoundmentTasker({ task, debtor }) {
	return (
		<div>
			{task.type === TASK_TYPE.DEBTOR_NOTIFICATION_REQUIRED && (
				<a
					href={getTaskTargetUrl(task)}
					target="_blank"
					className="btn btn-blue w-100 fw-500 mb-2"
				>
					Adrese Tebligat Hazırla
				</a>
			)}
			{task.type === TASK_TYPE.DEBTOR_NULL_ADDRESS && (
				<React.Fragment>
					<a
						href={task}
						target="_blank"
						className="btn btn-blue w-100 fw-500 mb-2"
					>
						Adresleri Güncelle
					</a>
				</React.Fragment>
			)}
			{task.type === TASK_TYPE.DEBTOR_NULL_IDENTITY && (
				<React.Fragment>
					<a
						href={getTaskTargetUrl(task)}
						target="_blank"
						className="btn btn-blue w-100 fw-500 mb-2"
					>
						T.C. Kimlik Numarasını Güncelle
					</a>
				</React.Fragment>
			)}
			{task.type === TASK_TYPE.NOTIFICATION_BARCODE_NUMBER_REQUIRED && (
				<React.Fragment>
					<a
						href={getTaskTargetUrl(task)}
						target="_blank"
						className="btn btn-blue w-100 fw-500 mb-2"
					>
						Barkod Numarasını Gir
					</a>
				</React.Fragment>
			)}
			{task.type === TASK_TYPE.NOTIFICATION_BARCODE_NUMBER_REQUEST && (
				<React.Fragment>
					<a
						href="https://www.turkiye.gov.tr/ptt-gonderi-takip"
						target="_blank"
						className="btn btn-blue w-100 fw-500 mb-2"
					>
						Tebligatı Sorgula
					</a>
					<a
						href={getTaskTargetUrl(task)}
						target="_blank"
						className="btn btn-blue w-100 fw-500 mb-2"
					>
						Tebligatı Durumunu Belirt
					</a>
				</React.Fragment>
			)}
			{task.type === TASK_TYPE.NOTIFICATION_STEP_1 && (
				<React.Fragment>
					{debtor.type === DEBTOR_TYPES.PERSON ? (
						<React.Fragment>
							<a
								href={getTaskTargetUrl(task)}
								target="_blank"
								className="btn btn-green w-100 fw-500 mb-2 ta-center fs-sm"
							>
								MERNIS adresine 21/1'ye göre tebligat hazırla
							</a>
						</React.Fragment>
					) : (
						<React.Fragment>
							<a
								href={getTaskTargetUrl(task)}
								target="_blank"
								className="btn btn-green w-100 fw-500 mb-2 ta-center fs-sm"
							>
								35'e göre tebligat hazırla
							</a>
						</React.Fragment>
					)}
				</React.Fragment>
			)}
			{task.type === TASK_TYPE.NOTIFICATION_STEP_2 && (
				<React.Fragment>
					{debtor.type === DEBTOR_TYPES.PERSON ? (
						<React.Fragment>
							<a
								href={getTaskTargetUrl(task)}
								target="_blank"
								className="btn btn-green w-100 fw-500 mb-2 ta-center fs-sm"
							>
								MERNIS adresine 21/2'ye göre tebligat hazırla
							</a>
						</React.Fragment>
					) : (
						<React.Fragment>
							<a
								href={getTaskTargetUrl(task)}
								target="_blank"
								className="btn btn-green w-100 fw-500 mb-2 ta-center fs-sm"
							>
								35/2'ye göre tebligat hazırla
							</a>
						</React.Fragment>
					)}
				</React.Fragment>
			)}
			{task.type === TASK_TYPE.NOTIFICATION_THIRD_PERSON_STEP_0 && (
				<React.Fragment>
					<React.Fragment>
						<a
							href={getTaskTargetUrl(task)}
							target="_blank"
							className="btn btn-green w-100 fw-500 mb-2 ta-center fs-sm"
						>
							Tebligat Hazırla
						</a>
					</React.Fragment>
				</React.Fragment>
			)}
			{task.type === TASK_TYPE.NOTIFICATION_THIRD_PERSON_STEP_1 && (
				<React.Fragment>
					<React.Fragment>
						<a
							href={getTaskTargetUrl(task)}
							target="_blank"
							className="btn btn-green w-100 fw-500 mb-2 ta-center fs-sm"
						>
							Tebligat Hazırla
						</a>
					</React.Fragment>
				</React.Fragment>
			)}
			{task.type === TASK_TYPE.NOTIFICATION_THIRD_PERSON_STEP_2 && (
				<React.Fragment>
					<React.Fragment>
						<a
							href={getTaskTargetUrl(task)}
							target="_blank"
							className="btn btn-green w-100 fw-500 mb-2 ta-center fs-sm"
						>
							Tebligat Hazırla
						</a>
					</React.Fragment>
				</React.Fragment>
			)}
			{task.type === TASK_TYPE.NOTIFICATION_DONE && (
				<React.Fragment>
					<Link href={getTaskTargetUrl(task)}>
						<a className="btn btn-blue w-100 fw-500 mb-2 ta-center fs-sm">
							Haciz İşlemleri
						</a>
					</Link>
				</React.Fragment>
			)}
		</div>
	)
}
