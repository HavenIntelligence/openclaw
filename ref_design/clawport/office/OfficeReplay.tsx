"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  advanceOfficeReplayClock,
  createInitialOfficeViewState,
  deriveOfficeScene,
  formatOfficeReplayTime,
  officeEventIcon,
  resetOfficeViewState,
  resolveOfficeAgentContext,
  resolveOfficeEventTone,
  type OfficeDerivedAgent,
  type OfficeEdge,
  type OfficeEvent,
  type OfficePanelTab,
  type OfficePoint,
  type OfficeReviewAction,
  type OfficeScenario,
  type OfficeTone,
} from "@/lib/office/replay";
import {
  DEFAULT_OFFICE_SCENARIO_ID,
  OFFICE_COLS,
  OFFICE_ROWS,
  OFFICE_SCENARIOS,
  OFFICE_TILE,
  getOfficeScenarioById,
} from "@/lib/office/scenarios";
import { cn } from "@/lib/utils";
import styles from "./OfficeReplay.module.css";

const SPEED_OPTIONS = [1, 2, 4] as const;
const AGENT_CARD_WIDTH = 92;
const AGENT_CARD_HEIGHT = 88;
const AGENT_ANCHOR_X = AGENT_CARD_WIDTH / 2;
const AGENT_ANCHOR_Y = 26;

export function OfficeReplay() {
  const [viewState, setViewState] = useState(() =>
    createInitialOfficeViewState(getOfficeScenarioById(DEFAULT_OFFICE_SCENARIO_ID)),
  );
  const [liveScenario, setLiveScenario] = useState<OfficeScenario | null>(null);
  const [liveGeneratedAt, setLiveGeneratedAt] = useState<number | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [liveRefreshTick, setLiveRefreshTick] = useState(0);
  const lastFrameRef = useRef<number | null>(null);
  const liveDebounceRef = useRef<number | null>(null);

  const baseScenario = useMemo(
    () => getOfficeScenarioById(viewState.scenarioId),
    [viewState.scenarioId],
  );
  const isLiveScenario = baseScenario.mode === "live";
  const scenario = isLiveScenario && liveScenario ? liveScenario : baseScenario;
  const sceneClockMs = isLiveScenario ? scenario.durationMs : viewState.clockMs;

  const scene = useMemo(
    () =>
      deriveOfficeScene({
        scenario,
        clockMs: sceneClockMs,
        selectedEventId: viewState.selectedEventId,
        reviewDecisions: viewState.reviewDecisions,
      }),
    [scenario, sceneClockMs, viewState.selectedEventId, viewState.reviewDecisions],
  );

  const width = OFFICE_COLS * OFFICE_TILE + 56;
  const height = OFFICE_ROWS * OFFICE_TILE;
  const agentById = useMemo(
    () => new Map(scene.agents.map((agent) => [agent.id, agent])),
    [scene.agents],
  );
  const selectedAgentId = resolveSelectedAgentId(
    scene,
    viewState.selectedAgentId,
    scenario.defaultSelectedAgentId,
  );
  const selectedAgentContext = useMemo(
    () =>
      resolveOfficeAgentContext({
        scenario,
        scene,
        agentId: selectedAgentId,
      }),
    [scenario, scene, selectedAgentId],
  );
  const selectedArtifactId = resolveSelectedArtifactId(scene, viewState.selectedArtifactId);
  const selectedArtifact =
    scene.artifacts.find((artifact) => artifact.id === selectedArtifactId) ??
    scene.artifacts[0] ??
    null;
  const selectedEdge = scenario.edges.find((edge) => edge.id === viewState.selectedEdgeId) ?? null;
  const selectedEdgeEvent =
    selectedEdge && sceneClockMs > 0
      ? latestEventForEdge(scenario, sceneClockMs, selectedEdge.id)
      : null;
  const timelineSelectionId = viewState.selectedEventId ?? scene.latestEvent?.id ?? null;
  const focusAgentIds = useMemo(() => new Set(scenario.focusTrail), [scenario.focusTrail]);
  const overlayCards = scene.eventCards.slice(-2).toReversed();
  const progressPercent = isLiveScenario
    ? scenario.projectProgress
    : Math.round(scene.playbackProgress * 100);
  const transportTimeLabel = isLiveScenario
    ? liveGeneratedAt
      ? new Date(liveGeneratedAt).toLocaleTimeString()
      : "Connecting"
    : formatOfficeReplayTime(viewState.clockMs);

  useEffect(() => {
    if (!isLiveScenario) {
      return;
    }

    const controller = new AbortController();

    fetch("/api/office/live", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error ?? "Failed to load live office workspace");
        }
        return response.json();
      })
      .then((payload: { generatedAt: number; scenario: OfficeScenario }) => {
        setLiveScenario(payload.scenario);
        setLiveGeneratedAt(payload.generatedAt);
        setLiveError(null);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setLiveError(
          error instanceof Error ? error.message : "Failed to load live office workspace",
        );
      });

    return () => controller.abort();
  }, [isLiveScenario, liveRefreshTick]);

  useEffect(() => {
    if (!isLiveScenario) {
      if (liveDebounceRef.current !== null) {
        window.clearTimeout(liveDebounceRef.current);
        liveDebounceRef.current = null;
      }
      return;
    }

    setLiveRefreshTick((tick) => tick + 1);

    const intervalId = window.setInterval(() => {
      setLiveRefreshTick((tick) => tick + 1);
    }, 20000);

    const stream = new EventSource("/api/logs/stream");
    stream.onmessage = () => {
      if (liveDebounceRef.current !== null) {
        return;
      }
      liveDebounceRef.current = window.setTimeout(() => {
        liveDebounceRef.current = null;
        setLiveRefreshTick((tick) => tick + 1);
      }, 1500);
    };

    return () => {
      window.clearInterval(intervalId);
      stream.close();
      if (liveDebounceRef.current !== null) {
        window.clearTimeout(liveDebounceRef.current);
        liveDebounceRef.current = null;
      }
    };
  }, [isLiveScenario]);

  useEffect(() => {
    if (!viewState.isPlaying || isLiveScenario) {
      lastFrameRef.current = null;
      return;
    }

    let frameId = 0;
    const tick = (now: number) => {
      if (lastFrameRef.current === null) {
        lastFrameRef.current = now;
      }
      const deltaMs = now - lastFrameRef.current;
      lastFrameRef.current = now;

      setViewState((prev) => {
        if (!prev.isPlaying) {
          return prev;
        }
        const currentScenario = getOfficeScenarioById(prev.scenarioId);
        const next = advanceOfficeReplayClock({
          scenario: currentScenario,
          currentClockMs: prev.clockMs,
          deltaMs,
          speed: prev.speed,
          reviewDecisions: prev.reviewDecisions,
        });

        if (next.clockMs === prev.clockMs && !next.autoPaused && !next.gatedEventId) {
          return prev;
        }

        return {
          ...prev,
          clockMs: next.clockMs,
          isPlaying: !next.autoPaused,
          panelTab: next.gatedEventId ? "timeline" : prev.panelTab,
          selectedEventId: next.gatedEventId ?? prev.selectedEventId,
        };
      });

      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frameId);
      lastFrameRef.current = null;
    };
  }, [isLiveScenario, viewState.isPlaying]);

  function resetFrameClock() {
    lastFrameRef.current = null;
  }

  function chooseScenario(id: string) {
    const nextScenario = getOfficeScenarioById(id);
    setViewState((prev) => ({
      ...resetOfficeViewState(prev, nextScenario),
      isPlaying: nextScenario.mode === "live" ? false : true,
    }));
    resetFrameClock();
  }

  function setReplaySpeed(speed: number) {
    setViewState((prev) => ({ ...prev, speed }));
    resetFrameClock();
  }

  function togglePlayback() {
    if (isLiveScenario) {
      setLiveRefreshTick((tick) => tick + 1);
      return;
    }
    setViewState((prev) => ({ ...prev, isPlaying: !prev.isPlaying }));
    resetFrameClock();
  }

  function replayCurrentScenario() {
    if (isLiveScenario) {
      setLiveRefreshTick((tick) => tick + 1);
      return;
    }
    setViewState((prev) => ({
      ...createInitialOfficeViewState(scenario),
      speed: prev.speed,
      panelTab: prev.panelTab,
    }));
    resetFrameClock();
  }

  function selectAgent(agentId: string) {
    setViewState((prev) => ({
      ...prev,
      panelTab: "agent",
      selectedAgentId: agentId,
      selectedArtifactId: null,
      selectedEdgeId: null,
    }));
  }

  function selectTimelineEvent(eventId: string) {
    const event = scenario.events.find((entry) => entry.id === eventId);
    setViewState((prev) => ({
      ...prev,
      panelTab: "timeline",
      selectedEventId: eventId,
      selectedAgentId: event?.actorId ?? prev.selectedAgentId,
      selectedEdgeId: event?.edgeId ?? null,
    }));
  }

  function selectArtifact(artifactId: string, eventId: string | null) {
    const event = eventId ? scenario.events.find((entry) => entry.id === eventId) : null;
    setViewState((prev) => ({
      ...prev,
      panelTab: "artifacts",
      selectedArtifactId: artifactId,
      selectedEventId: eventId,
      selectedAgentId: event?.actorId ?? prev.selectedAgentId,
      selectedEdgeId: event?.edgeId ?? null,
    }));
  }

  function selectEdge(edgeId: string) {
    const event = latestEventForEdge(scenario, sceneClockMs, edgeId);
    setViewState((prev) => ({
      ...prev,
      panelTab: "timeline",
      selectedEdgeId: edgeId,
      selectedEventId: event?.id ?? prev.selectedEventId,
      selectedAgentId: event?.actorId ?? prev.selectedAgentId,
    }));
  }

  function chooseReviewAction(event: OfficeEvent, action: OfficeReviewAction) {
    setViewState((prev) => ({
      ...prev,
      reviewDecisions: { ...prev.reviewDecisions, [event.id]: action.id },
      panelTab: action.focusAgentId ? "agent" : "timeline",
      selectedAgentId: action.focusAgentId ?? prev.selectedAgentId,
      isPlaying: action.resumePlayback ?? false,
    }));
    resetFrameClock();
  }

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div className={styles.heroIntro}>
          <span className={styles.eyebrow}>Office Replay</span>
          <h1 className={styles.heroTitle}>Multi-Agent Control Plane</h1>
          <p className={styles.heroCopy}>
            Scripted local demo. Trace the handoff, artifact flow, blockers, and human checkpoints.
          </p>
        </div>

        <div className={styles.scenarios}>
          {OFFICE_SCENARIOS.map((entry) => {
            const isActive = entry.id === scenario.id;
            return (
              <button
                key={entry.id}
                type="button"
                className={cn(styles.scenarioChip, isActive && styles.scenarioChipActive)}
                onClick={() => chooseScenario(entry.id)}
              >
                <span className={styles.scenarioChipName}>{entry.name}</span>
                <span className={styles.scenarioChipMeta}>
                  {entry.mode === "live" ? "live workspace" : `${entry.projectProgress}% script`}
                </span>
              </button>
            );
          })}
        </div>

        <div className={styles.transport}>
          <span
            className={cn(
              styles.phaseBadge,
              scene.activeBlocker ? styles.phaseBadgeDanger : styles.phaseBadgeNeutral,
            )}
          >
            {isLiveScenario ? "Live" : scene.currentPhase}
          </span>
          <span className={styles.time}>{transportTimeLabel}</span>
          {!isLiveScenario &&
            SPEED_OPTIONS.map((speed) => (
              <button
                key={speed}
                type="button"
                className={cn(
                  styles.speedButton,
                  viewState.speed === speed && styles.speedButtonActive,
                )}
                onClick={() => setReplaySpeed(speed)}
              >
                {speed}x
              </button>
            ))}
          <button
            type="button"
            className={cn(
              styles.actionButton,
              viewState.isPlaying ? styles.actionButtonMuted : styles.actionButtonPrimary,
            )}
            onClick={togglePlayback}
          >
            {isLiveScenario ? "Refresh" : viewState.isPlaying ? "Pause" : "Play"}
          </button>
          {!isLiveScenario && (
            <button
              type="button"
              className={cn(styles.actionButton, styles.actionButtonOutline)}
              onClick={replayCurrentScenario}
            >
              Replay
            </button>
          )}
        </div>
      </div>

      <div className={styles.layout}>
        <section className={styles.stage}>
          <div className={styles.projectBar}>
            <div className={styles.projectCopy}>
              <span className={styles.projectName}>{scenario.projectTitle}</span>
              <span className={styles.projectDescription}>{scenario.projectDescription}</span>
              <span className={styles.projectSummary}>{scenario.summary}</span>
            </div>
            <div className={styles.projectMeta}>
              <span
                className={cn(
                  styles.projectStatus,
                  styles[
                    `projectStatus${capitalize(scenario.projectStatus)}` as keyof typeof styles
                  ],
                )}
              >
                {scenario.projectStatus}
              </span>
              <div className={styles.projectProgress}>
                <div
                  className={styles.projectProgressFill}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <span className={styles.projectPercent}>{progressPercent}%</span>
            </div>
          </div>

          <div className={styles.sceneRow}>
            <div className={styles.sceneMain}>
              <div className={styles.focusStrip}>
                <span className={styles.focusStripLabel}>Critical path</span>
                <div className={styles.focusTrack}>
                  {scenario.focusTrail.map((agentId, index) => {
                    const trailAgent = scenario.agents.find((agent) => agent.id === agentId);
                    const isTrailHot =
                      scene.latestEvent?.actorId === agentId ||
                      scene.latestEvent?.targetId === agentId;

                    if (!trailAgent) {
                      return null;
                    }

                    return (
                      <div key={`${agentId}-${index}`} className={styles.focusSegment}>
                        <span className={cn(styles.focusPill, isTrailHot && styles.focusPillHot)}>
                          {trailAgent.emoji} {trailAgent.name}
                        </span>
                        {index < scenario.focusTrail.length - 1 && (
                          <span className={styles.focusArrow}>→</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className={styles.canvasWrap}>
                <div className={styles.canvas} style={{ width, height }}>
                  <div className={styles.floor} style={{ width, height }}>
                    <EdgeLayer
                      scenario={scenario}
                      edges={scenario.edges}
                      agentById={agentById}
                      highlightedEdgeId={viewState.selectedEdgeId}
                      scene={scene}
                      width={width}
                      height={height}
                      onSelectEdge={selectEdge}
                    />

                    {scenario.zones.map((zone) => (
                      <div
                        key={zone.id}
                        className={styles.zone}
                        style={{
                          left: zone.x * OFFICE_TILE,
                          top: zone.y * OFFICE_TILE,
                          width: zone.w * OFFICE_TILE,
                          height: zone.h * OFFICE_TILE,
                          background: zone.color,
                          borderColor: zone.border,
                        }}
                      >
                        <span className={styles.zoneLabel}>{zone.label}</span>
                      </div>
                    ))}

                    {scenario.agents.map((agent) => {
                      const desk = agent.desk;
                      return (
                        <div
                          key={`${agent.id}-desk`}
                          className={styles.deskItem}
                          style={{
                            left: desk.x * OFFICE_TILE + OFFICE_TILE / 2 - 10,
                            top: desk.y * OFFICE_TILE + OFFICE_TILE - 18,
                          }}
                        >
                          🖥️
                        </div>
                      );
                    })}

                    {scene.packets.map((packet) => {
                      const event =
                        scenario.events.find((entry) => entry.id === packet.eventId) ?? null;
                      const edge = packet.edgeId
                        ? (scenario.edges.find((entry) => entry.id === packet.edgeId) ?? null)
                        : inferEdgeForPacket(scenario.edges, packet.fromId, packet.toId);
                      const point = resolvePacketPoint(
                        packet.progress,
                        packet.fromId,
                        packet.toId,
                        edge,
                        agentById,
                      );
                      const packetArtifactId = event?.artifact?.id ?? null;
                      return (
                        <button
                          key={packet.id}
                          type="button"
                          className={styles.packet}
                          data-tone={packet.tone}
                          style={{ left: point.x, top: point.y }}
                          onClick={() => {
                            if (packetArtifactId) {
                              selectArtifact(packetArtifactId, event?.id ?? null);
                            } else {
                              selectTimelineEvent(packet.eventId);
                            }
                          }}
                        >
                          <span className={styles.packetIcon}>{packet.icon}</span>
                          <span className={styles.packetLabel}>{packet.label}</span>
                        </button>
                      );
                    })}

                    {scene.agents.map((agent) => {
                      const isSelected = selectedAgentId === agent.id;
                      const isHighlighted = scene.highlightedAgentIds.includes(agent.id);
                      const isFocus = focusAgentIds.has(agent.id);
                      const isHot =
                        isSelected ||
                        isHighlighted ||
                        scene.latestEvent?.actorId === agent.id ||
                        scene.latestEvent?.targetId === agent.id ||
                        agent.status === "blocked" ||
                        agent.status === "review";

                      return (
                        <button
                          key={agent.id}
                          type="button"
                          className={cn(
                            styles.agentCard,
                            isSelected && styles.agentCardSelected,
                            isHighlighted && styles.agentCardHighlight,
                            isHot && styles.agentCardHot,
                            isFocus && styles.agentCardFocus,
                            !isHot && !isSelected && !isFocus && styles.agentCardBackground,
                            !agent.isScenarioActive && styles.agentCardDim,
                          )}
                          style={
                            {
                              left: agent.x * OFFICE_TILE,
                              top: agent.y * OFFICE_TILE,
                              ["--agent-accent" as string]: agent.color,
                            } as React.CSSProperties
                          }
                          onClick={() => selectAgent(agent.id)}
                        >
                          <span className={styles.agentStatus} data-status={agent.status} />
                          <span className={styles.agentAvatarShell}>
                            <span className={styles.agentAvatar}>{agent.emoji}</span>
                          </span>
                          <span className={styles.agentName}>{agent.name}</span>
                          <span className={styles.agentRole}>{agent.role}</span>
                          <span className={styles.agentBadge} data-tone={agent.tone}>
                            {agent.status}
                          </span>
                        </button>
                      );
                    })}

                    {scenario.edges.map((edge) => {
                      const from = agentCenter(agentById.get(edge.fromId));
                      const to = agentCenter(agentById.get(edge.toId));
                      const control = resolveCurveControlPoint(from, to, edge.lane ?? 0);
                      const label = resolveEdgeLabelPlacement(from, control, to, edge.lane ?? 0);
                      const isHighlighted =
                        scene.highlightedEdgeIds.includes(edge.id) ||
                        viewState.selectedEdgeId === edge.id;
                      const isFocus = scenario.focusEdgeIds.includes(edge.id);

                      return (
                        <button
                          key={`${edge.id}-label`}
                          type="button"
                          className={cn(
                            styles.edgeLabelTag,
                            isHighlighted && styles.edgeLabelTagActive,
                            isFocus && styles.edgeLabelTagFocus,
                          )}
                          data-tone={resolveEdgeTone(
                            edge.id,
                            scenario,
                            scene.latestEvent?.atMs ?? 0,
                          )}
                          style={{ left: label.x, top: label.y }}
                          onClick={() => selectEdge(edge.id)}
                        >
                          {edge.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <aside className={styles.eventRail}>
              <div className={styles.overlayRack}>
                {overlayCards.length ? (
                  overlayCards.map((card, index) => (
                    <button
                      key={card.eventId}
                      type="button"
                      className={cn(
                        styles.eventCard,
                        styles.overlayEventCard,
                        index > 0 && styles.overlayEventCardSecondary,
                        timelineSelectionId === card.eventId && styles.eventCardSelected,
                      )}
                      data-tone={card.tone}
                      onClick={() => selectTimelineEvent(card.eventId)}
                    >
                      <span className={styles.eventCardIcon}>{officeEventIcon(card.kind)}</span>
                      <span className={styles.eventCardBody}>
                        <span className={styles.eventCardTitle}>{card.title}</span>
                        <span className={styles.eventCardDetail}>{card.detail}</span>
                        {card.outcome && (
                          <span className={styles.eventCardOutcome}>{card.outcome}</span>
                        )}
                      </span>
                    </button>
                  ))
                ) : (
                  <div className={cn(styles.contextCard, styles.eventRailPlaceholder)}>
                    <div className={styles.contextEyebrow}>Recent signal</div>
                    <div className={styles.contextBody}>
                      {isLiveScenario
                        ? (liveError ??
                          "Live annotations appear here when real workspace activity comes in.")
                        : "Event annotations appear here as the scripted sequence advances."}
                    </div>
                  </div>
                )}
              </div>
            </aside>
          </div>

          <div className={styles.summaryStrip}>
            <div className={styles.summaryCard}>
              <span className={styles.summaryLabel}>Now</span>
              <span className={styles.summaryTitle}>
                {scene.latestEvent?.title ??
                  (isLiveScenario
                    ? "Waiting for live activity"
                    : "Waiting for first scripted step")}
              </span>
              <span className={styles.summaryDetail}>
                {scene.latestEvent?.outcome ??
                  (isLiveScenario
                    ? "Chat with the live office agents to generate real activity here."
                    : "Press play to start the sequence.")}
              </span>
            </div>
            <div className={styles.summaryCard}>
              <span className={styles.summaryLabel}>Next</span>
              <span className={styles.summaryTitle}>
                {scene.nextEvent?.title ??
                  (isLiveScenario ? "Awaiting next workspace event" : "Scenario complete")}
              </span>
              <span className={styles.summaryDetail}>
                {scene.nextEvent
                  ? `${formatOfficeReplayTime(scene.nextEvent.atMs)} · ${scene.nextEvent.detail}`
                  : isLiveScenario
                    ? "The live case refreshes from real conversations and the gateway log stream."
                    : "Replay or switch scenarios to explore another path."}
              </span>
            </div>
            <div
              className={cn(styles.summaryCard, scene.activeBlocker && styles.summaryCardDanger)}
            >
              <span className={styles.summaryLabel}>Blocked</span>
              <span className={styles.summaryTitle}>
                {scene.activeBlocker?.label ?? "No active blocker"}
              </span>
              <span className={styles.summaryDetail}>
                {scene.activeBlocker?.detail ?? "The scripted path is currently clear."}
              </span>
            </div>
          </div>
        </section>

        <aside className={styles.panel}>
          <div className={styles.panelTabs}>
            <PanelTab
              active={viewState.panelTab === "timeline"}
              label="Timeline"
              onClick={() => setViewState((prev) => ({ ...prev, panelTab: "timeline" }))}
            />
            <PanelTab
              active={viewState.panelTab === "agent"}
              label="Selected Agent"
              onClick={() => setViewState((prev) => ({ ...prev, panelTab: "agent" }))}
            />
            <PanelTab
              active={viewState.panelTab === "artifacts"}
              label="Artifacts"
              onClick={() => setViewState((prev) => ({ ...prev, panelTab: "artifacts" }))}
            />
          </div>

          {viewState.panelTab === "timeline" && (
            <div className={styles.sideScroll}>
              {scene.pendingReview && (
                <div className={styles.reviewCard}>
                  <div className={styles.contextEyebrow}>Human review required</div>
                  <div className={styles.contextTitle}>
                    {scene.pendingReview.event.review?.question}
                  </div>
                  <div className={styles.contextBody}>
                    {scene.pendingReview.event.review?.summary}
                  </div>
                  <div className={styles.reviewActions}>
                    {(scene.pendingReview.event.review?.actions ?? []).map((action) => (
                      <button
                        key={action.id}
                        type="button"
                        className={cn(
                          styles.actionButton,
                          action.resumePlayback
                            ? styles.actionButtonPrimary
                            : styles.actionButtonOutline,
                        )}
                        onClick={() => chooseReviewAction(scene.pendingReview!.event, action)}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {selectedEdge && selectedEdgeEvent && (
                <div className={styles.contextCard}>
                  <div className={styles.contextEyebrow}>Selected relation</div>
                  <div className={styles.contextTitle}>{selectedEdge.label}</div>
                  <div className={styles.contextBody}>{selectedEdgeEvent.title}</div>
                </div>
              )}

              <div className={styles.timeline}>
                {scene.timeline.map((entry) => {
                  const isActive = timelineSelectionId === entry.event.id;
                  return (
                    <button
                      key={entry.event.id}
                      type="button"
                      className={cn(
                        styles.timelineItem,
                        entry.isCurrent && styles.timelineItemCurrent,
                        isActive && styles.timelineItemSelected,
                        !entry.isPast && styles.timelineItemFuture,
                      )}
                      onClick={() => selectTimelineEvent(entry.event.id)}
                    >
                      <span className={styles.timelineMeta}>
                        <span className={styles.timelineIcon}>
                          {officeEventIcon(entry.event.kind)}
                        </span>
                        <span className={styles.timelineTime}>
                          {formatOfficeReplayTime(entry.event.atMs)}
                        </span>
                        <span>{entry.event.phase}</span>
                      </span>
                      <span className={styles.timelineTitle}>{entry.event.title}</span>
                      <span className={styles.timelineDetail}>{entry.event.detail}</span>
                      {entry.decisionLabel && (
                        <span className={styles.timelineDecision}>{entry.decisionLabel}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {viewState.panelTab === "agent" && (
            <div className={styles.sideScroll}>
              {selectedAgentContext ? (
                <div className={styles.agentPanel}>
                  <div className={styles.agentHero}>
                    <span className={styles.agentHeroEmoji}>
                      {selectedAgentContext.agent.emoji}
                    </span>
                    <div className={styles.agentHeroCopy}>
                      <div className={styles.agentHeroName}>{selectedAgentContext.agent.name}</div>
                      <div className={styles.agentHeroRole}>
                        {selectedAgentContext.agent.role} · {selectedAgentContext.agent.team}
                      </div>
                    </div>
                    <span
                      className={styles.agentHeroState}
                      data-status={selectedAgentContext.agent.status}
                    >
                      {selectedAgentContext.agent.status}
                    </span>
                  </div>

                  <div className={styles.contextCard}>
                    <div className={styles.contextEyebrow}>Current task</div>
                    <div className={styles.contextTitle}>
                      {selectedAgentContext.agent.currentTask}
                    </div>
                    <div className={styles.contextBody}>{selectedAgentContext.agent.objective}</div>
                  </div>

                  {selectedAgentContext.blocker && (
                    <div className={cn(styles.contextCard, styles.contextCardDanger)}>
                      <div className={styles.contextEyebrow}>Active blocker</div>
                      <div className={styles.contextTitle}>
                        {selectedAgentContext.blocker.label}
                      </div>
                      <div className={styles.contextBody}>
                        {selectedAgentContext.blocker.detail}
                      </div>
                    </div>
                  )}

                  <div className={styles.agentGrid}>
                    <div className={styles.miniCard}>
                      <span className={styles.miniCardLabel}>Inbound</span>
                      <span className={styles.miniCardValue}>
                        {selectedAgentContext.inbound?.title ?? "No inbound handoff yet"}
                      </span>
                    </div>
                    <div className={styles.miniCard}>
                      <span className={styles.miniCardLabel}>Outbound</span>
                      <span className={styles.miniCardValue}>
                        {selectedAgentContext.outbound?.title ?? "No outbound handoff yet"}
                      </span>
                    </div>
                  </div>

                  <div className={styles.recentList}>
                    <div className={styles.recentTitle}>Recent steps</div>
                    {selectedAgentContext.recentEvents.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        className={styles.recentItem}
                        onClick={() => selectTimelineEvent(entry.id)}
                      >
                        <span className={styles.recentTime}>
                          {formatOfficeReplayTime(entry.atMs)}
                        </span>
                        <span className={styles.recentCopy}>
                          <span className={styles.recentName}>{entry.title}</span>
                          <span className={styles.recentDetail}>{entry.detail}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className={styles.emptyState}>
                  Select an agent from the floor to inspect its context.
                </div>
              )}
            </div>
          )}

          {viewState.panelTab === "artifacts" && (
            <div className={styles.sideScroll}>
              {selectedArtifact && (
                <div className={styles.contextCard}>
                  <div className={styles.contextEyebrow}>Selected artifact</div>
                  <div className={styles.contextTitle}>{selectedArtifact.label}</div>
                  <div className={styles.contextBody}>{selectedArtifact.summary}</div>
                </div>
              )}

              <div className={styles.artifactList}>
                {scene.artifacts.length ? (
                  scene.artifacts.map((artifact) => (
                    <button
                      key={artifact.id}
                      type="button"
                      className={cn(
                        styles.artifact,
                        selectedArtifact?.id === artifact.id && styles.artifactSelected,
                      )}
                      onClick={() => selectArtifact(artifact.id, artifact.eventId)}
                    >
                      <span className={styles.artifactTone} data-tone={artifact.tone} />
                      <span className={styles.artifactCopy}>
                        <span className={styles.artifactTitle}>{artifact.label}</span>
                        <span className={styles.artifactSummary}>{artifact.summary}</span>
                        <span className={styles.artifactMeta}>
                          {artifact.statusLabel ?? "Available"} ·{" "}
                          {formatOfficeReplayTime(artifact.createdAtMs)}
                        </span>
                      </span>
                    </button>
                  ))
                ) : (
                  <div className={styles.emptyState}>
                    Artifacts appear here as the scripted sequence produces deliverables.
                  </div>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function PanelTab({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(styles.panelTab, active && styles.panelTabActive)}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function EdgeLayer({
  scenario,
  edges,
  agentById,
  highlightedEdgeId,
  scene,
  width,
  height,
  onSelectEdge,
}: {
  scenario: ReturnType<typeof getOfficeScenarioById>;
  edges: OfficeEdge[];
  agentById: Map<string, OfficeDerivedAgent>;
  highlightedEdgeId: string | null;
  scene: ReturnType<typeof deriveOfficeScene>;
  width: number;
  height: number;
  onSelectEdge: (edgeId: string) => void;
}) {
  return (
    <svg className={styles.network} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      {edges.map((edge) => {
        const from = agentCenter(agentById.get(edge.fromId));
        const to = agentCenter(agentById.get(edge.toId));
        const control = resolveCurveControlPoint(from, to, edge.lane ?? 0);
        const path = `M ${from.x} ${from.y} Q ${control.x} ${control.y} ${to.x} ${to.y}`;
        const isHighlighted =
          scene.highlightedEdgeIds.includes(edge.id) || highlightedEdgeId === edge.id;
        const isFocus = scenario.focusEdgeIds.includes(edge.id);
        const edgeTone = resolveEdgeTone(edge.id, scenario, scene.latestEvent?.atMs ?? 0);

        return (
          <g
            key={edge.id}
            className={cn(
              styles.edge,
              isHighlighted && styles.edgeActive,
              isFocus && styles.edgeFocus,
            )}
            data-tone={edgeTone}
            onClick={() => onSelectEdge(edge.id)}
          >
            <path className={styles.edgeHit} d={path} />
            {isFocus && <path className={styles.edgeGuide} d={path} />}
            {isHighlighted && <path className={styles.edgeHalo} d={path} />}
            <path className={styles.edgeLine} d={path} />
            {isHighlighted && <path className={styles.edgePulse} d={path} />}
          </g>
        );
      })}
    </svg>
  );
}

function resolveSelectedAgentId(
  scene: ReturnType<typeof deriveOfficeScene>,
  selectedAgentId: string | null,
  defaultSelectedAgentId: string,
) {
  const preferredId = selectedAgentId ?? defaultSelectedAgentId;
  return scene.agents.find((agent) => agent.id === preferredId)?.id ?? scene.agents[0]?.id ?? null;
}

function resolveSelectedArtifactId(
  scene: ReturnType<typeof deriveOfficeScene>,
  selectedArtifactId: string | null,
) {
  if (
    selectedArtifactId &&
    scene.artifacts.some((artifact) => artifact.id === selectedArtifactId)
  ) {
    return selectedArtifactId;
  }
  return scene.artifacts[0]?.id ?? null;
}

function latestEventForEdge(
  scenario: ReturnType<typeof getOfficeScenarioById>,
  clockMs: number,
  edgeId: string,
) {
  const matches = scenario.events.filter(
    (event) => event.edgeId === edgeId && event.atMs <= clockMs,
  );
  return matches.length ? matches[matches.length - 1] : null;
}

function inferEdgeForPacket(edges: OfficeEdge[], fromId: string, toId: string) {
  return edges.find((edge) => edge.fromId === fromId && edge.toId === toId) ?? null;
}

function resolvePacketPoint(
  progress: number,
  fromId: string,
  toId: string,
  edge: OfficeEdge | null,
  agentById: Map<string, OfficeDerivedAgent>,
) {
  const from = agentCenter(agentById.get(fromId));
  const to = agentCenter(agentById.get(toId));
  const control = resolveCurveControlPoint(from, to, edge?.lane ?? 0);
  return resolveCurvePoint(from, control, to, progress);
}

function resolveEdgeTone(
  edgeId: string,
  scenario: ReturnType<typeof getOfficeScenarioById>,
  clockMs: number,
): OfficeTone {
  const latest = latestEventForEdge(scenario, clockMs, edgeId);
  return latest ? resolveOfficeEventTone(latest.kind) : "neutral";
}

function agentCenter(agent: OfficeDerivedAgent | undefined) {
  if (!agent) {
    return { x: 0, y: 0 };
  }
  return {
    x: agent.x * OFFICE_TILE + AGENT_ANCHOR_X,
    y: agent.y * OFFICE_TILE + AGENT_ANCHOR_Y,
  };
}

function resolveCurveControlPoint(from: OfficePoint, to: OfficePoint, lane: number) {
  const direction = from.x <= to.x ? 1 : -1;
  const distance = Math.abs(to.x - from.x);
  return {
    x: (from.x + to.x) / 2 + lane * 18 * direction,
    y: Math.min(from.y, to.y) - Math.max(48, distance * 0.18) - Math.abs(lane) * 10,
  };
}

function resolveCurvePoint(
  from: OfficePoint,
  control: OfficePoint,
  to: OfficePoint,
  progress: number,
) {
  const t = clamp(progress, 0, 1);
  return {
    x: (1 - t) * (1 - t) * from.x + 2 * (1 - t) * t * control.x + t * t * to.x,
    y: (1 - t) * (1 - t) * from.y + 2 * (1 - t) * t * control.y + t * t * to.y,
  };
}

function resolveCurveTangent(
  from: OfficePoint,
  control: OfficePoint,
  to: OfficePoint,
  progress: number,
) {
  const t = clamp(progress, 0, 1);
  return {
    x: 2 * (1 - t) * (control.x - from.x) + 2 * t * (to.x - control.x),
    y: 2 * (1 - t) * (control.y - from.y) + 2 * t * (to.y - control.y),
  };
}

function resolveEdgeLabelPlacement(
  from: OfficePoint,
  control: OfficePoint,
  to: OfficePoint,
  lane: number,
) {
  const baseProgress = clamp(0.42 + lane * 0.04, 0.34, 0.58);
  const point = resolveCurvePoint(from, control, to, baseProgress);
  const tangent = resolveCurveTangent(from, control, to, baseProgress);
  const length = Math.hypot(tangent.x, tangent.y) || 1;
  const normal = { x: -tangent.y / length, y: tangent.x / length };
  const offset = 28 + Math.abs(lane) * 6;
  const candidateA = { x: point.x + normal.x * offset, y: point.y + normal.y * offset };
  const candidateB = { x: point.x - normal.x * offset, y: point.y - normal.y * offset };

  return candidateA.y <= candidateB.y ? candidateA : candidateB;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
