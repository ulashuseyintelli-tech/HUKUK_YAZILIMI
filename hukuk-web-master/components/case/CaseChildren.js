import React, { useEffect, useState } from 'react'
import {
	FaCheck,
	FaChevronCircleDown,
	FaChevronCircleUp,
	FaLongArrowAltLeft,
	FaPlusCircle,
	FaTrash,
} from 'react-icons/fa'
import { STATUS } from '../../constants'
import {
	getCasePartOpacity,
	goPreviousStepOfTeacher,
} from '../../helpers/Helper'
import { saveCase } from '../../services/caseService'
import useInpoundmentContext from '../../services/hooks/useInpoundmentContext'
import LoadingAnimation from '../anBrains/animations/LoadingAnimation/LoadingAnimation'
import Button from '../anBrains/Button'
import Input from '../anBrains/Input'
import Note from '../Note'

export default function CaseChildren() {
	const { currentCase, setCurrentCase, handleError } = useInpoundmentContext()

	const [status, setStatus] = useState(STATUS.NORMAL)
	const [isBlinking, setIsBlinking] = useState(
		getCasePartOpacity(currentCase, 'children'),
	)
	const [isOpen, setIsOpen] = useState(false)

	const [children, setChildren] = useState(
		currentCase.children.length === 0 ? [''] : currentCase.children,
	)

	useEffect(() => {
		if (currentCase.isDebtorsCompleted && !currentCase.isChildrenCompleted) {
			setIsOpen(true)
		}
	}, [currentCase])

	const save = async () => {
		if (children.length > 0 && !children.some(c => !c)) {
			setStatus(STATUS.LOADING)
			await saveCase(currentCase.number, {
				...currentCase,
				isChildrenCompleted: true,
				children,
			})
				.then(res => {
					setCurrentCase(res.data)
					setIsOpen(false)
				})
				.catch(handleError)
			setStatus(STATUS.NORMAL)
		} else {
			alert('Lütfen tüm çocukların isimlerini girin!')
		}
	}

	return (
		<div
			className="case-form__writ mt-4 relative"
			disabled={!getCasePartOpacity(currentCase, 'children')}
		>
			<LoadingAnimation status={status} />
			<Button
				classes="w-100 jst-between orange bold fs-nm"
				onClick={() => setIsOpen(!isOpen)}
			>
				<p className="orange fw-700">Teslimi İstenen Çocuklar</p>
				{isOpen ? (
					<FaChevronCircleUp className="orange" />
				) : (
					<FaChevronCircleDown className="orange" />
				)}
			</Button>
			{isOpen && (
				<>
					<div className="step-item-divider my-4"></div>
					{children.length === 0 ? (
						<p>Henüz eklenmemiş.</p>
					) : (
						children.map((child, i) => {
							return (
								<div className="flex al-center w-100 mb-2">
									<p className="mr-2">{i + 1}.</p>
									<Input
										onChange={e => {
											children[i] = e.target.value
											setChildren([...children])
										}}
										classes="w-100"
										value={child}
									/>
									<Button
										theme="red"
										classes="ml-4 px-2 py-1"
										onClick={() => {
											children.splice(i, 1)
											setChildren([...children])
										}}
									>
										<FaTrash />
									</Button>
								</div>
							)
						})
					)}
					<div className="flex al-center mt-8">
						<Button
							theme="orange"
							icon={<FaPlusCircle />}
							classes="fw-600 w-100 mr-4 py-3"
							onClick={() => setChildren([...children, ''])}
						>
							Çocuk Ekle
						</Button>
						<Button
							theme="cute"
							icon={<FaCheck />}
							classes="fw-600 w-100 py-3"
							onClick={save}
						>
							Kaydet
						</Button>
					</div>
				</>
			)}
			{currentCase.isDebtorsCompleted && !currentCase.isChildrenCompleted && (
				<Note
					type="zekiye"
					classes="teacher"
					blinking={isBlinking}
					onMouseOver={() => setIsBlinking(false)}
				>
					Bir sonraki aşamaya geçebilmek için teslimi istenen çocukların
					bilgilerini girin
					<Button
						classes="mt-4"
						onClick={() =>
							goPreviousStepOfTeacher(setStatus, currentCase, setCurrentCase)
						}
					>
						<FaLongArrowAltLeft className="fs-xsm blue" />
						<span className="fw-500 fs-xsm blue">Önceki Adım</span>
					</Button>
				</Note>
			)}
		</div>
	)
}
