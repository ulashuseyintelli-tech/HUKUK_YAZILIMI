import Button from './anBrains/Button'
import { FaRegCircle, FaRegDotCircle } from 'react-icons/fa'

export default function TrueFalse({
	object,
	property,
	change,
	options,
	values,
	className,
	reverse,
}) {
	const trueValue = values ? values[1] : true
	const falseValue = values ? values[0] : false

	const isTrue = object
		? object[property] === true ||
		  object[property] === 1 ||
		  object[property] === trueValue
		: false
	const isFalse = object
		? object[property] === false ||
		  object[property] === 0 ||
		  object[property] === falseValue
		: false

	return (
		<div
			className={`radio-container flex al-center ${
				reverse ? 'flex-reverse' : ''
			} mt-4 ${className ? className : ''}`}
		>
			<Button
				type="button"
				classes={`mr-4 radio ${isFalse ? 'radio-selected' : ''}`}
				onClick={() => change(property, falseValue)}
			>
				<div className="flex al-center">
					{isFalse ? (
						<FaRegDotCircle className="green mr-2" />
					) : (
						<FaRegCircle style={{ color: '#D2D6DB' }} className="mr-2" />
					)}
				</div>
				<p>{options[0]}</p>
			</Button>
			<Button
				type="button"
				classes={`mr-4 radio ${isTrue ? 'radio-selected' : ''}`}
				onClick={() => change(property, trueValue)}
			>
				<div className="flex al-center">
					{isTrue ? (
						<FaRegDotCircle className="green mr-2" />
					) : (
						<FaRegCircle style={{ color: '#D2D6DB' }} className="mr-2" />
					)}
				</div>
				<p>{options[1]}</p>
			</Button>
		</div>
	)
}
