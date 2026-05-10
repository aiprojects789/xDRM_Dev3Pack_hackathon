import React, { useEffect } from 'react';
import toast from 'react-hot-toast';

const DRMProtection = () => {
  useEffect(() => {
    // 1. Disable Keyboard Shortcuts (PrintScreen, Ctrl+P)
    const handleKeyDown = (e) => {
      // Print Screen
      if (e.key === 'PrintScreen') {
        navigator.clipboard.writeText('');
        toast.error('Screenshots are disabled on this platform.', { id: 'drm-print' });
        e.preventDefault();
      }

      // Ctrl + P (Print)
      if (e.ctrlKey && e.key === 'p') {
        toast.error('Printing is disabled for this content.', { id: 'drm-print' });
        e.preventDefault();
      }
    };

    // Add listeners
    document.addEventListener('keydown', handleKeyDown);

    // CSS to prevent image dragging only (keeping text selection enabled)
    const style = document.createElement('style');
    style.innerHTML = `
      img {
        -webkit-user-drag: none !important;
        -khtml-user-drag: none !important;
        -moz-user-drag: none !important;
        -o-user-drag: none !important;
        user-drag: none !important;
        pointer-events: none !important;
      }
    `;
    document.head.appendChild(style);

    return () => {
      // Cleanup
      document.removeEventListener('keydown', handleKeyDown);
      if (document.head.contains(style)) {
        document.head.removeChild(style);
      }
    };
  }, []);

  return null;
};

export default DRMProtection;
