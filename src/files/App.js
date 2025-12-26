import React, { useState, useEffect } from 'react';
import './App.css';
import Game from './Game';
import GameLobby from './GameLobby';
import WaitingRoom from './WaitingRoom';
import { database } from './firebase';
import { ref, set, onValue, update, remove } from 'firebase/database';

function App() {
  const [gamePhase, setGamePhase] = useState('lobby'); // 'lobby', 'waiting', 'playing'
  const [roomCode, setRoomCode] = useState(null);
  const [playerName, setPlayerName] = useState('');
  const [playerRole, setPlayerRole] = useState(null); // 'player1' or 'player2'
  const [gameData, setGameData] = useState(null);

  useEffect(() => {
    if (!roomCode) return;

    const gameRef = ref(database, `casino-games/${roomCode}`);
    
    const unsubscribe = onValue(gameRef, (snapshot) => {
      const data = snapshot.val();
      
      if (!data) {
        // Game was deleted, go back to lobby
        setGamePhase('lobby');
        setRoomCode(null);
        setPlayerRole(null);
        return;
      }

      setGameData(data);

      // Check if both players have joined
      if (data.players?.player1 && data.players?.player2) {
        setGamePhase('playing');
      } else if (playerRole === 'player1') {
        setGamePhase('waiting');
      }
    });

    return () => unsubscribe();
  }, [roomCode, playerRole]);

  const handleJoinGame = async (code, name, role) => {
    const gameRef = ref(database, `casino-games/${code}`);
    
    if (role === 'player1') {
      // Create new game
      await set(gameRef, {
        roomCode: code,
        status: 'waiting',
        createdAt: Date.now(),
        players: {
          player1: {
            name: name,
            joinedAt: Date.now()
          }
        }
      });
      
      setRoomCode(code);
      setPlayerName(name);
      setPlayerRole('player1');
      setGamePhase('waiting');
    } else {
      // Join existing game
      const snapshot = await new Promise((resolve) => {
        onValue(gameRef, resolve, { onlyOnce: true });
      });
      
      const existingGame = snapshot.val();
      
      if (!existingGame) {
        alert('Game not found! Please check the room code.');
        return;
      }
      
      if (existingGame.players?.player2) {
        alert('This game is full!');
        return;
      }
      
      await update(gameRef, {
        'players/player2': {
          name: name,
          joinedAt: Date.now()
        },
        status: 'playing'
      });
      
      setRoomCode(code);
      setPlayerName(name);
      setPlayerRole('player2');
      setGamePhase('playing');
    }

    // Store in localStorage for reconnection
    localStorage.setItem('casinoGame', JSON.stringify({
      roomCode: code,
      playerName: name,
      playerRole: role
    }));
  };

  const handleLeaveGame = async () => {
    if (roomCode) {
      const gameRef = ref(database, `casino-games/${roomCode}`);
      await remove(gameRef);
    }
    
    localStorage.removeItem('casinoGame');
    setGamePhase('lobby');
    setRoomCode(null);
    setPlayerRole(null);
    setGameData(null);
  };

  // Try to reconnect on page load
  useEffect(() => {
    const savedGame = localStorage.getItem('casinoGame');
    if (savedGame) {
      const { roomCode: savedCode, playerName: savedName, playerRole: savedRole } = JSON.parse(savedGame);
      
      // Check if game still exists
      const gameRef = ref(database, `casino-games/${savedCode}`);
      onValue(gameRef, (snapshot) => {
        if (snapshot.exists()) {
          setRoomCode(savedCode);
          setPlayerName(savedName);
          setPlayerRole(savedRole);
        } else {
          localStorage.removeItem('casinoGame');
        }
      }, { onlyOnce: true });
    }
  }, []);

  return (
    <div className="App">
      {gamePhase === 'lobby' && (
        <GameLobby onJoinGame={handleJoinGame} />
      )}
      
      {gamePhase === 'waiting' && (
        <WaitingRoom 
          roomCode={roomCode} 
          playerName={playerName}
          onLeaveGame={handleLeaveGame}
        />
      )}
      
      {gamePhase === 'playing' && (
        <Game 
          roomCode={roomCode}
          playerRole={playerRole}
          playerName={playerName}
          opponentName={playerRole === 'player1' ? gameData?.players?.player2?.name : gameData?.players?.player1?.name}
          onLeaveGame={handleLeaveGame}
        />
      )}
    </div>
  );
}

export default App;
