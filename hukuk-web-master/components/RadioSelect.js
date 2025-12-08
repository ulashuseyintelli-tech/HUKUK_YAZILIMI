import React from 'react'
import { FaRegCircle, FaRegDotCircle } from 'react-icons/fa'
import Button from './anBrains/Button'

export default function RadioSelect({
	options,
	values = [null, true, false],
	value,
	onChange = () => {},
	className = '',
}) {
	return (
		<div className={`flex al-center ${className}`}>
			{options.map((option, index) => {
				const isSelected = value === values[index]
				return (
					<Button
						classes={`mr-4 radio ${isSelected ? 'radio-selected' : ''}`}
						onClick={() => onChange(values[index])}
					>
						<div className="flex al-center">
							{isSelected ? (
								<FaRegDotCircle className="green mr-2" />
							) : (
								<FaRegCircle style={{ color: '#D2D6DB' }} className="mr-2" />
							)}
						</div>
						<p>{option}</p>
					</Button>
				)
			})}
		</div>
	)
}
