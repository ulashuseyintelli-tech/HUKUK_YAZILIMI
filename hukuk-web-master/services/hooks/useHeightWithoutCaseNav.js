import { useEffect, useState } from 'react'

const useHeightWithoutHeader = () => {
	const [height, setHeight] = useState(100)

	useEffect(() => {
		const elHeight = document.getElementById('header').offsetHeight
		setHeight(elHeight)
	}, [])

	return { height }
}

export default useHeightWithoutHeader
