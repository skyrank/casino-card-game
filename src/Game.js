import React, { useState, useEffect } from 'react';
import Card from './Card';
import { createDeck, shuffleDeck, dealInitialCards, dealNextRound, calculateScore, canCapture } from './gameUtils';
import './Game.css';
import { database } from './firebase';
import { ref, onValue, set, get } from 'firebase/database';

function Game({ roomCode, playerRole, playerName, opponentName, onLeaveGame }) {
  const [gameState, setGameState] = useState(null);
  const [selectedCard, setSelectedCard] = useState(null);
  const [message, setMessage] = useState('');
  const [selectedTableCards, setSelectedTableCards] = useState([]);

  console.log('Game rendering. playerRole:', playerRole, 'selectedCard:', selectedCard);

  // STEP 1: Listen to Firebase gameState
  useEffect(() => {
    if (!roomCode) return;

    console.log('Setting up Firebase listener for room:', roomCode);
    const gameStateRef = ref(database, `casino-games/${roomCode}/gameState`);
    
    const unsubscribe = onValue(gameStateRef, (snapshot) => {
      const data = snapshot.val();
      console.log('Firebase gameState updated:', data);
      
      if (data) {
        setGameState(data);
        
        // Update message based on turn
        if (data.currentTurn === playerRole) {
          setMessage(`Your turn! Select a card from your hand.`);
        } else {
          setMessage(`${opponentName}'s turn...`);
        }
      } else {
        console.log('No gameState in Firebase yet');
        setMessage('Waiting for game to start...');
      }
    });

    return () => {
      console.log('Cleaning up Firebase listener');
      unsubscribe();
    };
  }, [roomCode, playerRole, opponentName]);

  // STEP 2: Initialize game (Player 1 only)
  useEffect(() => {
    if (!roomCode || playerRole !== 'player1') return;

    console.log('Player 1 checking if game needs initialization...');
    const gameStateRef = ref(database, `casino-games/${roomCode}/gameState`);
    
    // Check if gameState already exists
    const checkAndInitialize = async () => {
      const snapshot = await get(gameStateRef);
      
      if (!snapshot.exists()) {
        console.log('No gameState found - Player 1 initializing game...');
        await initializeGameInFirebase();
      } else {
        console.log('GameState already exists, skipping initialization');
      }
    };

    checkAndInitialize();
  }, [roomCode, playerRole]);

  // STEP 2: Initialize game in Firebase (Player 1 only)
  async function initializeGameInFirebase() {
    console.log('Initializing game in Firebase...');
    
    const deck = shuffleDeck(createDeck());
    const { player1Hand, player2Hand, tableCards, deck: remainingDeck } = dealInitialCards(deck);

    const initialGameState = {
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
    await set(gameStateRef, initialGameState);
    
    console.log('Game initialized in Firebase!', initialGameState);
  }

  // Keep existing game logic - we'll modify this in later steps
  function startNewGame() {
    const deck = shuffleDeck(createDeck());

    console.log('NEW GAME - Deck has', deck.length, 'cards');

    const { player1Hand, player2Hand, tableCards, deck: remainingDeck } = dealInitialCards(deck);

    console.log('After initial deal:', {
      p1: player1Hand.length,
      p2: player2Hand.length,
      table: tableCards.length,
      deck: remainingDeck.length,
      total: player1Hand.length + player2Hand.length + tableCards.length + remainingDeck.length
    });

    setGameState({
      deck: remainingDeck,
      player1Hand,
      player2Hand,
      tableCards,
      player1Captured: [],
      player2Captured: [],
      currentTurn: 'player1',
      currentDealer: 'player1',
      roundNumber: 1,
      player1Score: 0,
      player2Score: 0,
      lastCapture: null,
      builds: []
    });

    setMessage('Player 1 starts. Click a card from your hand.');
  }

  function handleCardClick(card, source, index) {
    if (!gameState) return;

    // Only allow current player to select their cards
    if (source === 'player1Hand' && gameState.currentTurn !== 'player1') return;
    if (source === 'player2Hand' && gameState.currentTurn !== 'player2') return;

    setSelectedCard({ card, source, index });
    setMessage(`Selected ${getCardName(card)}. Click table cards to capture, or click "Trail" to play without capturing.`);
  }

  function handleTableCardClick(tableCard, tableIndex) {
    console.log('Table card clicked:', tableCard, 'Selected card:', selectedCard);

    if (!selectedCard) {
      setMessage('Select a card from your hand first!');
      return;
    }

    // Toggle table card selection
    const isSelected = selectedTableCards.some(tc => tc.index === tableIndex);

    if (isSelected) {
      // Deselect
      setSelectedTableCards(selectedTableCards.filter(tc => tc.index !== tableIndex));
      setMessage('Card deselected. Select table cards then click Capture or Build.');
    } else {
      // Select
      setSelectedTableCards([...selectedTableCards, { card: tableCard, index: tableIndex }]);
      setMessage('Card selected. Select more cards or click Capture/Build.');
    }
  }

  function canMakeGroups(cards, target) {
    // Simple approach: check if we can make at least one valid grouping

    // Option 1: All cards sum to target (numerical build)
    const totalSum = cards.reduce((sum, c) => sum + c.rank, 0);
    if (totalSum === target) return true;

    // Option 2: Can we partition into groups that each equal target? (set build)
    // For simplicity, check if ANY subset sums to target
    // and at least one other card/group also equals target

    function hasSubsetSum(arr, target, startIdx = 0) {
      // Can any subset starting from startIdx sum to target?
      for (let mask = 1; mask < (1 << (arr.length - startIdx)); mask++) {
        let sum = 0;
        let indices = [];
        for (let i = 0; i < arr.length - startIdx; i++) {
          if (mask & (1 << i)) {
            sum += arr[startIdx + i].rank;
            indices.push(startIdx + i);
          }
        }
        if (sum === target) {
          // Check if remaining cards can also form groups
          const remaining = arr.filter((_, idx) => !indices.includes(idx));
          if (remaining.length === 0) return true; // All cards used

          // Check if any single remaining card equals target
          if (remaining.some(c => c.rank === target)) return true;

          // Check if remaining cards sum to target
          const remainingSum = remaining.reduce((s, c) => s + c.rank, 0);
          if (remainingSum === target) return true;
        }
      }
      return false;
    }

    return hasSubsetSum(cards, target);
  }
  
  function captureCards(tableIndices) {
    console.log('captureCards called! Indices:', tableIndices, 'Selected:', selectedCard);
    const { card: playedCard, source, index: handIndex } = selectedCard;
    const currentPlayer = gameState.currentTurn;

    // Remove played card from hand
    const newHand = [...gameState[`${currentPlayer}Hand`]];
    newHand.splice(handIndex, 1);

    // Remove captured cards from table
    const capturedTableCards = tableIndices.map(i => gameState.tableCards[i]);
    const newTableCards = gameState.tableCards.filter((_, i) => !tableIndices.includes(i));

    // Add to captured pile (played card + captured cards)
    const newCaptured = [...gameState[`${currentPlayer}Captured`], playedCard, ...capturedTableCards];

    const newState = {
      deck: gameState.deck,
      player1Hand: currentPlayer === 'player1' ? newHand : gameState.player1Hand,
      player2Hand: currentPlayer === 'player2' ? newHand : gameState.player2Hand,
      tableCards: newTableCards,
      player1Captured: currentPlayer === 'player1' ? newCaptured : gameState.player1Captured,
      player2Captured: currentPlayer === 'player2' ? newCaptured : gameState.player2Captured,
      currentTurn: gameState.currentTurn === 'player1' ? 'player2' : 'player1',
      currentDealer: gameState.currentDealer,
      roundNumber: gameState.roundNumber,
      player1Score: gameState.player1Score,
      player2Score: gameState.player2Score,
      lastCapture: currentPlayer,
      builds: gameState.builds
    };

    setGameState(newState);

    setSelectedCard(null);
    setSelectedTableCards([]);
    setMessage(`Player ${currentPlayer === 'player1' ? '1' : '2'} captured ${capturedTableCards.length + 1} card(s)!`);

    console.log('Checking for deal. P1 hand:', newState.player1Hand.length, 'P2 hand:', newState.player2Hand.length);
    if (newState.player1Hand.length === 0 && newState.player2Hand.length === 0) {
      console.log('BOTH HANDS EMPTY - calling checkForNextDeal');
      checkForNextDeal(newState);
    }
  }
  
  function handleTrail() {
    console.log('Trail clicked! Selected card:', selectedCard);
    setMessage('TESTING: ' + Math.random());

    if (!selectedCard) {
      setMessage('Select a card from your hand first!');
      return;
    }

    const { card: playedCard, index: handIndex } = selectedCard;
    const currentPlayer = gameState.currentTurn;

    // Remove from hand, add to table
    const newHand = [...gameState[`${currentPlayer}Hand`]];
    newHand.splice(handIndex, 1);

    const newTableCards = [...gameState.tableCards, playedCard];

    // Create completely new object to force re-render
    const newState = {
      deck: gameState.deck,
      player1Hand: currentPlayer === 'player1' ? newHand : gameState.player1Hand,
      player2Hand: currentPlayer === 'player2' ? newHand : gameState.player2Hand,
      tableCards: newTableCards,
      player1Captured: gameState.player1Captured,
      player2Captured: gameState.player2Captured,
      currentTurn: gameState.currentTurn === 'player1' ? 'player2' : 'player1',
      currentDealer: gameState.currentDealer,
      roundNumber: gameState.roundNumber,
      player1Score: gameState.player1Score,
      player2Score: gameState.player2Score,
      lastCapture: gameState.lastCapture,
      builds: gameState.builds
    };

    setGameState(newState);
    setSelectedCard(null);
    setSelectedTableCards([]);

    // Check AFTER newState is created
    console.log('Checking for deal. P1 hand:', newState.player1Hand.length, 'P2 hand:', newState.player2Hand.length);
    if (newState.player1Hand.length === 0 && newState.player2Hand.length === 0) {
      console.log('BOTH HANDS EMPTY - calling checkForNextDeal');
      checkForNextDeal(newState);
    }
  }
  
  function handleCapture() {
    if (!selectedCard) {
      setMessage('Select a hand card first!');
      return;
    }

    const { card: playedCard, index: handIndex } = selectedCard;
    const currentPlayer = gameState.currentTurn;

    // Find all valid table card combinations that can be captured
    const validCombos = findCapturableCombinations(gameState.tableCards, playedCard.rank);

    // Check for build captures
    const buildCaptures = [];
    if (gameState.builds) {
      gameState.builds.forEach((build, buildIndex) => {
        if (build.value === playedCard.rank) {
          buildCaptures.push({ type: 'build', buildIndex, description: `Build of ${build.value}` });
        }
      });
    }

    // If there are selected table cards, validate them
    if (selectedTableCards.length > 0) {
      const selectedIndices = selectedTableCards.map(tc => tc.index).sort();
      
      // Check if selection matches a valid combination
      const matchingCombo = validCombos.find(combo => {
        const comboIndices = combo.indices.sort();
        return JSON.stringify(comboIndices) === JSON.stringify(selectedIndices);
      });

      if (matchingCombo) {
        captureCards(selectedIndices);
      } else {
        setMessage('Invalid capture combination! Try different cards.');
      }
    } else if (buildCaptures.length > 0) {
      // Automatically capture first available build
      captureBuild(buildCaptures[0].buildIndex);
    } else if (validCombos.length > 0) {
      setMessage(`Select cards to capture. Available: ${validCombos.map(c => c.description).join(', ')}`);
    } else {
      setMessage('No valid captures available. Trail instead?');
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

    return combinations;
  }

  function handleBuild() {
    if (!selectedCard) {
      setMessage('Select a hand card first!');
      return;
    }

    if (selectedTableCards.length === 0) {
      setMessage('Select table cards to build with!');
      return;
    }

    const { card: playedCard, index: handIndex } = selectedCard;
    const selectedCards = selectedTableCards.map(tc => tc.card);

    // Calculate the total value
    const totalValue = playedCard.rank + selectedCards.reduce((sum, c) => sum + c.rank, 0);

    // Check if player can make groups that sum to totalValue
    if (!canMakeGroups([playedCard, ...selectedCards], totalValue)) {
      setMessage('Cannot form valid groups for this build!');
      return;
    }

    // Create the build
    const newBuild = {
      value: totalValue,
      cards: [playedCard, ...selectedCards],
      owner: gameState.currentTurn
    };

    // Remove card from hand
    const currentPlayer = gameState.currentTurn;
    const newHand = [...gameState[`${currentPlayer}Hand`]];
    newHand.splice(handIndex, 1);

    // Remove selected cards from table
    const selectedIndices = selectedTableCards.map(tc => tc.index);
    const newTableCards = gameState.tableCards.filter((_, i) => !selectedIndices.includes(i));

    // Add build to builds array
    const newBuilds = [...(gameState.builds || []), newBuild];

    const newState = {
      deck: gameState.deck,
      player1Hand: currentPlayer === 'player1' ? newHand : gameState.player1Hand,
      player2Hand: currentPlayer === 'player2' ? newHand : gameState.player2Hand,
      tableCards: newTableCards,
      player1Captured: gameState.player1Captured,
      player2Captured: gameState.player2Captured,
      currentTurn: gameState.currentTurn === 'player1' ? 'player2' : 'player1',
      currentDealer: gameState.currentDealer,
      roundNumber: gameState.roundNumber,
      player1Score: gameState.player1Score,
      player2Score: gameState.player2Score,
      lastCapture: gameState.lastCapture,
      builds: newBuilds
    };

    setGameState(newState);
    setSelectedCard(null);
    setSelectedTableCards([]);
    setMessage(`Build of ${totalValue} created!`);

    if (newHand.length === 0) {
      const otherHand = currentPlayer === 'player1' ? newState.player2Hand : newState.player1Hand;
      if (otherHand.length === 0) {
        checkForNextDeal(newState);
      }
    }
  }

  function handleBuildClick(build, buildIndex) {
    if (!selectedCard) {
      setMessage('Select a hand card first!');
      return;
    }

    // Check if the selected card can capture this build
    if (selectedCard.card.rank === build.value) {
      captureBuild(buildIndex);
    } else {
      setMessage(`You need a ${build.value} to capture this build!`);
    }
  }

  function captureBuild(buildIndex) {
    const { card: playedCard, index: handIndex } = selectedCard;
    const build = gameState.builds[buildIndex];
    const currentPlayer = gameState.currentTurn;

    // Remove card from hand
    const newHand = [...gameState[`${currentPlayer}Hand`]];
    newHand.splice(handIndex, 1);

    // Remove the build
    const newBuilds = gameState.builds.filter((_, i) => i !== buildIndex);

    // Add all cards to captured pile
    const newCaptured = [...gameState[`${currentPlayer}Captured`], playedCard, ...build.cards];

    const newState = {
      deck: gameState.deck,
      player1Hand: currentPlayer === 'player1' ? newHand : gameState.player1Hand,
      player2Hand: currentPlayer === 'player2' ? newHand : gameState.player2Hand,
      tableCards: gameState.tableCards,
      player1Captured: currentPlayer === 'player1' ? newCaptured : gameState.player1Captured,
      player2Captured: currentPlayer === 'player2' ? newCaptured : gameState.player2Captured,
      currentTurn: gameState.currentTurn === 'player1' ? 'player2' : 'player1',
      currentDealer: gameState.currentDealer,
      roundNumber: gameState.roundNumber,
      player1Score: gameState.player1Score,
      player2Score: gameState.player2Score,
      lastCapture: currentPlayer,
      builds: newBuilds
    };

    setGameState(newState);
    setSelectedCard(null);
    setSelectedTableCards([]);
    setMessage(`Captured build of ${build.value}!`);

    if (newHand.length === 0) {
      const otherHand = currentPlayer === 'player1' ? newState.player2Hand : newState.player1Hand;
      if (otherHand.length === 0) {
        checkForNextDeal(newState);
      }
    }
  }

  function checkForNextDeal(currentState) {
    setTimeout(() => {
      if (!currentState) {
        console.log('checkForNextDeal: no currentState');
        return;
      }

      // Both hands are empty - try to deal more cards
      if (currentState.deck.length > 0) {
        // Deal remaining cards (might be less than 8)
        const cardsPerPlayer = Math.min(4, Math.floor(currentState.deck.length / 2));

        if (cardsPerPlayer > 0) {
          const player1Hand = currentState.deck.slice(0, cardsPerPlayer);
          const player2Hand = currentState.deck.slice(cardsPerPlayer, cardsPerPlayer * 2);
          const remainingDeck = currentState.deck.slice(cardsPerPlayer * 2);

          setGameState({
            ...currentState,
            player1Hand: player1Hand,
            player2Hand: player2Hand,
            deck: remainingDeck,
            currentTurn: currentState.currentTurn === 'player1' ? 'player2' : 'player1'
          });
          setMessage('New cards dealt! Next player\'s turn.');
        } else {
          endRound();
        }
      } else {
        // No cards left in deck AND both hands empty - end round
        endRound();
      }
    }, 1500);
  }
  
  function endRound() {
    console.log('END ROUND - Card count check:', {
      p1Captured: gameState.player1Captured.length,
      p2Captured: gameState.player2Captured.length,
      tableCards: gameState.tableCards.length,
      p1Hand: gameState.player1Hand.length,
      p2Hand: gameState.player2Hand.length,
      deck: gameState.deck.length,
      total: gameState.player1Captured.length + gameState.player2Captured.length +
        gameState.tableCards.length + gameState.player1Hand.length +
        gameState.player2Hand.length + gameState.deck.length
    });

    const lastCapturer = gameState.lastCapture || 'player1';

    // Collect all remaining cards (table + any cards still in hands)
    const remainingCards = [
      ...gameState.tableCards,
      ...gameState.player1Hand,
      ...gameState.player2Hand
    ];

    // Award all remaining cards to last capturer
    const player1Final = lastCapturer === 'player1'
      ? [...gameState.player1Captured, ...remainingCards]
      : gameState.player1Captured;

    const player2Final = lastCapturer === 'player2'
      ? [...gameState.player2Captured, ...remainingCards]
      : gameState.player2Captured;



    // Calculate scores
    const p1Stats = calculateScore(player1Final);
    const p2Stats = calculateScore(player2Final);

    // Award spades majority
    let p1Score = p1Stats.score;
    let p2Score = p2Stats.score;

    if (p1Stats.spadeCount > p2Stats.spadeCount) p1Score += 1;
    if (p2Stats.spadeCount > p1Stats.spadeCount) p2Score += 1;

    // Award cards majority
    if (p1Stats.cardCount > p2Stats.cardCount) p1Score += 3;
    if (p2Stats.cardCount > p1Stats.cardCount) p2Score += 3;

    setGameState({
      deck: [],  // Round is over, no cards left
      player1Hand: [],  // Clear hands
      player2Hand: [],  // Clear hands
      tableCards: [],
      player1Captured: player1Final,
      player2Captured: player2Final,
      currentTurn: null,
      currentDealer: gameState.currentDealer,
      roundNumber: gameState.roundNumber,
      player1Score: p1Score,
      player2Score: p2Score,
      lastCapture: gameState.lastCapture,
      builds: []
    });

    setMessage(`Round Over! Player 1: ${p1Score} pts | Player 2: ${p2Score} pts`);
  }

  function getCardName(card) {
    const ranks = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    return `${ranks[card.rank]} of ${card.suit}s`;
  }

  // Show loading while waiting for Firebase data
  if (!gameState) {
    return (
      <div className="game">
        <div className="game-header">
          <h1>🎴 Casino Card Game</h1>
          <div className="room-info">
            Room: <strong>{roomCode}</strong>
            <button className="leave-btn" onClick={onLeaveGame}>Leave Game</button>
          </div>
        </div>
        <div className="loading">Waiting for game to start...</div>
      </div>
    );
  }

  // Use fallbacks for arrays that might be undefined from Firebase
  const player1Hand = gameState.player1Hand || [];
  const player2Hand = gameState.player2Hand || [];
  const tableCards = gameState.tableCards || [];
  const player1Captured = gameState.player1Captured || [];
  const player2Captured = gameState.player2Captured || [];
  const builds = gameState.builds || [];

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

        {/* Player 2 */}
        <div className="player-section">
          <h2>Player 2 {gameState.currentTurn === 'player2' && '← TURN'}</h2>
          <div className="hand">
            {gameState.currentTurn === 'player2' ? (
              // Show actual cards when it's Player 2's turn
              player2Hand.map((card, i) => (
                <div
                  key={i}
                  onClick={() => handleCardClick(card, 'player2Hand', i)}
                  className={selectedCard?.source === 'player2Hand' && selectedCard?.index === i ? 'selected' : ''}
                >
                  <Card rank={card.rank} suit={card.suit} />
                </div>
              ))
            ) : (
              // Show card backs when it's NOT Player 2's turn
              player2Hand.map((card, i) => (
                <div key={i} className="card-back"></div>
              ))
            )}
          </div>
          <div className="captured-info">
            Captured: {player2Captured.length} cards | Score: {gameState.player2Score}
          </div>
        </div>

        {/* Table */}
        <div className="table-section">
          <h2>Table</h2>
          <div className="table">
            {console.log('Rendering table cards:', tableCards.length, tableCards)}
            {tableCards.map((card, i) => (
              <div
                key={`${card.rank}-${card.suit}-${i}`}
                onClick={() => handleTableCardClick(card, i)}
                className={`table-card ${selectedTableCards.some(tc => tc.index === i) ? 'selected' : ''}`}
              >
                <Card rank={card.rank} suit={card.suit} />
              </div>
            ))}

            {/* Render Builds */}
            {builds.map((build, i) => (
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


        {/* Player 1 */}
        <div className="player-section">
          <h2>Player 1 {gameState.currentTurn === 'player1' && '← TURN'}</h2>
          <div className="hand">
            {gameState.currentTurn === 'player1' ? (
              // Show actual cards when it's Player 1's turn
              player1Hand.map((card, i) => (
                <div
                  key={i}
                  onClick={() => handleCardClick(card, 'player1Hand', i)}
                  className={selectedCard?.source === 'player1Hand' && selectedCard?.index === i ? 'selected' : ''}
                >
                  <Card rank={card.rank} suit={card.suit} />
                </div>
              ))
            ) : (
              // Show card backs when it's NOT Player 1's turn
              player1Hand.map((card, i) => (
                <div key={i} className="card-back"></div>
              ))
            )}
          </div>
          <div className="captured-info">
            Captured: {player1Captured.length} cards | Score: {gameState.player1Score}
          </div>
        </div>

        <div className="controls">
          <button onClick={handleCapture} disabled={!selectedCard}>
            Capture
          </button>
          <button onClick={handleBuild} disabled={!selectedCard || selectedTableCards.length === 0}>
            Build
          </button>
          <button onClick={handleTrail} disabled={!selectedCard}>
            Trail (Play without capturing)
          </button>
          <button onClick={startNewGame}>
            New Game
        </button>
      </div>     
    </div>        
  </div>          
  );
}

export default Game;
