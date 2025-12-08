import { useRef, useEffect } from 'react'
import { FaTimes } from 'react-icons/fa'

export default function Modal({
	visible,
	children,
	close,
	errorOccurred,
	successfully,
	disableCloseOnClick,
}) {
	const wrapperRef = useRef(null)
	useOutsideHandler(wrapperRef, close, disableCloseOnClick)

	if (!close || typeof close !== 'function') {
		throw new Error('You must specify close function')
	}

	return visible ? (
		<div className="modal">
			<div className="modal-content" ref={wrapperRef}>
				{errorOccurred && <p className="fs-lg red mb-4 bold">Hata!</p>}
				{successfully && <p className="fs-lg green mb-4 bold">Başarılı!</p>}
				{children}
			</div>
		</div>
	) : null
}

function useOutsideHandler(ref, onClick, disableCloseOnClick) {
	if (disableCloseOnClick) {
		return null
	}
	useEffect(() => {
		const taskerRef = document.getElementById('tasker')
		function handleClickOutside(event) {
			if (
				ref.current &&
				!ref.current.contains(event.target) &&
				!taskerRef.contains(event.target)
			) {
				onClick()
			}
		}
		// Bind the event listener
		document.addEventListener('mousedown', handleClickOutside)
		return () => {
			// Unbind the event listener on clean up
			document.removeEventListener('mousedown', handleClickOutside)
		}
	})
}
