import React, { useState } from 'react';
import './GameLobby.css';

function GameLobby({ onCreateGame, onJoinGame, error }) {
  const [playerName, setPlayerName] = useState('');
  const [roomName, setRoomName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const validateRoomName = (name) => {
    // Must be 4-8 uppercase letters
    return /^[A-Z]{4,8}$/.test(name);
  };

  const handleNewGame = async () => {
    // Validate name
    if (!playerName.trim()) {
      alert('Please enter your name');
      return;
    }
    
    // Validate room name
    if (!roomName.trim()) {
      alert('Please enter a room name');
      return;
    }
    
    const upperRoomName = roomName.toUpperCase();
    if (!validateRoomName(upperRoomName)) {
      alert('Room name must be 4-8 letters (A-Z only)');
      return;
    }
    
    setIsLoading(true);
    const success = await onCreateGame(upperRoomName, playerName);
    setIsLoading(false);
    
    if (!success) {
      // Error will be shown via error prop
    }
  };

  const handleJoinGame = async () => {
    // Validate name
    if (!playerName.trim()) {
      alert('Please enter your name');
      return;
    }
    
    // Validate room name
    if (!roomName.trim()) {
      alert('Please enter a room name');
      return;
    }
    
    const upperRoomName = roomName.toUpperCase();
    if (!validateRoomName(upperRoomName)) {
      alert('Room name must be 4-8 letters (A-Z only)');
      return;
    }
    
    setIsLoading(true);
    const success = await onJoinGame(upperRoomName, playerName);
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
        
        <div className="input-section">
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

        <div className="input-section">
          <label>Room Name:</label>
          <input
            type="text"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value.toUpperCase())}
            placeholder="4-8 letters"
            maxLength={8}
            disabled={isLoading}
          />
          <p className="helper-text">4-8 letters (e.g., JOESIG)</p>
        </div>

        <div className="button-section">
          <button 
            className="new-game-button"
            onClick={handleNewGame}
            disabled={!playerName.trim() || !roomName.trim() || isLoading}
          >
            {isLoading ? 'Creating...' : 'New Game'}
          </button>
          
          <button 
            className="join-game-button"
            onClick={handleJoinGame}
            disabled={!playerName.trim() || !roomName.trim() || isLoading}
          >
            {isLoading ? 'Joining...' : 'Join Game'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default GameLobby;
