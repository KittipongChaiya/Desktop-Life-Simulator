/**
 * Devtools root. Owns the F1–F9 keybinds and mounts each tool.
 *
 * Mounted by the renderer bootstrap only when FEATURE_DEBUG is on. Everything
 * below renders null when hidden, so an unopened tool costs one boolean check.
 *
 * SCREENSHOT MODE (Ctrl+Shift+S, 07.8l) hides every panel at once — and HIDES
 * rather than FORGETS. Each panel keeps its own open/closed state; screenshot
 * mode sits in front of all of them as a single `&&`, so leaving it restores
 * exactly the arrangement you had. A mode that closed the panels instead would
 * be a "close everything" button wearing the wrong name, and you would rebuild
 * your layout after every capture.
 *
 * The in-world overlays are suppressed by the same switch through
 * `renderDebug.setScreenshot`, which applies the identical rule in the one
 * place the world view reads. One toggle, two surfaces, no list to maintain.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react';

import { FEATURE_CONSOLE, FEATURE_INSPECTOR } from '../flags';
import type { DevToolsHost } from '../host';

import { CommandMonitor } from './CommandMonitor';
import { DebugOverlay } from './DebugOverlay';
import { DevConsole } from './DevConsole';
import { EventMonitor } from './EventMonitor';
import { Inspector } from './Inspector';
import { loadLayout, saveLayout, withOpen } from './panel-layout';
import { PerformancePanel } from './PerformancePanel';
import { TimeControls } from './TimeControls';

export interface DevToolsProps {
  readonly host: DevToolsHost;
}

export function DevTools({ host }: DevToolsProps): ReactNode {
  // Which panels were open last session (07.8n). Read once: a layout is a
  // starting arrangement, not a live subscription.
  const [remembered] = useState(() => new Set(loadLayout().open));

  const [overlayVisible, setOverlayVisible] = useState(() => remembered.has('overlay'));
  const [consoleVisible, setConsoleVisible] = useState(false);
  const [inspectorVisible, setInspectorVisible] = useState(() => remembered.has('inspector'));
  const [eventsVisible, setEventsVisible] = useState(() => remembered.has('events'));
  const [commandsVisible, setCommandsVisible] = useState(() => remembered.has('commands'));
  const [timeVisible, setTimeVisible] = useState(() => remembered.has('time'));
  const [perfVisible, setPerfVisible] = useState(() => remembered.has('perf'));
  const [screenshot, setScreenshot] = useState(false);

  /**
   * Toggles a panel and remembers the decision.
   *
   * The CONSOLE is deliberately absent from the remembered set: it takes focus
   * and swallows typing, so restoring it on launch would surprise the next
   * session rather than serve it.
   */
  const toggle = useCallback(
    (id: string, set: React.Dispatch<React.SetStateAction<boolean>>) => () => {
      set((open) => {
        saveLayout(withOpen(loadLayout(), id, !open));
        return !open;
      });
    },
    [],
  );

  const closeConsole = useCallback(() => {
    setConsoleVisible(false);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      // Ctrl+Shift+S, matching the app's own `Ctrl+Shift+C` click-through
      // binding. The function keys are spent, and a screenshot is deliberate
      // enough to be worth two modifiers.
      if (event.ctrlKey && event.shiftKey && (event.key === 'S' || event.key === 's')) {
        event.preventDefault();
        setScreenshot((active) => {
          host.renderDebug.setScreenshot(!active);
          return !active;
        });
        return;
      }

      switch (event.key) {
        case 'F3':
          event.preventDefault();
          toggle('overlay', setOverlayVisible)();
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
          toggle('perf', setPerfVisible)();
          break;
        case 'F6':
          event.preventDefault();
          toggle('time', setTimeVisible)();
          break;
        case 'F5':
          event.preventDefault();
          toggle('commands', setCommandsVisible)();
          break;
        case 'F2':
          event.preventDefault();
          toggle('events', setEventsVisible)();
          break;
        case 'F1':
          if (!FEATURE_CONSOLE) return;
          event.preventDefault();
          setConsoleVisible((v) => !v);
          break;
        case 'F4':
          if (!FEATURE_INSPECTOR) return;
          event.preventDefault();
          toggle('inspector', setInspectorVisible)();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [host, toggle]);

  // One rule, applied once per panel. Spelled out seven times it would be
  // seven chances for the next panel to forget it and appear in a capture.
  const shown = (visible: boolean): boolean => visible && !screenshot;

  return (
    <>
      <DebugOverlay
        visible={shown(overlayVisible)}
        metrics={host.metrics}
        profiler={host.profiler}
      />
      <Inspector visible={shown(inspectorVisible)} registry={host.inspector} />
      <EventMonitor
        visible={shown(eventsVisible)}
        ring={host.events}
        onClose={toggle('events', setEventsVisible)}
      />
      <CommandMonitor
        visible={shown(commandsVisible)}
        ring={host.commandLog}
        onClose={toggle('commands', setCommandsVisible)}
      />
      <TimeControls
        visible={shown(timeVisible)}
        simulation={host.simulation}
        onClose={toggle('time', setTimeVisible)}
      />
      <PerformancePanel
        visible={shown(perfVisible)}
        simulation={host.simulation}
        onClose={toggle('perf', setPerfVisible)}
      />
      <DevConsole visible={shown(consoleVisible)} engine={host.console} onClose={closeConsole} />
    </>
  );
}
