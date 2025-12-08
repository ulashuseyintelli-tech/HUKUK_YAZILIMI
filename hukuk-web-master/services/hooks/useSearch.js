import { useState } from 'react'

export default ({ items, sort }) => {
	const [searchTerm, setSearchTerm] = useState('')

	const search = () => {
		if (!searchTerm) return [...items].sort(sort)
		else
			return items
				.filter(c => {
					let inc = false
					Object.values(c).map(val => {
						if (
							`${val}`
								.toLocaleLowerCase('tr-TR')
								.includes(searchTerm.toLocaleLowerCase('tr-TR'))
						)
							inc = true
					})
					return inc
				})
				.sort(sort)
	}

	return {
		search,
		searchTerm,
		setSearchTerm,
	}
}
