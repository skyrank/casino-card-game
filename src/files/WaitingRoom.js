import React from 'react';
import './WaitingRoom.css';

function WaitingRoom({ roomCode, playerName, onLeaveGame }) {
  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomCode);
    alert('Room code copied to clipboard!');
  };

  return (
    <div className="waiting-container">
      <div className="waiting-card">
        <h1>🎴 Waiting for Opponent...</h1>
        
        <div className="room-code-display">
          <p>Share this code with your opponent:</p>
          <div className="code-box" onClick={copyRoomCode}>
            <span className="code">{roomCode}</span>
            <span className="copy-hint">Click to copy</span>
          </div>
        </div>

        <div className="player-info">
          <p>You are: <strong>{playerName}</strong></p>
          <p>Playing as: <strong>Player 1</strong></p>
        </div>

        <div className="loading-animation">
          <div className="dot"></div>
          <div className="dot"></div>
          <div className="dot"></div>
        </div>

        <button className="leave-button" onClick={onLeaveGame}>
          Leave Game
        </button>
      </div>
    </div>
  );
}

export default WaitingRoom;
