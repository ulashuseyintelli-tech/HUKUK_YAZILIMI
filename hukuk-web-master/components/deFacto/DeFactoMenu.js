import React from 'react'
import Button from '../anBrains/Button'
import {
	FaMoneyBill,
	FaChair,
	FaUser,
	FaBuffer,
	FaReceipt,
} from 'react-icons/fa'

export default function DeFactoMenu({ selectedTab, setSelectedTab }) {
	return (
		<div className="de-facto__menu flex al-center">
			<Button
				onClick={() => setSelectedTab(0)}
				classes={` fs-md fw-500 ${selectedTab === 0 ? ' blue' : 'fw-500'}`}
			>
				<FaMoneyBill className="mr-2" />
				Para
			</Button>
			<Button
				onClick={() => setSelectedTab(1)}
				classes={` fs-md fw-500 ${selectedTab === 1 ? ' blue' : 'fw-500'}`}
			>
				<FaChair className="mr-2" />
				Mal
			</Button>
			<Button
				onClick={() => setSelectedTab(2)}
				classes={` fs-md fw-500 ${selectedTab === 2 ? ' blue' : 'fw-500'}`}
			>
				<FaUser className="mr-2" />
				Kefil
			</Button>
			<Button
				onClick={() => setSelectedTab(3)}
				classes={` fs-md fw-500 ${selectedTab === 3 ? ' blue' : 'fw-500'}`}
			>
				<FaBuffer className="mr-2" />
				Taahhüt
			</Button>
			<Button
				onClick={() => setSelectedTab(4)}
				classes={` fs-md fw-500 ${selectedTab === 4 ? ' blue' : 'fw-500'}`}
			>
				<FaReceipt className="mr-2" />
				Maaş Rızası
			</Button>
		</div>
	)
}
