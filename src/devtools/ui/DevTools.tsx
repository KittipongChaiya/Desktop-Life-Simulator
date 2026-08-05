/**
 * Devtools root. Owns the F1–F9 keybinds and mounts each tool.
 *
 * Mounted by the renderer bootstrap only when FEATURE_DEBUG is on. Everything
 * below renders null when hidden, so an unopened tool costs one boolean check.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react';

import { FEATURE_CONSOLE, FEATURE_INSPECTOR } from '../flags';
import type { DevToolsHost } from '../host';

import { CommandMonitor } from './CommandMonitor';
import { DebugOverlay } from './DebugOverlay';
import { DevConsole } from './DevConsole';
import { EventMonitor } from './EventMonitor';
import { Inspector } from './Inspector';
import { PerformancePanel } from './PerformancePanel';
import { TimeControls } from './TimeControls';

export interface DevToolsProps {
  readonly host: DevToolsHost;
}

export function DevTools({ host }: DevToolsProps): ReactNode {
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [consoleVisible, setConsoleVisible] = useState(false);
  const [inspectorVisible, setInspectorVisible] = useState(false);
  const [eventsVisible, setEventsVisible] = useState(false);
  const [commandsVisible, setCommandsVisible] = useState(false);
  const [timeVisible, setTimeVisible] = useState(false);
  const [perfVisible, setPerfVisible] = useState(false);

  const closeConsole = useCallback(() => {
    setConsoleVisible(false);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      switch (event.key) {
        case 'F3':
          event.preventDefault();
          setOverlayVisible((v) => !v);
          break;
        // F8 draws INTO THE WORLD rather than opening a panel, so it has no
        // component and no React state: it flips a holder the view reads each
        // frame, and the borders appearing in the world are the feedback.
        case 'F8':
          event.preventDefault();
          host.renderDebug.setChunks(!host.renderDebug.chunks());
          break;
        // Cycles: off, routes, routes and heatmap (07.8j).
        case 'F9':
          event.preventDefault();
          host.renderDebug.cyclePathfinding();
          break;
        case 'F7':
          event.preventDefault();
          setPerfVisible((v) => !v);
          break;
        case 'F6':
          event.preventDefault();
          setTimeVisible((v) => !v);
          break;
        case 'F5':
          event.preventDefault();
          setCommandsVisible((v) => !v);
          break;
        case 'F2':
          event.preventDefault();
          setEventsVisible((v) => !v);
          break;
        case 'F1':
          if (!FEATURE_CONSOLE) return;
          event.preventDefault();
          setConsoleVisible((v) => !v);
          break;
        case 'F4':
          if (!FEATURE_INSPECTOR) return;
          event.preventDefault();
          setInspectorVisible((v) => !v);
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [host]);

  return (
    <>
      <DebugOverlay visible={overlayVisible} metrics={host.metrics} profiler={host.profiler} />
      <Inspector visible={inspectorVisible} registry={host.inspector} />
      <EventMonitor visible={eventsVisible} ring={host.events} />
      <CommandMonitor visible={commandsVisible} ring={host.commandLog} />
      <TimeControls visible={timeVisible} simulation={host.simulation} />
      <PerformancePanel visible={perfVisible} simulation={host.simulation} />
      <DevConsole visible={consoleVisible} engine={host.console} onClose={closeConsole} />
    </>
  );
}
