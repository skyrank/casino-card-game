import React, { useState, useEffect, useCallback } from 'react';
import './App.css';
import Game from './Game';
import GameLobby from './GameLobby';
import WaitingRoom from './WaitingRoom';
import { database } from './firebase';
import { ref, set, onValue, update, remove, get } from 'firebase/database';

function App() {
  const [gamePhase, setGamePhase] = useState('lobby'); // 'lobby', 'waiting', 'playing'
  const [roomCode, setRoomCode] = useState(null);
  const [playerName, setPlayerName] = useState('');
  const [playerRole, setPlayerRole] = useState(null); // 'player1' or 'player2'
  const [opponentName, setOpponentName] = useState('');
  const [error, setError] = useState(null);

  // Handle leaving the game - wrapped in useCallback to prevent recreation
  const handleLeaveGame = useCallback(async () => {
    if (roomCode) {
      try {
        const gameRef = ref(database, `casino-games/${roomCode}`);
        await remove(gameRef);
      } catch (err) {
        console.error('Error leaving game:', err);
      }
    }
    
    localStorage.removeItem('casinoGame');
    setGamePhase('lobby');
    setRoomCode(null);
    setPlayerRole(null);
    setPlayerName('');
    setOpponentName('');
    setError(null);
  }, [roomCode]);

  // Listen to game state changes
  useEffect(() => {
    if (!roomCode) return;

    const gameRef = ref(database, `casino-games/${roomCode}`);
    
    const unsubscribe = onValue(gameRef, (snapshot) => {
      const data = snapshot.val();
      
      if (!data) {
        // Game was deleted
        console.log('Game deleted, returning to lobby');
        handleLeaveGame();
        return;
      }

      // Update opponent name
      const oppRole = playerRole === 'player1' ? 'player2' : 'player1';
      if (data.players?.[oppRole]) {
        setOpponentName(data.players[oppRole].name);
      }

      // Update game phase based on status
      if (data.status === 'waiting' && playerRole === 'player1') {
        setGamePhase('waiting');
      } else if (data.status === 'playing') {
        // Transition to playing when status changes, regardless of gameState
        // gameState will be initialized by Player 1 once both players are in
        setGamePhase('playing');
      }
    });

    return () => unsubscribe();
  }, [roomCode, playerRole, handleLeaveGame]);

  // Handle creating a new game
  const handleCreateGame = async (code, name) => {
    try {
      setError(null);
      const gameRef = ref(database, `casino-games/${code}`);
      
      // Check if game already exists
      const snapshot = await get(gameRef);
      if (snapshot.exists()) {
        setError('Room name already exists. Use "Join Game" to enter, or choose a different room name.');
        return false;
      }

      // Create new game
      await set(gameRef, {
        roomCode: code,
        status: 'waiting',
        createdAt: Date.now(),
        players: {
          player1: {
            name: name,
            joinedAt: Date.now(),
            connected: true
          }
        }
      });
      
      setRoomCode(code);
      setPlayerName(name);
      setPlayerRole('player1');
      setGamePhase('waiting');

      // Save to localStorage for reconnection
      localStorage.setItem('casinoGame', JSON.stringify({
        roomCode: code,
        playerName: name,
        playerRole: 'player1'
      }));

      return true;
    } catch (err) {
      console.error('Error creating game:', err);
      setError('Failed to create game. Please try again.');
      return false;
    }
  };

  // Handle joining an existing game
  const handleJoinGame = async (code, name) => {
    try {
      setError(null);
      const gameRef = ref(database, `casino-games/${code}`);
      
      // Check if game exists
      const snapshot = await get(gameRef);
      if (!snapshot.exists()) {
        setError('Room not found. Check the room name or click "New Game" to create it.');
        return false;
      }

      const gameData = snapshot.val();

      // Check if player name matches Player 1 - allow rejoin
      if (gameData.players?.player1?.name === name) {
        setRoomCode(code);
        setPlayerName(name);
        setPlayerRole('player1');
        
        // Get opponent name if exists
        if (gameData.players?.player2) {
          setOpponentName(gameData.players.player2.name);
        }
        
        // Set phase based on game status
        if (gameData.status === 'waiting') {
          setGamePhase('waiting');
        } else if (gameData.status === 'playing') {
          setGamePhase('playing');
        }

        // Save to localStorage
        localStorage.setItem('casinoGame', JSON.stringify({
          roomCode: code,
          playerName: name,
          playerRole: 'player1'
        }));

        return true;
      }

      // Check if player name matches Player 2 - allow rejoin
      if (gameData.players?.player2?.name === name) {
        setRoomCode(code);
        setPlayerName(name);
        setPlayerRole('player2');
        setOpponentName(gameData.players.player1.name);
        setGamePhase('playing');

        // Save to localStorage
        localStorage.setItem('casinoGame', JSON.stringify({
          roomCode: code,
          playerName: name,
          playerRole: 'player2'
        }));

        return true;
      }

      // Name doesn't match either player - check if game is full
      if (gameData.players?.player2) {
        setError('Game in progress. Choose a different room.');
        return false;
      }

      // Check if game already started (shouldn't happen if player2 doesn't exist, but safety check)
      if (gameData.status !== 'waiting') {
        setError('This game has already started.');
        return false;
      }

      // Join as new Player 2
      await update(gameRef, {
        'players/player2': {
          name: name,
          joinedAt: Date.now(),
          connected: true
        },
        status: 'playing'  // Start the game when player 2 joins
      });
      
      setRoomCode(code);
      setPlayerName(name);
      setPlayerRole('player2');
      setOpponentName(gameData.players.player1.name);
      setGamePhase('playing');

      // Save to localStorage for reconnection
      localStorage.setItem('casinoGame', JSON.stringify({
        roomCode: code,
        playerName: name,
        playerRole: 'player2'
      }));

      return true;
    } catch (err) {
      console.error('Error joining game:', err);
      setError('Failed to join game. Please try again.');
      return false;
    }
  };

  // Handle playing against AI
  const handlePlayAI = async (code, name) => {
    try {
      setError(null);
      const gameRef = ref(database, `casino-games/${code}`);
      
      // Create AI game - start immediately with AI as player2
      await set(gameRef, {
        roomCode: code,
        status: 'playing',
        isAiGame: true,  // Flag to indicate this is an AI game
        createdAt: Date.now(),
        players: {
          player1: {
            name: name,
            joinedAt: Date.now(),
            connected: true
          },
          player2: {
            name: 'AI Opponent',
            joinedAt: Date.now(),
            connected: true,
            isAI: true
          }
        }
      });
      
      setRoomCode(code);
      setPlayerName(name);
      setPlayerRole('player1');
      setOpponentName('AI Opponent');
      setGamePhase('playing');

      // Save to localStorage
      localStorage.setItem('casinoGame', JSON.stringify({
        roomCode: code,
        playerName: name,
        playerRole: 'player1',
        isAiGame: true
      }));

      return true;
    } catch (err) {
      console.error('Error creating AI game:', err);
      setError('Failed to create AI game. Please try again.');
      return false;
    }
  };

  // Try to reconnect on page load
  useEffect(() => {
    const savedGame = localStorage.getItem('casinoGame');
    if (savedGame) {
      try {
        const { roomCode: savedCode, playerName: savedName, playerRole: savedRole } = JSON.parse(savedGame);
        
        // Verify game still exists
        const gameRef = ref(database, `casino-games/${savedCode}`);
        get(gameRef).then(snapshot => {
          if (snapshot.exists()) {
            setRoomCode(savedCode);
            setPlayerName(savedName);
            setPlayerRole(savedRole);
            
            const gameData = snapshot.val();
            const oppRole = savedRole === 'player1' ? 'player2' : 'player1';
            if (gameData.players?.[oppRole]) {
              setOpponentName(gameData.players[oppRole].name);
            }
            
            // Set appropriate phase
            if (gameData.status === 'waiting') {
              setGamePhase('waiting');
            } else if (gameData.status === 'playing') {
              setGamePhase('playing');
            }
          } else {
            localStorage.removeItem('casinoGame');
          }
        });
      } catch (err) {
        console.error('Error reconnecting:', err);
        localStorage.removeItem('casinoGame');
      }
    }
  }, []);

  return (
    <div className="App">
      {gamePhase === 'lobby' && (
        <GameLobby 
          onCreateGame={handleCreateGame}
          onJoinGame={handleJoinGame}
          onPlayAI={handlePlayAI}
          error={error}
        />
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
          opponentName={opponentName}
          onLeaveGame={handleLeaveGame}
        />
      )}
    </div>
  );
}

export default App;
