import React, { useEffect } from 'react'

export default function Seven({ setAvailability }) {
	useEffect(() => {
		setAvailability(true)
	}, [])

	return null
}
