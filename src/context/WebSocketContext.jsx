// src/contexts/WebSocketContext.jsx
import React, { createContext, useContext } from "react";
import { useWebSocket } from "../hooks/useWebSocket";

const WebSocketContext = createContext(null);

export function WebSocketProvider({ children }) {
  const ws = useWebSocket();

  return (
    <WebSocketContext.Provider value={ws}>{children}</WebSocketContext.Provider>
  );
}

export function useWS() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error("useWS must be used within WebSocketProvider");
  }
  return context;
}
