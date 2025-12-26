import React, { useState, useEffect } from 'react';
import Card from './Card';
import { createDeck, shuffleDeck, dealInitialCards, dealNextRound, calculateScore, canCapture } from './gameUtils';
import './Game.css';

function Game() {
  const [gameState, setGameState] = useState(null);
  const [selectedCard, setSelectedCard] = useState(null);
  const [message, setMessage] = useState('');
  const [selectedTableCards, setSelectedTableCards] = useState([]);

  console.log('Game rendering. selectedCard:', selectedCard);

  // Initialize game
  useEffect(() => {
    startNewGame();
  }, []);

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
    console.log('Shuffled deck first 10 cards:', deck.slice(0, 10));


    setGameState({
      deck: remainingDeck,
      player1Hand,
      player2Hand,
      tableCards,
      player1Captured: [],
      player2Captured: [],
      currentTurn: 'player1',
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
      player1Score: gameState.player1Score,
      player2Score: gameState.player2Score,
      lastCapture: currentPlayer
    };

    setGameState(newState);

    setSelectedCard(null);
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
      player1Score: gameState.player1Score,
      player2Score: gameState.player2Score,
      lastCapture: gameState.lastCapture,
      builds: gameState.builds
    };

    setGameState(newState);
    setSelectedCard(null);

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

    // Find all builds that can be captured
    const capturableBuilds = gameState.builds.filter(build => build.value === playedCard.rank);

    if (validCombos.length === 0 && capturableBuilds.length === 0) {
      setMessage(`Cannot capture! No table cards or builds match ${playedCard.rank}`);
      return;
    }

    // Flatten all valid combinations to get all capturable table card indices
    const allCapturableIndices = [...new Set(validCombos.flat())];

    // Capture table cards
    const capturedTableCards = allCapturableIndices.map(i => gameState.tableCards[i]);

    // Capture all cards from builds
    const capturedBuildCards = capturableBuilds.flatMap(build => build.cards);

    // Remove from hand
    const newHand = [...gameState[`${currentPlayer}Hand`]];
    newHand.splice(handIndex, 1);

    // Remove captured table cards
    const newTableCards = gameState.tableCards.filter((_, i) => !allCapturableIndices.includes(i));

    // Remove captured builds
    const newBuilds = gameState.builds.filter(build => build.value !== playedCard.rank);

    // Add everything to captured pile
    const newCaptured = [
      ...gameState[`${currentPlayer}Captured`],
      playedCard,
      ...capturedTableCards,
      ...capturedBuildCards
    ];

    const newState = {
      deck: gameState.deck,
      player1Hand: currentPlayer === 'player1' ? newHand : gameState.player1Hand,
      player2Hand: currentPlayer === 'player2' ? newHand : gameState.player2Hand,
      tableCards: newTableCards,
      player1Captured: currentPlayer === 'player1' ? newCaptured : gameState.player1Captured,
      player2Captured: currentPlayer === 'player2' ? newCaptured : gameState.player2Captured,
      currentTurn: gameState.currentTurn === 'player1' ? 'player2' : 'player1',
      player1Score: gameState.player1Score,
      player2Score: gameState.player2Score,
      lastCapture: currentPlayer,
      builds: newBuilds
    };

    setGameState(newState);
    setSelectedCard(null);
    setSelectedTableCards([]);

    const totalCaptured = capturedTableCards.length + capturedBuildCards.length + 1;
    setMessage(`Player ${currentPlayer === 'player1' ? '1' : '2'} captured ${totalCaptured} card(s)!`);

    // Check if both hands empty
    if (newState.player1Hand.length === 0 && newState.player2Hand.length === 0) {
      checkForNextDeal(newState);
    }
  }

  function findCapturableCombinations(tableCards, targetValue) {
    const results = [];

    // Check each card individually (pairing)
    tableCards.forEach((card, index) => {
      if (card.rank === targetValue) {
        results.push([index]);
      }
    });

    // Check all combinations of 2+ cards
    function findCombos(start, currentCombo, currentSum) {
      if (currentSum === targetValue && currentCombo.length > 0) {
        results.push([...currentCombo]);
      }

      if (currentSum >= targetValue) return;

      for (let i = start; i < tableCards.length; i++) {
        currentCombo.push(i);
        findCombos(i + 1, currentCombo, currentSum + tableCards[i].rank);
        currentCombo.pop();
      }
    }

    findCombos(0, [], 0);

    return results;
  }

  function findBuildOptions(playedCard, tableCards, playerHand, playedCardIndex) {
    const allCards = [playedCard, ...tableCards];
    const options = [];

    // Check each possible target value that player has in hand
    for (let targetValue = 1; targetValue <= 10; targetValue++) {  // Only 1-10, not 11-13
      // Must have this card in hand (excluding the played card)
      const hasCapturingCard = playerHand.some((card, idx) =>
        card.rank === targetValue && idx !== playedCardIndex
      );

      if (!hasCapturingCard) continue;

      // Check if cards can form valid groups for this target
      const canBuild = canMakeGroups(allCards, targetValue);

      if (canBuild) {
        options.push(targetValue);
      }
    }

    return options;
  }

  function canMakeGroups(cards, target) {
    // Check if ALL cards can be partitioned into groups that each equal target

    // Option 1: All cards sum to target (numerical build)
    const totalSum = cards.reduce((sum, c) => sum + c.rank, 0);
    if (totalSum === target) return true;

    // Option 2: Set build - partition ALL cards into groups that each equal target
    function canPartitionAll(remaining, groups) {
      if (remaining.length === 0) {
        // Successfully used all cards, need at least 2 groups for set build
        return groups.length >= 2 && groups.every(g => g.sum === target);
      }

      // Try to form a group that sums to target from remaining cards
      for (let mask = 1; mask < (1 << remaining.length); mask++) {
        let sum = 0;
        let groupCards = [];

        for (let i = 0; i < remaining.length; i++) {
          if (mask & (1 << i)) {
            sum += remaining[i].rank;
            groupCards.push(remaining[i]);
          }
        }

        if (sum === target) {
          // Found a valid group, try to partition the rest
          const newRemaining = remaining.filter((_, i) => !(mask & (1 << i)));
          if (canPartitionAll(newRemaining, [...groups, { sum, cards: groupCards }])) {
            return true;
          }
        }
      }

      return false;
    }

    return canPartitionAll(cards, []);
  }



  function handleBuild() {
    if (!selectedCard || selectedTableCards.length === 0) {
      setMessage('Select a hand card and table card(s) to build!');
      return;
    }

    const { card: playedCard, index: handIndex } = selectedCard;
    const currentPlayer = gameState.currentTurn;

    // Check if we're adding to an existing build
    const selectedBuilds = selectedTableCards.filter(tc => tc.type === 'build');
    const selectedRegularCards = selectedTableCards.filter(tc => tc.type !== 'build');

    if (selectedBuilds.length > 0) {
      // ADDING TO EXISTING BUILD
      const existingBuild = selectedBuilds[0]; // Should only be one
      const buildValue = existingBuild.build.value;

      // Validate player has the capturing card
      const hasCapturingCard = gameState[`${currentPlayer}Hand`].some(
        (card, idx) => card.rank === buildValue && idx !== handIndex
      );

      if (!hasCapturingCard) {
        setMessage(`Cannot add to build ${buildValue} - you don't have a ${buildValue} in your hand!`);
        return;
      }

      // Add played card + selected table cards to the build
      const newBuildCards = [
        ...existingBuild.build.cards,
        playedCard,
        ...selectedRegularCards.map(tc => tc.card)
      ];

      const updatedBuild = {
        ...existingBuild.build,
        cards: newBuildCards
      };

      // Remove played card from hand
      const newHand = [...gameState[`${currentPlayer}Hand`]];
      newHand.splice(handIndex, 1);

      // Remove selected regular table cards
      const tableIndices = selectedRegularCards.map(tc => tc.index);
      const newTableCards = gameState.tableCards.filter((_, i) => !tableIndices.includes(i));

      // Replace the build
      const newBuilds = gameState.builds.map((b, idx) =>
        idx === existingBuild.buildIndex ? updatedBuild : b
      );

      const newState = {
        deck: gameState.deck,
        player1Hand: currentPlayer === 'player1' ? newHand : gameState.player1Hand,
        player2Hand: currentPlayer === 'player2' ? newHand : gameState.player2Hand,
        tableCards: newTableCards,
        player1Captured: gameState.player1Captured,
        player2Captured: gameState.player2Captured,
        currentTurn: gameState.currentTurn === 'player1' ? 'player2' : 'player1',
        player1Score: gameState.player1Score,
        player2Score: gameState.player2Score,
        lastCapture: gameState.lastCapture,
        builds: newBuilds
      };

      setGameState(newState);
      setSelectedCard(null);
      setSelectedTableCards([]);
      setMessage(`Player ${currentPlayer === 'player1' ? '1' : '2'} added to building ${buildValue}!`);

      setTimeout(() => {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      }, 100);

    } else {
      // CREATING NEW BUILD (existing logic)
      const tableCards = selectedTableCards.map(tc => tc.card);
      const validBuildValues = findBuildOptions(
        playedCard,
        tableCards,
        gameState[`${currentPlayer}Hand`],
        handIndex
      );

      if (validBuildValues.length === 0) {
        setMessage(`Cannot build - you don't have the capturing card in your hand!`);

        setTimeout(() => {
          window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
        }, 100);

        return;
      }



      let buildValue;
      if (validBuildValues.length === 1) {
        buildValue = validBuildValues[0];
      } else {
        const choice = prompt(`Multiple build options available. What are you building?\nOptions: ${validBuildValues.join(', ')}`);
        buildValue = parseInt(choice);
        if (!validBuildValues.includes(buildValue)) {
          setMessage('Invalid build choice!');
          return;
        }
      }

      const allCards = [playedCard, ...tableCards];
      const totalSum = allCards.reduce((sum, card) => sum + card.rank, 0);
      const buildType = (totalSum === buildValue) ? 'numerical' : 'set';

      const buildCards = [playedCard, ...selectedTableCards.map(tc => tc.card)];
      const newBuild = {
        cards: buildCards,
        value: buildValue,
        owner: currentPlayer,
        type: buildType
      };

      const newHand = [...gameState[`${currentPlayer}Hand`]];
      newHand.splice(handIndex, 1);

      const tableIndices = selectedTableCards.map(tc => tc.index);
      const newTableCards = gameState.tableCards.filter((_, i) => !tableIndices.includes(i));

      const newState = {
        deck: gameState.deck,
        player1Hand: currentPlayer === 'player1' ? newHand : gameState.player1Hand,
        player2Hand: currentPlayer === 'player2' ? newHand : gameState.player2Hand,
        tableCards: newTableCards,
        player1Captured: gameState.player1Captured,
        player2Captured: gameState.player2Captured,
        currentTurn: gameState.currentTurn === 'player1' ? 'player2' : 'player1',
        player1Score: gameState.player1Score,
        player2Score: gameState.player2Score,
        lastCapture: gameState.lastCapture,
        builds: [...gameState.builds, newBuild]
      };

      setGameState(newState);
      setSelectedCard(null);
      setSelectedTableCards([]);
      setMessage(`Player ${currentPlayer === 'player1' ? '1' : '2'} is building ${buildValue}${buildType === 'set' ? 's' : ''}!`);
    }
  }

  function handleBuildClick(build, buildIndex) {
    console.log('Build clicked:', build, buildIndex);

    if (!selectedCard) {
      setMessage('Select a card from your hand first!');
      return;
    }

    // Add this build to selected items
    setSelectedTableCards([...selectedTableCards, {
      type: 'build',
      build: build,
      buildIndex: buildIndex
    }]);

    setMessage('Build selected. Add more cards or click Build button.');
  }

  function checkForNextDeal(currentState) {
    setTimeout(() => {
      // Check if both hands are actually empty
      const bothHandsEmpty = currentState.player1Hand.length === 0 && currentState.player2Hand.length === 0;

      if (!bothHandsEmpty) {
        // At least one player still has cards - don't deal, just let them finish playing
        console.log('Waiting for players to finish their hands');
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

  if (!gameState) return <div>Loading...</div>;

  return (
    <div className="game">
      <h1>Casino Card Game</h1>

      <div className="message">{message}</div>

      <div className="game-board">

        {/* Player 2 */}
        <div className="player-section">
          <h2>Player 2 {gameState.currentTurn === 'player2' && '← TURN'}</h2>
          <div className="hand">
            {gameState.currentTurn === 'player2' ? (
              // Show actual cards when it's Player 2's turn
              gameState.player2Hand.map((card, i) => (
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
              gameState.player2Hand.map((card, i) => (
                <div key={i} className="card-back"></div>
              ))
            )}
          </div>
          <div className="captured-info">
            Captured: {gameState.player2Captured.length} cards | Score: {gameState.player2Score}
          </div>
        </div>

        {/* Table */}
        <div className="table-section">
          <h2>Table</h2>
          <div className="table">
            {console.log('Rendering table cards:', gameState.tableCards.length, gameState.tableCards)}
            {gameState.tableCards.map((card, i) => (
              <div
                key={`${card.rank}-${card.suit}-${i}`}
                onClick={() => handleTableCardClick(card, i)}
                className={`table-card ${selectedTableCards.some(tc => tc.index === i) ? 'selected' : ''}`}
              >
                <Card rank={card.rank} suit={card.suit} />
              </div>
            ))}

            {/* ADD THIS SECTION - Render Builds */}
            {gameState.builds.map((build, i) => (
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
              gameState.player1Hand.map((card, i) => (
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
              gameState.player1Hand.map((card, i) => (
                <div key={i} className="card-back"></div>
              ))
            )}
          </div>
          <div className="captured-info">
            Captured: {gameState.player1Captured.length} cards | Score: {gameState.player1Score}
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
