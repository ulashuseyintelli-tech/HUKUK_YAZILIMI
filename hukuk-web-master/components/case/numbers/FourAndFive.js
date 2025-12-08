import React, { useEffect } from 'react'

export default function FourAndFive({ setAvailability }) {
	useEffect(() => {
		setAvailability(true)
	}, [])

	return null
}
