import React, { useState, useEffect } from 'react';
import Card from './Card';
import { createDeck, shuffleDeck, dealInitialCards, dealNextRound, calculateScore } from './gameUtils';
import './Game.css';
import { database } from './firebase';
import { ref, set, onValue, update } from 'firebase/database';

function Game({ roomCode, playerRole, playerName, opponentName, onLeaveGame }) {
  const [gameState, setGameState] = useState(null);
  const [selectedCard, setSelectedCard] = useState(null);
  const [message, setMessage] = useState('');
  const [selectedTableCards, setSelectedTableCards] = useState([]);
  const [isDealing, setIsDealing] = useState(false);  // Prevent duplicate deals

  // Listen to Firebase for game state changes
  useEffect(() => {
    if (!roomCode) return;

    const gameStateRef = ref(database, `casino-games/${roomCode}/gameState`);
    
    const unsubscribe = onValue(gameStateRef, (snapshot) => {
      const data = snapshot.val();
      
      if (data) {
        setGameState(data);
        
        // Update message based on turn
        if (data.currentTurn === playerRole) {
          setMessage("Your turn! Select a card from your hand.");
        } else {
          setMessage(`${opponentName}'s turn...`);
        }
      }
    });

    return () => unsubscribe();
  }, [roomCode, playerRole, opponentName]);

  // Initialize game (only Player 1)
  useEffect(() => {
    if (!roomCode || playerRole !== 'player1') return;

    const gameStateRef = ref(database, `casino-games/${roomCode}/gameState`);
    
    // Check if game state already exists
    onValue(gameStateRef, (snapshot) => {
      if (!snapshot.exists()) {
        // Player 1 creates the initial game
        startNewGame();
      }
    }, { onlyOnce: true });
  }, [roomCode, playerRole]);

  // STEP 3: Monitor Firebase gameState and trigger dealing when both hands empty
  useEffect(() => {
    if (!gameState || playerRole !== 'player1' || isDealing) return;

    const player1Hand = gameState.player1Hand || [];
    const player2Hand = gameState.player2Hand || [];

    // Check if both hands are empty and deck has cards
    if (player1Hand.length === 0 && player2Hand.length === 0 && gameState.deck && gameState.deck.length > 0) {
      console.log('Both hands empty detected in Firebase - triggering deal');
      setIsDealing(true);
      setTimeout(() => {
        checkForNextDeal();
        setIsDealing(false);
      }, 1500);
    }
    // Check if both hands empty and deck is empty - end round
    else if (player1Hand.length === 0 && player2Hand.length === 0 && (!gameState.deck || gameState.deck.length === 0)) {
      console.log('Both hands and deck empty - ending round');
      setIsDealing(true);
      setTimeout(() => {
        checkForNextDeal();
        setIsDealing(false);
      }, 1500);
    }
  }, [gameState?.player1Hand?.length, gameState?.player2Hand?.length, gameState?.deck?.length, playerRole, isDealing]);

  async function startNewGame() {
    const deck = shuffleDeck(createDeck());
    const { player1Hand, player2Hand, tableCards, deck: remainingDeck } = dealInitialCards(deck);

    const initialState = {
      deck: remainingDeck,
      player1Hand,
      player2Hand,
      tableCards,
      player1Captured: [],
      player2Captured: [],
      currentTurn: 'player2',  // Player 2 goes first (non-dealer)
      currentDealer: 'player1', // Player 1 is first dealer
      roundNumber: 1,
      player1Score: 0,
      player2Score: 0,
      lastCapture: null,
      builds: []
    };

    const gameStateRef = ref(database, `casino-games/${roomCode}/gameState`);
    await set(gameStateRef, initialState);
  }

  function handleCardClick(card, source, index) {
    if (!gameState) return;

    // Only allow current player to select their cards
    if (gameState.currentTurn !== playerRole) {
      setMessage("It's not your turn!");
      return;
    }

    if (source === 'player1Hand' && playerRole !== 'player1') return;
    if (source === 'player2Hand' && playerRole !== 'player2') return;

    setSelectedCard({ card, source, index });
    setSelectedTableCards([]); // Clear table card selections when selecting new hand card
    setMessage(`Selected ${getCardName(card)}. Click table cards to capture, or click "Trail" to play without capturing.`);
  }

  function handleTableCardClick(tableCard, tableIndex) {
    if (!selectedCard) {
      setMessage('Select a card from your hand first!');
      return;
    }

    if (gameState.currentTurn !== playerRole) {
      setMessage("It's not your turn!");
      return;
    }

    // Toggle table card selection
    const isSelected = selectedTableCards.some(tc => tc.index === tableIndex);

    if (isSelected) {
      setSelectedTableCards(selectedTableCards.filter(tc => tc.index !== tableIndex));
      setMessage('Card deselected. Select table cards then click Capture or Build.');
    } else {
      setSelectedTableCards([...selectedTableCards, { card: tableCard, index: tableIndex }]);
      setMessage('Card selected. Select more cards or click Capture/Build.');
    }
  }

  async function handleCapture() {
    if (!selectedCard) {
      setMessage('Select a hand card first!');
      return;
    }

    if (gameState.currentTurn !== playerRole) {
      setMessage("It's not your turn!");
      return;
    }

    const { card: playedCard, index: handIndex} = selectedCard;

    // Find all valid table card combinations that can be captured
    const tableCards = gameState.tableCards || [];
    const validCombos = findCapturableCombinations(tableCards, playedCard.rank);

    // Check if any selected table cards match a valid combination
    const selectedIndices = selectedTableCards.map(tc => tc.index).sort();
    
    let matchingCombo = null;
    if (selectedIndices.length > 0) {
      matchingCombo = validCombos.find(combo => {
        const comboIndices = combo.indices.sort();
        return JSON.stringify(comboIndices) === JSON.stringify(selectedIndices);
      });
    }

    if (matchingCombo) {
      // Valid capture
      await captureCards(selectedIndices);
      setSelectedTableCards([]);
    } else if (selectedIndices.length === 0) {
      // No cards selected - show available captures
      if (validCombos.length > 0) {
        setMessage(`Available captures: ${validCombos.map(c => c.description).join(', ')}`);
      } else {
        setMessage('No valid captures available. Trail instead?');
      }
    } else {
      setMessage('Invalid capture combination! Try different cards.');
    }
  }

  function findCapturableCombinations(tableCards, playedRank) {
    const combinations = [];
    
    // 1. Pairing - exact rank match
    tableCards.forEach((card, index) => {
      if (card.rank === playedRank) {
        combinations.push({
          type: 'pair',
          indices: [index],
          cards: [card],
          description: getCardName(card)
        });
      }
    });

    // 2. Combining - multiple cards that sum to playedRank
    const n = tableCards.length;
    for (let mask = 1; mask < (1 << n); mask++) {
      const subset = [];
      const indices = [];
      
      for (let i = 0; i < n; i++) {
        if (mask & (1 << i)) {
          subset.push(tableCards[i]);
          indices.push(i);
        }
      }
      
      if (subset.length > 1) {
        const sum = subset.reduce((acc, card) => acc + card.rank, 0);
        if (sum === playedRank) {
          combinations.push({
            type: 'combine',
            indices,
            cards: subset,
            description: subset.map(c => getCardName(c)).join(' + ')
          });
        }
      }
    }

    // 3. Capturing builds
    if (gameState.builds && Array.isArray(gameState.builds) && gameState.builds.length > 0) {
      gameState.builds.forEach((build, buildIndex) => {
        if (build.value === playedRank) {
          combinations.push({
            type: 'build',
            buildIndex,
            description: `Build of ${build.value}`
          });
        }
      });
    }

    return combinations;
  }

  async function captureCards(tableIndices) {
    console.log('=== CAPTURE CARDS DEBUG ===');
    console.log('tableIndices:', tableIndices);
    console.log('selectedCard:', selectedCard);
    console.log('playerRole:', playerRole);
    console.log('gameState.player1Hand:', gameState?.player1Hand);
    console.log('gameState.player2Hand:', gameState?.player2Hand);
    console.log('gameState.tableCards:', gameState?.tableCards);
    console.log('gameState.player1Captured:', gameState?.player1Captured);
    console.log('gameState.player2Captured:', gameState?.player2Captured);
    
    if (!selectedCard || !selectedCard.card) {
      console.error('No selected card!');
      setMessage('Error: No card selected');
      return;
    }
    
    const { card: playedCard, index: handIndex } = selectedCard;
    
    // Get hand safely
    const handKey = `${playerRole}Hand`;
    const currentHand = gameState?.[handKey];
    
    if (!currentHand || !Array.isArray(currentHand)) {
      console.error('Invalid hand:', handKey, currentHand);
      setMessage('Error: Invalid hand state');
      return;
    }
    
    const newHand = currentHand.filter((_, idx) => idx !== handIndex);
    
    // Get table cards safely
    const tableCards = gameState?.tableCards;
    
    if (!tableCards || !Array.isArray(tableCards)) {
      console.error('Invalid table cards:', tableCards);
      setMessage('Error: Invalid table state');
      return;
    }
    
    // Capture cards from table
    const capturedTableCards = [];
    for (const idx of tableIndices) {
      if (tableCards[idx]) {
        capturedTableCards.push(tableCards[idx]);
      }
    }
    
    const newTableCards = tableCards.filter((_, idx) => !tableIndices.includes(idx));
    
    // Get captured pile safely
    const capturedKey = `${playerRole}Captured`;
    const currentCaptured = gameState?.[capturedKey];
    const safeCaptured = Array.isArray(currentCaptured) ? currentCaptured : [];
    
    // Build new captured array
    const newCaptured = [...safeCaptured, playedCard, ...capturedTableCards];
    
    console.log('newHand:', newHand);
    console.log('newTableCards:', newTableCards);
    console.log('newCaptured:', newCaptured);
    
    // Switch turn
    const nextTurn = gameState.currentTurn === 'player1' ? 'player2' : 'player1';
    
    const updates = {
      [handKey]: newHand,
      tableCards: newTableCards,
      [capturedKey]: newCaptured,
      currentTurn: nextTurn,
      lastCapture: playerRole
    };
    
    console.log('Sending updates:', updates);
    
    try {
      const gameStateRef = ref(database, `casino-games/${roomCode}/gameState`);
      await update(gameStateRef, updates);
      
      setSelectedCard(null);
      setSelectedTableCards([]);
      setMessage(`You captured ${capturedTableCards.length + 1} card(s)!`);
    } catch (error) {
      console.error('Firebase update error:', error);
      setMessage('Error updating game. Please try again.');
    }
  }

  async function handleTrail() {
    if (!selectedCard) {
      setMessage('Select a card from your hand first!');
      return;
    }

    if (gameState.currentTurn !== playerRole) {
      setMessage("It's not your turn!");
      return;
    }

    const { card: playedCard, index: handIndex } = selectedCard;

    // Remove from hand, add to table
    const handKey = `${playerRole}Hand`;
    const newHand = [...gameState[handKey]];
    newHand.splice(handIndex, 1);

    const newTableCards = [...gameState.tableCards, playedCard];

    // Switch turn
    const nextTurn = gameState.currentTurn === 'player1' ? 'player2' : 'player1';

    const updates = {
      [handKey]: newHand,
      tableCards: newTableCards,
      currentTurn: nextTurn
    };

    const gameStateRef = ref(database, `casino-games/${roomCode}/gameState`);
    await update(gameStateRef, updates);

    setSelectedCard(null);
    
    // Removed immediate check - useEffect will handle dealing when Firebase syncs
  }

  async function handleBuild() {
    if (!selectedCard) {
      setMessage('Select a hand card first!');
      return;
    }

    if (gameState.currentTurn !== playerRole) {
      setMessage("It's not your turn!");
      return;
    }

    if (selectedTableCards.length === 0) {
      setMessage('Select table cards to build with!');
      return;
    }

    const { card: playedCard, index: handIndex } = selectedCard;
    const selectedCards = selectedTableCards.map(tc => tc.card);
    const totalValue = playedCard.rank + selectedCards.reduce((sum, c) => sum + c.rank, 0);

    // Create build
    const newBuild = {
      value: totalValue,
      cards: [playedCard, ...selectedCards],
      owner: playerRole
    };

    // Remove cards from hand and table
    const handKey = `${playerRole}Hand`;
    const newHand = [...gameState[handKey]];
    newHand.splice(handIndex, 1);

    const selectedIndices = selectedTableCards.map(tc => tc.index);
    const newTableCards = gameState.tableCards.filter((_, i) => !selectedIndices.includes(i));

    const newBuilds = [...(gameState.builds || []), newBuild];

    // Switch turn
    const nextTurn = gameState.currentTurn === 'player1' ? 'player2' : 'player1';

    const updates = {
      [handKey]: newHand,
      tableCards: newTableCards,
      builds: newBuilds,
      currentTurn: nextTurn
    };

    const gameStateRef = ref(database, `casino-games/${roomCode}/gameState`);
    await update(gameStateRef, updates);

    setSelectedCard(null);
    setSelectedTableCards([]);
    setMessage(`Build of ${totalValue} created!`);
    
    // Removed immediate check - useEffect will handle dealing when Firebase syncs
  }

  async function checkForNextDeal() {
    if (!gameState) return;
    
    // Only Player 1 should deal new cards to avoid conflicts
    if (playerRole !== 'player1') return;

    if (gameState.deck.length > 0) {
      const cardsPerPlayer = Math.min(4, Math.floor(gameState.deck.length / 2));

      if (cardsPerPlayer > 0) {
        const player1Hand = gameState.deck.slice(0, cardsPerPlayer);
        const player2Hand = gameState.deck.slice(cardsPerPlayer, cardsPerPlayer * 2);
        const remainingDeck = gameState.deck.slice(cardsPerPlayer * 2);

        // Switch dealer and set turn to non-dealer
        const newDealer = gameState.currentDealer === 'player1' ? 'player2' : 'player1';
        const newTurn = newDealer === 'player1' ? 'player2' : 'player1';

        const updates = {
          player1Hand,
          player2Hand,
          deck: remainingDeck,
          currentDealer: newDealer,
          currentTurn: newTurn
        };

        const gameStateRef = ref(database, `casino-games/${roomCode}/gameState`);
        await update(gameStateRef, updates);
        
        setMessage('New cards dealt!');
      } else {
        await endRound();
      }
    } else {
      await endRound();
    }
  }

  async function endRound() {
    if (!gameState) return;
    
    // Only Player 1 should end the round to avoid conflicts
    if (playerRole !== 'player1') return;

    const lastCapturer = gameState.lastCapture || 'player1';

    // Collect all remaining cards
    const remainingCards = [
      ...gameState.tableCards,
      ...gameState.player1Hand,
      ...gameState.player2Hand
    ];

    // Flatten builds
    const buildCards = (gameState.builds || []).flatMap(b => b.cards);
    remainingCards.push(...buildCards);

    // Award to last capturer
    const player1Final = lastCapturer === 'player1'
      ? [...gameState.player1Captured, ...remainingCards]
      : gameState.player1Captured;

    const player2Final = lastCapturer === 'player2'
      ? [...gameState.player2Captured, ...remainingCards]
      : gameState.player2Captured;

    // Calculate scores
    const p1Stats = calculateScore(player1Final);
    const p2Stats = calculateScore(player2Final);

    let p1Score = p1Stats.score;
    let p2Score = p2Stats.score;

    if (p1Stats.spadeCount > p2Stats.spadeCount) p1Score += 1;
    if (p2Stats.spadeCount > p1Stats.spadeCount) p2Score += 1;

    if (p1Stats.cardCount > p2Stats.cardCount) p1Score += 3;
    if (p2Stats.cardCount > p1Stats.cardCount) p2Score += 3;

    const updates = {
      deck: [],
      player1Hand: [],
      player2Hand: [],
      tableCards: [],
      player1Captured: player1Final,
      player2Captured: player2Final,
      currentTurn: null,
      player1Score: p1Score,
      player2Score: p2Score,
      builds: []
    };

    const gameStateRef = ref(database, `casino-games/${roomCode}/gameState`);
    await update(gameStateRef, updates);

    setMessage(`Round Over! ${playerName}: ${playerRole === 'player1' ? p1Score : p2Score} pts | ${opponentName}: ${playerRole === 'player1' ? p2Score : p1Score} pts`);
  }

  function handleBuildClick(build, buildIndex) {
    if (gameState.currentTurn !== playerRole) {
      setMessage("It's not your turn!");
      return;
    }

    if (!selectedCard) {
      setMessage('Select a hand card first!');
      return;
    }

    // Can only capture build if hand card matches build value
    if (selectedCard.card.rank === build.value) {
      captureBuild(buildIndex);
    } else {
      setMessage(`You need a ${build.value} to capture this build!`);
    }
  }

  async function captureBuild(buildIndex) {
    const { card: playedCard, index: handIndex } = selectedCard;
    const build = gameState.builds[buildIndex];

    // Remove played card from hand
    const handKey = `${playerRole}Hand`;
    const newHand = [...gameState[handKey]];
    newHand.splice(handIndex, 1);

    // Remove build
    const newBuilds = gameState.builds.filter((_, i) => i !== buildIndex);

    // Add to captured pile
    const capturedKey = `${playerRole}Captured`;
    const newCaptured = [...(gameState[capturedKey] || []), playedCard, ...build.cards];

    // Switch turn
    const nextTurn = gameState.currentTurn === 'player1' ? 'player2' : 'player1';

    const updates = {
      [handKey]: newHand,
      builds: newBuilds,
      [capturedKey]: newCaptured,
      currentTurn: nextTurn,
      lastCapture: playerRole
    };

    const gameStateRef = ref(database, `casino-games/${roomCode}/gameState`);
    await update(gameStateRef, updates);

    setSelectedCard(null);
    setMessage(`You captured the build of ${build.value}!`);
  }

  function getCardName(card) {
    const ranks = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    return `${ranks[card.rank]} of ${card.suit}s`;
  }

  if (!gameState) {
    return <div className="loading">Loading game...</div>;
  }

  const myHand = gameState[`${playerRole}Hand`] || [];
  const opponentHand = gameState[playerRole === 'player1' ? 'player2Hand' : 'player1Hand'] || [];
  const myCaptured = gameState[`${playerRole}Captured`] || [];
  const opponentCaptured = gameState[playerRole === 'player1' ? 'player2Captured' : 'player1Captured'] || [];
  const myScore = gameState[playerRole === 'player1' ? 'player1Score' : 'player2Score'] || 0;
  const opponentScore = gameState[playerRole === 'player1' ? 'player2Score' : 'player1Score'] || 0;
  const isMyTurn = gameState.currentTurn === playerRole;

  return (
    <div className="game">
      <div className="game-header">
        <h1>🎴 Casino Card Game</h1>
        <div className="room-info">
          Room: <strong>{roomCode}</strong>
          <button className="leave-btn" onClick={onLeaveGame}>Leave Game</button>
        </div>
      </div>

      <div className="message">{message}</div>

      <div className="game-board">
        {/* Opponent */}
        <div className="player-section opponent-section">
          <h2>{opponentName} {!isMyTurn && '← TURN'}</h2>
          <div className="hand">
            {opponentHand.map((card, i) => (
              <div key={i} className="card-back"></div>
            ))}
          </div>
          <div className="captured-info">
            Captured: {opponentCaptured.length} cards | Score: {opponentScore}
          </div>
        </div>

        {/* Table */}
        <div className="table-section">
          <h2>Table</h2>
          <div className="table">
            {gameState.tableCards.map((card, i) => (
              <div
                key={`${card.rank}-${card.suit}-${i}`}
                onClick={() => handleTableCardClick(card, i)}
                className={`table-card ${selectedTableCards.some(tc => tc.index === i) ? 'selected' : ''}`}
              >
                <Card rank={card.rank} suit={card.suit} />
              </div>
            ))}

            {/* Builds */}
            {gameState.builds && gameState.builds.map((build, i) => (
              <div
                key={`build-${i}`}
                className="build-pile"
                onClick={() => handleBuildClick(build, i)}
              >
                <div className="build-label">Building {build.value}</div>
                <div className="build-cards">
                  {build.cards.map((card, cardIndex) => (
                    <div key={cardIndex} className="build-card-small">
                      <Card rank={card.rank} suit={card.suit} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* You (current player) */}
        <div className="player-section my-section">
          <h2>{playerName} (You) {isMyTurn && '← YOUR TURN'}</h2>
          <div className="hand">
            {myHand.map((card, i) => (
              <div
                key={i}
                onClick={() => handleCardClick(card, `${playerRole}Hand`, i)}
                className={selectedCard?.source === `${playerRole}Hand` && selectedCard?.index === i ? 'selected' : ''}
              >
                <Card rank={card.rank} suit={card.suit} />
              </div>
            ))}
          </div>
          <div className="captured-info">
            Captured: {myCaptured.length} cards | Score: {myScore}
          </div>
        </div>

        <div className="controls">
          <button onClick={handleCapture} disabled={!selectedCard || !isMyTurn}>
            Capture
          </button>
          <button onClick={handleBuild} disabled={!selectedCard || selectedTableCards.length === 0 || !isMyTurn}>
            Build
          </button>
          <button onClick={handleTrail} disabled={!selectedCard || !isMyTurn}>
            Trail
          </button>
        </div>
      </div>
    </div>
  );
}

export default Game;
