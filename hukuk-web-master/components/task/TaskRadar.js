import React, { useEffect, useState } from 'react'
import LottieAnimation from '../anBrains/animations/LottieAnimation'
import radar from '../../public/animations/radar.json'

export default function TaskRadar({
	children,
	type,
	always,
	containerClasses,
	right,
	top,
	onClick = () => {},
}) {
	const [hash, setHash] = useState(null)
	useEffect(() => {
		setHash(window.location.hash.replace('#', ''))
	}, [])

	return (
		<div
			style={{ position: 'relative' }}
			className={containerClasses || ''}
			onClick={onClick}
		>
			{children}
			<div
				style={{
					position: 'absolute',
					right: right ? right : 0,
					top: top ? top : 0,
				}}
			>
				{(hash === type || always) && (
					<LottieAnimation
						animationData={radar}
						loop={true}
						width={50}
						height={50}
					/>
				)}
			</div>
		</div>
	)
}
