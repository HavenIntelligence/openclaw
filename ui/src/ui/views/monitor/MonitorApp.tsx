import React, { useState, useEffect, useMemo } from "react";
import "./monitor.css";
import { deriveState } from "./derivation";
import { mockAgents, mockEvents, mockTimelineEnd } from "./mockData";
import { MonitorDashboard } from "./MonitorDashboard";

export interface MonitorAppProps {
  isDark: boolean;
}

export function MonitorApp({ isDark }: MonitorAppProps) {
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [hoveredAgentId, setHoveredAgentId] = useState<string | null>(null);

  const MAX_TIME = mockTimelineEnd;

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
    <MonitorDashboard
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
      isDark={isDark}
      {...derivedState}
    />
  );
}
