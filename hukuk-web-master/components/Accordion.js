import React, { useState } from 'react'
import { FaChevronDown, FaChevronUp, FaStore } from 'react-icons/fa'
import Button from './anBrains/Button'

export default function Accordion({
	isOpenDefault,
	title,
	titleIcon,
	classes,
	children,
}) {
	const [isOpen, setIsOpen] = useState(isOpenDefault)

	return (
		<div
			className={`custodian-info ${isOpen ? '' : 'custodian-info__closed'}${
				classes ? ` ${classes}` : ''
			}`}
		>
			<Button
				classes={`w-100 jst-between custodian-info__header`}
				onClick={() => setIsOpen(!isOpen)}
			>
				<div className="column al-start">
					<div className="flex al-center">
						{titleIcon || <FaStore className="blue mr-2" />}
						<p className="fw-600 blue fs-md">
							{title || 'Yeddiemin Bilgilerini Gir'}
						</p>
					</div>
					{!isOpen && <p className="mt-2">Detayları görmek için tıklayın</p>}
				</div>
				<Button classes="fw-500 ml-2">
					{isOpen ? <FaChevronUp /> : <FaChevronDown />}
				</Button>
			</Button>
			{isOpen && <div className="custodian-info__content">{children}</div>}
		</div>
	)
}
