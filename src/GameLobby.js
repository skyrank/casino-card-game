import React, { useState } from 'react';
import './GameLobby.css';

function GameLobby({ onCreateGame, onJoinGame, error }) {
  const [roomCode, setRoomCode] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const generateRoomCode = () => {
    // Generate a 6-character room code
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing chars like 0, O, 1, I
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  const handleCreateGame = async () => {
    if (!playerName.trim()) {
      alert('Please enter your name');
      return;
    }
    
    setIsLoading(true);
    const newRoomCode = generateRoomCode();
    const success = await onCreateGame(newRoomCode, playerName);
    setIsLoading(false);
    
    if (!success) {
      // Error will be shown via error prop
    }
  };

  const handleJoinGame = async () => {
    if (!playerName.trim()) {
      alert('Please enter your name');
      return;
    }
    if (!roomCode.trim()) {
      alert('Please enter a room code');
      return;
    }
    
    setIsLoading(true);
    const success = await onJoinGame(roomCode.toUpperCase(), playerName);
    setIsLoading(false);
    
    if (!success) {
      // Error will be shown via error prop
    }
  };

  return (
    <div className="lobby-container">
      <div className="lobby-card">
        <h1>🎴 Casino Card Game</h1>
        
        {error && (
          <div className="error-message">
            {error}
          </div>
        )}
        
        <div className="name-input-section">
          <label>Your Name:</label>
          <input
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Enter your name"
            maxLength={20}
            disabled={isLoading}
          />
        </div>

        <div className="lobby-options">
          <div className="option-section">
            <button 
              className="create-button"
              onClick={handleCreateGame}
              disabled={!playerName.trim() || isLoading}
            >
              {isLoading ? 'Creating...' : 'Create New Game'}
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
              disabled={isLoading}
            />
            <button 
              className="join-button"
              onClick={handleJoinGame}
              disabled={!playerName.trim() || !roomCode.trim() || isLoading}
            >
              {isLoading ? 'Joining...' : 'Join Game'}
            </button>
            <p className="helper-text">Enter the code shared by your opponent</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default GameLobby;
