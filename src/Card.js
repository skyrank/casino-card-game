import React from 'react';
import './Card.css';

function Card({ rank, suit }) {
  // Helper function to get suit symbol
  const getSuitSymbol = (suit) => {
    const symbols = {
      'Spade': '\u2660',    // ♠
      'Club': '\u2663',     // ♣
      'Heart': '\u2665',    // ♥
      'Diamond': '\u2666'   // ♦
    };
    return symbols[suit];
  };

  // Helper function to get suit color
  const getColor = (suit) => {
    return (suit === 'Heart' || suit === 'Diamond') ? 'red' : 'black';
  };

  // Helper function to display rank
  const getRankDisplay = (rank) => {
    if (rank === 1) return 'A';
    if (rank === 11) return 'J';
    if (rank === 12) return 'Q';
    if (rank === 13) return 'K';
    return rank.toString();
  };

  return (
    <div className="card" style={{ color: getColor(suit) }}>
      <div className="card-corner top-left">
        <div>{getRankDisplay(rank)}</div>
        <div>{getSuitSymbol(suit)}</div>
      </div>
      <div className="card-center">
        {getSuitSymbol(suit)}
      </div>
      <div className="card-corner bottom-right">
        <div>{getRankDisplay(rank)}</div>
        <div>{getSuitSymbol(suit)}</div>
      </div>
    </div>
  );
}

export default Card;
