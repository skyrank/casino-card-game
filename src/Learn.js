import React from 'react';
import './Learn.css';

function Learn({ onBack }) {
  const videos = [
    { id: '3AxQdRhIBpw', title: 'How To Make a Build' },
    { id: 'bKEEv1S-OAk', title: 'Making 2 Builds and Capturing' },
    { id: 'bNx97uLCz_M', title: 'A-Basic Build 3' },
    { id: 'smNA_TkVqRk', title: 'A-Basic Capture' },
    { id: 'sbfMDl4bwbI', title: 'Capturing 2 Cards from the Table' },
    { id: '9NA7uCvfuTw', title: 'End-of-Round Screen' },
    { id: 's8XFUMMn6W0', title: 'Unable-To Capture Smaller Card' }
  ];

  return (
    <div className="learn-page">
      <div className="learn-header">
        <h1>🎴 How to Play Casino</h1>
        <p>Watch these short tutorials to master the game</p>
        <button onClick={onBack} className="back-link">← Back to Game</button>
      </div>

      <div className="videos-grid">
        {videos.map((video, index) => (
          <div key={video.id} className="video-card">
            <div className="video-wrapper">
              <iframe
                src={`https://www.youtube.com/embed/${video.id}`}
                title={video.title}
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              ></iframe>
            </div>
            <h3>{video.title}</h3>
          </div>
        ))}
      </div>

      <div className="learn-footer">
        <button onClick={onBack} className="play-now-btn">Play Now →</button>
      </div>
    </div>
  );
}

export default Learn;
