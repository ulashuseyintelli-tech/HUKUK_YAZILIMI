import React from 'react'
import { handleImageChoosen } from '../../services/imageService'
import Button from './Button'
import { FaImage, FaFileImage, FaCamera } from 'react-icons/fa'

export default function ImagePicker({ upload, classes, justIcon }) {
	return (
		<React.Fragment>
			<input
				id="upload"
				name="image"
				type="file"
				accept=".jpg,.jpeg,.png"
				onChange={e => handleImageChoosen(e, upload)}
			/>
			<label
				htmlFor="upload"
				className={`flex al-center ${classes} ${
					justIcon
						? 'profile-picture-change'
						: 'w-100 btn py-1 brd fs-sm fw-500 br-xsm'
				}`}
			>
				{justIcon ? (
					<FaCamera />
				) : (
					<React.Fragment>
						<FaImage className="mr-2" />
						Fotoğraf seç
					</React.Fragment>
				)}
			</label>
		</React.Fragment>
	)
}
