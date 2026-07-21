/**
 * Devtools root. Owns the F1/F3/F4 keybinds and mounts each tool.
 *
 * Mounted by the renderer bootstrap only when FEATURE_DEBUG is on. Everything
 * below renders null when hidden, so an unopened tool costs one boolean check.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react';

import { FEATURE_CONSOLE, FEATURE_INSPECTOR } from '../flags';
import type { DevToolsHost } from '../host';

import { DebugOverlay } from './DebugOverlay';
import { DevConsole } from './DevConsole';
import { Inspector } from './Inspector';

export interface DevToolsProps {
  readonly host: DevToolsHost;
}

export function DevTools({ host }: DevToolsProps): ReactNode {
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [consoleVisible, setConsoleVisible] = useState(false);
  const [inspectorVisible, setInspectorVisible] = useState(false);

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
  }, []);

  return (
    <>
      <DebugOverlay visible={overlayVisible} metrics={host.metrics} profiler={host.profiler} />
      <Inspector visible={inspectorVisible} registry={host.inspector} />
      <DevConsole visible={consoleVisible} engine={host.console} onClose={closeConsole} />
    </>
  );
}
