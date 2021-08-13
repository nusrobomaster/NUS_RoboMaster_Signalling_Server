import websockets
import random
websocket = None
from multiprocessing import Process
'''
Use Python websockets module to simulate the following 
functionality from the client frontend

user-login: Available in frontend signallingServer.userLogin()
find-robot: Available in frontend signallingServer.findRobot()
offer: Available in frontend signallingServer.sendOffer()
user-start-game: Available in frontend signallingServer.startGame()

The login for what the client does in each functionality is 
provided in the frontend GameSelect.js 
in goToBattle() and Home.js when the start button is pressed.

Spawn multiple threads that perform the above functionality 
so we can stress-test the queuing system.
'''

#user-login: Available in frontend signallingServer.userLogin()
#find-robot: Available in frontend signallingServer.findRobot()
#offer: Available in frontend signallingServer.sendOffer()
#user-start-game: Available in frontend signallingServer.startGame()

import asyncio
import json
import websockets
import sys
import logging
import threading
import time

import zmq
import cv2
from PIL import Image
import numpy as np

from av import VideoFrame
import pyautogui as pyg

from aiortc import *

control_data_channel = None
websocket = None
offer = None


# async def connect_to_signalling_server(uri, login_message):
#     global websocket
#     websocket = await websockets.connect(uri)
#     print("Connected to server")
#     await websocket.send(json.dumps(login_message))
#     await findrobot()
#     # async for message in websocket:
#     #     print(1)
#     #     data = json.loads(message)
#     #     print(data)

async def startgame(index):
    global websocket
    global user_connection
    global offer
    
    logging.info("Thread    : startgame %d.", index)
    await websocket.send(json.dumps({"type":"user-start-game"}))
    async for message in websocket:
        data = json.loads(message)
        print("startgame handler")
        print(data)

async def sendoffer(index):
    global websocket
    global offer
    
    config = RTCConfiguration([\
        RTCIceServer("turn:18.142.123.26:3478", username="RaghavB", credential="RMTurnServer"),\
        RTCIceServer("stun:stun.1.google.com:19302")])

    user_connection = RTCPeerConnection(configuration=config)
    control_data_channel = user_connection.createDataChannel("control_data_channel")
    offer = await user_connection.createOffer()
    await user_connection.setLocalDescription(offer)
    print("RTCPeerConnection object is created")

    await websocket.send(json.dumps({"type":"offer", "name": "s1", "offer": user_connection.localDescription.sdp}))
    async for message in websocket:
        data = json.loads(message)
        print("sendoffer handler")
        print(data)
        await startgame(index)


async def findrobot(index):
    global websocket
    global user_connection
    global offer
    logging.info("Thread    : findrobot %d.", index)
    await websocket.send(json.dumps({"type":"find-robot"}))
    async for message in websocket:
        data = json.loads(message)
        print("findrobot handler")
        print(data)
        if(data['type'] != 'update-queue'):
            await sendoffer(index)
        

async def connect_to_signalling_server(index):
    global websocket
    global websocket
    global websocket
    global user_connection

    signalling_server_uri = "ws://localhost:49621"
    login_message = {"type": "user-login", "name": str(random.randint(0,1000)) }
    websocket = await websockets.connect(signalling_server_uri)
    print("Connected to server")
    await websocket.send(json.dumps(login_message))
    await websocket.send(json.dumps({"type":"find-robot"}))

    
    async for message in websocket:
        data = json.loads(message)
        print(data)
        if(data['type'] == 'request-offer'):
            await sendoffer(index)
        

def between_callback(index):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    loop.run_until_complete(connect_to_signalling_server(index))
    loop.close()
    


  


if __name__ == "__main__":
    format = "%(asctime)s: %(message)s"
    logging.basicConfig(format=format, level=logging.INFO,
                        datefmt="%H:%M:%S")

    threads = list()
    for index in range(4):
        logging.info("Main    : create and start thread %d.", index)
        x = Process(target=between_callback, args=(index,), daemon=True)
        threads.append(x)
        x.start()

    for index, thread in enumerate(threads):
        logging.info("Main    : before joining thread %d.", index)
        thread.join()
        logging.info("Main    : thread %d done", index)
