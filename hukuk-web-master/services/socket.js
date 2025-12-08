import { createContext, useContext, useState } from 'react'
import { io } from 'socket.io-client'
import { API_URL } from '../config'

export const SocketContext = createContext()

export const useSocketContext = () => {
	return useContext(SocketContext)
}

export const useSocket = () => {
	return io(API_URL)
}
