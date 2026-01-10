// Deck creation and game utilities

export function createDeck() {
  const deck = [];
  const suits = ["Spade", "Club", "Heart", "Diamond"];
  
  for (let i = 0; i < suits.length; i++) {
    const suit = suits[i];
    for (let rank = 1; rank <= 13; rank++) {
      deck.push({ rank, suit });
    }
  }
  
  return deck;
}

export function shuffleDeck(deck) {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function dealInitialCards(deck) {
  // Deal 2 to player1, 2 to table, 2 to player2, repeat
  const player1Hand = [deck[0], deck[1], deck[6], deck[7]];
  const tableCards = [deck[2], deck[3], deck[8], deck[9]];
  const player2Hand = [deck[4], deck[5], deck[10], deck[11]];
  const remainingDeck = deck.slice(12);
  
  return {
    player1Hand,
    player2Hand,
    tableCards,
    deck: remainingDeck
  };
}

export function dealNextRound(deck, numCards = 4) {
  // Deal 4 cards to each player (no more to table)
  if (deck.length < 8) return null;
  
  const player1Hand = deck.slice(0, 4);
  const player2Hand = deck.slice(4, 8);
  const remainingDeck = deck.slice(8);
  
  return {
    player1Hand,
    player2Hand,
    deck: remainingDeck
  };
}

export function calculateScore(capturedCards) {
  let score = 0;
  let spadeCount = 0;
  let aceCount = 0;
  let has10Diamond = false;
  let has2Spade = false;
  
  capturedCards.forEach(card => {
    // Count aces (1 point each)
    if (card.rank === 1) {
      score += 1;
      aceCount += 1;
    }
    
    // Little casino (2 of spades)
    if (card.rank === 2 && card.suit === "Spade") {
      score += 1;
      has2Spade = true;
    }
    
    // Big casino (10 of diamonds)
    if (card.rank === 10 && card.suit === "Diamond") {
      score += 2;
      has10Diamond = true;
    }
    
    // Count spades for majority
    if (card.suit === "Spade") spadeCount++;
  });
  
  return { 
    score, 
    spadeCount, 
    cardCount: capturedCards.length,
    aceCount,
    has10Diamond,
    has2Spade
  };
}

export function canCapture(playedCard, tableCards) {
  const captures = [];
  
  // Check for pairing - exact rank match
  tableCards.forEach((card, index) => {
    if (card.rank === playedCard.rank) {
      captures.push({
        type: 'pair',
        cards: [card],
        indices: [index]
      });
    }
  });
  
  // For MVP, just return pairing captures
  // (We can add combining logic later)
  
  return captures;
}
