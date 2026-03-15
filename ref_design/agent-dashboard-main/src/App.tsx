import React, { useState, useEffect, useMemo } from "react";
import Dashboard from "./components/Dashboard";
import { mockAgents, mockEvents } from "./mockData";
import { deriveState } from "./utils/derivation";

export default function App() {
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [hoveredAgentId, setHoveredAgentId] = useState<string | null>(null);

  const MAX_TIME = 400;

  useEffect(() => {
    if (!isPlaying) {
      return;
    }
    const timer = setInterval(() => {
      setCurrentTime((t) => {
        if (t >= MAX_TIME) {
          setIsPlaying(false);
          return t;
        }
        return t + 1;
      });
    }, 100);
    return () => clearInterval(timer);
  }, [isPlaying]);

  const derivedState = useMemo(
    () => deriveState(mockAgents, mockEvents, currentTime),
    [currentTime],
  );

  return (
    <Dashboard
      currentTime={currentTime}
      setCurrentTime={setCurrentTime}
      isPlaying={isPlaying}
      setIsPlaying={setIsPlaying}
      selectedAgentId={selectedAgentId}
      setSelectedAgentId={setSelectedAgentId}
      hoveredAgentId={hoveredAgentId}
      setHoveredAgentId={setHoveredAgentId}
      agents={mockAgents}
      events={mockEvents}
      maxTime={MAX_TIME}
      {...derivedState}
    />
  );
}
