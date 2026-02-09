import React, { useState, useEffect } from 'react';
import Card from './Card';
import { createDeck, shuffleDeck, dealInitialCards, dealNextRound, calculateScore } from './gameUtils';
import './Game.css';
import { database } from './firebase';
import { ref, set, onValue, update } from 'firebase/database';
import soundManager from './soundManager';

function Game({ roomCode, playerRole, playerName, opponentName, onLeaveGame }) {
  const [gameState, setGameState] = useState(null);
  const [selectedCard, setSelectedCard] = useState(null);
  const [message, setMessage] = useState('');
  const [selectedTableCards, setSelectedTableCards] = useState([]);
  const [selectedBuild, setSelectedBuild] = useState(null);  // Store selected build for capture
  const [isDealing, setIsDealing] = useState(false);  // Prevent duplicate deals
  const [soundEnabled, setSoundEnabled] = useState(soundManager.isEnabled());
  const [playMessage, setPlayMessage] = useState(null);  // Animated message for plays

  // Initialize sound manager
  useEffect(() => {
    soundManager.init();
  }, []);

  // Listen for play messages from Firebase
  useEffect(() => {
    if (!gameState || !gameState.lastPlayMessage) return;
    
    // Show the message when it updates
    showPlayMessage(gameState.lastPlayMessage);
  }, [gameState?.lastPlayTimestamp]); // Trigger when timestamp changes

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
    // Check if both hands empty and deck is empty - end round (ONLY if not already ended)
    else if (player1Hand.length === 0 && player2Hand.length === 0 && (!gameState.deck || gameState.deck.length === 0) && !gameState.roundEnded) {
      console.log('Both hands and deck empty - ending round');
      setIsDealing(true);
      setTimeout(() => {
        checkForNextDeal();
        setIsDealing(false);
      }, 1500);
    }
  }, [gameState?.player1Hand?.length, gameState?.player2Hand?.length, gameState?.deck?.length, playerRole, isDealing, gameState?.roundEnded]);

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
      player1Score: 0,          // Round score
      player2Score: 0,          // Round score
      player1TotalScore: 0,     // Cumulative game score
      player2TotalScore: 0,     // Cumulative game score
      player1Wins: 0,           // Persistent game wins
      player2Wins: 0,           // Persistent game wins
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

    soundManager.play('cardSelect'); // Play card selection sound
    setSelectedCard({ card, source, index });
    setSelectedTableCards([]); // Clear table card selections when selecting new hand card
    setSelectedBuild(null); // Clear build selection when selecting new hand card
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

    // Clear build selection when selecting table cards
    setSelectedBuild(null);

    // Toggle table card selection
    const isSelected = selectedTableCards.some(tc => tc.index === tableIndex);

    if (isSelected) {
      setSelectedTableCards(selectedTableCards.filter(tc => tc.index !== tableIndex));
      setMessage('Card deselected. Select table cards then click Capture or Build.');
    } else {
      soundManager.play('tableSelect'); // Play table card selection sound
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

    // PRIORITY 1: Check if a build is selected
    if (selectedBuild) {
      await captureBuild(selectedBuild.index);
      setSelectedBuild(null);
      return;
    }

    // PRIORITY 2: Check for table card captures
    const { card: playedCard, index: handIndex } = selectedCard;
    const tableCards = gameState.tableCards || [];
    const selectedIndices = selectedTableCards.map(tc => tc.index).sort();

    if (selectedIndices.length === 0) {
      // No cards selected - show available captures
      const validCombos = findCapturableCombinations(tableCards, playedCard.rank);
      if (validCombos.length > 0) {
        setMessage(`Available captures: ${validCombos.map(c => c.description).join(', ')}`);
      } else {
        setMessage('No valid captures available. Trail instead?');
      }
      return;
    }

    // NEW: Check if player has active builds and validate capture accordingly
    const myBuilds = (gameState.builds || []).filter(b => b.owner === playerRole);
    
    if (myBuilds.length > 0) {
      // Player has active builds - check if this capture violates build rules
      const selectedCards = selectedIndices.map(idx => tableCards[idx]);
      
      // Check if any of the selected cards match any build value
      for (const build of myBuilds) {
        const matchingSelectedCards = selectedCards.filter(card => card.rank === build.value);
        
        if (matchingSelectedCards.length > 0) {
          // Player is trying to capture cards that match their build value
          // Count how many cards of that rank they have in hand (including the one they're playing)
          const myHand = gameState[`${playerRole}Hand`] || [];
          const cardsOfBuildValue = myHand.filter(c => c.rank === build.value).length;
          
          // If they only have ONE card of that value (the one they're playing),
          // they CANNOT capture table cards of that value - they MUST capture the build
          if (cardsOfBuildValue === 1 && playedCard.rank === build.value) {
            setMessage(`You have a ${build.value}-build on the table! You must capture it or make a different play. You can't capture other ${build.value}s unless you have multiple ${build.value}s in hand.`);
            return;
          }
        }
      }
    }

    // Check if selected cards can be partitioned into valid combinations
    const selectedCards = selectedIndices.map(idx => tableCards[idx]);
    const canCapture = canPartitionIntoValidCombinations(selectedCards, playedCard.rank);

    if (canCapture) {
      // Valid capture
      await captureCards(selectedIndices);
      setSelectedTableCards([]);
    } else {
      setMessage('Invalid selection! Cards must form valid combinations that equal your card rank.');
    }
  }

  // Check if selected cards can be partitioned into combinations that all equal targetRank
  function canPartitionIntoValidCombinations(cards, targetRank) {
    // Edge case: empty selection
    if (cards.length === 0) return false;

    // Try to partition cards into groups where each group sums to targetRank
    return tryPartition(cards, targetRank, []);
  }

  // Recursive function to try partitioning cards into valid groups
  function tryPartition(remainingCards, targetRank, currentGroups) {
    // Base case: no cards left, partition successful
    if (remainingCards.length === 0) {
      return currentGroups.length > 0;
    }

    // Try to find a valid group from remaining cards
    const n = remainingCards.length;
    
    // Try all possible non-empty subsets
    for (let mask = 1; mask < (1 << n); mask++) {
      const group = [];
      const notInGroup = [];
      
      for (let i = 0; i < n; i++) {
        if (mask & (1 << i)) {
          group.push(remainingCards[i]);
        } else {
          notInGroup.push(remainingCards[i]);
        }
      }
      
      // Check if this group is valid (sums to targetRank)
      const groupSum = group.reduce((sum, card) => sum + card.rank, 0);
      
      if (groupSum === targetRank) {
        // Valid group! Try to partition the rest
        if (tryPartition(notInGroup, targetRank, [...currentGroups, group])) {
          return true;
        }
      }
    }
    
    // No valid partition found
    return false;
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
    
    // Generate play message - use the CURRENT TURN player, not viewer's role
    const activePlayerName = gameState.currentTurn === 'player1' ? 
      (playerRole === 'player1' ? playerName : opponentName) :
      (playerRole === 'player2' ? playerName : opponentName);
    const capturedCardsStr = capturedTableCards.map(c => formatCardForMessage(c)).join(', ');
    const playedCardStr = formatCardForMessage(playedCard);
    const msgText = `${activePlayerName} captured ${capturedCardsStr} with a ${playedCardStr}`;
    
    // Switch turn
    const nextTurn = gameState.currentTurn === 'player1' ? 'player2' : 'player1';
    
    const updates = {
      [handKey]: newHand,
      tableCards: newTableCards,
      [capturedKey]: newCaptured,
      currentTurn: nextTurn,
      lastCapture: playerRole,
      lastPlayMessage: msgText,
      lastPlayTimestamp: Date.now()
    };
    
    console.log('Sending updates:', updates);
    
    try {
      const gameStateRef = ref(database, `casino-games/${roomCode}/gameState`);
      await update(gameStateRef, updates);
      
      soundManager.play('capture'); // Play capture sound
      
      setSelectedCard(null);
      setSelectedTableCards([]);
      setMessage(`You captured ${capturedTableCards.length + 1} card(s)!`);
    } catch (error) {
      console.error('Firebase update error:', error);
      setMessage('Error updating game. Please try again.');
    }
  }

  async function handleTrail() {
    console.log('=== TRAIL DEBUG ===');
    console.log('selectedCard:', selectedCard);
    console.log('playerRole:', playerRole);
    console.log('gameState.player1Hand:', gameState?.player1Hand);
    console.log('gameState.player2Hand:', gameState?.player2Hand);
    console.log('gameState.tableCards:', gameState?.tableCards);
    
    if (!selectedCard) {
      setMessage('Select a card from your hand first!');
      return;
    }

    if (gameState.currentTurn !== playerRole) {
      setMessage("It's not your turn!");
      return;
    }

    // CASINO RULE: Cannot trail if you own an active build
    const currentBuilds = gameState.builds || [];
    const playerHasActiveBuild = currentBuilds.some(build => build.owner === playerRole);
    
    if (playerHasActiveBuild) {
      setMessage("You can't trail - you must capture your build first!");
      return;
    }

    const { card: playedCard, index: handIndex } = selectedCard;

    // Remove from hand, add to table
    const handKey = `${playerRole}Hand`;
    const currentHand = gameState[handKey];
    
    console.log('handKey:', handKey);
    console.log('currentHand:', currentHand);
    console.log('Is array?:', Array.isArray(currentHand));
    
    if (!currentHand || !Array.isArray(currentHand)) {
      console.error('Hand not array in trail:', handKey, currentHand);
      setMessage('Error: Invalid hand state. Refreshing...');
      return;
    }
    
    const newHand = currentHand.filter((_, idx) => idx !== handIndex);
    
    const currentTableCards = gameState.tableCards || []; // Handle undefined as empty array
    const newTableCards = [...currentTableCards, playedCard];

    console.log('newHand:', newHand);
    console.log('newTableCards:', newTableCards);

    // Switch turn
    const nextTurn = gameState.currentTurn === 'player1' ? 'player2' : 'player1';

    const updates = {
      [handKey]: newHand,
      tableCards: newTableCards,
      currentTurn: nextTurn
    };

    // Generate play message - use the CURRENT TURN player, not viewer's role
    const activePlayerName = gameState.currentTurn === 'player1' ? 
      (playerRole === 'player1' ? playerName : opponentName) :
      (playerRole === 'player2' ? playerName : opponentName);
    const trailedCardStr = formatCardForMessage(playedCard);
    const msgText = `${activePlayerName} trailed a ${trailedCardStr}`;
    
    // Store message in Firebase so both players see it
    updates.lastPlayMessage = msgText;
    updates.lastPlayTimestamp = Date.now();

    console.log('Sending trail updates:', updates);

    const gameStateRef = ref(database, `casino-games/${roomCode}/gameState`);
    await update(gameStateRef, updates);

    soundManager.play('trail'); // Play trail sound
    
    setSelectedCard(null);
    
    // Removed immediate check - useEffect will handle dealing when Firebase syncs
  }

  // Find all valid build values for a set of cards
  function findValidBuildValues(cards, playerHand) {
    const validValues = [];
    
    // Get all cards with their ranks
    const cardRanks = cards.map(c => c.rank);
    
    // Check what values the player can actually capture (has in hand)
    const capturableValues = playerHand.map(c => c.rank);
    
    console.log('Finding build values for cards:', cardRanks);
    console.log('Player can capture:', capturableValues);
    
    // Option 1: Sum of all cards
    const totalSum = cardRanks.reduce((sum, r) => sum + r, 0);
    if (capturableValues.includes(totalSum)) {
      validValues.push({
        value: totalSum,
        type: 'sum',
        description: `Build ${totalSum} (sum of all cards)`
      });
    }
    
    // Option 2: Multiple groups that equal the same value
    // Try each possible target value that player can capture
    for (const targetValue of capturableValues) {
      if (canPartitionIntoGroups(cardRanks, targetValue)) {
        // Only add if not already added as sum
        if (!validValues.some(v => v.value === targetValue)) {
          validValues.push({
            value: targetValue,
            type: 'multiple',
            description: `Build ${targetValue}s (multiple groups)`
          });
        }
      }
    }
    
    console.log('Valid build values:', validValues);
    return validValues;
  }
  
  // Check if cards can be partitioned into groups that each equal target
  function canPartitionIntoGroups(cardRanks, target) {
    // Each card that already equals target is its own group
    const exactMatches = cardRanks.filter(r => r === target);
    const remaining = cardRanks.filter(r => r !== target);
    
    if (remaining.length === 0) {
      // All cards already equal target (e.g., multiple 10s)
      return exactMatches.length >= 2;
    }
    
    // Try to partition remaining cards into groups that sum to target
    return canMakeGroups(remaining, target, exactMatches.length);
  }
  
  function canMakeGroups(cards, target, existingGroups) {
    if (cards.length === 0) {
      // All cards used - valid if we have at least 2 total groups
      return existingGroups >= 2;
    }
    
    // Try to find any subset that sums to target
    for (let mask = 1; mask < (1 << cards.length); mask++) {
      let sum = 0;
      const subset = [];
      const remainingIndices = [];
      
      for (let i = 0; i < cards.length; i++) {
        if (mask & (1 << i)) {
          sum += cards[i];
          subset.push(cards[i]);
        } else {
          remainingIndices.push(i);
        }
      }
      
      if (sum === target) {
        // Found a group! Check if remaining can form more groups
        const remaining = remainingIndices.map(i => cards[i]);
        
        if (remaining.length === 0) {
          // Used all cards in one group - valid if we already had groups
          return existingGroups >= 1;
        }
        
        // Recursively check remaining cards
        if (canMakeGroups(remaining, target, existingGroups + 1)) {
          return true;
        }
      }
    }
    
    return false;
  }

  async function handleBuild() {
    console.log('=== BUILD DEBUG ===');
    console.log('selectedCard:', selectedCard);
    console.log('selectedTableCards:', selectedTableCards);
    console.log('selectedBuild:', selectedBuild);
    console.log('playerRole:', playerRole);
    
    if (!selectedCard) {
      setMessage('Select a hand card first!');
      return;
    }

    if (gameState.currentTurn !== playerRole) {
      setMessage("It's not your turn!");
      return;
    }

    // CASE 1: Increasing an existing build
    if (selectedBuild) {
      await increaseBuild(selectedBuild.index);
      return;
    }

    // CASE 2: Creating a new build from table cards
    if (selectedTableCards.length === 0) {
      setMessage('Select table cards to build with, or click a build to increase it!');
      return;
    }

    const { card: playedCard, index: handIndex } = selectedCard;
    const selectedCards = selectedTableCards.map(tc => tc.card);
    
    // All cards going into the build (played card + selected table cards)
    const allBuildCards = [playedCard, ...selectedCards];
    
    // CASINO RULE: Cannot build with picture cards (J=11, Q=12, K=13)
    const hasPictureCard = allBuildCards.some(c => c.rank > 10);
    if (hasPictureCard) {
      setMessage('Cannot build with picture cards (J, Q, K)!');
      return;
    }
    
    // Get player's current hand (minus the played card)
    const handKey = `${playerRole}Hand`;
    const currentHand = gameState[handKey] || [];
    const remainingHand = currentHand.filter((_, idx) => idx !== handIndex);
    
    // Find all valid build values
    const validValues = findValidBuildValues(allBuildCards, remainingHand);
    
    console.log('Valid build values:', validValues);
    
    if (validValues.length === 0) {
      setMessage('Cannot build - you must have a matching card in hand to capture this build later!');
      return;
    }
    
    // CASINO RULE: Maximum build value is 10
    const validValuesUnder10 = validValues.filter(v => v.value <= 10);
    if (validValuesUnder10.length === 0) {
      setMessage('Cannot build higher than 10!');
      return;
    }
    
    // For now, use the first valid value (we'll add user choice in Phase 3)
    const buildValue = validValuesUnder10[0].value;
    
    console.log('Using build value:', buildValue, validValuesUnder10[0].description);

    // Create build
    const newBuild = {
      value: buildValue,
      cards: allBuildCards,
      owner: playerRole
    };

    console.log('Creating build:', newBuild);

    // Remove cards from hand and table
    if (!currentHand || !Array.isArray(currentHand)) {
      console.error('Hand not array in build:', handKey, currentHand);
      setMessage('Error: Invalid hand state');
      return;
    }
    
    const newHand = remainingHand;

    const selectedIndices = selectedTableCards.map(tc => tc.index);
    const tableCards = gameState.tableCards || [];
    const newTableCards = tableCards.filter((_, i) => !selectedIndices.includes(i));

    const currentBuilds = gameState.builds || [];
    const newBuilds = [...currentBuilds, newBuild];

    // Generate play message - use the CURRENT TURN player, not viewer's role
    const activePlayerName = gameState.currentTurn === 'player1' ? 
      (playerRole === 'player1' ? playerName : opponentName) :
      (playerRole === 'player2' ? playerName : opponentName);
    const msgText = `${activePlayerName} is building ${buildValue}s`;
    
    // Switch turn
    const nextTurn = gameState.currentTurn === 'player1' ? 'player2' : 'player1';

    const updates = {
      [handKey]: newHand,
      tableCards: newTableCards,
      builds: newBuilds,
      currentTurn: nextTurn,
      lastPlayMessage: msgText,
      lastPlayTimestamp: Date.now()
    };

    console.log('Sending build updates:', updates);

    try {
      const gameStateRef = ref(database, `casino-games/${roomCode}/gameState`);
      await update(gameStateRef, updates);

      setSelectedCard(null);
      setSelectedTableCards([]);
      setSelectedBuild(null);
      setMessage(`${validValuesUnder10[0].description} created!`);
    } catch (error) {
      console.error('Error creating build:', error);
      setMessage('Error creating build. Please try again.');
    }
  }

  async function increaseBuild(buildIndex) {
    console.log('=== INCREASE BUILD DEBUG ===');
    console.log('buildIndex:', buildIndex);
    console.log('selectedCard:', selectedCard);
    
    const { card: playedCard, index: handIndex } = selectedCard;
    const build = gameState.builds[buildIndex];
    
    if (!build) {
      console.error('Build not found:', buildIndex);
      setMessage('Error: Build not found');
      return;
    }

    // All cards that will be in the increased build
    const allBuildCards = [playedCard, ...build.cards];
    
    // CASINO RULE: Cannot add picture cards to builds
    if (playedCard.rank > 10) {
      setMessage('Cannot add picture cards (J, Q, K) to builds!');
      return;
    }
    
    // Get player's remaining hand (minus the played card)
    const handKey = `${playerRole}Hand`;
    const currentHand = gameState[handKey] || [];
    const remainingHand = currentHand.filter((_, idx) => idx !== handIndex);
    
    // Find all valid values for the increased build
    const validValues = findValidBuildValues(allBuildCards, remainingHand);
    
    console.log('Valid increased build values:', validValues);
    
    if (validValues.length === 0) {
      setMessage('Cannot increase - you must have a matching card in hand to capture this build later!');
      return;
    }
    
    // CASINO RULE: Maximum build value is 10
    const validValuesUnder10 = validValues.filter(v => v.value <= 10);
    if (validValuesUnder10.length === 0) {
      setMessage('Cannot build higher than 10!');
      return;
    }
    
    // CASINO RULE: Can only increase, not decrease
    const increasedValues = validValuesUnder10.filter(v => v.value > build.value);
    if (increasedValues.length === 0) {
      setMessage(`Cannot change build of ${build.value} - can only increase its value!`);
      return;
    }
    
    // Use the first valid increased value
    const newBuildValue = increasedValues[0].value;
    
    console.log('Increasing build from', build.value, 'to', newBuildValue);

    // Update the build
    const newBuild = {
      value: newBuildValue,
      cards: allBuildCards,
      owner: playerRole  // New owner is the player who increased it
    };

    // Remove card from hand
    if (!currentHand || !Array.isArray(currentHand)) {
      console.error('Hand not array in increase build:', handKey, currentHand);
      setMessage('Error: Invalid hand state');
      return;
    }
    
    const newHand = remainingHand;

    // Update the builds array
    const currentBuilds = gameState.builds || [];
    const newBuilds = currentBuilds.map((b, i) => i === buildIndex ? newBuild : b);

    // Switch turn
    const nextTurn = gameState.currentTurn === 'player1' ? 'player2' : 'player1';

    const updates = {
      [handKey]: newHand,
      builds: newBuilds,
      currentTurn: nextTurn
    };

    console.log('Sending increase build updates:', updates);

    try {
      const gameStateRef = ref(database, `casino-games/${roomCode}/gameState`);
      await update(gameStateRef, updates);

      setSelectedCard(null);
      setSelectedBuild(null);
      setMessage(`Build increased from ${build.value} to ${newBuildValue}!`);
    } catch (error) {
      console.error('Error increasing build:', error);
      setMessage('Error increasing build. Please try again.');
    }
  }

  async function checkForNextDeal() {
    if (!gameState) {
      console.log('checkForNextDeal: no gameState');
      return;
    }
    
    // Only Player 1 should deal new cards to avoid conflicts
    if (playerRole !== 'player1') {
      console.log('checkForNextDeal: not player1, skipping');
      return;
    }

    const deck = gameState.deck || [];
    console.log('checkForNextDeal: deck length =', deck.length);

    if (deck.length > 0) {
      const cardsPerPlayer = Math.min(4, Math.floor(deck.length / 2));

      if (cardsPerPlayer > 0) {
        const player1Hand = deck.slice(0, cardsPerPlayer);
        const player2Hand = deck.slice(cardsPerPlayer, cardsPerPlayer * 2);
        const remainingDeck = deck.slice(cardsPerPlayer * 2);

        // Switch dealer and set turn to non-dealer
        const newDealer = gameState.currentDealer === 'player1' ? 'player2' : 'player1';
        const newTurn = newDealer === 'player1' ? 'player2' : 'player1';

        const updates = {
          player1Hand,
          player2Hand,
          deck: remainingDeck,
          currentDealer: newDealer,
          currentTurn: newTurn,
          roundEnded: false  // Clear the flag for new deal
        };

        console.log('Dealing new cards:', updates);

        const gameStateRef = ref(database, `casino-games/${roomCode}/gameState`);
        await update(gameStateRef, updates);
        
        setMessage('New cards dealt!');
        setIsDealing(false);
      } else {
        console.log('Not enough cards for both players, ending round');
        await endRound();
      }
    } else {
      console.log('Deck empty, ending round');
      await endRound();
    }
  }

  async function endRound() {
    console.log('=== END ROUND DEBUG ===');
    
    if (!gameState) {
      console.log('endRound: no gameState');
      return;
    }
    
    // Only Player 1 should end the round to avoid conflicts
    if (playerRole !== 'player1') {
      console.log('endRound: not player1, skipping');
      return;
    }

    console.log('gameState:', {
      tableCards: gameState.tableCards,
      player1Hand: gameState.player1Hand,
      player2Hand: gameState.player2Hand,
      player1Captured: gameState.player1Captured,
      player2Captured: gameState.player2Captured,
      builds: gameState.builds
    });

    const lastCapturer = gameState.lastCapture || 'player1';

    // Collect all remaining cards safely
    const tableCards = gameState.tableCards || [];
    const player1Hand = gameState.player1Hand || [];
    const player2Hand = gameState.player2Hand || [];
    
    const remainingCards = [
      ...tableCards,
      ...player1Hand,
      ...player2Hand
    ];

    // Flatten builds
    const builds = gameState.builds || [];
    const buildCards = builds.flatMap(b => b.cards || []);
    remainingCards.push(...buildCards);

    console.log('Remaining cards to award:', remainingCards.length);

    // Award to last capturer
    const player1Captured = gameState.player1Captured || [];
    const player2Captured = gameState.player2Captured || [];
    
    const player1Final = lastCapturer === 'player1'
      ? [...player1Captured, ...remainingCards]
      : player1Captured;

    const player2Final = lastCapturer === 'player2'
      ? [...player2Captured, ...remainingCards]
      : player2Captured;

    console.log('Final captured counts:', {
      player1: player1Final.length,
      player2: player2Final.length
    });

    // Calculate scores
    const p1Stats = calculateScore(player1Final);
    const p2Stats = calculateScore(player2Final);

    let p1Score = p1Stats.score;
    let p2Score = p2Stats.score;

    if (p1Stats.spadeCount > p2Stats.spadeCount) p1Score += 1;
    if (p2Stats.spadeCount > p1Stats.spadeCount) p2Score += 1;

    if (p1Stats.cardCount > p2Stats.cardCount) p1Score += 3;
    if (p2Stats.cardCount > p1Stats.cardCount) p2Score += 3;

    console.log('Final scores:', { p1Score, p2Score });

    // Update cumulative scores
    const p1TotalScore = (gameState.player1TotalScore || 0) + p1Score;
    const p2TotalScore = (gameState.player2TotalScore || 0) + p2Score;

    console.log('Cumulative scores:', { p1TotalScore, p2TotalScore });

    // Check if game is over (someone reached 21+)
    const gameOver = p1TotalScore >= 21 || p2TotalScore >= 21;
    const winner = p1TotalScore >= 21 ? 'player1' : (p2TotalScore >= 21 ? 'player2' : null);

    console.log('Game over check:', { gameOver, winner, p1TotalScore, p2TotalScore });

    // Increment win counter if someone won
    const currentP1Wins = gameState.player1Wins || 0;
    const currentP2Wins = gameState.player2Wins || 0;
    const newP1Wins = gameOver && winner === 'player1' ? currentP1Wins + 1 : currentP1Wins;
    const newP2Wins = gameOver && winner === 'player2' ? currentP2Wins + 1 : currentP2Wins;

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
      player1TotalScore: p1TotalScore,
      player2TotalScore: p2TotalScore,
      player1Wins: newP1Wins,
      player2Wins: newP2Wins,
      builds: [],
      roundEnded: true,  // Prevent infinite loop
      showRoundSummary: !gameOver,  // Show summary if game NOT over
      gameOver: gameOver,  // Show game over screen if someone hit 21
      winner: winner
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

    // Check if hand card matches build value for capture
    if (selectedCard.card.rank === build.value) {
      // Toggle selection for capture
      if (selectedBuild?.index === buildIndex) {
        setSelectedBuild(null);
        setMessage('Build deselected');
      } else {
        setSelectedBuild({ build, index: buildIndex });
        setMessage(`Build of ${build.value} selected. Click Capture to take it, or Build to increase it.`);
      }
    } else {
      // Card doesn't match - maybe they want to increase the build
      // Toggle selection for increasing
      if (selectedBuild?.index === buildIndex) {
        setSelectedBuild(null);
        setMessage('Build deselected');
      } else {
        setSelectedBuild({ build, index: buildIndex });
        setMessage(`Build selected. Click Build to add your ${selectedCard.card.rank} to this build.`);
      }
    }
  }

  async function captureBuild(buildIndex) {
    console.log('=== CAPTURE BUILD DEBUG ===');
    console.log('buildIndex:', buildIndex);
    console.log('selectedCard:', selectedCard);
    console.log('gameState.builds:', gameState?.builds);
    
    if (!selectedCard) {
      console.error('No selected card for build capture');
      setMessage('Error: No card selected');
      return;
    }
    
    const builds = gameState.builds || [];
    const build = builds[buildIndex];
    
    if (!build) {
      console.error('Build not found:', buildIndex);
      setMessage('Error: Build not found');
      return;
    }

    const { card: playedCard, index: handIndex } = selectedCard;

    // CRITICAL: Validate that card rank matches build value
    if (playedCard.rank !== build.value) {
      console.error('Card rank does not match build value:', {
        cardRank: playedCard.rank,
        buildValue: build.value
      });
      setMessage(`You need a ${build.value} to capture this build!`);
      return;
    }

    // Remove played card from hand
    const handKey = `${playerRole}Hand`;
    const currentHand = gameState[handKey];
    
    if (!currentHand || !Array.isArray(currentHand)) {
      console.error('Hand not array in capture build:', handKey, currentHand);
      setMessage('Error: Invalid hand state');
      return;
    }
    
    const newHand = currentHand.filter((_, idx) => idx !== handIndex);

    // Remove build
    const newBuilds = builds.filter((_, i) => i !== buildIndex);

    // Add to captured pile
    const capturedKey = `${playerRole}Captured`;
    const currentCaptured = gameState[capturedKey] || [];
    const buildCards = build.cards || [];
    const newCaptured = [...currentCaptured, playedCard, ...buildCards];

    console.log('Capturing build:', {
      buildValue: build.value,
      buildCards: buildCards.length,
      newCapturedTotal: newCaptured.length
    });

    // Switch turn
    const nextTurn = gameState.currentTurn === 'player1' ? 'player2' : 'player1';

    // Generate play message - use the CURRENT TURN player, not viewer's role
    const activePlayerName = gameState.currentTurn === 'player1' ? 
      (playerRole === 'player1' ? playerName : opponentName) :
      (playerRole === 'player2' ? playerName : opponentName);
    const playedCardStr = formatCardForMessage(playedCard);
    const msgText = `${activePlayerName} captured a build of ${build.value} with a ${playedCardStr}`;
    
    const updates = {
      [handKey]: newHand,
      builds: newBuilds,
      [capturedKey]: newCaptured,
      currentTurn: nextTurn,
      lastCapture: playerRole,
      lastPlayMessage: msgText,
      lastPlayTimestamp: Date.now()
    };

    console.log('Sending capture build updates:', updates);

    try {
      const gameStateRef = ref(database, `casino-games/${roomCode}/gameState`);
      await update(gameStateRef, updates);

      soundManager.play('capture'); // Play capture sound
      
      setSelectedCard(null);
      setMessage(`You captured the build of ${build.value}!`);
    } catch (error) {
      console.error('Error capturing build:', error);
      setMessage('Error capturing build. Please try again.');
    }
  }

  function getCardName(card) {
    const ranks = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    return `${ranks[card.rank]} of ${card.suit}s`;
  }

  // Format card name for play messages - shows suit for Aces, Spades, 10♦, 2♠
  function formatCardForMessage(card) {
    const ranks = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const suits = { Heart: '♥', Diamond: '♦', Club: '♣', Spade: '♠' };
    
    console.log('formatCardForMessage - card:', card, 'rank:', card.rank, 'suit:', card.suit);
    
    const rank = ranks[card.rank];
    
    // Show suit for: All Aces, All Spades, 10 of Diamonds, 2 of Spades
    if (card.rank === 1 || card.suit === 'Spade' || 
        (card.rank === 10 && card.suit === 'Diamond') || 
        (card.rank === 2 && card.suit === 'Spade')) {
      const result = `${rank}${suits[card.suit]}`;
      console.log('Showing suit - result:', result);
      return result;
    }
    
    console.log('Not showing suit - result:', rank);
    return rank;
  }

  // Show animated play message that fades after 2 seconds
  function showPlayMessage(text) {
    setPlayMessage(text);
    setTimeout(() => {
      setPlayMessage(null);
    }, 2000);
  }

  function toggleSound() {
    const newState = soundManager.toggle();
    setSoundEnabled(newState);
  }

  if (!gameState) {
    return <div className="loading">Loading game...</div>;
  }

  // Show Game Over if someone reached 21
  if (gameState.gameOver) {
    const p1Stats = calculateScore(gameState.player1Captured || []);
    const p2Stats = calculateScore(gameState.player2Captured || []);
    const p1TotalScore = gameState.player1TotalScore || 0;
    const p2TotalScore = gameState.player2TotalScore || 0;
    const winnerRole = gameState.winner;
    const winnerName = winnerRole === playerRole ? playerName : opponentName;

    const handleNewGame = async () => {
      // Only Player 1 should create new game
      if (playerRole !== 'player1') {
        setMessage('Waiting for new game to start...');
        return;
      }

      // Start completely fresh game
      const deck = shuffleDeck(createDeck());
      const { player1Hand, player2Hand, tableCards, deck: remainingDeck } = dealInitialCards(deck);

      const initialState = {
        deck: remainingDeck,
        player1Hand,
        player2Hand,
        tableCards,
        player1Captured: [],
        player2Captured: [],
        currentTurn: 'player2',
        currentDealer: 'player1',
        roundNumber: 1,
        player1Score: 0,
        player2Score: 0,
        player1TotalScore: 0,
        player2TotalScore: 0,
        lastCapture: null,
        builds: [],
        roundEnded: false,
        showRoundSummary: false,
        gameOver: false,
        winner: null
      };

      const gameStateRef = ref(database, `casino-games/${roomCode}/gameState`);
      await set(gameStateRef, initialState);
      setMessage('New game started!');
    };

    return (
      <div className="game">
        <div className="game-header">
          <h1>🎴 Casino Card Game</h1>
          <div className="room-info">
            Room: <strong>{roomCode}</strong>
            <span className="win-counter">
              {playerRole === 'player1' ? playerName : opponentName}: <strong>{gameState.player1Wins || 0}</strong> | {' '}
              {playerRole === 'player2' ? playerName : opponentName}: <strong>{gameState.player2Wins || 0}</strong>
            </span>
            <button className="sound-toggle" onClick={toggleSound}>
              {soundEnabled ? '🔊 Sound ON' : '🔇 Sound OFF'}
            </button>
            <button className="leave-btn" onClick={onLeaveGame}>Leave Game</button>
          </div>
        </div>

        <div className="game-over">
          <h1>🏆 {winnerName} Wins! 🏆</h1>
          
          <div className="final-scores">
            <h2>Final Score</h2>
            <div className="score-display">
              <div className={winnerRole === 'player1' ? 'winner' : ''}>
                {playerRole === 'player1' ? playerName : opponentName}: {p1TotalScore}
              </div>
              <div className={winnerRole === 'player2' ? 'winner' : ''}>
                {playerRole === 'player2' ? playerName : opponentName}: {p2TotalScore}
              </div>
            </div>
          </div>

          <div className="score-section">
            <h3>Final Breakdown</h3>
            <div className="player-scores">
              <div className="player-score-card">
                <h4>{playerRole === 'player1' ? playerName : opponentName}</h4>
                <div className="score-details">
                  {p1Stats.cardCount > p2Stats.cardCount && <div>Most Cards: 3 pts</div>}
                  {p1Stats.spadeCount > p2Stats.spadeCount && <div>Most Spades: 1 pt</div>}
                  {p1Stats.has10Diamond && <div>10♦ (Big Casino): 2 pts</div>}
                  {p1Stats.has2Spade && <div>2♠ (Little Casino): 1 pt</div>}
                  {p1Stats.aceCount > 0 && <div>Aces: {p1Stats.aceCount} pts</div>}
                </div>
                <div className="stats">
                  Total Cards: {p1Stats.cardCount} | Total Spades: {p1Stats.spadeCount}
                </div>
              </div>

              <div className="player-score-card">
                <h4>{playerRole === 'player2' ? playerName : opponentName}</h4>
                <div className="score-details">
                  {p2Stats.cardCount > p1Stats.cardCount && <div>Most Cards: 3 pts</div>}
                  {p2Stats.spadeCount > p1Stats.spadeCount && <div>Most Spades: 1 pt</div>}
                  {p2Stats.has10Diamond && <div>10♦ (Big Casino): 2 pts</div>}
                  {p2Stats.has2Spade && <div>2♠ (Little Casino): 1 pt</div>}
                  {p2Stats.aceCount > 0 && <div>Aces: {p2Stats.aceCount} pts</div>}
                </div>
                <div className="stats">
                  Total Cards: {p2Stats.cardCount} | Total Spades: {p2Stats.spadeCount}
                </div>
              </div>
            </div>
          </div>

          <div className="game-over-buttons">
            <button className="new-game-btn" onClick={handleNewGame}>
              New Game
            </button>
            <button className="leave-btn" onClick={onLeaveGame}>
              Leave Game
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show Round Summary if round just ended
  if (gameState.showRoundSummary) {
    const p1Stats = calculateScore(gameState.player1Captured || []);
    const p2Stats = calculateScore(gameState.player2Captured || []);
    const p1Score = gameState.player1Score || 0;
    const p2Score = gameState.player2Score || 0;
    const p1TotalScore = gameState.player1TotalScore || 0;
    const p2TotalScore = gameState.player2TotalScore || 0;

    const handleContinue = async () => {
      // Only Player 1 should start new round to avoid conflicts
      if (playerRole !== 'player1') {
        setMessage('Waiting for new round to start...');
        return;
      }
      
      // Start new round
      const deck = shuffleDeck(createDeck());
      const { player1Hand, player2Hand, tableCards, deck: remainingDeck } = dealInitialCards(deck);
      
      const newDealer = gameState.currentDealer === 'player1' ? 'player2' : 'player1';
      const newTurn = newDealer === 'player1' ? 'player2' : 'player1';

      const updates = {
        deck: remainingDeck,
        player1Hand,
        player2Hand,
        tableCards,
        player1Captured: [],
        player2Captured: [],
        currentTurn: newTurn,
        currentDealer: newDealer,
        roundNumber: (gameState.roundNumber || 1) + 1,
        player1Score: 0,
        player2Score: 0,
        player1TotalScore: 0,  // Reset total score for new game
        player2TotalScore: 0,  // Reset total score for new game
        player1Wins: gameState.player1Wins || 0,  // Preserve wins
        player2Wins: gameState.player2Wins || 0,  // Preserve wins
        lastCapture: null,
        builds: [],
        roundEnded: false,
        showRoundSummary: false,  // Hide summary, start new round
        gameOver: false,  // Clear game over state
        winner: null  // Clear winner
      };

      const gameStateRef = ref(database, `casino-games/${roomCode}/gameState`);
      await update(gameStateRef, updates);
      setMessage('New round started!');
    };

    return (
      <div className="game">
        <div className="game-header">
          <h1>🎴 Casino Card Game</h1>
          <div className="room-info">
            Room: <strong>{roomCode}</strong>
            <span className="win-counter">
              {playerRole === 'player1' ? playerName : opponentName}: <strong>{gameState.player1Wins || 0}</strong> | {' '}
              {playerRole === 'player2' ? playerName : opponentName}: <strong>{gameState.player2Wins || 0}</strong>
            </span>
            <button className="sound-toggle" onClick={toggleSound}>
              {soundEnabled ? '🔊 Sound ON' : '🔇 Sound OFF'}
            </button>
            <button className="leave-btn" onClick={onLeaveGame}>Leave Game</button>
          </div>
        </div>

        <div className="round-summary">
          <h2>Round {gameState.roundNumber || 1} Complete!</h2>
          
          <div className="score-section">
            <h3>Current Round Points</h3>
            <div className="player-scores">
              <div className="player-score-card">
                <h4>{playerRole === 'player1' ? playerName : opponentName}</h4>
                <div className="score-details">
                  {p1Stats.cardCount > p2Stats.cardCount && <div>Most Cards: 3 pts</div>}
                  {p1Stats.spadeCount > p2Stats.spadeCount && <div>Most Spades: 1 pt</div>}
                  {p1Stats.has10Diamond && <div>10♦ (Big Casino): 2 pts</div>}
                  {p1Stats.has2Spade && <div>2♠ (Little Casino): 1 pt</div>}
                  {p1Stats.aceCount > 0 && <div>Aces: {p1Stats.aceCount} pts</div>}
                  <div className="total-round">Total: {p1Score} pts</div>
                </div>
                <div className="stats">
                  Cards: {p1Stats.cardCount} | Spades: {p1Stats.spadeCount}
                </div>
              </div>

              <div className="player-score-card">
                <h4>{playerRole === 'player2' ? playerName : opponentName}</h4>
                <div className="score-details">
                  {p2Stats.cardCount > p1Stats.cardCount && <div>Most Cards: 3 pts</div>}
                  {p2Stats.spadeCount > p1Stats.spadeCount && <div>Most Spades: 1 pt</div>}
                  {p2Stats.has10Diamond && <div>10♦ (Big Casino): 2 pts</div>}
                  {p2Stats.has2Spade && <div>2♠ (Little Casino): 1 pt</div>}
                  {p2Stats.aceCount > 0 && <div>Aces: {p2Stats.aceCount} pts</div>}
                  <div className="total-round">Total: {p2Score} pts</div>
                </div>
                <div className="stats">
                  Cards: {p2Stats.cardCount} | Spades: {p2Stats.spadeCount}
                </div>
              </div>
            </div>
          </div>

          <div className="score-section cumulative">
            <h3>Cumulative Game Score</h3>
            <div className="cumulative-scores">
              <div>{playerRole === 'player1' ? playerName : opponentName}: {p1TotalScore}</div>
              <div>{playerRole === 'player2' ? playerName : opponentName}: {p2TotalScore}</div>
            </div>
          </div>

          <button className="continue-btn" onClick={handleContinue}>
            Continue Game
          </button>
        </div>
      </div>
    );
  }

  const myHand = gameState[`${playerRole}Hand`] || [];
  const opponentHand = gameState[playerRole === 'player1' ? 'player2Hand' : 'player1Hand'] || [];
  const myCaptured = gameState[`${playerRole}Captured`] || [];
  const opponentCaptured = gameState[playerRole === 'player1' ? 'player2Captured' : 'player1Captured'] || [];
  const myScore = gameState[playerRole === 'player1' ? 'player1Score' : 'player2Score'] || 0;
  const opponentScore = gameState[playerRole === 'player1' ? 'player2Score' : 'player1Score'] || 0;
  const tableCards = gameState.tableCards || [];
  const builds = gameState.builds || [];
  const isMyTurn = gameState.currentTurn === playerRole;

  return (
    <div className="game">
      <div className="game-header">
        <h1>🎴 Casino Card Game</h1>
        <div className="room-info">
          Room: <strong>{roomCode}</strong>
          <span className="win-counter">
            {playerRole === 'player1' ? playerName : opponentName}: <strong>{gameState.player1Wins || 0}</strong> | {' '}
            {playerRole === 'player2' ? playerName : opponentName}: <strong>{gameState.player2Wins || 0}</strong>
          </span>
          <button className="sound-toggle" onClick={toggleSound}>
            {soundEnabled ? '🔊 Sound ON' : '🔇 Sound OFF'}
          </button>
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
            {tableCards.map((card, i) => (
              <div
                key={`${card.rank}-${card.suit}-${i}`}
                onClick={() => handleTableCardClick(card, i)}
                className={`table-card ${selectedTableCards.some(tc => tc.index === i) ? 'selected' : ''}`}
              >
                <Card rank={card.rank} suit={card.suit} />
              </div>
            ))}

            {/* Builds */}
            {builds.map((build, i) => (
              <div
                key={`build-${i}`}
                className={`build-pile ${selectedBuild?.index === i ? 'selected' : ''}`}
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
            
            {/* Animated play message */}
            {playMessage && (
              <div className="play-message-overlay">
                {playMessage}
              </div>
            )}
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
          <button onClick={handleBuild} disabled={!selectedCard || (selectedTableCards.length === 0 && !selectedBuild) || !isMyTurn}>
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
