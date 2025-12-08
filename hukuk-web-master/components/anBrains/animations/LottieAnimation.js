import React from 'react'
import dynamic from 'next/dynamic'

const Lottie = dynamic(() => import('react-lottie'))

export default function LottieAnimation({
	loop = false,
	autoplay = true,
	animationData,
	width = 400,
	height = 400,
}) {
	const defaultOptions = {
		loop,
		autoplay,
		animationData,
		rendererSettings: {
			preserveAspectRatio: 'xMidYMid slice',
		},
	}

	return <Lottie options={defaultOptions} height={height} width={width} />
}
