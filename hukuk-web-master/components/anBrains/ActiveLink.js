import { useRouter } from 'next/router'

export function ActiveLink({ children, href, className = '', activeClass }) {
	const router = useRouter()
	className += router.asPath === href ? ` case-menu-active ${activeClass}` : ''

	const handleClick = e => {
		e.preventDefault()
		router.push(href)
	}

	return (
		<a href={href} onClick={handleClick} className={className}>
			{children}
		</a>
	)
}
