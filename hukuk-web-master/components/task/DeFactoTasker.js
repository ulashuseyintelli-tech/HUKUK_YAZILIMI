import React from 'react'
import { TASK_TYPE } from '../../constants'
import Link from 'next/link'
import { getTaskTargetUrl } from '../../helpers/taskHelper'

export default function DeFactoTasker({ task, debtor }) {
	return (
		<div>
			{task.type === TASK_TYPE.DE_FACTO_IS_DEBTOR_EXIST && (
				<Link href={getTaskTargetUrl(task)}>
					<a className="btn btn-green w-100 fw-500 mb-2 ta-center fs-sm">
						Yerinde Olup Olmadığını Gir
					</a>
				</Link>
			)}
			{task.type === TASK_TYPE.DE_FACTO_IS_MONEY_RECEIVED && (
				<Link href={getTaskTargetUrl(task)}>
					<a className="btn btn-green w-100 fw-500 mb-2 ta-center fs-sm">
						Para Tahsilatının Yapılıp Yapılmadığını Gir
					</a>
				</Link>
			)}
			{task.type === TASK_TYPE.DE_FACTO_IS_COMMITMENT_RECEIVED && (
				<Link href={getTaskTargetUrl(task)}>
					<a className="btn btn-green w-100 fw-500 mb-2 ta-center fs-sm">
						Taahhüt Alınıp Alınmadığını Gir
					</a>
				</Link>
			)}
			{task.type === TASK_TYPE.DE_FACTO_CONSENT_TO_GARNISHMENT && (
				<Link href={getTaskTargetUrl(task)}>
					<a className="btn btn-green w-100 fw-500 mb-2 ta-center fs-sm">
						Maaş Haczi Rızası Gir
					</a>
				</Link>
			)}
			{task.type === TASK_TYPE.DE_FACTO_RECEIVED_MONEY_AMOUNT && (
				<Link href={getTaskTargetUrl(task)}>
					<a className="btn btn-green w-100 fw-500 mb-2 ta-center fs-sm">
						Tahsilat Yapılan Para Miktarını Gir
					</a>
				</Link>
			)}
			{task.type === TASK_TYPE.DE_FACTO_PERSON_GOT_MONEY && (
				<Link href={getTaskTargetUrl(task)}>
					<a className="btn btn-green w-100 fw-500 mb-2 ta-center fs-sm">
						Tahsilat Yapılan Parayı Alan Kişiyi Gir
					</a>
				</Link>
			)}
			{task.type === TASK_TYPE.DE_FACTO_IS_MONEY_REQUESTED && (
				<Link href={getTaskTargetUrl(task)}>
					<a className="btn btn-green w-100 fw-500 mb-2 ta-center fs-sm">
						Paranın Dosyaya Yatırılmasını Talep et
					</a>
				</Link>
			)}
			{task.type === TASK_TYPE.DE_FACTO_IS_RECEIVED_MONEY_DECLARED && (
				<Link href={getTaskTargetUrl(task)}>
					<a className="btn btn-green w-100 fw-500 mb-2 ta-center fs-sm">
						Tahsilatı Yapılan Parayı Beyan Et
					</a>
				</Link>
			)}
			{task.type === TASK_TYPE.DE_FACTO_MONEY_COLLECTION_REQUIRED && (
				<Link href={getTaskTargetUrl(task)}>
					<a className="btn btn-green w-100 fw-500 mb-2 ta-center fs-sm">
						Tahsilat Ekle
					</a>
				</Link>
			)}
			{task.type === TASK_TYPE.DE_FACTO_PERSON_MAKE_COMMITMENT && (
				<Link href={getTaskTargetUrl(task)}>
					<a className="btn btn-green w-100 fw-500 mb-2 ta-center fs-sm">
						Taahhüt Veren Kişiyi Gir
					</a>
				</Link>
			)}
			{task.type === TASK_TYPE.DE_FACTO_COMMITMENT_DETAILS && (
				<Link href={getTaskTargetUrl(task)}>
					<a className="btn btn-green w-100 fw-500 mb-2 ta-center fs-sm">
						Taahhüt Detaylarını Gir
					</a>
				</Link>
			)}
			{task.type === TASK_TYPE.DE_FACTO_PERSON_CONSENT_TO_GARNISHMENT && (
				<Link href={getTaskTargetUrl(task)}>
					<a className="btn btn-green w-100 fw-500 mb-2 ta-center fs-sm">
						Kişiyi Belirt
					</a>
				</Link>
			)}
			{task.type === TASK_TYPE.DE_FACTO_GARNISHMENT_DETAILS && (
				<Link href={getTaskTargetUrl(task)}>
					<a className="btn btn-green w-100 fw-500 mb-2 ta-center fs-sm">
						Maaş Haczi Rızası Detaylarını Gir
					</a>
				</Link>
			)}
			{task.type === TASK_TYPE.DE_FACTO_GARNISHMENT_DOCUMENTS && (
				<Link href={getTaskTargetUrl(task)}>
					<a className="btn btn-green w-100 fw-500 mb-2 ta-center fs-sm">
						Maaş Haczi Rızası Talimatlarını Hazırla
					</a>
				</Link>
			)}
			{task.type === TASK_TYPE.DE_FACTO_GARNISHMENT_DOCUMENTS_RESPONSE && (
				<Link href={getTaskTargetUrl(task)}>
					<a className="btn btn-green w-100 fw-500 mb-2 ta-center fs-sm">
						Maaş Haczi Cevabını Gir
					</a>
				</Link>
			)}
		</div>
	)
}
