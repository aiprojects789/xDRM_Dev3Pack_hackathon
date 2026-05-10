import React from "react";
import { useWeb3 } from "../context/Web3Context";

const NetworkSelector = () => {
  const {
    currentNetworkConfig,
    connected,
  } = useWeb3();

  // Determine status indicator color
  const getStatusColor = () => {
    if (!connected) return "#9ca3af"; // gray - not connected
    return "#22c55e"; // green - correct network (Solana only)
  };

  return (
    <div style={{ position: "relative", zIndex: 9999 }}>
      {/* Network Button (Read-only since only one network exists) */}
      <div
        id="network-selector-display"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "6px 12px",
          borderRadius: "8px",
          border: "1px solid #e5e7eb",
          backgroundColor: "#ffffff",
          fontSize: "13px",
          fontWeight: 500,
          color: "#374151",
          whiteSpace: "nowrap",
          boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
        }}
      >
        {/* Status dot */}
        <span
          style={{
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            backgroundColor: getStatusColor(),
            flexShrink: 0,
          }}
        />
        {/* Network icon + name */}
        <div 
          style={{ 
            width: "18px", 
            height: "18px", 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "center",
            flexShrink: 0,
            borderRadius: "50%",
            overflow: "hidden",
          }}
        >
          <img 
            src={currentNetworkConfig.icon} 
            alt={currentNetworkConfig.label} 
            style={{ width: "100%", height: "100%", objectFit: "contain" }} 
          />
        </div>
        <span>{currentNetworkConfig.shortLabel}</span>
      </div>
    </div>
  );
};

export default NetworkSelector;
