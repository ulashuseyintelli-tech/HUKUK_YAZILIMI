import React from 'react'
import { TASK_TYPE } from '../../constants'
import Link from 'next/link'
import { getTaskTargetUrl } from '../../helpers/taskHelper'

export default function SaleTasker({ task, debtor }) {
	return (
		<div>
			{task.type === TASK_TYPE.SALE_COLLECTION_REQUIRED && (
				<Link href={getTaskTargetUrl(task)}>
					<a className="btn btn-green w-100 fw-500 mb-2 ta-center fs-sm">
						Tahsilat Gir
					</a>
				</Link>
			)}
			{task.type === TASK_TYPE.SALE_SOLD_BY_ANOTHER_CREDITOR && (
				<Link href={getTaskTargetUrl(task)}>
					<a className="btn btn-green w-100 fw-500 mb-2 ta-center fs-sm">
						Başkası Tarafından Satılıp Satılmadığını Belirt
					</a>
				</Link>
			)}
			{task.type === TASK_TYPE.SALE_REQUEST_REQUIRED && (
				<Link href={getTaskTargetUrl(task)}>
					<a className="btn btn-green w-100 fw-500 mb-2 ta-center fs-sm">
						Satış Talebi Yazdır
					</a>
				</Link>
			)}
			{task.type === TASK_TYPE.SALE_REQUEST_TRACKING_NUMBER_REQUIRED && (
				<Link href={getTaskTargetUrl(task)}>
					<a className="btn btn-green w-100 fw-500 mb-2 ta-center fs-sm">
						Takip Numarası Gir
					</a>
				</Link>
			)}
			{task.type === TASK_TYPE.SALE_REQUEST_RESPONSE_REQUIRED && (
				<Link href={getTaskTargetUrl(task)}>
					<a className="btn btn-green w-100 fw-500 mb-2 ta-center fs-sm">
						Cevabı Kontrol Et
					</a>
				</Link>
			)}
			{task.type === TASK_TYPE.SALE_REQUEST_RESPONSE_STATUS_REQUIRED && (
				<Link href={getTaskTargetUrl(task)}>
					<a className="btn btn-green w-100 fw-500 mb-2 ta-center fs-sm">
						Cevabı Gir
					</a>
				</Link>
			)}
			{task.type ===
				TASK_TYPE.SALE_REQUEST_RESPONSE_STATUS_NEGATIVE_REASON_REQUIRED && (
				<Link href={getTaskTargetUrl(task)}>
					<a className="btn btn-green w-100 fw-500 mb-2 ta-center fs-sm">
						Olumsuz Olma Nedenini Gir
					</a>
				</Link>
			)}
			{task.type === TASK_TYPE.SALE_REQUEST_DAY_DATES_REQUIRED && (
				<Link href={getTaskTargetUrl(task)}>
					<a className="btn btn-green w-100 fw-500 mb-2 ta-center fs-sm">
						Satış Günlerini Gir
					</a>
				</Link>
			)}
			{task.type === TASK_TYPE.SALE_REQUEST_DAY_RESPONSE && (
				<Link href={getTaskTargetUrl(task)}>
					<a className="btn btn-green w-100 fw-500 mb-2 ta-center fs-sm">
						Satış Günü Sonucunu Gir
					</a>
				</Link>
			)}
			{task.type === TASK_TYPE.SALE_REQUEST_DAY_REASON_FOR_NEGATIVE && (
				<Link href={getTaskTargetUrl(task)}>
					<a className="btn btn-green w-100 fw-500 mb-2 ta-center fs-sm">
						Satış Günü Olumsuz Olma Nedenini Gir
					</a>
				</Link>
			)}
			{task.type === TASK_TYPE.SALE_REQUEST_SECOND_DAY_REQUIRED && (
				<Link href={getTaskTargetUrl(task)}>
					<a className="btn btn-green w-100 fw-500 mb-2 ta-center fs-sm">
						İkinci Haciz Günü Detaylarını Gir
					</a>
				</Link>
			)}
			{task.type === TASK_TYPE.SALE_REQUEST_COMPLETED_NOTIFICATION_REQUIRED && (
				<Link href={getTaskTargetUrl(task)}>
					<a className="btn btn-green w-100 fw-500 mb-2 ta-center fs-sm">
						Tebligat Hazırla
					</a>
				</Link>
			)}
			{task.type === TASK_TYPE.NEW_SALE_REQUEST_REQUIRED && (
				<Link href={getTaskTargetUrl(task)}>
					<a className="btn btn-green w-100 fw-500 mb-2 ta-center fs-sm">
						Yeni Satış Talebi Oluştur
					</a>
				</Link>
			)}

			{task.type === TASK_TYPE.SALE_MONEY_INCOME_REQUIRED && (
				<Link href={getTaskTargetUrl(task)}>
					<a className="btn btn-green w-100 fw-500 mb-2 ta-center fs-sm">
						Paranın Yatırılıp Yatırılmadığını Gir
					</a>
				</Link>
			)}
			{task.type === TASK_TYPE.SALE_MONEY_INCOME_SHARE_REQUIRED && (
				<Link href={getTaskTargetUrl(task)}>
					<a className="btn btn-green w-100 fw-500 mb-2 ta-center fs-sm">
						Takyidatlara Göre Dağıtıldı Olarak İşaretle
					</a>
				</Link>
			)}
		</div>
	)
}
