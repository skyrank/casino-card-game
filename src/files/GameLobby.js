import React, { useState } from 'react';
import './GameLobby.css';

function GameLobby({ onJoinGame }) {
  const [roomCode, setRoomCode] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const generateRoomCode = () => {
    // Generate a 6-character room code
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing chars like 0, O, 1, I
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  const handleCreateGame = () => {
    if (!playerName.trim()) {
      alert('Please enter your name');
      return;
    }
    const newRoomCode = generateRoomCode();
    onJoinGame(newRoomCode, playerName, 'player1');
  };

  const handleJoinGame = () => {
    if (!playerName.trim()) {
      alert('Please enter your name');
      return;
    }
    if (!roomCode.trim()) {
      alert('Please enter a room code');
      return;
    }
    onJoinGame(roomCode.toUpperCase(), playerName, 'player2');
  };

  return (
    <div className="lobby-container">
      <div className="lobby-card">
        <h1>🎴 Casino Card Game</h1>
        
        <div className="name-input-section">
          <label>Your Name:</label>
          <input
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Enter your name"
            maxLength={20}
          />
        </div>

        <div className="lobby-options">
          <div className="option-section">
            <button 
              className="create-button"
              onClick={handleCreateGame}
              disabled={!playerName.trim()}
            >
              Create New Game
            </button>
            <p className="helper-text">Start a new game and share the code with your opponent</p>
          </div>

          <div className="divider">OR</div>

          <div className="option-section">
            <label>Room Code:</label>
            <input
              type="text"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              placeholder="Enter 6-digit code"
              maxLength={6}
            />
            <button 
              className="join-button"
              onClick={handleJoinGame}
              disabled={!playerName.trim() || !roomCode.trim()}
            >
              Join Game
            </button>
            <p className="helper-text">Enter the code shared by your opponent</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default GameLobby;
