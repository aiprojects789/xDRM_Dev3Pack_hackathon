import React, { useState } from 'react';
import { X, Copy, Check, Facebook, Linkedin, MessageCircle, Share2 } from 'lucide-react';
import toast from 'react-hot-toast';

const ShareModal = ({ isOpen, onClose, artwork }) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !artwork) return null;

  const artworkId = artwork._id || artwork.id || artwork.token_id;
  const shareUrl = `https://xdrm.softechdigitalgroup.com/share/${artworkId}`;
  const shareTitle = `Check out this amazing artwork "${artwork.title || 'Untitled'}" on XDRM - The secure platform to protect and monetize digital creations! 🎨🚀`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast.success('Link copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  const shareOptions = [
    {
      name: 'X (Twitter)',
      icon: (
        <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      ),
      color: 'bg-black text-white',
      url: `https://x.com/intent/tweet?text=${encodeURIComponent(shareTitle)}&url=${encodeURIComponent(shareUrl)}`
    },
    {
      name: 'Facebook',
      icon: <Facebook className="w-5 h-5 text-white" strokeWidth={2.5} />,
      color: 'bg-[#1877F2] text-white',
      url: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}&quote=${encodeURIComponent(shareTitle)}`
    },
    {
      name: 'LinkedIn',
      icon: <Linkedin className="w-5 h-5 text-white" strokeWidth={2.5} />,
      color: 'bg-[#0A66C2] text-white',
      url: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`
    },
    {
      name: 'WhatsApp',
      icon: <MessageCircle className="w-5 h-5 text-white" strokeWidth={2.5} />,
      color: 'bg-[#25D366] text-white',
      url: `https://api.whatsapp.com/send?text=${encodeURIComponent(shareTitle + ' ' + shareUrl)}`
    }
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-xl font-bold text-gray-900 flex items-center">
            <Share2 className="w-5 h-5 mr-2 text-purple-600" />
            Share Artwork
          </h3>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500 hover:text-gray-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <p className="text-gray-600 mb-6 text-center">
            Share this artwork with your friends and community on social media.
          </p>

          {/* Social Grid */}
          <div className="grid grid-cols-2 gap-4 mb-8">
            {shareOptions.map((option) => (
              <a
                key={option.name}
                href={option.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center justify-center gap-3 py-3 px-4 rounded-xl text-white font-medium ${option.color} transition-transform hover:scale-[1.03] active:scale-[0.98] shadow-md`}
              >
                {option.icon}
                <span>{option.name}</span>
              </a>
            ))}
          </div>

          {/* Copy Link Section */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-700 ml-1">Copy Link</label>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={shareUrl}
                className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
              />
              <button
                onClick={handleCopyLink}
                className={`flex items-center justify-center px-4 rounded-xl transition-all ${
                  copied 
                    ? 'bg-green-100 text-green-600 border border-green-200' 
                    : 'bg-purple-600 text-white hover:bg-purple-700 shadow-md'
                }`}
                title="Copy to clipboard"
              >
                {copied ? <Check className="w-5 h-5 text-green-600" /> : <Copy className="w-5 h-5 text-white" />}
              </button>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="bg-gray-50 px-6 py-4 text-center">
          <p className="text-xs text-gray-500">
            Artworks shared via this link will include your DRM protections.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ShareModal;
