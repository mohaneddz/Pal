# WebSocket Server for Pal - Frontend/Backend Communication
# pip install websockets

import asyncio
import json
import websockets
from typing import Set, Dict, Any
import threading
import queue

# Import existing modules
from stt import initialize_stt, get_continuous_listener, transcribe_audio
from tts import initialize_tts, play_tts
from llm import send_message
import numpy as np

# Connected clients
connected_clients: Set[websockets.WebSocketServerProtocol] = set()

# Message queue for async communication
message_queue = queue.Queue()

class PalWebSocketServer:
    def __init__(self):
        self.continuous_listener = None
        self.is_listening = False
        self.current_client = None
        
    async def send_to_client(self, client: websockets.WebSocketServerProtocol, event: str, data: Any = None):
        """Send message to a specific client"""
        try:
            message = json.dumps({"event": event, "data": data})
            await client.send(message)
        except Exception as e:
            print(f"[WebSocket] Error sending to client: {e}")
    
    async def broadcast(self, event: str, data: Any = None):
        """Broadcast message to all connected clients"""
        if connected_clients:
            message = json.dumps({"event": event, "data": data})
            await asyncio.gather(
                *[client.send(message) for client in connected_clients],
                return_exceptions=True
            )
    
    async def handle_stt_start(self, client):
        """Handle STT start request"""
        print("[WebSocket] Starting STT...")
        await self.send_to_client(client, "stt_listening_started")
        
        # Initialize continuous listener if not already done
        if not self.continuous_listener:
            self.continuous_listener = get_continuous_listener()
            self.continuous_listener.start()
        
        self.is_listening = True
        self.current_client = client
        
        # Start listening in background
        asyncio.create_task(self.listen_and_transcribe(client))
    
    async def listen_and_transcribe(self, client):
        """Listen for audio and transcribe"""
        try:
            # Simulate audio level updates (in real implementation, get from listener)
            for _ in range(50):  # Simulate listening for a few seconds
                if not self.is_listening:
                    break
                    
                # Send fake audio level for demonstration
                audio_level = np.random.random() * 0.5
                await self.send_to_client(client, "stt_audio_level", {"level": audio_level})
                await asyncio.sleep(0.1)
            
            # In real implementation, get actual audio and transcribe
            # For now, simulate transcription
            if self.is_listening:
                # This would be replaced with actual transcription
                await self.send_to_client(client, "stt_transcript_partial", {"text": "Listening..."})
                
        except Exception as e:
            print(f"[WebSocket] Error in listen_and_transcribe: {e}")
            await self.send_to_client(client, "stt_error", {"error": str(e)})
    
    async def handle_stt_stop(self, client):
        """Handle STT stop request"""
        print("[WebSocket] Stopping STT...")
        self.is_listening = False
        
        # Simulate getting final transcript
        # In real implementation, this would come from the actual STT
        final_text = "Hello, how are you?"
        
        await self.send_to_client(client, "stt_transcript_final", {"text": final_text})
        await self.send_to_client(client, "conversation_user_message", {"text": final_text})
        
        # Get LLM response
        asyncio.create_task(self.handle_llm_response(client, final_text))
    
    async def handle_llm_response(self, client, user_message: str):
        """Get LLM response and trigger TTS"""
        try:
            # Get response from LLM (this is blocking, should be in thread pool)
            response = await asyncio.to_thread(send_message, user_message)
            
            # Send to client
            await self.send_to_client(client, "conversation_assistant_message", {"text": response})
            
            # Trigger TTS
            await self.handle_tts_speak(client, response)
            
        except Exception as e:
            print(f"[WebSocket] Error in LLM response: {e}")
    
    async def handle_tts_speak(self, client, text: str):
        """Handle TTS speak request"""
        try:
            await self.send_to_client(client, "tts_started")
            
            # Play TTS (blocking, should be in thread pool)
            duration = await asyncio.to_thread(play_tts, text)
            
            await self.send_to_client(client, "tts_finished")
            
        except Exception as e:
            print(f"[WebSocket] Error in TTS: {e}")
            await self.send_to_client(client, "tts_error", {"error": str(e)})
    
    async def handle_tts_stop(self, client):
        """Handle TTS stop request"""
        # TODO: Implement TTS interruption
        print("[WebSocket] TTS stop requested")
    
    async def handle_message(self, client: websockets.WebSocketServerProtocol, message: str):
        """Handle incoming WebSocket message"""
        try:
            data = json.loads(message)
            event = data.get("event")
            payload = data.get("data", {})
            
            print(f"[WebSocket] Received event: {event}")
            
            if event == "stt_start":
                await self.handle_stt_start(client)
            elif event == "stt_stop":
                await self.handle_stt_stop(client)
            elif event == "tts_speak":
                await self.handle_tts_speak(client, payload.get("text", ""))
            elif event == "tts_stop":
                await self.handle_tts_stop(client)
            else:
                print(f"[WebSocket] Unknown event: {event}")
                
        except json.JSONDecodeError:
            print(f"[WebSocket] Invalid JSON: {message}")
        except Exception as e:
            print(f"[WebSocket] Error handling message: {e}")
    
    async def handle_client(self, websocket: websockets.WebSocketServerProtocol, path: str):
        """Handle a WebSocket client connection"""
        connected_clients.add(websocket)
        print(f"[WebSocket] Client connected. Total clients: {len(connected_clients)}")
        
        try:
            async for message in websocket:
                await self.handle_message(websocket, message)
        except websockets.exceptions.ConnectionClosed:
            print("[WebSocket] Client disconnected")
        finally:
            connected_clients.remove(websocket)
            print(f"[WebSocket] Client removed. Total clients: {len(connected_clients)}")
    
    async def start_server(self, host: str = "localhost", port: int = 8765):
        """Start the WebSocket server"""
        print(f"[WebSocket] Starting server on ws://{host}:{port}")
        
        # Initialize TTS and STT
        print("[WebSocket] Initializing TTS...")
        initialize_tts()
        print("[WebSocket] Initializing STT...")
        initialize_stt()
        
        async with websockets.serve(self.handle_client, host, port):
            print(f"[WebSocket] Server running on ws://{host}:{port}")
            await asyncio.Future()  # Run forever

def main():
    server = PalWebSocketServer()
    asyncio.run(server.start_server())

if __name__ == "__main__":
    main()
